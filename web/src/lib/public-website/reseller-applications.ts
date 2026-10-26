import { z } from "zod";

import { getServerEnv, turnstileFormToken } from "@/lib/env";
import {
  assertEdgeFunctionSuccess,
} from "@/lib/public-website/edge-function-response";
import { deliverResellerPriceListEmailIfConfigured } from "@/lib/public-website/reseller-price-list-email";
import { verifyTurnstileToken } from "@/lib/public-website/turnstile";
import { validatePrivacyNoticeAcknowledgement } from "@/lib/platform-settings/privacy-notice";

export const plannedTransactionTypeLabels = {
  retail_resale: "Retail resale",
  restaurant_supply: "Restaurant supply",
  market_stall: "Market stall",
  online_resale: "Online resale",
  other: "Other",
} as const;

const plannedTransactionTypes = Object.keys(plannedTransactionTypeLabels) as [
  keyof typeof plannedTransactionTypeLabels,
  ...(keyof typeof plannedTransactionTypeLabels)[],
];

const resellerApplicationSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("A valid email address is required.").max(254)),
  address: z.string().trim().min(1, "Business address is required.").max(500),
  plannedTransactionType: z.enum(plannedTransactionTypes, {
    error: "Select a valid transaction type.",
  }),
  expectedQuantityPerWeek: z.string().trim().min(1, "Expected weekly quantity is required.").max(120),
  contactNumber: z.string().trim().min(1, "Contact number is required.").max(50),
  message: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value ? value : undefined)),
  turnstileToken: z.string().trim().min(1, "Please complete the verification challenge."),
});

export type ResellerApplicationPayload = {
  name: string;
  email: string;
  address: string;
  plannedTransactionType: keyof typeof plannedTransactionTypeLabels;
  expectedQuantityPerWeek: string;
  contactNumber: string;
  message?: string;
  turnstileToken: string;
};

export type ResellerApplicationParseResult =
  | {
      success: true;
      data: ResellerApplicationPayload;
    }
  | {
      success: false;
      errors: string[];
    };

export type ResellerApplicationSubmitOptions = {
  fetch?: typeof fetch;
  clientIp?: string | null;
  userAgent?: string | null;
  supabase?: ReturnType<typeof import("@/lib/supabase/admin").createSupabaseAdminClient>;
};

export type ResellerApplicationFeedback =
  | {
      status: "submitted";
    }
  | {
      status: "error";
      message: string;
    }
  | null;

export function parseResellerApplicationFormData(
  formData: FormData,
  options: { requirePrivacyAcknowledgement?: boolean } = {},
): ResellerApplicationParseResult {
  const result = resellerApplicationSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    address: formData.get("address"),
    plannedTransactionType: formData.get("plannedTransactionType"),
    expectedQuantityPerWeek: formData.get("expectedQuantityPerWeek"),
    contactNumber: formData.get("contactNumber"),
    message: formData.get("message") ?? undefined,
    turnstileToken: turnstileFormToken(formData.get("cf-turnstile-response")),
  });

  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map((issue) => issue.message),
    };
  }

  const privacyAckError = validatePrivacyNoticeAcknowledgement(
    formData,
    options.requirePrivacyAcknowledgement ?? false,
  );
  if (privacyAckError) {
    return { success: false, errors: [privacyAckError] };
  }

  return {
    success: true,
    data: result.data as ResellerApplicationPayload,
  };
}

export async function submitResellerApplication(
  payload: ResellerApplicationPayload,
  options: ResellerApplicationSubmitOptions = {},
): Promise<string> {
  const env = getServerEnv();
  const fetcher = options.fetch ?? fetch;

  if (!env.turnstileDisabled) {
    await verifyTurnstileToken(env.turnstileSecretKey, payload.turnstileToken, {
      fetch: fetcher,
      clientIp: options.clientIp,
    });
  }

  const headers = new Headers({
    Authorization: `Bearer ${env.supabaseServerKey}`,
    apikey: env.supabaseServerKey,
    "Content-Type": "application/json",
  });

  if (options.clientIp) {
    headers.set("x-client-ip", options.clientIp);
  }

  if (options.userAgent) {
    headers.set("x-client-user-agent", options.userAgent);
  }

  const response = await fetcher(`${env.supabaseUrl}/functions/v1/reseller-application`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await assertEdgeFunctionSuccess(
    response,
    "Unable to submit reseller application.",
  );

  if (body.emailDeliveryStatus !== "sent") {
    await deliverResellerPriceListEmailIfConfigured(body.id as string, {
      fetch: fetcher,
      supabase: options.supabase,
    });
  }

  return body.id as string;
}

export function getResellerApplicationFeedback(url: URL): ResellerApplicationFeedback {
  const status = url.searchParams.get("application");

  if (status === "submitted") {
    return {
      status,
    };
  }

  if (status === "error") {
    return {
      status,
      message: url.searchParams.get("message") ?? "Please check the application form and try again.",
    };
  }

  return null;
}
