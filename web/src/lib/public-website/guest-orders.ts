import { z } from "zod";
import { createHash } from "node:crypto";

import { getServerEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadPlatformSettings, type PlatformSettings } from "@/lib/platform-settings";
import {
  resolveOperationalNotificationRecipients,
  sendOperationalNotificationEmail,
} from "@/lib/platform-settings/operational-notification-email";
import { verifyTurnstileToken } from "@/lib/public-website/turnstile";
import { validatePrivacyNoticeAcknowledgement } from "@/lib/platform-settings/privacy-notice";
import {
  loadGuestOrderTrackingNumber,
  buildCustomerTrackPageUrl,
} from "@/lib/public-website/customer-tracking";
import {
  sendCustomerTrackingNumberEmail,
} from "@/lib/public-website/customer-tracking-email";
import { resolveTransactionalEmailFrom } from "@/lib/public-website/transactional-email";

const customerSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(100),
  lastName: z.string().trim().min(1, "Last name is required.").max(100),
  phoneNumber: z.string().trim().min(1, "Phone number is required.").max(50),
  email: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === "" ? undefined : value))
    .pipe(z.email("Email must be valid when provided.").optional()),
  address: z.string().trim().min(1, "Delivery address is required.").max(500),
});

const orderItemSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().positive("Product quantity must be greater than zero."),
  addDetails: z.string().trim().max(500).optional(),
});

export type GuestOrderPayload = {
  customer: z.infer<typeof customerSchema>;
  items: z.infer<typeof orderItemSchema>[];
  turnstileToken: string;
};

export type GuestOrderSubmitOptions = {
  fetch?: typeof fetch;
  clientIp?: string | null;
  supabase?: ReturnType<typeof createSupabaseAdminClient>;
  siteOrigin?: string;
};

export type GuestOrderSubmitResult = {
  orderId: string;
  trackingNumber: string;
  trackingEmailStatus: "sent" | "failed" | "skipped";
};

export type GuestOrderParseResult =
  | {
      success: true;
      data: GuestOrderPayload;
    }
  | {
      success: false;
      errors: string[];
    };

export function parseGuestOrderFormData(
  formData: FormData,
  options: { requirePrivacyAcknowledgement?: boolean } = {},
): GuestOrderParseResult {
  const customerResult = customerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phoneNumber: formData.get("phoneNumber"),
    email: formData.get("email"),
    address: formData.get("address"),
  });
  const itemResult = parseOrderItems(formData);
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "").trim();
  const turnstileDisabled = getServerEnv().turnstileDisabled === true;
  const errors = [
    ...(customerResult.success ? [] : flattenZodErrors(customerResult.error)),
    ...itemResult.errors,
    ...(!turnstileDisabled && turnstileToken === "" ? ["Please complete the verification challenge."] : []),
  ];
  const privacyAckError = validatePrivacyNoticeAcknowledgement(
    formData,
    options.requirePrivacyAcknowledgement ?? false,
  );
  if (privacyAckError) {
    errors.push(privacyAckError);
  }

  if (!customerResult.success || itemResult.items.length === 0 || errors.length > 0) {
    return {
      success: false,
      errors: itemResult.items.length === 0
        ? [...errors, "Select at least one product quantity."]
        : errors,
    };
  }

  return {
    success: true,
    data: {
      customer: customerResult.data,
      items: itemResult.items,
      turnstileToken,
    },
  };
}

export async function submitGuestOrder(
  payload: GuestOrderPayload,
  options: GuestOrderSubmitOptions = {},
): Promise<GuestOrderSubmitResult> {
  const env = getServerEnv();
  const fetcher = options.fetch ?? fetch;

  if (!env.turnstileDisabled) {
    await verifyTurnstileToken(env.turnstileSecretKey, payload.turnstileToken, {
      fetch: fetcher,
      clientIp: options.clientIp,
    });
  }
  await enforceGuestOrderRateLimit(fetcher, {
    redisUrl: env.upstashRedisRestUrl,
    redisToken: env.upstashRedisRestToken,
    clientIp: options.clientIp,
    contact: payload.customer.email ?? payload.customer.phoneNumber,
  });
  const duplicateGuardKey = await enforceGuestOrderDuplicateGuard(fetcher, {
    redisUrl: env.upstashRedisRestUrl,
    redisToken: env.upstashRedisRestToken,
    payload,
  });

  const supabase = options.supabase ?? createSupabaseAdminClient();

  try {
    const { data, error } = await supabase.rpc("submit_guest_order", {
      customer_payload: payload.customer,
      item_payload: payload.items,
    });

    if (error || typeof data !== "string") {
      throw new Error("Unable to submit guest order");
    }

    const orderId = data;
    const settings = await loadPlatformSettings(supabase);
    const trackingNumber = await loadGuestOrderTrackingNumber(orderId, supabase);
    const trackingEmailStatus = await deliverGuestOrderTrackingEmail(
      payload, trackingNumber, options.siteOrigin, fetcher, settings,
    );
    await notifyAdminsOfGuestOrder({
      supabase,
      orderId,
      payload,
      fetch: fetcher,
      settings,
    });

    return {
      orderId,
      trackingNumber,
      trackingEmailStatus,
    };
  } catch (error) {
    await clearGuestOrderDuplicateGuard(fetcher, {
      redisUrl: env.upstashRedisRestUrl,
      redisToken: env.upstashRedisRestToken,
      key: duplicateGuardKey,
    });
    throw error;
  }
}

async function deliverGuestOrderTrackingEmail(
  payload: GuestOrderPayload,
  trackingNumber: string,
  siteOrigin: string | undefined,
  fetcher: typeof fetch,
  settings: PlatformSettings,
): Promise<GuestOrderSubmitResult["trackingEmailStatus"]> {
  if (!payload.customer.email || !siteOrigin) {
    return "skipped";
  }

  const env = getServerEnv();
  const from = resolveTransactionalEmailFrom({
    resellerPriceListFrom: env.resellerPriceListFrom,
    tradeName: settings.businessProfile.tradeName,
    primaryEmail: settings.businessProfile.primaryEmail,
  });
  const recipientName = `${payload.customer.firstName} ${payload.customer.lastName}`.trim();
  const emailResult = await sendCustomerTrackingNumberEmail(
    payload.customer.email,
    {
      recipientName,
      trackingNumber,
      trackPageUrl: buildCustomerTrackPageUrl(siteOrigin),
      includeOrderSubmittedNote: true,
    },
    { fetch: fetcher, from },
  );

  if (emailResult.status === "failed") {
    console.error("Unable to deliver guest order tracking email.", emailResult.error);
  }

  return emailResult.status;
}

async function notifyAdminsOfGuestOrder(options: {
  supabase: ReturnType<typeof createSupabaseAdminClient>;
  orderId: string;
  payload: GuestOrderPayload;
  fetch: typeof fetch;
  settings: PlatformSettings;
}) {
  const recipients = resolveOperationalNotificationRecipients("new_order", options.settings);
  if (recipients.length === 0) return;
  const customerName = `${options.payload.customer.firstName} ${options.payload.customer.lastName}`.trim();
  const result = await sendOperationalNotificationEmail({
    event: "new_order",
    recipients,
    subject: `New guest order ${options.orderId.slice(0, 8)}`,
    text: `A new guest order was submitted by ${customerName}. Order ID: ${options.orderId}.`,
    html: `<p>A new guest order was submitted by <strong>${customerName}</strong>.</p><p>Order ID: ${options.orderId}</p>`,
    fetch: options.fetch,
  });
  if (result === "failed") console.error("Unable to deliver new-order admin notification.");
}

async function enforceGuestOrderRateLimit(
  fetcher: typeof fetch,
  options: {
    redisUrl: string | undefined;
    redisToken: string | undefined;
    clientIp: string | null | undefined;
    contact: string | undefined;
  },
): Promise<void> {
  if (!options.redisUrl || !options.redisToken) {
    throw new Error("Order rate limiting is not configured.");
  }

  if (options.clientIp) {
    await enforceRedisCounter(fetcher, options.redisUrl, options.redisToken, {
      key: `guest-order:ip-hour:${hashValue(options.clientIp)}`,
      limit: 5,
      message: "Too many guest orders were submitted from this network. Please try again later.",
    });
  }

  if (options.contact) {
    await enforceRedisCounter(fetcher, options.redisUrl, options.redisToken, {
      key: `guest-order:contact-hour:${hashValue(options.contact.toLowerCase())}`,
      limit: 3,
      message: "Too many guest orders were submitted for this contact. Please try again later.",
    });
  }
}

async function enforceGuestOrderDuplicateGuard(
  fetcher: typeof fetch,
  options: {
    redisUrl: string | undefined;
    redisToken: string | undefined;
    payload: GuestOrderPayload;
  },
): Promise<string> {
  if (!options.redisUrl || !options.redisToken) {
    throw new Error("Order duplicate detection is not configured.");
  }

  const key = `guest-order:duplicate:${createGuestOrderFingerprint(options.payload)}`;
  const result = await runRedisCommand(fetcher, options.redisUrl, options.redisToken, [
    "set",
    key,
    "1",
    "nx",
    "ex",
    "1800",
  ]);

  if (result !== "OK") {
    throw new Error("This guest order looks like a duplicate. Please wait before submitting it again.");
  }

  return key;
}

async function clearGuestOrderDuplicateGuard(
  fetcher: typeof fetch,
  options: {
    redisUrl: string | undefined;
    redisToken: string | undefined;
    key: string;
  },
): Promise<void> {
  if (!options.redisUrl || !options.redisToken) {
    return;
  }

  try {
    await runRedisCommand(fetcher, options.redisUrl, options.redisToken, ["del", options.key]);
  } catch (error) {
    console.error("Unable to clear guest order duplicate guard after failed submission.", error);
  }
}

async function enforceRedisCounter(
  fetcher: typeof fetch,
  redisUrl: string,
  redisToken: string,
  options: {
    key: string;
    limit: number;
    message: string;
  },
): Promise<void> {
  const count = await runRedisNumberCommand(fetcher, redisUrl, redisToken, ["incr", options.key]);

  if (count === 1) {
    await runRedisNumberCommand(fetcher, redisUrl, redisToken, ["expire", options.key, "3600"]);
  }

  if (count > options.limit) {
    throw new Error(options.message);
  }
}

async function runRedisNumberCommand(
  fetcher: typeof fetch,
  redisUrl: string,
  redisToken: string,
  parts: string[],
): Promise<number> {
  const result = await runRedisCommand(fetcher, redisUrl, redisToken, parts);

  if (typeof result !== "number") {
    throw new Error("Order rate limiting is unavailable.");
  }

  return result;
}

async function runRedisCommand(
  fetcher: typeof fetch,
  redisUrl: string,
  redisToken: string,
  parts: string[],
): Promise<unknown> {
  const url = `${redisUrl.replace(/\/$/, "")}/${parts.map(encodeURIComponent).join("/")}`;
  const response = await fetcher(url, {
    headers: {
      Authorization: `Bearer ${redisToken}`,
    },
  });
  const data = await readJsonResponse(response);

  if (!response.ok || !("result" in data)) {
    throw new Error("Order rate limiting is unavailable.");
  }

  return data.result;
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json().catch(() => ({}));

  return typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
}

function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createGuestOrderFingerprint(payload: GuestOrderPayload): string {
  return hashValue(JSON.stringify({
    address: normalizeFingerprintText(payload.customer.address),
    email: normalizeFingerprintText(payload.customer.email ?? ""),
    phoneNumber: normalizePhoneNumber(payload.customer.phoneNumber),
    items: payload.items
      .map((item) => ({
        productId: normalizeFingerprintText(item.productId),
        quantity: item.quantity,
        addDetails: normalizeFingerprintText(item.addDetails ?? ""),
      }))
      .toSorted((left, right) => {
        const productCompare = left.productId.localeCompare(right.productId);

        if (productCompare !== 0) {
          return productCompare;
        }

        return left.addDetails.localeCompare(right.addDetails);
      }),
  }));
}

function normalizeFingerprintText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizePhoneNumber(value: string): string {
  return value.replace(/\D/g, "");
}

function parseOrderItems(formData: FormData) {
  const errors: string[] = [];
  const items = Array.from(formData.entries()).flatMap(([key, rawValue]) => {
    if (!key.startsWith("quantity:")) {
      return [];
    }

    const productId = key.replace("quantity:", "").trim();
    const rawQuantity = String(rawValue ?? "").trim();

    if (rawQuantity === "") {
      return [];
    }

    const quantity = Number(rawQuantity);

    if (!Number.isFinite(quantity)) {
      errors.push("Product quantity must be a number.");
      return [];
    }

    if (quantity < 0) {
      errors.push("Product quantity cannot be negative.");
      return [];
    }

    if (quantity === 0) {
      return [];
    }

    const itemResult = orderItemSchema.safeParse({
      productId,
      quantity,
      addDetails: formData.get(`details:${productId}`) ?? undefined,
    });

    if (!itemResult.success) {
      errors.push(...flattenZodErrors(itemResult.error));
      return [];
    }

    return [itemResult.data];
  });

  return {
    items,
    errors,
  };
}

function flattenZodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}
