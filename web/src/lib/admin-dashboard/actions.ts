import type { APIContext } from "astro";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

import { parseContactNumber } from "@/lib/formatters";
import {
  requiredDateAndTimeFromFormData,
  requiredDateTimeFromFormData,
} from "@/lib/datetime";
import { parseAttachCustomerEntriesJson, assertAgentOrderAllowsCustomerAttach, type AgentOrderAttachEntry } from "@/lib/agent-order-attach";
import {
  ensureSalesInvoiceBeforeAgentPaymentConfirmation,
  ensureSalesInvoiceWhenOrderFullyPaid,
} from "@/lib/admin-dashboard/order-invoice";
import {
  executePlatformSettingsAdminAction,
  getPlatformSettingsActionSuccessMessage,
  isPlatformSettingsAdminAction,
  parsePlatformSettingsAdminAction,
  type PlatformSettingsAdminAction,
} from "@/lib/admin-dashboard/platform-settings-actions";
import { DEFAULT_CUSTOMER_CREDIT_LIMIT } from "@/lib/platform-settings";
import { isLockedContactDetailsField } from "@/lib/platform-settings/contact-sync";
import {
  assertAgentContactIsAvailable,
  assertAgentEmailIsAvailable,
  executeAgentProfileUpdate,
  parseAgentProfileUpdateFields,
} from "@/lib/agent-profile-update";
import {
  finalizeNewCustomerCreation,
} from "@/lib/public-website/customer-tracking";
import {
  invalidatePublicPageContentCacheForPage,
} from "@/lib/public-website/content";
import {
  parseTaglineItemsEditorPayload,
} from "@/lib/public-website/home-taglines";
import {
  getFaqDescription,
  getFaqHeading,
  parseFaqItemsEditorPayload,
} from "@/lib/public-website/home-faq";
import {
  normalizeProductCategories,
  updateProductCategoryField,
  updateProductCategoryImage,
} from "@/lib/public-website/home-product-categories";
import {
  addHeroSlide,
  collectRemovedHeroSlideSrcs,
  deleteHeroSlide,
  deleteHeroSlideBySrc,
  HERO_SLIDE_NEW_MARKER,
  normalizeHeroSlides,
  parseHeroSlidesEditorPayload,
  updateHeroSlideAlt,
  updateHeroSlideImage,
} from "@/lib/public-website/home-hero-slides";
import {
  assertProfileEmailIsAvailable,
  assertProfilePhoneIsAvailable,
  insertAgentWithProfile,
  insertCustomerWithProfile,
  loadCustomerProfileId,
  mapCustomerWithProfile,
  customerWithProfileSelect,
  updateCustomerWithProfile,
  asProfileIdentityClient,
  type ProfileIdentitySupabaseClient,
} from "@/lib/profile-identity";
import { logDevelopmentActionError } from "@/lib/request-logger";
import { buildCustomerRegistrationLinkUrl } from "@/lib/public-website/customer-registration";
import {
  getRegularCheckNotificationIdsForCustomer,
  upsertAdminNotificationRead,
  upsertAdminNotificationReads,
} from "./admin-notification-read";
import { formatDateTime } from "./view";
import { loadCustomers, loadOrders } from "./data";
import { getUnpaidOrderCheckNotificationIds } from "./unpaid-order-checks";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PRODUCT_IMAGE_BUCKET, isManagedStoragePath } from "@/lib/supabase/storage";

import {
  defaultProductCategories,
  defaultProductUnitLabels,
  normalizeProductOptionValue,
  productOtherOptionValue,
} from "./product-options";

const uuidSchema = z.uuid();
const pageStatuses = ["draft", "published", "archived"] as const;
const productCategories = defaultProductCategories;
const productUnitLabels = defaultProductUnitLabels;
const productAmountTypes = ["value", "percentage"] as const;
const stockStatuses = ["in_stock", "limited", "out_of_stock"] as const;
const orderStatuses = ["pending", "processing", "closed"] as const;
const inquiryStatuses = ["new", "reviewing", "responded", "closed", "spam"] as const;
const resellerApplicationStatuses = ["submitted", "contacted", "closed"] as const;
const registrationLinkDurations = ["30m", "1h", "3h", "12h", "1d"] as const;
const paymentCustomerTypes = ["regular", "wholesale", "reseller"] as const;
const paymentMethods = ["Cash", "Check"] as const;
const paymentTermsOptions = ["Cash on Delivery (COD)", "Bank Transfer", "Gcash"] as const;
const agentOrderTypes = ["personal", "distribution"] as const;

export type PageStatus = (typeof pageStatuses)[number];
export type ProductCategory = string;
export type ProductUnitLabel = string;
export type ProductAmountType = (typeof productAmountTypes)[number];
export type StockStatus = (typeof stockStatuses)[number];
export type OrderStatus = (typeof orderStatuses)[number];
export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid";
export type InquiryStatus = (typeof inquiryStatuses)[number];
export type ResellerApplicationStatus = (typeof resellerApplicationStatuses)[number];
export type RegistrationLinkDuration = (typeof registrationLinkDurations)[number];
export type PaymentCustomerType = (typeof paymentCustomerTypes)[number];
export type PaymentMethod = (typeof paymentMethods)[number];
export type PaymentTerms = (typeof paymentTermsOptions)[number];
type OrderPaymentStatus = "unpaid" | "partial" | "paid" | "refunded";
type AgentOrderCreateType = (typeof agentOrderTypes)[number];

type AdminDashboardContext = Pick<APIContext, "cookies" | "request" | "redirect"> & Partial<Pick<APIContext, "url">>;
type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;
type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type AdminActionResult = {
  redirectPath?: string;
  statusMessage?: string;
  sectionContent?: Record<string, unknown>;
  registrationLink?: string;
  registrationLinkExpiresAt?: string;
  registrationLinkDuration?: RegistrationLinkDuration;
};
type PromotionAuthUser = {
  id: string;
  email?: string | null;
};
type ProductImageFile = File & { size: number; type: string; name: string };
export type AdminActionFeedback = {
  status?: string;
  error?: string;
  cleanPath?: string;
  registrationLink?: string;
  registrationLinkExpiresAt?: string;
  registrationLinkDuration?: RegistrationLinkDuration;
};

export const ADMIN_REGISTRATION_LINK_SENT_MESSAGE =
  "Registration link created and sent to selected agents.";
export const ADMIN_REGISTRATION_LINK_CREATED_MESSAGE =
  "Registration link created. Copy and share it with customers when ready.";

const maxProductImageBytes = 2 * 1024 * 1024;

type CustomerFormPayload = {
  first_name: string;
  last_name: string;
  phone_number: string;
  email: string | null;
  address: string;
  assigned_agent_id: string | null;
  is_reseller: boolean;
  credit_limit: number;
  created_by?: string;
  updated_at: string;
};

type ParseSuccess = {
  success: true;
  action: AdminAction;
};

type ParseFailure = {
  success: false;
  errors: string[];
};

export type AdminActionParseResult = ParseSuccess | ParseFailure;

export type AdminAction =
  | {
      type: "save-page-section";
      sectionId: string;
      imageFile: ProductImageFile | null;
      slideIndex: number | null;
      categoryIndex: number | null;
      slideAction: "add" | "delete" | null;
      slideSrc: string | null;
      slideImageFiles: ProductImageFile[];
      slideNewImageIndexes: number[];
      payload: {
        page_id: string;
        type: string;
        sort_order: number;
        content: Record<string, unknown>;
        status: PageStatus;
        updated_at: string;
      };
    }
  | {
      type: "save-product";
      productId?: string;
      payload: {
        name: string;
        category: ProductCategory;
        description: string | null;
        unit_label: ProductUnitLabel;
        default_price: number;
        reseller_price: number;
        reseller_deduction_type: ProductAmountType;
        reseller_deduction_value: number;
        agent_commission_type: ProductAmountType;
        agent_commission_value: number;
        stock_status: StockStatus;
        image_file: ProductImageFile | null;
        is_active: boolean;
        updated_at?: string;
      };
    }
  | {
      type: "save-customer";
      customerId?: string;
      payload: CustomerFormPayload;
    }
  | {
      type: "create-agent";
      payload: {
        employee_id: string | null;
        first_name: string;
        last_name: string;
        display_name: string;
        email: string | null;
        contact: string;
        address: string;
        password: string | null;
        status: "active" | "inactive" | "suspended";
      };
    }
  | {
      type: "promote-customer-to-agent";
      customerId: string;
      account: {
        email: string;
        password: string;
        employee_id: string | null;
      };
    }
  | {
      type: "revoke-customer-agent-promotion";
      customerId: string;
    }
  | {
      type: "apply-customer-orders-payment";
      payload: {
        customer_id: string;
        order_ids: string[];
        amount: number;
        payment_method: PaymentMethod;
        payment_terms: PaymentTerms;
        payment_date: string;
        recorded_by: string;
        reference_number: string | null;
        notes: string | null;
      };
    }
  | {
      type: "update-agent";
      agentId: string;
      payload: ReturnType<typeof parseAgentProfileUpdateFields>;
    }
  | {
      type: "set-agent-status";
      agentId: string;
      status: "active" | "inactive";
    }
  | {
      type: "create-order";
      customer:
        | {
            type: "existing";
            customerId: string;
          }
        | {
            type: "agent";
            agentId: string;
          }
        | {
            type: "new";
            payload: CustomerFormPayload;
          };
      agentOrderType?: AgentOrderCreateType | null;
      payload: {
        agent_id: string | null;
        source: "admin_manual";
        order_status: OrderStatus;
        payment_status: "unpaid";
        release_date: string;
        submitted_by: string;
        approved_by: string;
        approved_at: string;
        created_at: string;
        updated_at: string;
      };
      items: {
        product_id: string;
        partial_quantity: number;
        final_quantity: number;
        add_details: string | null;
      }[];
      payment?: {
        amount: number;
        payment_method: PaymentMethod;
        payment_terms: PaymentTerms;
        payment_date: string;
        recorded_by: string;
        reference_number: string | null;
        notes: string | null;
      } | null;
    }
  | {
      type: "update-order-status";
      orderId: string;
      payload: {
        order_status: OrderStatus;
        admin_read_at: string;
        admin_read_by: string;
        updated_at: string;
      };
    }
  | {
      type: "update-order-notes";
      orderId: string;
      payload: {
        notes: string | null;
        updated_at: string;
      };
    }
  | {
      type: "mark-order-read";
      orderId: string;
      returnTo?: string;
    }
  | {
      type: "convert-customer-order-to-agent-distribution";
      orderId: string;
      returnTo?: string;
    }
  | {
      type: "update-commission";
      orderItemId: string;
      payload: {
        agent_commission_amount: number;
        agent_commission_paid: boolean;
        agent_commission_set_by: string | null;
        agent_commission_set_at: string | null;
      };
    }
  | {
      type: "update-order-total-commission";
      orderId: string;
      amount: number;
    }
  | {
      type: "update-agent-order-total-commission";
      agentOrderId: string;
      amount: number;
    }
  | {
      type: "update-agent-order-commission";
      agentOrderItemId: string;
      payload: {
        agent_commission_amount: number;
        agent_commission_updated_by: string;
        agent_commission_updated_at: string;
      };
    }
  | {
      type: "update-agent-order-item-quantity";
      agentOrderItemId: string;
      quantity: number;
    }
  | {
      type: "add-agent-order-item";
      agentOrderId: string;
      productId: string;
      quantity: number;
    }
  | {
      type: "approve-agent-order";
      agentOrderId: string;
      approvedBy: string;
    }
  | {
      type: "attach-agent-order-customer";
      agentOrderId: string;
      entries: AgentOrderAttachEntry[];
      requireApproval: boolean;
    }
  | {
      type: "record-payment";
      returnTo?: string;
      customerType: PaymentCustomerType;
      payload: {
        order_id: string;
        amount: number;
        payment_method: PaymentMethod;
        payment_terms: PaymentTerms;
        payment_date: string;
        recorded_by: string;
        reference_number: string | null;
        notes: string | null;
      };
    }
  | {
      type: "confirm-agent-payment";
      agentPaymentId: string;
      recordedBy: string;
    }
  | {
      type: "confirm-agent-payments";
      agentPaymentIds: string[];
      recordedBy: string;
    }
  | {
      type: "record-admin-agent-payment-distribution";
      agentOrderId: string;
      payload: {
        orderIds: string[];
        amount: number;
        payment_method: PaymentMethod;
        payment_terms: PaymentTerms;
        payment_date: string;
        recorded_by: string;
        reference_number: string | null;
        notes: string | null;
      };
    }
  | {
      type: "save-invoice";
      invoiceId?: string;
      payload: {
        order_id: string;
        status: InvoiceStatus;
        issued_at: string;
        due_at: string | null;
        updated_at: string;
      };
    }
  | {
      type: "update-inquiry";
      inquiryId: string;
      payload: {
        inquiry_status: InquiryStatus;
        internal_notes: string | null;
        admin_read_at: string;
        admin_read_by: string;
        updated_at: string;
      };
    }
  | {
      type: "mark-inquiry-read";
      inquiryId: string;
    }
  | {
      type: "update-reseller-application";
      applicationId: string;
      payload: {
        application_status: ResellerApplicationStatus;
        admin_read_at: string;
        admin_read_by: string;
        updated_at: string;
      };
    }
  | {
      type: "mark-reseller-application-read";
      applicationId: string;
    }
  | {
      type: "mark-admin-notification-read";
      notificationId: string;
    }
  | {
      type: "mark-all-admin-notifications-read";
    }
  | {
      type: "update-invoice-item-quantity";
      orderItemId: string;
      payload: {
        final_quantity: number;
      };
    }
  | {
      type: "apply-customer-payment";
      payload: {
        customer_id: string;
        amount: number;
        payment_method: PaymentMethod;
        payment_terms: PaymentTerms;
        payment_date: string;
        recorded_by: string;
        reference_number: string | null;
        notes: string | null;
      };
    }
  | {
      type: "create-customer-registration-link";
      payload: {
        agent_ids: string[];
        duration: RegistrationLinkDuration;
        base_url: string;
        created_by: string;
      };
    }
  | {
      type: "add-order-item";
      orderId: string;
      payload: {
        order_id: string;
        product_id: string;
        partial_quantity: number;
        final_quantity: number;
        add_details: string | null;
      };
    }
  | {
      type: "remove-order-item";
      orderItemId: string;
    }
  | {
      type: "update-order-item-quantity";
      orderItemId: string;
      payload: {
        partial_quantity: number;
      };
    }
  | PlatformSettingsAdminAction;

export function parseAdminActionFormData(
  formData: FormData,
  adminUserId: string,
): AdminActionParseResult {
  try {
    return parseAdminActionFormDataOrThrow(formData, adminUserId);
  } catch (error) {
    return {
      success: false,
      errors: error instanceof z.ZodError
        ? flattenZodErrors(error)
        : [error instanceof Error ? error.message : "Unable to parse admin action."],
    };
  }
}

function actionNameForLog(formData: FormData) {
  const action = formData.get("action");
  return typeof action === "string" && action.trim().length > 0
    ? action.trim()
    : "unknown";
}

export async function handleAdminDashboardAction(
  context: AdminDashboardContext,
  adminUserId: string,
  returnPath = "/admin",
) {
  const formData = await context.request.formData();
  const parsed = parseAdminActionFormData(formData, adminUserId);
  const wantsJsonResponse = acceptsJsonResponse(context.request);
  const logUrl = context.url ?? new URL(returnPath, "http://localhost");

  if (!parsed.success) {
    logDevelopmentActionError({
      action: actionNameForLog(formData),
      enabled: import.meta.env.DEV,
      error: new Error(parsed.errors.join(" ")),
      phase: "validation",
      scope: "admin",
      url: logUrl,
    });

    if (wantsJsonResponse) {
      return Response.json(
        {
          success: false,
          error: parsed.errors.join(" "),
        },
        { status: 400 },
      );
    }

    return context.redirect(`${returnPath}?error=${encodeURIComponent(parsed.errors.join(" "))}`, 303);
  }

  let actionResult: AdminActionResult | undefined;

  try {
    actionResult =
      await executeAdminAction(
        createSupabaseServerClient(context),
        parsed.action,
        adminUserId,
        { siteOrigin: context.url?.origin },
      ) ?? {};
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin action failed.";
    logDevelopmentActionError({
      action: parsed.action.type,
      enabled: import.meta.env.DEV,
      error,
      phase: "execution",
      scope: "admin",
      url: logUrl,
    });

    if (wantsJsonResponse) {
      return Response.json(
        {
          success: false,
          error: message,
        },
        { status: 500 },
      );
    }

    return context.redirect(`${returnPath}?error=${encodeURIComponent(message)}`, 303);
  }

  const redirectPath = actionResult?.redirectPath ?? getActionRedirectPath(parsed.action, returnPath);
  const message = actionResult?.statusMessage ?? getActionSuccessMessage(parsed.action);

  if (wantsJsonResponse) {
    return Response.json({
      success: true,
      status: message,
      redirectPath,
      action: parsed.action.type,
      sectionContent: actionResult?.sectionContent,
      registrationLink: actionResult?.registrationLink,
      registrationLinkExpiresAt: actionResult?.registrationLinkExpiresAt,
      registrationLinkDuration: actionResult?.registrationLinkDuration,
    });
  }

  return context.redirect(
    withActionFeedback(
      redirectPath,
      "status",
      message,
      actionResult?.registrationLink
        ? {
            registrationLink: actionResult.registrationLink,
            registrationLinkExpiresAt: actionResult.registrationLinkExpiresAt,
            registrationLinkDuration: actionResult.registrationLinkDuration,
          }
        : undefined,
    ),
    303,
  );
}

export async function markUnreadAdminInquiriesRead(
  context: Pick<APIContext, "cookies" | "request">,
  adminUserId: string,
) {
  const { error } = await createSupabaseServerClient(context)
    .from("contact_inquiry")
    .update(adminReadPayload(adminUserId))
    .eq("inquiry_status", "new")
    .is("admin_read_at", null);

  if (error) {
    throw new Error("Unable to mark inquiries as read.");
  }
}

export async function markUnreadAdminResellerApplicationsRead(
  context: Pick<APIContext, "cookies" | "request">,
  adminUserId: string,
) {
  const { error } = await createSupabaseServerClient(context)
    .from("reseller_application")
    .update(adminReadPayload(adminUserId))
    .eq("application_status", "submitted")
    .is("admin_read_at", null);

  if (error) {
    throw new Error("Unable to mark reseller applications as read.");
  }
}

export async function markUnreadAdminOrdersRead(
  context: Pick<APIContext, "cookies" | "request">,
  adminUserId: string,
) {
  const supabase = createSupabaseServerClient(context);
  const payload = adminReadPayload(adminUserId);
  const results = await Promise.all([
    supabase
      .from("order")
      .update(payload)
      .in("order_kind", ["customer", "personal"])
      .eq("order_status", "pending")
      .neq("source", "admin_manual")
      .is("admin_read_at", null),
    supabase
      .from("order")
      .update(payload)
      .eq("order_kind", "distribution")
      .in("order_status", ["pending_customers", "pending_order"])
      .is("admin_read_at", null),
  ]);

  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    throw new Error("Unable to mark orders as read.");
  }
}

export async function markAdminRegularCheckNotificationsReadForCustomer(
  context: Pick<APIContext, "cookies" | "request">,
  customerId: string,
  adminUserId: string,
  orders: Parameters<typeof getRegularCheckNotificationIdsForCustomer>[1],
  customers: Parameters<typeof getRegularCheckNotificationIdsForCustomer>[2],
) {
  const notificationIds = getRegularCheckNotificationIdsForCustomer(
    customerId,
    orders,
    customers,
  );

  if (notificationIds.length === 0) {
    return;
  }

  await upsertAdminNotificationReads(
    createSupabaseServerClient(context),
    notificationIds,
    adminUserId,
  );
}

export async function markAdminOrderReadIfUnread(
  context: Pick<APIContext, "cookies" | "request">,
  orderId: string,
  adminUserId: string,
) {
  const { error } = await createSupabaseServerClient(context)
    .from("order")
    .update(adminReadPayload(adminUserId))
    .eq("id", orderId)
    .eq("order_status", "pending")
    .neq("source", "admin_manual")
    .is("admin_read_at", null);

  if (error) {
    throw new Error("Unable to mark order as read.");
  }
}

const viewedResellerApplicationIdsSchema = z
  .array(uuidSchema)
  .min(1, "At least one application id is required.")
  .max(100, "Too many application ids were provided.");

export function parseViewedResellerApplicationIds(value: unknown): string[] {
  const result = viewedResellerApplicationIdsSchema.safeParse(value);

  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid application ids.");
  }

  return [...new Set(result.data)];
}

export async function markViewedResellerApplicationsRead(
  supabase: SupabaseServerClient,
  applicationIds: string[],
  adminUserId: string,
): Promise<{ markedCount: number }> {
  const uniqueIds = parseViewedResellerApplicationIds(applicationIds);

  if (uniqueIds.length === 0) {
    return { markedCount: 0 };
  }

  const { data, error } = await supabase
    .from("reseller_application")
    .update(adminReadPayload(adminUserId))
    .in("id", uniqueIds)
    .eq("application_status", "submitted")
    .is("admin_read_at", null)
    .select("id");

  if (error) {
    throw new Error("Unable to mark reseller applications as read.");
  }

  return { markedCount: data?.length ?? 0 };
}

export async function executeAdminAction(
  supabase: SupabaseServerClient,
  action: AdminAction,
  adminUserId = "00000000-0000-4000-8000-000000000000",
  options: { siteOrigin?: string } = {},
): Promise<AdminActionResult | void> {
  switch (action.type) {
    case "save-page-section": {
      const sectionContent = await executePageSectionSave(supabase, action);
      return { sectionContent };
    }
    case "save-product":
      await executeProductSave(action);
      return;
    case "save-customer":
      return await executeCustomerSave(supabase, action, options);
    case "create-agent":
      await executeAgentCreate(action.payload);
      return;
    case "promote-customer-to-agent":
      await executeCustomerPromotionToAgent(action.customerId, action.account);
      return;
    case "revoke-customer-agent-promotion":
      await executeRevokeCustomerAgentPromotion(action.customerId);
      return;
    case "update-agent":
      await executeAgentProfileUpdate(createSupabaseAdminClient(), action.agentId, action.payload);
      return;
    case "set-agent-status":
      await executeAgentStatusUpdate(createSupabaseAdminClient(), action.agentId, action.status);
      return;
    case "create-order":
      return await executeOrderCreate(supabase, action, options);
    case "update-order-status":
      await executeTableUpdate(supabase, "order", action.orderId, action.payload);
      return;
    case "update-order-notes":
      await executeTableUpdate(supabase, "order", action.orderId, action.payload);
      return;
    case "mark-order-read":
      await markAdminRecordRead(supabase, "order", action.orderId, adminReadPayload(adminUserId));
      return;
    case "convert-customer-order-to-agent-distribution": {
      const { data, error } = await supabase.rpc("convert_customer_order_to_agent_distribution_order", {
        target_order_id: action.orderId,
      });

      if (error) {
        throw new Error(error.message || "Unable to convert customer order.");
      }

      return typeof data === "string"
        ? { redirectPath: `/admin/orders/agent/${data}` }
        : undefined;
    }
    case "update-commission":
      await assertOrderItemCommissionPayable(supabase, action.orderItemId, action.payload.agent_commission_paid);
      await executeTableUpdate(supabase, "order_item", action.orderItemId, action.payload);
      return;
    case "update-order-total-commission":
      await executeOrderTotalCommissionUpdate(supabase, action.orderId, action.amount, adminUserId);
      return;
    case "update-agent-order-total-commission":
      await executeAgentOrderTotalCommissionUpdate(
        supabase,
        action.agentOrderId,
        action.amount,
        adminUserId,
      );
      return;
    case "update-agent-order-commission":
      await assertAgentOrderItemCommissionEditable(supabase, action.agentOrderItemId);
      await executeTableUpdate(supabase, "order_item", action.agentOrderItemId, action.payload);
      return;
    case "update-agent-order-item-quantity": {
      const { error } = await supabase.rpc("update_agent_order_item_quantity", {
        target_agent_order_item_id: action.agentOrderItemId,
        new_quantity: action.quantity,
      });

      if (error) {
        throw new Error(error.message || "Unable to update agent order item quantity.");
      }

      return;
    }
    case "add-agent-order-item":
      await executeAgentOrderItemAdd(
        supabase,
        action.agentOrderId,
        action.productId,
        action.quantity,
      );
      return;
    case "approve-agent-order":
      await executeAgentOrderApproval(supabase, action);
      return;
    case "attach-agent-order-customer": {
      const releaseSchedule = await assertAgentOrderAllowsCustomerAttach(supabase, action.agentOrderId);

      for (const entry of action.entries) {
        const releaseSchedulePayload = {
          releaseDate: releaseSchedule.date,
          releaseTime: releaseSchedule.time,
        };
        const { data, error } = await supabase.rpc("attach_customer_to_agent_order", {
          target_agent_order_id: action.agentOrderId,
          target_customer_id: entry.customer.type === "existing" ? entry.customer.customerId : null,
          item_payload: entry.items,
          customer_payload: entry.customer.type === "new"
            ? {
                ...releaseSchedulePayload,
                firstName: entry.customer.payload.firstName,
                lastName: entry.customer.payload.lastName,
                phoneNumber: entry.customer.payload.phoneNumber,
                email: entry.customer.payload.email,
                address: entry.customer.payload.address,
              }
            : releaseSchedulePayload,
          require_approval: action.requireApproval,
        });

        if (error || typeof data !== "string") {
          throw new Error(error?.message || "Unable to attach customer order to agent order.");
        }
      }

      return;
    }
    case "update-invoice-item-quantity": {
      const orderId = await assertOrderItemInvoiceQuantityEditable(supabase, action.orderItemId);
      await assertProjectedOrderReceivableCoversPayments(createSupabaseAdminClient(), orderId, {
        orderItemId: action.orderItemId,
        quantity: action.payload.final_quantity,
        type: "update",
      });
      await executeTableUpdate(supabase, "order_item", action.orderItemId, action.payload);
      return;
    }
    case "add-order-item":
      await assertOrderProductsEditable(supabase, action.orderId);
      await executeTableInsert(supabase, "order_item", action.payload);
      return;
    case "remove-order-item": {
      const orderId = await assertOrderProductsEditableByItemId(supabase, action.orderItemId, {
        requireMultipleItems: true,
      });
      await assertProjectedOrderReceivableCoversPayments(createSupabaseAdminClient(), orderId, {
        orderItemId: action.orderItemId,
        type: "remove",
      });
      await executeTableDelete(supabase, "order_item", action.orderItemId);
      return;
    }
    case "update-order-item-quantity": {
      const orderId = await assertOrderProductsEditableByItemId(supabase, action.orderItemId);
      await assertProjectedOrderReceivableCoversPayments(createSupabaseAdminClient(), orderId, {
        orderItemId: action.orderItemId,
        quantity: action.payload.partial_quantity,
        type: "update",
      });
      await executeTableUpdate(supabase, "order_item", action.orderItemId, action.payload);
      return;
    }
    case "record-payment": {
      assertPositivePaymentAmount(action.payload.amount);
      const balance = await applyPaymentCustomerTypePricing(
        supabase,
        action.payload.order_id,
        action.customerType,
      );
      assertPaymentAmountWithinBalance(action.payload.amount, balance);
      await executeTableInsert(supabase, "payment", action.payload);
      await ensureSalesInvoiceWhenOrderFullyPaid(supabase, action.payload.order_id);
      await markAdminRecordRead(
        supabase,
        "order",
        action.payload.order_id,
        adminReadPayload(action.payload.recorded_by),
      );
      return;
    }
    case "confirm-agent-payment":
      await executeAgentPaymentConfirmation(supabase, action);
      return;
    case "confirm-agent-payments":
      await executeAgentPaymentConfirmations(supabase, action);
      return;
    case "record-admin-agent-payment-distribution":
      await executeAdminAgentPaymentDistribution(supabase, action);
      return;
    case "apply-customer-payment":
      await executeCustomerPaymentDistribution(action.payload);
      return;
    case "apply-customer-orders-payment":
      await executeCustomerOrdersPayment(supabase, action);
      return;
    case "create-customer-registration-link": {
      const { token, expiresAt } = await executeCustomerRegistrationLinkCreate(action.payload);
      const expiryFeedback = formatRegistrationLinkExpiryFeedback(expiresAt, action.payload.duration);

      if (action.payload.agent_ids.length > 0) {
        return {
          statusMessage: `${ADMIN_REGISTRATION_LINK_SENT_MESSAGE} ${expiryFeedback}`,
        };
      }

      return {
        statusMessage: ADMIN_REGISTRATION_LINK_CREATED_MESSAGE,
        registrationLink: buildCustomerRegistrationLinkUrl(action.payload.base_url, token),
        registrationLinkExpiresAt: expiresAt,
        registrationLinkDuration: action.payload.duration,
      };
    }
    case "save-invoice":
      await assertOrderCanGenerateInvoice(supabase, action.payload.order_id);
      await executeTableUpsert(supabase, "invoice", action.invoiceId, action.payload);
      await markAdminRecordRead(supabase, "order", action.payload.order_id, adminReadPayload(adminUserId));
      return;
    case "update-inquiry":
      await executeTableUpdate(supabase, "contact_inquiry", action.inquiryId, action.payload);
      return;
    case "mark-inquiry-read":
      await markAdminRecordRead(supabase, "contact_inquiry", action.inquiryId, adminReadPayload(adminUserId));
      return;
    case "update-reseller-application":
      await executeTableUpdate(supabase, "reseller_application", action.applicationId, action.payload);
      return;
    case "mark-reseller-application-read":
      await markAdminRecordRead(supabase, "reseller_application", action.applicationId, adminReadPayload(adminUserId));
      return;
    case "mark-admin-notification-read":
      await markAdminNotificationRead(supabase, action.notificationId, adminUserId);
      return;
    case "mark-all-admin-notifications-read":
      await markAllAdminNotificationsRead(supabase, adminUserId);
      return;
    case "save-platform-settings-general":
    case "save-platform-settings-privacy":
    case "save-platform-settings-templates":
    case "change-admin-password":
    case "send-agent-password-reset": {
      const { data: authData } = await supabase.auth.getUser();
      const result = await executePlatformSettingsAdminAction(supabase, action, adminUserId, {
        adminEmail: authData.user?.email,
        siteOrigin: options.siteOrigin,
      });

      if (action.type === "save-platform-settings-general" && result) {
        return {
          sectionContent: result,
        };
      }

      return;
    }
  }
}

export function getAllowedNextOrderStatuses(
  status: OrderStatus,
  paymentStatus?: OrderPaymentStatus,
): OrderStatus[] {
  switch (status) {
    case "pending":
      return ["processing", "closed"];
    case "processing":
      return ["closed"];
    case "closed":
      return paymentStatus && paymentStatus !== "paid" ? ["processing"] : [];
  }
}

export function formatAdminActionFeedback(url: URL): AdminActionFeedback {
  const status = normalizeQueryMessage(url.searchParams.get("status"));
  const error = normalizeQueryMessage(url.searchParams.get("error"));
  const registrationLink = normalizeQueryMessage(url.searchParams.get("registrationLink"));
  const registrationLinkExpiresAt = normalizeQueryMessage(
    url.searchParams.get("registrationLinkExpiresAt"),
  );
  const registrationLinkDuration = parseRegistrationLinkDuration(
    url.searchParams.get("registrationLinkDuration"),
  );

  return {
    status,
    error,
    registrationLink,
    registrationLinkExpiresAt,
    registrationLinkDuration,
    cleanPath: status || error || registrationLink || registrationLinkExpiresAt
      ? getAdminActionFeedbackCleanPath(url)
      : undefined,
  };
}

export function getPageStatuses() {
  return [...pageStatuses];
}

export function getProductCategories() {
  return [...productCategories];
}

export function getProductUnitLabels() {
  return [...productUnitLabels];
}

export function getStockStatuses() {
  return [...stockStatuses];
}

export function getOrderStatuses() {
  return [...orderStatuses];
}

export function getInquiryStatuses() {
  return [...inquiryStatuses];
}

export function getResellerApplicationStatuses() {
  return [...resellerApplicationStatuses];
}

function parseAdminActionFormDataOrThrow(
  formData: FormData,
  adminUserId: string,
): ParseSuccess {
  const action = requiredString(formData, "action");

  switch (action) {
    case "save-page-section": {
      const sectionType = requiredString(formData, "type");
      const contentField = optionalString(formData, "contentField");
      const contentValue = formData.get("contentValue");
      const imageFile = optionalSectionImage(formData, "imageFile");
      const rawContent = optionalString(formData, "content");
      const slideAction = optionalString(formData, "slideAction") as
        | "add"
        | "delete"
        | undefined;
      const slideIndex = optionalNonNegativeInteger(formData, "slideIndex");
      const categoryIndex = optionalNonNegativeInteger(formData, "categoryIndex");
      const slideSrc = optionalString(formData, "slideSrc");
      const slideImageFiles = optionalSlideImageFiles(formData);
      const slideNewImageIndexes = parseSlideNewImageIndexes(formData);
      let content: Record<string, unknown>;

      if (slideAction === "add" || slideAction === "delete" || contentField || imageFile) {
        const currentContent = parseSectionContent(
          requiredString(formData, "currentContent"),
        );

        if (slideAction === "add") {
          content = addHeroSlide(currentContent);
        } else if (slideAction === "delete") {
          if (slideIndex === null) {
            throw new Error("Slide index is required.");
          }

          content = deleteHeroSlide(currentContent, slideIndex).content;
        } else if (contentField === "slides") {
          if (typeof contentValue !== "string") {
            throw new Error("Content value is required.");
          }

          content = {
            ...currentContent,
            slides: parseHeroSlidesEditorPayload(JSON.parse(contentValue)),
          };

          if (slideImageFiles.length !== slideNewImageIndexes.length) {
            throw new Error("Carousel image uploads do not match the selected slides.");
          }
        } else if (contentField === "items") {
          if (typeof contentValue !== "string") {
            throw new Error("Content value is required.");
          }

          content = {
            ...currentContent,
            items: parseTaglineItemsEditorPayload(contentValue),
          };
        } else if (contentField === "slideAlt") {
          if (slideIndex === null) {
            throw new Error("Slide index is required.");
          }

          if (typeof contentValue !== "string") {
            throw new Error("Content value is required.");
          }

          content = updateHeroSlideAlt(currentContent, slideIndex, contentValue);
        } else if (
          contentField &&
          categoryIndex !== null &&
          sectionType === "product_category_range"
        ) {
          if (typeof contentValue !== "string") {
            throw new Error("Content value is required.");
          }

          content = updateProductCategoryField(
            currentContent,
            categoryIndex,
            contentField,
            contentValue,
          );
        } else if (contentField) {
          if (sectionType === "contact_details" && isLockedContactDetailsField(contentField)) {
            throw new Error("Contact email and phone are managed in Settings.");
          }

          if (typeof contentValue !== "string") {
            throw new Error("Content value is required.");
          }

          content = {
            ...currentContent,
            [contentField]: contentValue,
          };
        } else {
          content = currentContent;
        }
      } else if (rawContent) {
        content = parseSectionContent(rawContent);
      } else {
        content = parseSectionContent(requiredString(formData, "content"));
      }

      return success({
        type: "save-page-section",
        sectionId: requiredUuid(formData, "sectionId"),
        imageFile,
        slideIndex,
        categoryIndex,
        slideAction: slideAction ?? null,
        slideSrc: slideSrc ?? null,
        slideImageFiles,
        slideNewImageIndexes,
        payload: {
          page_id: uuidSchema.parse(requiredString(formData, "pageId")),
          type: requiredString(formData, "type"),
          sort_order: nonNegativeInteger(formData, "sortOrder"),
          content,
          status: enumValue(formData, "status", pageStatuses),
          updated_at: new Date().toISOString(),
        },
      });
    }
    case "save-product": {
      const productId = optionalUuid(formData, "productId");
      const defaultPrice = nonNegativeNumber(formData, "defaultPrice");
      const resellerDeductionType = enumValue(
        formData,
        "resellerDeductionType",
        productAmountTypes,
      );
      const resellerDeductionValue = productAmountValue(
        formData,
        "resellerDeductionValue",
        resellerDeductionType,
        "Reseller deduction",
      );
      const agentCommissionType = enumValue(
        formData,
        "agentCommissionType",
        productAmountTypes,
      );
      const agentCommissionValue = productAmountValue(
        formData,
        "agentCommissionValue",
        agentCommissionType,
        "Agent commission",
      );

      return success({
        type: "save-product",
        productId,
        payload: {
          name: requiredString(formData, "name"),
          category: productOptionValue(
            formData,
            "category",
            "categoryOther",
            "Category",
          ),
          description: optionalString(formData, "description"),
          unit_label: productOptionValue(
            formData,
            "unitLabel",
            "unitLabelOther",
            "Unit label",
          ),
          default_price: defaultPrice,
          reseller_price: calculateResellerPrice(
            defaultPrice,
            resellerDeductionType,
            resellerDeductionValue,
          ),
          reseller_deduction_type: resellerDeductionType,
          reseller_deduction_value: resellerDeductionValue,
          agent_commission_type: agentCommissionType,
          agent_commission_value: agentCommissionValue,
          stock_status: enumValue(formData, "stockStatus", stockStatuses),
          image_file: requiredProductImage(
            formData,
            "imageFile",
            {
              required: !optionalUuid(formData, "productId"),
            },
          ),
          is_active: formData.get("isActive") === "on",
        },
      });
    }
    case "save-customer": {
      const customerId = optionalUuid(formData, "customerId");
      return success({
        type: "save-customer",
        customerId,
        payload: parseCustomerFormPayload(formData, adminUserId, { isNew: !customerId }),
      });
    }
    case "create-agent":
      return success({
        type: "create-agent",
        payload: parseCreateAgentPayload(formData),
      });
    case "promote-customer-to-agent":
      return success({
        type: "promote-customer-to-agent",
        customerId: uuidSchema.parse(requiredString(formData, "customerId")),
        account: parsePromoteCustomerAccountPayload(formData),
      });
    case "revoke-customer-agent-promotion":
      return success({
        type: "revoke-customer-agent-promotion",
        customerId: uuidSchema.parse(requiredString(formData, "customerId")),
      });
    case "update-agent":
      return success({
        type: "update-agent",
        agentId: uuidSchema.parse(requiredString(formData, "agentId")),
        payload: parseAgentProfileUpdateFields(formData),
      });
    case "set-agent-status":
      return success({
        type: "set-agent-status",
        agentId: uuidSchema.parse(requiredString(formData, "agentId")),
        status: enumValue(formData, "status", ["active", "inactive"] as const),
      });
    case "create-order": {
      const existingCustomerId = optionalUuid(formData, "customerId");
      const orderAgentId = optionalUuid(formData, "agentId") ?? null;
      const agentOrderType = orderAgentId
        ? enumValue(formData, "agentOrderType", agentOrderTypes)
        : null;
      const payment = parseCreateOrderPaymentPayload(formData, adminUserId);
      const timestamp = new Date().toISOString();

      if (agentOrderType === "distribution" && payment) {
        throw new Error("Downpayment is not supported for agent distribution orders.");
      }

      return success({
        type: "create-order",
        customer: orderAgentId
          ? {
              type: "agent",
              agentId: orderAgentId,
            }
          : existingCustomerId
          ? {
              type: "existing",
              customerId: existingCustomerId,
            }
          : {
              type: "new",
              payload: parseCustomerFormPayload(formData, adminUserId, { isNew: true }),
            },
        agentOrderType,
        payload: {
          agent_id: orderAgentId,
          source: "admin_manual",
          order_status: "processing",
          payment_status: "unpaid",
          release_date: requiredDateAndTimeFromFormData(formData, "releaseDate", "releaseTime"),
          submitted_by: adminUserId,
          approved_by: adminUserId,
          approved_at: timestamp,
          created_at: timestamp,
          updated_at: timestamp,
        },
        items: parseOrderItems(formData),
        payment,
      });
    }
    case "update-order-status": {
      const nextStatus = enumValue(formData, "orderStatus", orderStatuses);
      return success({
        type: "update-order-status",
        orderId: uuidSchema.parse(requiredString(formData, "orderId")),
        payload: {
          order_status: nextStatus,
          ...adminReadPayload(adminUserId),
          updated_at: new Date().toISOString(),
        },
      });
    }
    case "update-order-notes":
      return success({
        type: "update-order-notes",
        orderId: uuidSchema.parse(requiredString(formData, "orderId")),
        payload: {
          notes: optionalString(formData, "notes"),
          updated_at: new Date().toISOString(),
        },
      });
    case "mark-order-read":
      return success({
        type: "mark-order-read",
        orderId: uuidSchema.parse(requiredString(formData, "orderId")),
        returnTo: optionalAdminReturnPath(formData, "returnTo"),
      });
    case "convert-customer-order-to-agent-distribution":
      return success({
        type: "convert-customer-order-to-agent-distribution",
        orderId: uuidSchema.parse(requiredString(formData, "orderId")),
        returnTo: optionalAdminReturnPath(formData, "returnTo"),
      });
    case "update-commission": {
      const amount = nonNegativeNumber(formData, "amount");
      const isPaid = formData.get("isPaid") === "on";
      return success({
        type: "update-commission",
        orderItemId: uuidSchema.parse(requiredString(formData, "orderItemId")),
        payload: amount <= 0
          ? {
              agent_commission_amount: 0,
              agent_commission_paid: false,
              agent_commission_set_by: null,
              agent_commission_set_at: null,
            }
          : {
              agent_commission_amount: amount,
              agent_commission_paid: isPaid,
              agent_commission_set_by: adminUserId,
              agent_commission_set_at: new Date().toISOString(),
          },
      });
    }
    case "update-order-total-commission":
      return success({
        type: "update-order-total-commission",
        orderId: uuidSchema.parse(requiredString(formData, "orderId")),
        amount: nonNegativeNumber(formData, "amount"),
      });
    case "update-agent-order-total-commission":
      return success({
        type: "update-agent-order-total-commission",
        agentOrderId: uuidSchema.parse(requiredString(formData, "agentOrderId")),
        amount: nonNegativeNumber(formData, "amount"),
      });
    case "update-agent-order-commission":
      return success({
        type: "update-agent-order-commission",
        agentOrderItemId: uuidSchema.parse(requiredString(formData, "agentOrderItemId")),
        payload: {
          agent_commission_amount: nonNegativeNumber(formData, "amount"),
          agent_commission_updated_by: adminUserId,
          agent_commission_updated_at: new Date().toISOString(),
        },
      });
    case "update-agent-order-item-quantity":
      return success({
        type: "update-agent-order-item-quantity",
        agentOrderItemId: uuidSchema.parse(requiredString(formData, "agentOrderItemId")),
        quantity: positiveNumber(formData, "quantity"),
      });
    case "add-agent-order-item":
      return success({
        type: "add-agent-order-item",
        agentOrderId: uuidSchema.parse(requiredString(formData, "agentOrderId")),
        productId: uuidSchema.parse(requiredString(formData, "productId")),
        quantity: positiveNumber(formData, "quantity"),
      });
    case "approve-agent-order":
      return success({
        type: "approve-agent-order",
        agentOrderId: requiredUuid(formData, "agentOrderId"),
        approvedBy: adminUserId,
      });
    case "attach-agent-order-customer": {
      const entriesJson = requiredString(formData, "attachCustomerEntries");

      return success({
        type: "attach-agent-order-customer",
        agentOrderId: uuidSchema.parse(requiredString(formData, "agentOrderId")),
        entries: parseAttachCustomerEntriesJson(entriesJson),
        requireApproval: false,
      });
    }
    case "update-invoice-item-quantity":
      return success({
        type: "update-invoice-item-quantity",
        orderItemId: uuidSchema.parse(requiredString(formData, "orderItemId")),
        payload: {
          final_quantity: positiveNumber(formData, "quantity"),
        },
      });
    case "add-order-item": {
      const quantity = positiveNumber(formData, "quantity");
      const orderId = uuidSchema.parse(requiredString(formData, "orderId"));

      return success({
        type: "add-order-item",
        orderId,
        payload: {
          order_id: orderId,
          product_id: uuidSchema.parse(requiredString(formData, "productId")),
          partial_quantity: quantity,
          final_quantity: quantity,
          add_details: optionalString(formData, "addDetails"),
        },
      });
    }
    case "remove-order-item":
      return success({
        type: "remove-order-item",
        orderItemId: uuidSchema.parse(requiredString(formData, "orderItemId")),
      });
    case "update-order-item-quantity":
      return success({
        type: "update-order-item-quantity",
        orderItemId: uuidSchema.parse(requiredString(formData, "orderItemId")),
        payload: {
          partial_quantity: positiveNumber(formData, "quantity"),
        },
      });
    case "record-payment":
      return success({
        type: "record-payment",
        returnTo: optionalAdminReturnPath(formData, "returnTo"),
        customerType: enumValue(formData, "customerType", paymentCustomerTypes),
        payload: {
          order_id: uuidSchema.parse(requiredString(formData, "orderId")),
          amount: positiveNumber(formData, "amount"),
          payment_method: enumValue(formData, "paymentMethod", paymentMethods),
          payment_terms: enumValue(formData, "paymentTerms", paymentTermsOptions),
          payment_date: requiredDateTimeFromFormData(formData, "paymentDate", "paymentTime"),
          recorded_by: adminUserId,
          reference_number: optionalString(formData, "referenceNumber"),
          notes: optionalString(formData, "notes"),
        },
      });
    case "confirm-agent-payment":
      return success({
        type: "confirm-agent-payment",
        agentPaymentId: uuidSchema.parse(requiredString(formData, "agentPaymentId")),
        recordedBy: adminUserId,
      });
    case "confirm-agent-payments":
      return success({
        type: "confirm-agent-payments",
        agentPaymentIds: requiredUuidList(formData, "agentPaymentId"),
        recordedBy: adminUserId,
      });
    case "record-admin-agent-payment-distribution":
      return success({
        type: "record-admin-agent-payment-distribution",
        agentOrderId: uuidSchema.parse(requiredString(formData, "agentOrderId")),
        payload: {
          orderIds: requiredUuidList(formData, "orderId", "At least one customer order is required."),
          amount: positiveNumber(formData, "amount"),
          payment_method: enumValue(formData, "paymentMethod", paymentMethods),
          payment_terms: enumValue(formData, "paymentTerms", paymentTermsOptions),
          payment_date: requiredDateTimeFromFormData(formData, "paymentDate", "paymentTime"),
          recorded_by: adminUserId,
          reference_number: optionalString(formData, "referenceNumber"),
          notes: optionalString(formData, "notes"),
        },
      });
    case "apply-customer-payment":
      return success({
        type: "apply-customer-payment",
        payload: {
          customer_id: uuidSchema.parse(requiredString(formData, "customerId")),
          amount: positiveNumber(formData, "amount"),
          payment_method: enumValue(formData, "paymentMethod", paymentMethods),
          payment_terms: enumValue(formData, "paymentTerms", paymentTermsOptions),
          payment_date: requiredDateTimeFromFormData(formData, "paymentDate", "paymentTime"),
          recorded_by: adminUserId,
          reference_number: optionalString(formData, "referenceNumber"),
          notes: optionalString(formData, "notes"),
        },
      });
    case "apply-customer-orders-payment":
      return success({
        type: "apply-customer-orders-payment",
        payload: {
          customer_id: uuidSchema.parse(requiredString(formData, "customerId")),
          order_ids: requiredUuidList(formData, "orderId", "At least one order is required."),
          amount: positiveNumber(formData, "amount"),
          payment_method: enumValue(formData, "paymentMethod", paymentMethods),
          payment_terms: enumValue(formData, "paymentTerms", paymentTermsOptions),
          payment_date: requiredDateTimeFromFormData(formData, "paymentDate", "paymentTime"),
          recorded_by: adminUserId,
          reference_number: optionalString(formData, "referenceNumber"),
          notes: optionalString(formData, "notes"),
        },
      });
    case "create-customer-registration-link":
      return success({
        type: "create-customer-registration-link",
        payload: {
          agent_ids: optionalUuidList(formData, "agentId"),
          duration: enumValue(formData, "duration", registrationLinkDurations),
          base_url: requiredUrlOrigin(formData, "baseUrl"),
          created_by: adminUserId,
        },
      });
    case "save-invoice":
      return success({
        type: "save-invoice",
        invoiceId: optionalUuid(formData, "invoiceId"),
        payload: {
          order_id: uuidSchema.parse(requiredString(formData, "orderId")),
          status: "issued",
          issued_at: new Date().toISOString(),
          due_at: null,
          updated_at: new Date().toISOString(),
        },
      });
    case "update-inquiry":
      return success({
        type: "update-inquiry",
        inquiryId: uuidSchema.parse(requiredString(formData, "inquiryId")),
        payload: {
          inquiry_status: enumValue(formData, "inquiryStatus", inquiryStatuses),
          internal_notes: optionalString(formData, "internalNotes"),
          ...adminReadPayload(adminUserId),
          updated_at: new Date().toISOString(),
        },
      });
    case "mark-inquiry-read":
      return success({
        type: "mark-inquiry-read",
        inquiryId: uuidSchema.parse(requiredString(formData, "inquiryId")),
      });
    case "update-reseller-application":
      return success({
        type: "update-reseller-application",
        applicationId: uuidSchema.parse(requiredString(formData, "applicationId")),
        payload: {
          application_status: enumValue(formData, "applicationStatus", resellerApplicationStatuses),
          ...adminReadPayload(adminUserId),
          updated_at: new Date().toISOString(),
        },
      });
    case "mark-reseller-application-read":
      return success({
        type: "mark-reseller-application-read",
        applicationId: uuidSchema.parse(requiredString(formData, "applicationId")),
      });
    case "mark-admin-notification-read":
      return success({
        type: "mark-admin-notification-read",
        notificationId: requiredString(formData, "notificationId"),
      });
    case "mark-all-admin-notifications-read":
      return success({ type: "mark-all-admin-notifications-read" });
    default:
      if (isPlatformSettingsAdminAction(action)) {
        return success(parsePlatformSettingsAdminAction(action, formData));
      }
      throw new Error("Unknown admin action.");
  }
}

async function executeAgentCreate(
  payload: Extract<AdminAction, { type: "create-agent" }>["payload"],
) {
  const adminClient = createSupabaseAdminClient();
  await assertAgentEmailIsAvailable(adminClient, payload.email);
  await assertAgentContactIsAvailable(adminClient, payload.contact);

  let userId: string | null = null;

  if (payload.email) {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: payload.email,
      password: payload.password ?? undefined,
      email_confirm: true,
    });

    if (error || !data.user) {
      if (error?.message?.toLowerCase().includes("already")) {
        throw new Error("Email already exists for another account.");
      }

      throw new Error("Unable to create agent auth account.");
    }

    userId = data.user.id;
  }

  try {
    await insertAgentWithProfile(asProfileIdentityClient(adminClient), {
      user_id: userId,
      employee_id: payload.employee_id,
      first_name: payload.first_name,
      last_name: payload.last_name,
      display_name: payload.display_name,
      contact: payload.contact,
      address: payload.address,
      email: payload.email,
      status: payload.status,
    });
  } catch (error) {
    if (userId) {
      await adminClient.auth.admin.deleteUser(userId);
    }

    throw error;
  }
}

async function executeAgentStatusUpdate(
  adminClient: SupabaseAdminClient,
  agentId: string,
  status: "active" | "inactive",
) {
  const { data: agent, error: loadError } = await adminClient
    .from("agent")
    .select("id")
    .eq("id", agentId)
    .maybeSingle();

  if (loadError) {
    throw new Error("Unable to load agent profile.");
  }

  if (!agent) {
    throw new Error("Agent profile was not found.");
  }

  const { error } = await adminClient
    .from("agent")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", agentId);

  if (error) {
    throw new Error("Unable to update agent status.");
  }
}

async function executeProductSave(action: Extract<AdminAction, { type: "save-product" }>) {
  const adminClient = createSupabaseAdminClient();
  const existingProduct = action.productId
    ? await loadExistingProduct(adminClient, action.productId)
    : null;
  const existingImagePath = existingProduct?.image_path ?? null;
  let uploadedImagePath: string | null = null;

  try {
    if (action.payload.image_file) {
      uploadedImagePath = await uploadProductImage(
        adminClient,
        action.payload.image_file,
        action.payload.name,
      );
    }

    const payload = {
      name: action.payload.name,
      category: action.payload.category,
      description: action.payload.description,
      unit_label: action.payload.unit_label,
      default_price: action.payload.default_price,
      reseller_price: action.payload.reseller_price,
      reseller_deduction_type: action.payload.reseller_deduction_type,
      reseller_deduction_value: action.payload.reseller_deduction_value,
      agent_commission_type: action.payload.agent_commission_type,
      agent_commission_value: action.payload.agent_commission_value,
      stock_status: action.payload.stock_status,
      image_path: uploadedImagePath ?? existingImagePath,
      is_active: action.payload.is_active,
      updated_at: new Date().toISOString(),
    };

    if (!payload.image_path) {
      throw new Error("Product image is required.");
    }

    await executeTableUpsert(adminClient, "product", action.productId, payload);

    if (uploadedImagePath && existingImagePath && existingImagePath !== uploadedImagePath) {
      await removeProductImage(adminClient, existingImagePath);
    }
  } catch (error) {
    if (uploadedImagePath) {
      await removeProductImage(adminClient, uploadedImagePath);
    }

    throw error;
  }
}

async function executeOrderCreate(
  supabase: SupabaseServerClient,
  action: Extract<AdminAction, { type: "create-order" }>,
  options: { siteOrigin?: string } = {},
): Promise<AdminActionResult | void> {
  if (action.agentOrderType === "distribution") {
    return await executeAgentDistributionOrderCreate(supabase, action);
  }

  const customer = await resolveOrderCustomer(supabase, action.customer);
  const { data, error } = await supabase
    .from("order")
    .insert({
      order_kind: "customer",
      customer_id: customer.customerId,
      ...action.payload,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    await cleanupCreatedOrderCustomer(supabase, customer.createdCustomerId);
    throw new Error("Unable to create order.");
  }

  const orderId = String(data.id);
  const { error: itemError } = await supabase
    .from("order_item")
    .insert(action.items.map((item) => ({
      ...item,
      order_id: orderId,
      order_kind: "customer",
    })));

  if (itemError) {
    await cleanupCreatedOrder(supabase, orderId, customer.createdCustomerId, "Unable to create order items");
    throw new Error("Unable to create order items.");
  }

  if (!action.payment) {
    return customer.createdCustomerDetails
      ? await finalizeNewCustomerCreation({
          ...customer.createdCustomerDetails,
          siteOrigin: options.siteOrigin,
          baseMessage: "Order created.",
          includeOrderSubmittedNote: true,
        })
      : undefined;
  }

  const { error: paymentError } = await supabase
    .from("payment")
    .insert({
      ...action.payment,
      order_id: orderId,
    });

  if (!paymentError) {
    try {
      await ensureSalesInvoiceWhenOrderFullyPaid(supabase, orderId);
      return customer.createdCustomerDetails
        ? await finalizeNewCustomerCreation({
            ...customer.createdCustomerDetails,
            siteOrigin: options.siteOrigin,
            baseMessage: "Order created.",
            includeOrderSubmittedNote: true,
          })
        : undefined;
    } catch (error) {
      await cleanupCreatedOrder(
        supabase,
        orderId,
        customer.createdCustomerId,
        error instanceof Error ? error.message : "Unable to create sales invoice",
      );
      throw error;
    }
  }

  await cleanupCreatedOrder(supabase, orderId, customer.createdCustomerId, "Unable to create payment record");
  throw new Error("Unable to create payment record.");
}

async function executeCustomerSave(
  _supabase: SupabaseServerClient,
  action: Extract<AdminAction, { type: "save-customer" }>,
  options: { siteOrigin?: string } = {},
): Promise<AdminActionResult | void> {
  const identityClient = asProfileIdentityClient(createSupabaseAdminClient());

  if (!action.customerId) {
    await assertCustomerContactIsAvailable(identityClient, action.payload);

    const { trackingNumber } = await insertCustomerWithProfile(identityClient, action.payload);

    return await finalizeNewCustomerCreation({
      trackingNumber,
      recipientName: `${action.payload.first_name} ${action.payload.last_name}`.trim(),
      email: action.payload.email,
      siteOrigin: options.siteOrigin,
      baseMessage: "Customer created.",
    });
  }

  const profileId = await loadCustomerProfileId(identityClient, action.customerId);
  await assertCustomerContactIsAvailable(identityClient, action.payload, profileId);
  await updateCustomerWithProfile(
    identityClient,
    action.customerId,
    profileId,
    action.payload,
  );
}

async function resolveOrderCustomer(
  supabase: SupabaseServerClient,
  customer: Extract<AdminAction, { type: "create-order" }>["customer"],
) {
  if (customer.type === "existing") {
    return {
      customerId: customer.customerId,
      createdCustomerId: null,
    };
  }

  if (customer.type === "agent") {
    const { data, error } = await supabase
      .from("agent")
      .select("customer_id")
      .eq("id", customer.agentId)
      .maybeSingle();

    if (error) {
      throw new Error("Unable to load agent customer record.");
    }

    const customerId = data && typeof data.customer_id === "string"
      ? data.customer_id
      : null;

    if (!customerId) {
      throw new Error("Agent does not have a customer balance record.");
    }

    return {
      customerId,
      createdCustomerId: null,
    };
  }

  await assertCustomerContactIsAvailable(
    asProfileIdentityClient(createSupabaseAdminClient()),
    customer.payload,
  );

  const { customerId, trackingNumber } = await insertCustomerWithProfile(
    asProfileIdentityClient(createSupabaseAdminClient()),
    customer.payload,
  );

  return {
    customerId,
    createdCustomerId: customerId,
    createdCustomerDetails: {
      trackingNumber,
      recipientName: `${customer.payload.first_name} ${customer.payload.last_name}`.trim(),
      email: customer.payload.email,
    },
  };
}

async function assertCustomerContactIsAvailable(
  supabase: ProfileIdentitySupabaseClient,
  payload: CustomerFormPayload,
  excludeProfileId?: string,
) {
  await assertProfilePhoneIsAvailable(supabase, payload.phone_number, excludeProfileId);

  if (!payload.email) {
    return;
  }

  await assertProfileEmailIsAvailable(supabase, payload.email, excludeProfileId);
}

async function loadExistingProduct(
  supabase: SupabaseAdminClient,
  productId: string,
) {
  const { data, error } = await supabase
    .from("product")
    .select("id, image_path")
    .eq("id", productId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load existing product.");
  }

  if (!data) {
    throw new Error("Product was not found.");
  }

  return {
    id: String(data.id),
    image_path: typeof data.image_path === "string" ? data.image_path : null,
  };
}


async function assertOrderCanGenerateInvoice(
  supabase: SupabaseServerClient,
  orderId: string,
) {
  const { data, error } = await supabase
    .from("order")
    .select("order_status")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to verify order status for invoice generation.");
  }

  if (!data || data.order_status !== "processing") {
    throw new Error("Only processing orders can generate a sales invoice.");
  }
}

async function applyPaymentCustomerTypePricing(
  supabase: SupabaseServerClient,
  orderId: string,
  customerType: PaymentCustomerType,
) {
  const { data: order, error: orderError } = await supabase
    .from("order")
    .select(`
      agent_id,
      parent_order_id,
      converted_at,
      customer:customer_id ( is_reseller )
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    throw new Error("Unable to verify customer type before recording payment.");
  }

  type PaymentPricingOrderRow = {
    agent_id?: unknown;
    parent_order_id?: unknown;
    converted_at?: unknown;
    customer?: { is_reseller?: unknown } | Array<{ is_reseller?: unknown }> | null;
  };
  const orderRow = order as PaymentPricingOrderRow | null;
  const joinedCustomer = orderRow?.customer;
  const orderCustomer = Array.isArray(joinedCustomer)
    ? joinedCustomer[0]
    : joinedCustomer;
  const isResellerCustomer = orderCustomer?.is_reseller === true;
  const hasAgentLink = Boolean(
    orderRow?.agent_id ||
    orderRow?.parent_order_id,
  );

  if (isResellerCustomer && customerType !== "reseller") {
    throw new Error("Reseller customer payments must use reseller pricing.");
  }

  const targetPriceType = customerType === "reseller" ? "reseller" : "retail";
  const { data: payments, error: paymentError } = await supabase
    .from("payment")
    .select("id, amount")
    .eq("order_id", orderId);

  if (paymentError) {
    throw new Error("Unable to verify existing payments before updating customer type pricing.");
  }

  const { data: items, error: itemError } = await supabase
    .from("order_item")
    .select(`
      id,
      product_id,
      final_quantity,
      price_type,
      unit_price,
      agent_commission_amount
    `)
    .eq("order_id", orderId);

  if (itemError) {
    throw new Error("Unable to load order item prices.");
  }

  type PaymentPricingItemRow = {
    id?: unknown;
    product_id?: unknown;
    final_quantity?: unknown;
    price_type?: unknown;
    agent_commission_amount?: unknown;
  };

  const itemRows = (items ?? []) as PaymentPricingItemRow[];
  const productIds = [...new Set(itemRows.flatMap((item) => (
    typeof item.product_id === "string" ? [item.product_id] : []
  )))];

  if (itemRows.length === 0 || productIds.length === 0) {
    throw new Error("Order item product pricing is incomplete.");
  }

  const pricingClient = createSupabaseAdminClient();
  const { data: products, error: productError } = await pricingClient
    .from("product")
    .select("id, default_price, reseller_price, agent_commission_type, agent_commission_value")
    .in("id", productIds);

  if (productError) {
    throw new Error("Unable to load product prices for payment.");
  }

  type PaymentPricingProductRow = {
    id?: unknown;
    default_price?: unknown;
    reseller_price?: unknown;
    agent_commission_type?: unknown;
    agent_commission_value?: unknown;
  };

  const productPriceById = new Map(
    ((products ?? []) as PaymentPricingProductRow[]).flatMap((product) => (
      typeof product.id === "string" ? [[product.id, product]] : []
    )),
  );

  const normalizedItems = itemRows.map((item) => {
    const product = typeof item.product_id === "string"
      ? productPriceById.get(item.product_id)
      : undefined;
    const defaultPrice = Number(product?.default_price);
    const resellerPrice = Number(product?.reseller_price);
    const finalQuantity = Number(item.final_quantity);
    const unitPrice = targetPriceType === "reseller" ? resellerPrice : defaultPrice;
    const agentCommissionAmount = Number(item.agent_commission_amount ?? 0);

    if (
      typeof item.id !== "string" ||
      typeof item.product_id !== "string" ||
      !Number.isFinite(finalQuantity) ||
      !Number.isFinite(defaultPrice) ||
      !Number.isFinite(resellerPrice) ||
      !Number.isFinite(agentCommissionAmount)
    ) {
      throw new Error("Order item product pricing is incomplete.");
    }

    return {
      id: item.id,
      finalQuantity,
      priceType: typeof item.price_type === "string" ? item.price_type : "",
      unitPrice,
      commissionAmount: calculatePaymentItemCommission({
        finalQuantity,
        unitPrice,
        agentCommissionAmount,
        product,
      }),
    };
  });
  const deductCommission = hasAgentLink;

  if ((payments ?? []).length > 0) {
    const hasPricingChange = normalizedItems.some((item) => item.priceType !== targetPriceType);

    if (hasPricingChange) {
      throw new Error("Customer type pricing can only be changed before a payment record exists.");
    }

    return calculatePaymentBalance(normalizedItems, payments ?? [], deductCommission);
  }

  await Promise.all(normalizedItems.map(async (item) => {
    const { error } = await supabase
      .from("order_item")
      .update({
        price_type: targetPriceType,
        unit_price: item.unitPrice,
      })
      .eq("id", item.id);

    if (error) {
      throw new Error("Unable to update order item pricing.");
    }
  }));

  return calculatePaymentBalance(normalizedItems, payments ?? [], deductCommission);
}

function assertPositivePaymentAmount(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }
}

function assertPaymentAmountWithinBalance(amount: number, balance: number) {
  if (!Number.isFinite(balance) || amount > balance + 0.005) {
    throw new Error("Payment amount cannot exceed the remaining balance.");
  }
}

function calculatePaymentItemCommission(input: {
  finalQuantity: number;
  unitPrice: number;
  agentCommissionAmount: number;
  product?: {
    agent_commission_type?: unknown;
    agent_commission_value?: unknown;
  };
}) {
  if (input.agentCommissionAmount > 0) {
    return Math.max(roundCurrency(input.agentCommissionAmount), 0);
  }

  const commissionType = input.product?.agent_commission_type;
  const commissionValue = Number(input.product?.agent_commission_value ?? 0);

  if (
    (commissionType !== "value" && commissionType !== "percentage") ||
    !Number.isFinite(commissionValue)
  ) {
    return 0;
  }

  const commissionAmount = commissionType === "percentage"
    ? input.finalQuantity * input.unitPrice * commissionValue / 100
    : input.finalQuantity * commissionValue;

  return Math.max(roundCurrency(commissionAmount), 0);
}

function calculatePaymentBalance(
  items: Array<{ finalQuantity: number; unitPrice: number; commissionAmount: number }>,
  payments: Array<{ amount?: unknown }>,
  deductCommission = false,
) {
  const orderTotal = items.reduce((total, item) => total + item.finalQuantity * item.unitPrice, 0);
  const commissionTotal = deductCommission
    ? items.reduce((total, item) => total + item.commissionAmount, 0)
    : 0;
  const paidTotal = payments.reduce((total, payment) => {
    const amount = Number(payment.amount ?? 0);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  return Math.max(roundCurrency(orderTotal - commissionTotal - paidTotal), 0);
}

async function assertOrderItemInvoiceQuantityEditable(
  supabase: SupabaseServerClient,
  orderItemId: string,
): Promise<string> {
  const { data: orderItem, error: orderItemError } = await supabase
    .from("order_item")
    .select("order_id")
    .eq("id", orderItemId)
    .maybeSingle();

  if (orderItemError) {
    throw new Error("Unable to verify invoice quantity update.");
  }

  const orderId = typeof orderItem?.order_id === "string" ? orderItem.order_id : null;

  if (!orderId) {
    throw new Error("Order item was not found.");
  }

  return orderId;
}

async function executeCustomerPromotionToAgent(
  customerId: string,
  account: Extract<AdminAction, { type: "promote-customer-to-agent" }>["account"],
) {
  const adminClient = createSupabaseAdminClient();
  const { data: customerRow, error: customerError } = await adminClient
    .from("customer")
    .select(customerWithProfileSelect)
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    throw new Error("Unable to load customer for promotion.");
  }

  if (!customerRow) {
    throw new Error("Customer was not found.");
  }

  const customer = mapCustomerWithProfile(customerRow);
  const customerProfileId = "profile_id" in customerRow && customerRow.profile_id
    ? String(customerRow.profile_id)
    : null;

  if (!customerProfileId) {
    throw new Error("Customer profile was not found.");
  }

  const { data: existingAgent, error: existingAgentError } = await adminClient
    .from("agent")
    .select("id")
    .eq("customer_id", customerId)
    .limit(1)
    .maybeSingle();

  if (existingAgentError) {
    throw new Error("Unable to verify existing customer agent profile.");
  }

  if (existingAgent?.id) {
    throw new Error("This customer is already linked to an agent profile.");
  }

  await assertAgentContactIsAvailable(
    adminClient,
    customer.phone_number,
    undefined,
    customerProfileId,
  );

  const customerEmail = typeof customer.email === "string" ? customer.email.trim().toLowerCase() : "";
  const promotionEmail = customerEmail.length > 0 ? customerEmail : account.email.trim().toLowerCase();

  if (customerEmail.length > 0 && promotionEmail !== customerEmail) {
    throw new Error("Promotion email must match the customer record.");
  }

  if (customerEmail.length === 0) {
    await savePromotedAgentProfileEmail(adminClient, customerProfileId, promotionEmail);
  }

  const authUser = await resolveCustomerPromotionAuthUser(adminClient, promotionEmail, account.password);
  const userId = authUser.userId;

  let agentId: string | null = null;

  try {
    agentId = await insertAgentWithProfile(asProfileIdentityClient(adminClient), {
      user_id: userId,
      customer_id: customerId,
      profile_id: customerProfileId,
      employee_id: account.employee_id,
      first_name: customer.first_name,
      last_name: customer.last_name,
      display_name: `${customer.first_name} ${customer.last_name}`.trim(),
      contact: customer.phone_number,
      address: customer.address,
      email: customer.email,
      status: "active",
      promoted_from_customer_id: customerId,
      promoted_from_customer_at: new Date().toISOString(),
    });
    await attachPromotedAgentToCustomerOrders(adminClient, customerId, agentId);
    await markCustomerPromotedToAgent(adminClient, customerId, agentId);
  } catch (error) {
    if (agentId) {
      await adminClient.from("agent").delete().eq("id", agentId);
    }

    if (authUser.created) {
      await adminClient.auth.admin.deleteUser(userId);
    }

    throw error;
  }

}

async function resolveCustomerPromotionAuthUser(
  adminClient: SupabaseAdminClient,
  email: string,
  password: string,
): Promise<{ userId: string; created: boolean }> {
  const existingUser = await findAuthUserByEmail(adminClient, email);

  if (existingUser) {
    await assertAuthUserCanBeUsedForCustomerPromotion(adminClient, existingUser.id);

    const { data, error } = await adminClient.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
    });

    if (error || !data.user) {
      throw new Error(error?.message || "Unable to update existing agent auth account.");
    }

    return {
      userId: existingUser.id,
      created: false,
    };
  }

  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError || !authUser.user) {
    if (authError?.message?.toLowerCase().includes("already")) {
      throw new Error("Email already exists for another account.");
    }

    throw new Error("Unable to create agent auth account.");
  }

  return {
    userId: authUser.user.id,
    created: true,
  };
}

async function findAuthUserByEmail(
  adminClient: SupabaseAdminClient,
  email: string,
): Promise<PromotionAuthUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const { data, error } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    throw new Error("Unable to validate existing agent email.");
  }

  const user = (data?.users ?? []).find(
    (item: PromotionAuthUser) => (item.email ?? "").trim().toLowerCase() === normalizedEmail,
  );

  return user ? { id: user.id, email: user.email } : null;
}

async function assertAuthUserCanBeUsedForCustomerPromotion(
  adminClient: SupabaseAdminClient,
  userId: string,
) {
  const [
    { data: linkedAgent, error: linkedAgentError },
    { data: linkedAdminRole, error: linkedAdminRoleError },
  ] = await Promise.all([
    adminClient
      .from("agent")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
    adminClient
      .from("admin_role")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (linkedAgentError || linkedAdminRoleError) {
    throw new Error("Unable to validate existing auth account.");
  }

  if (linkedAgent?.id || linkedAdminRole?.id) {
    throw new Error("Email already exists for another account.");
  }
}

async function attachPromotedAgentToCustomerOrders(
  supabase: SupabaseAdminClient,
  customerId: string,
  agentId: string,
) {
  const { data: processingOrders, error: processingOrdersError } = await supabase
    .from("order")
    .select("id")
    .eq("customer_id", customerId)
    .eq("order_status", "processing");

  if (processingOrdersError) {
    throw new Error("Unable to load active customer orders for commission setup.");
  }

  const { error } = await supabase
    .from("order")
    .update({
      agent_id: agentId,
      updated_at: new Date().toISOString(),
    })
    .eq("customer_id", customerId)
    .eq("order_status", "processing");

  if (error) {
    throw new Error("Unable to attach promoted agent to customer orders.");
  }

  await initializePromotedAgentOrderCommissions(supabase, processingOrders ?? []);
}

async function initializePromotedAgentOrderCommissions(
  supabase: SupabaseAdminClient,
  processingOrders: Array<{ id?: unknown }>,
) {
  const orderIds = processingOrders.flatMap((order) => (
    typeof order.id === "string" ? [order.id] : []
  ));

  if (orderIds.length === 0) {
    return;
  }

  const { data: orderItems, error: orderItemsError } = await supabase
    .from("order_item")
    .select(`
      id,
      final_quantity,
      partial_quantity,
      unit_price,
      product:product_id (
        agent_commission_type,
        agent_commission_value
      )
    `)
    .in("order_id", orderIds);

  if (orderItemsError) {
    throw new Error("Unable to load active order items for commission setup.");
  }

  const commissionUpdates = (orderItems ?? []).flatMap((item) => {
    const orderItemId = typeof item.id === "string" ? item.id : null;

    if (!orderItemId) {
      return [];
    }

    return [{
      id: orderItemId,
      amount: calculatePromotionOrderItemCommission(item),
    }];
  });

  const updateResults = await Promise.all(commissionUpdates.map((item) => (
    supabase
      .from("order_item")
      .update({
        agent_commission_amount: item.amount,
        agent_commission_paid: false,
        agent_commission_set_by: null,
        agent_commission_set_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id)
  )));

  const failedUpdate = updateResults.find((result) => result.error);

  if (failedUpdate) {
    throw new Error("Unable to initialize active order commissions.");
  }
}

function calculatePromotionOrderItemCommission(item: {
  final_quantity?: unknown;
  partial_quantity?: unknown;
  unit_price?: unknown;
  product?: unknown;
}) {
  const product = normalizePromotionOrderItemProduct(item.product);
  const quantity = Number(item.final_quantity ?? item.partial_quantity ?? 0);
  const unitPrice = Number(item.unit_price ?? 0);
  const commissionValue = Number(product?.agent_commission_value ?? 0);
  const commissionType = product?.agent_commission_type;

  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(unitPrice) ||
    !Number.isFinite(commissionValue) ||
    (commissionType !== "value" && commissionType !== "percentage")
  ) {
    return 0;
  }

  const commissionAmount = commissionType === "percentage"
    ? quantity * unitPrice * commissionValue / 100
    : quantity * commissionValue;

  return Math.max(roundCurrency(commissionAmount), 0);
}

function normalizePromotionOrderItemProduct(product: unknown) {
  const productRow = Array.isArray(product) ? product[0] : product;

  if (!productRow || typeof productRow !== "object") {
    return null;
  }

  return productRow as {
    agent_commission_type?: unknown;
    agent_commission_value?: unknown;
  };
}

async function executeAgentDistributionOrderCreate(
  supabase: SupabaseServerClient,
  action: Extract<AdminAction, { type: "create-order" }>,
): Promise<AdminActionResult> {
  if (action.customer.type !== "agent") {
    throw new Error("Agent distribution orders require an agent.");
  }

  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .from("order")
    .insert({
      order_kind: "distribution",
      agent_id: action.customer.agentId,
      source: "agent_submitted",
      payment_status: "unpaid",
      order_status: "pending_customers",
      notes: null,
      release_date: action.payload.release_date,
      submitted_by: action.payload.submitted_by,
      approved_by: action.payload.submitted_by,
      approved_at: timestamp,
      created_at: timestamp,
      admin_read_at: timestamp,
      admin_read_by: action.payload.submitted_by,
      updated_at: timestamp,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw new Error("Unable to create agent distribution order.");
  }

  const agentOrderId = String(data.id);
  const { error: itemError } = await supabase
    .from("order_item")
    .insert(action.items.map((item) => ({
      order_id: agentOrderId,
      order_kind: "distribution",
      product_id: item.product_id,
      partial_quantity: item.partial_quantity,
      final_quantity: item.partial_quantity,
      add_details: item.add_details,
    })));

  if (itemError) {
    await executeTableDelete(supabase, "order", agentOrderId);
    throw new Error("Unable to create agent distribution order items.");
  }

  return {
    redirectPath: `/admin/orders/agent/${agentOrderId}`,
  };
}

async function executeAgentOrderTotalCommissionUpdate(
  supabase: SupabaseServerClient,
  agentOrderId: string,
  amount: number,
  adminUserId: string,
) {
  await assertAgentOrderCommissionEditable(supabase, agentOrderId);

  const { data: orderItems, error: orderItemsError } = await supabase
    .from("order_item")
    .select("id, final_quantity, partial_quantity, unit_price")
    .eq("order_id", agentOrderId);

  if (orderItemsError) {
    throw new Error("Unable to load agent order items for commission update.");
  }

  const normalizedItems = (orderItems ?? []).flatMap((item) => {
    const id = typeof item.id === "string" ? item.id : null;
    const quantity = Number(item.final_quantity ?? item.partial_quantity ?? 0);
    const unitPrice = Number(item.unit_price ?? 0);

    if (!id || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
      return [];
    }

    return [{
      id,
      lineTotal: Math.max(roundCurrency(quantity * unitPrice), 0),
    }];
  });

  if (normalizedItems.length === 0) {
    throw new Error("Agent order has no items for commission update.");
  }

  const allocatedCommissions = allocateTotalCommission(normalizedItems, amount);
  const now = new Date().toISOString();
  const updateResults = await Promise.all(allocatedCommissions.map((item) => (
    supabase
      .from("order_item")
      .update({
        agent_commission_amount: item.amount,
        agent_commission_updated_by: adminUserId,
        agent_commission_updated_at: now,
        updated_at: now,
      })
      .eq("id", item.id)
  )));

  if (updateResults.some((result) => result.error)) {
    throw new Error("Unable to update agent order commission.");
  }
}

async function executeOrderTotalCommissionUpdate(
  supabase: SupabaseServerClient,
  orderId: string,
  amount: number,
  adminUserId: string,
) {
  const { data: orderItems, error: orderItemsError } = await supabase
    .from("order_item")
    .select("id, final_quantity, unit_price")
    .eq("order_id", orderId);

  if (orderItemsError) {
    throw new Error("Unable to load order items for commission update.");
  }

  const normalizedItems = (orderItems ?? []).flatMap((item) => {
    const id = typeof item.id === "string" ? item.id : null;
    const quantity = Number(item.final_quantity ?? 0);
    const unitPrice = Number(item.unit_price ?? 0);

    if (!id || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
      return [];
    }

    return [{
      id,
      lineTotal: Math.max(roundCurrency(quantity * unitPrice), 0),
    }];
  });

  if (normalizedItems.length === 0) {
    throw new Error("Order has no items for commission update.");
  }

  const allocatedCommissions = allocateTotalCommission(normalizedItems, amount);
  const now = new Date().toISOString();
  const updateResults = await Promise.all(allocatedCommissions.map((item) => (
    supabase
      .from("order_item")
      .update(item.amount <= 0
        ? {
            agent_commission_amount: 0,
            agent_commission_paid: false,
            agent_commission_set_by: null,
            agent_commission_set_at: null,
            updated_at: now,
          }
        : {
            agent_commission_amount: item.amount,
            agent_commission_paid: false,
            agent_commission_set_by: adminUserId,
            agent_commission_set_at: now,
            updated_at: now,
          })
      .eq("id", item.id)
  )));

  if (updateResults.some((result) => result.error)) {
    throw new Error("Unable to update order commission.");
  }
}

function allocateTotalCommission(
  items: Array<{ id: string; lineTotal: number }>,
  amount: number,
) {
  const targetAmount = Math.max(roundCurrency(amount), 0);
  const totalLineAmount = items.reduce((total, item) => total + item.lineTotal, 0);
  let remainingAmount = targetAmount;

  return items.map((item, index) => {
    const isLastItem = index === items.length - 1;
    const itemAmount = isLastItem
      ? remainingAmount
      : totalLineAmount > 0
        ? roundCurrency(targetAmount * item.lineTotal / totalLineAmount)
        : roundCurrency(targetAmount / items.length);

    remainingAmount = roundCurrency(remainingAmount - itemAmount);

    return {
      id: item.id,
      amount: Math.max(roundCurrency(itemAmount), 0),
    };
  });
}

async function executeAgentOrderApproval(
  supabase: SupabaseServerClient,
  action: Extract<AdminAction, { type: "approve-agent-order" }>,
) {
  const { data: linkedCustomerOrders, error: linkedCustomerOrdersError } = await supabase
    .from("order")
    .select("id")
    .in("order_kind", ["customer", "personal"])
    .eq("parent_order_id", action.agentOrderId)
    .is("converted_at", null)
    .limit(1);

  if (linkedCustomerOrdersError) {
    throw new Error("Unable to verify agent order customers before approval.", {
      cause: linkedCustomerOrdersError,
    });
  }

  const timestamp = new Date().toISOString();
  const nextStatus = (linkedCustomerOrders ?? []).length > 0
    ? "processing"
    : "pending_customers";
  const { error } = await supabase
    .from("order")
    .update({
      order_status: nextStatus,
      admin_read_at: timestamp,
      admin_read_by: action.approvedBy,
      updated_at: timestamp,
    })
    .eq("id", action.agentOrderId)
    .eq("order_kind", "distribution")
    .eq("order_status", "pending_order");

  if (error) {
    throw new Error("Unable to approve agent order.", { cause: error });
  }
}

async function markCustomerPromotedToAgent(
  supabase: SupabaseAdminClient,
  customerId: string,
  agentId: string,
) {
  const { error } = await supabase
    .from("customer")
    .update({
      promoted_to_agent_id: agentId,
      promoted_to_agent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  if (error) {
    throw new Error("Unable to mark promoted customer record.");
  }
}

async function savePromotedAgentProfileEmail(
  supabase: SupabaseAdminClient,
  profileId: string,
  email: string,
) {
  const { error } = await supabase
    .from("profile")
    .update({
      email,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profileId);

  if (error) {
    throw new Error("Agent account created, but the profile email could not be saved.");
  }
}

async function executeCustomerPaymentDistribution(
  payload: Extract<AdminAction, { type: "apply-customer-payment" }>["payload"],
) {
  const adminClient = createSupabaseAdminClient();
  const { error } = await adminClient.rpc("apply_customer_payment_distribution", {
    target_customer_id: payload.customer_id,
    payment_amount: payload.amount,
    payment_method_value: payload.payment_method,
    payment_terms_value: payload.payment_terms,
    payment_date_value: payload.payment_date,
    recorded_by_value: payload.recorded_by,
    reference_number_value: payload.reference_number,
    notes_value: payload.notes,
  });

  if (error) {
    throw new Error(error.message || "Unable to distribute customer payment.");
  }
}

async function executeRevokeCustomerAgentPromotion(customerId: string) {
  const adminClient = createSupabaseAdminClient();
  const { data: customer, error: customerError } = await adminClient
    .from("customer")
    .select("id, promoted_to_agent_id")
    .eq("id", customerId)
    .maybeSingle();

  if (customerError) {
    throw new Error("Unable to load customer promotion status.");
  }

  const agentId = typeof customer?.promoted_to_agent_id === "string"
    ? customer.promoted_to_agent_id
    : null;

  if (!agentId) {
    throw new Error("This customer is not promoted to an agent.");
  }

  const { data: agent, error: agentError } = await adminClient
    .from("agent")
    .select("id, promoted_from_customer_id")
    .eq("id", agentId)
    .maybeSingle();

  if (agentError || !agent) {
    throw new Error("Unable to load linked agent record.");
  }

  if (agent.promoted_from_customer_id !== customerId) {
    throw new Error("This customer is not linked to a promoted agent record.");
  }

  const { count: distributionOrderCount, error: distributionOrdersError } = await adminClient
    .from("order")
    .select("id", { count: "exact", head: true })
    .eq("order_kind", "distribution")
    .eq("agent_id", agentId);

  if (distributionOrdersError) {
    throw new Error("Unable to check linked agent distribution orders.");
  }

  if ((distributionOrderCount ?? 0) > 0) {
    throw new Error(
      "Cannot cancel agent promotion while the agent has linked distribution orders.",
    );
  }

  const { error: detachOrdersError } = await adminClient
    .from("order")
    .update({
      agent_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("customer_id", customerId)
    .eq("order_status", "processing");

  if (detachOrdersError) {
    throw new Error("Unable to detach agent from active customer orders.");
  }

  const { error: customerUpdateError } = await adminClient
    .from("customer")
    .update({
      promoted_to_agent_id: null,
      promoted_to_agent_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", customerId);

  if (customerUpdateError) {
    throw new Error("Unable to clear customer promotion status.");
  }

  const { error: agentUpdateError } = await adminClient
    .from("agent")
    .update({
      status: "inactive",
      promoted_from_customer_id: null,
      promoted_from_customer_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", agentId);

  if (agentUpdateError) {
    throw new Error("Unable to deactivate promoted agent record.");
  }
}

async function executeCustomerOrdersPayment(
  supabase: SupabaseServerClient,
  action: Extract<AdminAction, { type: "apply-customer-orders-payment" }>,
) {
  assertPositivePaymentAmount(action.payload.amount);

  const adminClient = createSupabaseAdminClient();
  const balances = await loadCustomerOrderPaymentBalances(
    adminClient,
    action.payload.customer_id,
    action.payload.order_ids,
  );
  const payableBalances = balances.filter((balance) => balance.balance > 0);

  if (payableBalances.length === 0) {
    throw new Error("Selected orders do not have remaining balances.");
  }

  const minimumAmount = minimumPaymentAmountForSelectedBalances(
    payableBalances.map((balance) => balance.balance),
  );
  const maximumAmount = roundCurrency(
    payableBalances.reduce((total, balance) => total + balance.balance, 0),
  );

  if (action.payload.amount < minimumAmount - 0.005) {
    throw new Error(
      `Payment amount must be at least ${minimumAmount.toFixed(2)} so the last selected order receives a payment.`,
    );
  }

  if (action.payload.amount > maximumAmount + 0.005) {
    throw new Error("Payment amount cannot exceed selected order balances.");
  }

  let remainingAmount = roundCurrency(action.payload.amount);

  for (const { orderId, balance } of payableBalances) {
    if (remainingAmount <= 0) {
      break;
    }

    const amount = roundCurrency(Math.min(remainingAmount, balance));

    if (amount <= 0) {
      continue;
    }

    await executeTableInsert(supabase, "payment", {
      order_id: orderId,
      amount,
      payment_method: action.payload.payment_method,
      payment_terms: action.payload.payment_terms,
      payment_date: action.payload.payment_date,
      recorded_by: action.payload.recorded_by,
      reference_number: action.payload.reference_number,
      notes: action.payload.notes,
    });
    await ensureSalesInvoiceWhenOrderFullyPaid(supabase, orderId);
    await markAdminRecordRead(
      supabase,
      "order",
      orderId,
      adminReadPayload(action.payload.recorded_by),
    );

    remainingAmount = roundCurrency(remainingAmount - amount);
  }
}

async function loadCustomerOrderPaymentBalances(
  adminClient: SupabaseAdminClient,
  customerId: string,
  orderIds: string[],
) {
  const uniqueOrderIds = [...new Set(orderIds)];
  const { data: orders, error } = await adminClient
    .from("order")
    .select("id, customer_id, payment_status")
    .in("id", uniqueOrderIds);

  if (error) {
    throw new Error("Unable to verify selected customer orders.");
  }

  const orderById = new Map(
    ((orders ?? []) as Array<{
      id?: unknown;
      customer_id?: unknown;
      payment_status?: unknown;
    }>).flatMap((order) => {
      return typeof order.id === "string"
        ? [[order.id, order]]
        : [];
    }),
  );

  return Promise.all(uniqueOrderIds.map(async (orderId) => {
    const order = orderById.get(orderId);

    if (!order || order.customer_id !== customerId) {
      throw new Error("One or more selected orders do not belong to this customer.");
    }

    if (order.payment_status === "paid") {
      throw new Error("Paid orders cannot receive payments.");
    }

    const { data: balance, error: balanceError } = await adminClient.rpc(
      "compute_payment_balance",
      { target_order_id: orderId },
    );

    if (balanceError) {
      throw new Error("Unable to verify selected order balances.");
    }

    const numericBalance = Number(balance ?? 0);

    return {
      orderId,
      balance: Number.isFinite(numericBalance)
        ? roundCurrency(Math.max(numericBalance, 0))
        : 0,
    };
  }));
}

async function executeAdminAgentPaymentDistribution(
  supabase: SupabaseServerClient,
  action: Extract<AdminAction, { type: "record-admin-agent-payment-distribution" }>,
) {
  assertPositivePaymentAmount(action.payload.amount);

  const adminClient = createSupabaseAdminClient();
  const balances = await loadAdminAgentOrderPaymentBalances(
    adminClient,
    action.agentOrderId,
    action.payload.orderIds,
  );
  const payableBalances = balances.filter((balance) => balance.balance > 0);

  if (payableBalances.length === 0) {
    throw new Error("Selected customer orders do not have remaining balances.");
  }

  const minimumAmount = minimumPaymentAmountForSelectedBalances(
    payableBalances.map((balance) => balance.balance),
  );
  const maximumAmount = roundCurrency(
    payableBalances.reduce((total, balance) => total + balance.balance, 0),
  );

  if (action.payload.amount < minimumAmount - 0.005) {
    throw new Error(
      `Payment amount must be at least ${minimumAmount.toFixed(2)} so the last selected customer order receives a payment.`,
    );
  }

  if (action.payload.amount > maximumAmount + 0.005) {
    throw new Error("Payment amount cannot exceed selected order balances.");
  }

  let remainingAmount = roundCurrency(action.payload.amount);

  for (const { orderId, balance } of payableBalances) {
    if (remainingAmount <= 0) {
      break;
    }

    const amount = roundCurrency(Math.min(remainingAmount, balance));

    if (amount <= 0) {
      continue;
    }

    await executeTableInsert(supabase, "payment", {
      order_id: orderId,
      amount,
      payment_method: action.payload.payment_method,
      payment_terms: action.payload.payment_terms,
      payment_date: action.payload.payment_date,
      recorded_by: action.payload.recorded_by,
      reference_number: action.payload.reference_number,
      notes: action.payload.notes,
    });
    await ensureSalesInvoiceWhenOrderFullyPaid(supabase, orderId);
    await markAdminRecordRead(
      supabase,
      "order",
      orderId,
      adminReadPayload(action.payload.recorded_by),
    );

    remainingAmount = roundCurrency(remainingAmount - amount);
  }
}

async function loadAdminAgentOrderPaymentBalances(
  adminClient: SupabaseAdminClient,
  agentOrderId: string,
  orderIds: string[],
) {
  const uniqueOrderIds = [...new Set(orderIds)];
  const { data: orders, error } = await adminClient
    .from("order")
    .select("id, parent_order_id")
    .in("id", uniqueOrderIds);

  if (error) {
    throw new Error("Unable to verify selected customer orders.");
  }

  const orderById = new Map(
    ((orders ?? []) as Array<{ id?: unknown; parent_order_id?: unknown }>).flatMap((order) => {
      return typeof order.id === "string"
        ? [[order.id, order]]
        : [];
    }),
  );

  return Promise.all(uniqueOrderIds.map(async (orderId) => {
    const order = orderById.get(orderId);

    if (!order || order.parent_order_id !== agentOrderId) {
      throw new Error("One or more selected customer orders do not belong to this agent distribution order.");
    }

    const { data: balance, error: balanceError } = await adminClient.rpc(
      "compute_payment_balance",
      { target_order_id: orderId },
    );

    if (balanceError) {
      throw new Error("Unable to verify selected customer order balances.");
    }

    const numericBalance = Number(balance ?? 0);

    return {
      orderId,
      balance: Number.isFinite(numericBalance)
        ? roundCurrency(Math.max(numericBalance, 0))
        : 0,
    };
  }));
}

function minimumPaymentAmountForSelectedBalances(balances: number[]) {
  if (balances.length === 0) {
    return 0;
  }

  const priorOrderTotal = balances
    .slice(0, -1)
    .reduce((total, balance) => total + balance, 0);

  return roundCurrency(priorOrderTotal + 0.01);
}

async function executeAgentPaymentConfirmation(
  supabase: SupabaseServerClient,
  action: Extract<AdminAction, { type: "confirm-agent-payment" }>,
) {
  await ensureSalesInvoiceBeforeAgentPaymentConfirmation(supabase, action.agentPaymentId);

  const { data, error } = await supabase.rpc("confirm_agent_received_payment", {
    agent_payment_id: action.agentPaymentId,
    recorded_by_value: action.recordedBy,
  });

  if (error || typeof data !== "string") {
    throw new Error("Unable to confirm agent received payment.");
  }
}

async function executeAgentPaymentConfirmations(
  supabase: SupabaseServerClient,
  action: Extract<AdminAction, { type: "confirm-agent-payments" }>,
) {
  for (const agentPaymentId of action.agentPaymentIds) {
    await executeAgentPaymentConfirmation(supabase, {
      type: "confirm-agent-payment",
      agentPaymentId,
      recordedBy: action.recordedBy,
    });
  }
}

async function executeCustomerRegistrationLinkCreate(
  payload: Extract<AdminAction, { type: "create-customer-registration-link" }>["payload"],
) {
  const adminClient = createSupabaseAdminClient();

  if (payload.agent_ids.length > 0) {
    const { data: agents, error: agentError } = await adminClient
      .from("agent")
      .select("id")
      .in("id", payload.agent_ids)
      .eq("status", "active");

    if (agentError) {
      throw new Error("Unable to validate registration link agents.");
    }

    const activeAgentIds = new Set((agents ?? []).map((agent) => String(agent.id)));

    if (activeAgentIds.size !== payload.agent_ids.length) {
      throw new Error("Registration links can only be sent to active agents.");
    }
  }

  const token = createRegistrationToken();
  const expiresAt = new Date(
    Date.now() + registrationDurationSeconds(payload.duration) * 1000,
  ).toISOString();
  const { data: link, error: linkError } = await adminClient
    .from("customer_registration_link")
    .insert({
      token,
      token_hash: hashRegistrationToken(token),
      expires_at: expiresAt,
      created_by: payload.created_by,
    })
    .select("id")
    .single();

  if (linkError || !link?.id) {
    throw new Error("Unable to create customer registration link.");
  }

  if (payload.agent_ids.length > 0) {
    const { error: linkAgentError } = await adminClient
      .from("customer_registration_link_agent")
      .insert(payload.agent_ids.map((agentId) => ({
        link_id: String(link.id),
        agent_id: agentId,
      })));

    if (linkAgentError) {
      await adminClient.from("customer_registration_link").delete().eq("id", String(link.id));
      throw new Error("Unable to notify selected agents about the registration link.");
    }
  }

  return { token, expiresAt };
}

async function assertOrderProductsEditableByItemId(
  supabase: SupabaseServerClient,
  orderItemId: string,
  options: { requireMultipleItems?: boolean } = {},
): Promise<string> {
  const { data: orderItem, error: orderItemError } = await supabase
    .from("order_item")
    .select("order_id")
    .eq("id", orderItemId)
    .maybeSingle();

  if (orderItemError) {
    throw new Error("Unable to verify order products before updating them.");
  }

  const orderId = typeof orderItem?.order_id === "string" ? orderItem.order_id : null;

  if (!orderId) {
    throw new Error("Order item was not found.");
  }

  await assertOrderProductsEditable(supabase, orderId, options);
  return orderId;
}

async function assertOrderProductsEditable(
  supabase: SupabaseServerClient,
  orderId: string,
  options: { requireMultipleItems?: boolean } = {},
) {
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoice")
    .select("id")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();

  if (invoiceError) {
    throw new Error("Unable to verify invoices before updating order products.");
  }

  if (invoice?.id) {
    throw new Error("Order products cannot be edited after a sales invoice has been created.");
  }

  if (options.requireMultipleItems) {
    const { data: orderItems, error: orderItemsError } = await supabase
      .from("order_item")
      .select("id")
      .eq("order_id", orderId);

    if (orderItemsError) {
      throw new Error("Unable to verify order item count before removing a product.");
    }

    if ((orderItems ?? []).length <= 1) {
      throw new Error("Order must keep at least one product.");
    }
  }
}

type ProductQuantityProjection =
  | {
      type: "update";
      orderItemId: string;
      quantity: number;
    }
  | {
      type: "remove";
      orderItemId: string;
    };

async function assertProjectedOrderReceivableCoversPayments(
  supabase: SupabaseServerClient,
  orderId: string,
  projection: ProductQuantityProjection,
) {
  const { data: order, error: orderError } = await supabase
    .from("order")
    .select(`
      id,
      agent_id,
      parent_order_id,
      converted_at,
      customer:customer_id (
        promoted_to_agent_id
      ),
      payment (
        amount
      ),
      order_item (
        id,
        final_quantity,
        unit_price,
        agent_commission_amount,
        product:product_id (
          agent_commission_type,
          agent_commission_value
        )
      )
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) {
    throw new Error("Unable to verify paid order total before updating products.");
  }

  if (!order) {
    throw new Error("Order was not found.");
  }

  const normalizedOrder = order as {
    agent_id?: unknown;
    parent_order_id?: unknown;
    converted_at?: unknown;
    customer?: unknown;
    payment?: Array<{ amount?: unknown }> | null;
    order_item?: Array<{
      id?: unknown;
      final_quantity?: unknown;
      unit_price?: unknown;
      agent_commission_amount?: unknown;
      product?: unknown;
    }> | null;
  };
  const paidTotal = sumPaymentAmounts(normalizedOrder.payment ?? []);

  if (paidTotal <= 0) {
    return;
  }

  const orderItems = normalizedOrder.order_item ?? [];
  const projectedItems = orderItems.flatMap((item) => {
    if (typeof item.id !== "string") {
      return [];
    }

    if (projection.type === "remove" && item.id === projection.orderItemId) {
      return [];
    }

    const quantity = projection.type === "update" && item.id === projection.orderItemId
      ? projection.quantity
      : Number(item.final_quantity ?? 0);
    const unitPrice = Number(item.unit_price ?? 0);
    const agentCommissionAmount = Number(item.agent_commission_amount ?? 0);

    if (
      !Number.isFinite(quantity) ||
      !Number.isFinite(unitPrice) ||
      !Number.isFinite(agentCommissionAmount)
    ) {
      throw new Error("Unable to verify paid order total before updating products.");
    }

    return [{
      id: item.id,
      finalQuantity: quantity,
      unitPrice,
      commissionAmount: calculatePaymentItemCommission({
        finalQuantity: quantity,
        unitPrice,
        agentCommissionAmount,
        product: normalizeProjectionProduct(item.product),
      }),
    }];
  });
  const targetExists = orderItems.some((item) => {
    return typeof item.id === "string" && item.id === projection.orderItemId;
  });

  if (!targetExists) {
    throw new Error("Order item was not found.");
  }

  const deductCommission = Boolean(
    normalizedOrder.agent_id ||
    normalizedOrder.parent_order_id,
  );
  const commissionTotal = deductCommission
    ? projectedItems.reduce((total, item) => total + item.commissionAmount, 0)
    : 0;
  const projectedReceivable = projectedItems.reduce((total, item) => {
    return total + item.finalQuantity * item.unitPrice;
  }, 0) - (deductCommission ? commissionTotal : 0);

  if (roundCurrency(projectedReceivable) + 0.005 < paidTotal) {
    throw new Error("Order product quantities cannot be reduced below the recorded payment total.");
  }
}

function sumPaymentAmounts(payments: Array<{ amount?: unknown }>) {
  return roundCurrency(payments.reduce((total, payment) => {
    const amount = Number(payment.amount ?? 0);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0));
}

function normalizeProjectionProduct(product: unknown) {
  const row = Array.isArray(product) ? product[0] : product;

  if (!row || typeof row !== "object") {
    return undefined;
  }

  return row as {
    agent_commission_type?: unknown;
    agent_commission_value?: unknown;
  };
}

async function assertOrderItemCommissionPayable(
  supabase: SupabaseServerClient,
  orderItemId: string,
  isPaid: boolean,
) {
  if (!isPaid) {
    return;
  }

  const { data: orderItem, error: orderItemError } = await supabase
    .from("order_item")
    .select("id, order_id, final_quantity, unit_price, agent_commission_paid")
    .eq("id", orderItemId)
    .maybeSingle();

  if (orderItemError) {
    throw new Error("Unable to verify commission payment status.");
  }

  if (!orderItem || typeof orderItem.order_id !== "string") {
    throw new Error("Order item was not found.");
  }

  const orderId = orderItem.order_id;

  const { data: payments, error: paymentError } = await supabase
    .from("payment")
    .select("amount")
    .eq("order_id", orderId);

  if (paymentError) {
    throw new Error("Unable to verify payment records before updating commission.");
  }

  const paymentTotal = (payments ?? []).reduce((total, payment) => {
    const amount = Number((payment as { amount?: unknown }).amount);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  if (paymentTotal <= 0) {
    throw new Error("Record a payment before marking commission as paid.");
  }

  const { data: orderItems, error: orderItemsError } = await supabase
    .from("order_item")
    .select("id, final_quantity, unit_price, agent_commission_paid")
    .eq("order_id", orderId);

  if (orderItemsError) {
    throw new Error("Unable to verify commission payment coverage.");
  }

  const currentItemTotal = roundCurrency(
    Number(orderItem.final_quantity ?? 0) * Number(orderItem.unit_price ?? 0),
  );
  const paidCommissionCoverage = (orderItems ?? []).reduce((total, item) => {
    const normalizedItem = item as {
      id?: unknown;
      final_quantity?: unknown;
      unit_price?: unknown;
      agent_commission_paid?: unknown;
    };

    if (typeof normalizedItem.id !== "string" || normalizedItem.id === orderItemId) {
      return total;
    }

    if (normalizedItem.agent_commission_paid !== true) {
      return total;
    }

    const quantity = Number(normalizedItem.final_quantity);
    const unitPrice = Number(normalizedItem.unit_price);

    if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
      return total;
    }

    return total + roundCurrency(quantity * unitPrice);
  }, 0);

  const availableCoverage = roundCurrency(paymentTotal - paidCommissionCoverage);

  if (currentItemTotal > availableCoverage) {
    throw new Error("This commission cannot be marked as paid because recorded payments do not cover the item total.");
  }
}

async function assertAgentOrderCommissionEditable(
  supabase: SupabaseServerClient,
  agentOrderId: string,
) {
  const { data: customerOrders, error: customerOrdersError } = await supabase
    .from("order")
    .select("id, payment_status")
    .in("order_kind", ["customer", "personal"])
    .eq("parent_order_id", agentOrderId)
    .is("converted_at", null);

  if (customerOrdersError) {
    throw new Error("Unable to verify agent order payments before updating commission.");
  }

  const linkedCustomerOrders = customerOrders ?? [];
  const isFullyPaid = linkedCustomerOrders.length > 0 &&
    linkedCustomerOrders.every((order) => order.payment_status === "paid");

  if (isFullyPaid) {
    throw new Error("Agent order commission cannot be edited after all customer orders are fully paid.");
  }
}

async function executeAgentOrderItemAdd(
  supabase: SupabaseServerClient,
  agentOrderId: string,
  productId: string,
  quantity: number,
) {
  await assertAgentOrderCommissionEditable(supabase, agentOrderId);

  const { data: agentOrder, error: agentOrderError } = await supabase
    .from("order")
    .select("id")
    .eq("id", agentOrderId)
    .eq("order_kind", "distribution")
    .maybeSingle();

  if (agentOrderError) {
    throw new Error("Unable to verify agent distribution order before adding a product.");
  }

  if (!agentOrder?.id) {
    throw new Error("Agent distribution order was not found.");
  }

  const { data: existingItem, error: existingItemError } = await supabase
    .from("order_item")
    .select("id")
    .eq("order_id", agentOrderId)
    .eq("product_id", productId)
    .limit(1)
    .maybeSingle();

  if (existingItemError) {
    throw new Error("Unable to verify agent order products before adding.");
  }

  if (existingItem?.id) {
    throw new Error("This product is already on the agent order.");
  }

  const { error } = await supabase.from("order_item").insert({
    order_id: agentOrderId,
    order_kind: "distribution",
    product_id: productId,
    partial_quantity: quantity,
    final_quantity: quantity,
    add_details: null,
  });

  if (error) {
    throw new Error(error.message || "Unable to add product to agent order.");
  }
}

async function assertAgentOrderItemCommissionEditable(
  supabase: SupabaseServerClient,
  agentOrderItemId: string,
) {
  const { data: agentOrderItem, error: agentOrderItemError } = await supabase
    .from("order_item")
    .select("id, order_id")
    .eq("id", agentOrderItemId)
    .maybeSingle();

  if (agentOrderItemError) {
    throw new Error("Unable to verify agent order commission status.");
  }

  if (!agentOrderItem || typeof agentOrderItem.order_id !== "string") {
    throw new Error("Agent order item was not found.");
  }

  await assertAgentOrderCommissionEditable(supabase, agentOrderItem.order_id);
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function cleanupCreatedOrderCustomer(
  supabase: SupabaseServerClient,
  customerId: string | null,
) {
  if (!customerId) return;

  await supabase.from("customer").delete().eq("id", customerId);
}

async function cleanupCreatedOrder(
  supabase: SupabaseServerClient,
  orderId: string,
  createdCustomerId: string | null,
  failureLabel: string,
) {
  const { error: cleanupError } = await supabase.from("order").delete().eq("id", orderId);

  if (cleanupError) {
    throw new Error(`${failureLabel}. The order was created but cleanup failed.`);
  }

  await cleanupCreatedOrderCustomer(supabase, createdCustomerId);
}

async function executeTableUpsert(
  supabase: SupabaseServerClient,
  table: string,
  id: string | undefined,
  payload: Record<string, unknown>,
) {
  if (id) {
    await executeTableUpdate(supabase, table, id, payload);
    return;
  }

  await executeTableInsert(supabase, table, payload);
}

async function executeTableInsert(
  supabase: SupabaseServerClient,
  table: string,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase.from(table).insert(payload);
  if (error) throw new Error(`Unable to insert ${table.replaceAll("_", " ")}.`);
}

async function executeTableUpdate(
  supabase: SupabaseServerClient,
  table: string,
  id: string,
  payload: Record<string, unknown>,
) {
  const { error } = await supabase.from(table).update(payload).eq("id", id);
  if (error) {
    const detail = error.message ? `: ${error.message}` : "";
    throw new Error(`Unable to update ${table.replaceAll("_", " ")}${detail}.`, { cause: error });
  }
}

async function executeTableDelete(
  supabase: SupabaseServerClient,
  table: string,
  id: string,
) {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(`Unable to delete ${table.replaceAll("_", " ")}.`);
}

type AdminReadableTable =
  | "order"
  | "contact_inquiry"
  | "reseller_application";

function adminReadPayload(adminUserId: string) {
  return {
    admin_read_at: new Date().toISOString(),
    admin_read_by: adminUserId,
  };
}

async function markAdminRecordRead(
  supabase: SupabaseServerClient,
  table: AdminReadableTable,
  id: string,
  payload: ReturnType<typeof adminReadPayload>,
) {
  await executeTableUpdate(supabase, table, id, payload);
}

async function markAdminNotificationRead(
  supabase: SupabaseServerClient,
  notificationId: string,
  adminUserId: string,
) {
  if (notificationId.startsWith("unpaid-check-")) {
    await upsertAdminNotificationRead(supabase, notificationId, adminUserId);
    return;
  }

  const target = adminNotificationTarget(notificationId);

  await markAdminRecordRead(
    supabase,
    target.table,
    target.id,
    adminReadPayload(adminUserId),
  );
}

async function markAllAdminNotificationsRead(
  supabase: SupabaseServerClient,
  adminUserId: string,
) {
  const payload = adminReadPayload(adminUserId);
  const results = await Promise.all([
    supabase
      .from("order")
      .update(payload)
      .in("order_kind", ["customer", "personal"])
      .eq("order_status", "pending")
      .neq("source", "admin_manual")
      .is("admin_read_at", null),
    supabase
      .from("contact_inquiry")
      .update(payload)
      .eq("inquiry_status", "new")
      .is("admin_read_at", null),
    supabase
      .from("reseller_application")
      .update(payload)
      .eq("application_status", "submitted")
      .is("admin_read_at", null),
  ]);

  const failedResult = results.find((result) => result.error);

  if (failedResult?.error) {
    throw new Error("Unable to mark admin notifications as read.");
  }

  const [orders, customers] = await Promise.all([
    loadOrders(supabase, 200),
    loadCustomers(supabase),
  ]);

  await upsertAdminNotificationReads(
    supabase,
    getUnpaidOrderCheckNotificationIds(orders, customers),
    adminUserId,
  );
}

function adminNotificationTarget(notificationId: string): {
  table: AdminReadableTable;
  id: string;
} {
  if (notificationId.startsWith("reseller-app-")) {
    return {
      table: "reseller_application",
      id: uuidSchema.parse(notificationId.slice("reseller-app-".length)),
    };
  }

  if (notificationId.startsWith("order-pending-")) {
    return {
      table: "order",
      id: uuidSchema.parse(notificationId.slice("order-pending-".length)),
    };
  }

  if (notificationId.startsWith("inquiry-new-")) {
    return {
      table: "contact_inquiry",
      id: uuidSchema.parse(notificationId.slice("inquiry-new-".length)),
    };
  }

  throw new Error("Notification cannot be marked as read.");
}

async function uploadProductImage(
  supabase: SupabaseAdminClient,
  file: ProductImageFile,
  productName: string,
) {
  const extension = inferFileExtension(file);
  const fileNameBase = slugifyFileSegment(productName) || "product";
  const objectPath = `products/${fileNameBase}-${crypto.randomUUID()}.${extension}`;
  return uploadManagedImage(supabase, file, objectPath);
}

async function uploadPageSectionImage(
  supabase: SupabaseAdminClient,
  file: ProductImageFile,
  sectionType: string,
) {
  const extension = inferFileExtension(file);
  const fileNameBase = slugifyFileSegment(sectionType) || "section";
  const objectPath = `page-sections/${fileNameBase}-${crypto.randomUUID()}.${extension}`;
  return uploadManagedImage(supabase, file, objectPath);
}

async function uploadManagedImage(
  supabase: SupabaseAdminClient,
  file: ProductImageFile,
  objectPath: string,
) {
  const { data, error } = await supabase.storage
    .from(PRODUCT_IMAGE_BUCKET)
    .upload(objectPath, file, {
      cacheControl: "31536000",
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error || !data?.path) {
    const detail = error?.message ? ` ${error.message}` : "";
    throw new Error(
      import.meta.env.DEV
        ? `Unable to upload image.${detail}`
        : "Unable to upload image.",
    );
  }

  return data.path;
}

async function loadPageSectionContent(
  supabase: SupabaseServerClient,
  sectionId: string,
) {
  const { data, error } = await supabase
    .from("page_section")
    .select("content")
    .eq("id", sectionId)
    .maybeSingle();

  if (error || !data?.content || typeof data.content !== "object" || Array.isArray(data.content)) {
    return null;
  }

  return data.content as Record<string, unknown>;
}

async function executePageSectionSave(
  _supabase: SupabaseServerClient,
  action: Extract<AdminAction, { type: "save-page-section" }>,
): Promise<Record<string, unknown>> {
  const adminSupabase = createSupabaseAdminClient();
  const existingContent = await loadPageSectionContent(adminSupabase, action.sectionId);
  const previousImageSrc =
    typeof existingContent?.imageSrc === "string" ? existingContent.imageSrc : null;
  let uploadedImagePath: string | null = null;
  const cleanupPaths = new Set<string>();
  let content = { ...action.payload.content };

  try {
    if (action.slideAction === "delete") {
      const baseContent = existingContent ?? content;
      const deleted = action.slideSrc
        ? deleteHeroSlideBySrc(baseContent, action.slideSrc)
        : action.slideIndex !== null
          ? deleteHeroSlide(baseContent, action.slideIndex)
          : null;

      if (!deleted) {
        throw new Error("Slide index is required.");
      }

      content = deleted.content;

      if (
        deleted.removedSlide.src !== HERO_SLIDE_NEW_MARKER &&
        isManagedStoragePath(deleted.removedSlide.src)
      ) {
        cleanupPaths.add(deleted.removedSlide.src);
      }
    } else if (existingContent?.slides) {
      collectRemovedHeroSlideSrcs(existingContent.slides, normalizeHeroSlides(content.slides)).forEach(
        (imagePath) => cleanupPaths.add(imagePath),
      );
    }

    if (action.slideImageFiles.length > 0) {
      const slides = parseHeroSlidesEditorPayload(content.slides);

      for (let fileIndex = 0; fileIndex < action.slideImageFiles.length; fileIndex += 1) {
        const targetIndex = action.slideNewImageIndexes[fileIndex];
        const file = action.slideImageFiles[fileIndex];

        if (targetIndex === undefined || !file) {
          throw new Error("Carousel image uploads do not match the selected slides.");
        }

        uploadedImagePath = await uploadPageSectionImage(
          createSupabaseAdminClient(),
          file,
          `${action.payload.type}-slide`,
        );

        const previousSrc = slides[targetIndex]?.src ?? null;
        slides[targetIndex] = {
          ...slides[targetIndex],
          src: uploadedImagePath,
        };

        if (
          previousSrc &&
          previousSrc !== HERO_SLIDE_NEW_MARKER &&
          previousSrc !== uploadedImagePath
        ) {
          cleanupPaths.add(previousSrc);
        }
      }

      content = {
        ...content,
        slides,
      };
    }

    if (action.imageFile && action.slideIndex !== null) {
      uploadedImagePath = await uploadPageSectionImage(
        createSupabaseAdminClient(),
        action.imageFile,
        `${action.payload.type}-slide`,
      );
      const updatedSlide = updateHeroSlideImage(
        content,
        action.slideIndex,
        uploadedImagePath,
      );
      content = updatedSlide.content;

      if (updatedSlide.previousSrc) {
        cleanupPaths.add(updatedSlide.previousSrc);
      }
    } else if (action.imageFile && action.categoryIndex !== null) {
      uploadedImagePath = await uploadPageSectionImage(
        createSupabaseAdminClient(),
        action.imageFile,
        `${action.payload.type}-category`,
      );
      const updatedCategory = updateProductCategoryImage(
        content,
        action.categoryIndex,
        uploadedImagePath,
      );
      content = updatedCategory.content;

      if (updatedCategory.previousSrc) {
        cleanupPaths.add(updatedCategory.previousSrc);
      }
    } else if (action.imageFile) {
      uploadedImagePath = await uploadPageSectionImage(
        createSupabaseAdminClient(),
        action.imageFile,
        action.payload.type,
      );
      content = {
        ...content,
        imageSrc: uploadedImagePath,
      };

      if (previousImageSrc) {
        cleanupPaths.add(previousImageSrc);
      }
    }

    if (action.payload.type === "faq") {
      content = {
        heading: getFaqHeading(content),
        description: getFaqDescription(content),
        items: parseFaqItemsEditorPayload(JSON.stringify(content.items ?? [])),
      };
    }

    if (action.payload.type === "product_category_range") {
      const normalized = normalizeProductCategories(content);
      content = {
        heading: normalized.heading,
        subtitle: normalized.subtitle,
        categories: normalized.categories,
      };
    }

    await executeTableUpdate(adminSupabase, "page_section", action.sectionId, {
      ...action.payload,
      content,
    });

    for (const imagePath of cleanupPaths) {
      if (imagePath !== uploadedImagePath) {
        await removeProductImage(createSupabaseAdminClient(), imagePath);
      }
    }
  } catch (error) {
    if (uploadedImagePath) {
      await removeProductImage(createSupabaseAdminClient(), uploadedImagePath);
    }

    throw error;
  }

  await invalidatePublicPageContentCacheForPage(action.payload.page_id);
  return content;
}

async function removeProductImage(
  supabase: SupabaseAdminClient,
  imagePath: string,
) {
  if (!isManagedStoragePath(imagePath, PRODUCT_IMAGE_BUCKET)) {
    return;
  }

  await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([imagePath]);
}

function success(action: AdminAction): ParseSuccess {
  return {
    success: true,
    action,
  };
}

function requiredString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  if (!value) {
    throw new Error(`${toSentenceLabel(key)} is required.`);
  }

  return value;
}

function optionalString(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();

  return value.length > 0 ? value : null;
}

function optionalEmail(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  return value ? z.email("Enter a valid email address.").parse(value.toLowerCase()) : null;
}

function optionalUuid(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  return value ? uuidSchema.parse(value) : undefined;
}

function optionalUuidList(formData: FormData, key: string) {
  const values = formData
    .getAll(key)
    .map((value) => normalizeFormDataEntry(value))
    .filter((value) => value.length > 0);

  return [...new Set(values.map((value) => uuidSchema.parse(value)))];
}

function requiredUuidList(formData: FormData, key: string, errorMessage?: string) {
  const values = optionalUuidList(formData, key);

  if (values.length === 0) {
    throw new Error(errorMessage ?? `${toSentenceLabel(key)} is required.`);
  }

  return values;
}

function requiredUrlOrigin(formData: FormData, key: string) {
  const value = requiredString(formData, key);
  const url = new URL(value);

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${toSentenceLabel(key)} must be a valid website URL.`);
  }

  return url.origin;
}

function optionalAdminReturnPath(formData: FormData, key: string) {
  const value = optionalString(formData, key);

  if (!value) return undefined;

  if (!value.startsWith("/admin") || value.startsWith("//")) {
    throw new Error("Return path is not supported.");
  }

  return value;
}

function requiredUuid(formData: FormData, key: string) {
  return uuidSchema.parse(requiredString(formData, key));
}

function enumValue<T extends string>(
  formData: FormData,
  key: string,
  values: readonly T[],
): T {
  const value = requiredString(formData, key);
  const found = values.find((item) => item === value);

  if (!found) {
    throw new Error(`${toSentenceLabel(key)} is not supported.`);
  }

  return found;
}

function productOptionValue(
  formData: FormData,
  key: string,
  otherKey: string,
  label: string,
) {
  const selectedValue = requiredString(formData, key);
  const rawValue = selectedValue === productOtherOptionValue
    ? requiredString(formData, otherKey)
    : selectedValue;
  const normalizedValue = normalizeProductOptionValue(rawValue);

  if (!normalizedValue) {
    throw new Error(`${label} is required.`);
  }

  if (normalizedValue.length > 60) {
    throw new Error(`${label} must be 60 characters or fewer.`);
  }

  return normalizedValue;
}

function productAmountValue(
  formData: FormData,
  key: string,
  type: ProductAmountType,
  label: string,
) {
  const value = nonNegativeNumber(formData, key);

  if (type === "percentage" && value > 100) {
    throw new Error(`${label} percentage cannot exceed 100.`);
  }

  return value;
}

function calculateResellerPrice(
  defaultPrice: number,
  deductionType: ProductAmountType,
  deductionValue: number,
) {
  const resellerPrice = deductionType === "percentage"
    ? defaultPrice * (1 - deductionValue / 100)
    : defaultPrice - deductionValue;

  if (resellerPrice < 0) {
    throw new Error("Reseller deduction cannot exceed the default price.");
  }

  return roundCurrency(resellerPrice);
}

function nonNegativeInteger(formData: FormData, key: string) {
  const value = Number(requiredString(formData, key));

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${toSentenceLabel(key)} must be a non-negative integer.`);
  }

  return value;
}

function optionalNonNegativeInteger(formData: FormData, key: string) {
  const rawValue = optionalString(formData, key);

  if (!rawValue) {
    return null;
  }

  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${toSentenceLabel(key)} must be a non-negative integer.`);
  }

  return value;
}

function nonNegativeNumber(formData: FormData, key: string) {
  const value = Number(requiredString(formData, key));

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${toSentenceLabel(key)} must be a non-negative number.`);
  }

  return value;
}

function optionalNonNegativeNumber(formData: FormData, key: string, fallback: number) {
  const rawValue = optionalString(formData, key);

  if (!rawValue) {
    return fallback;
  }

  const value = Number(rawValue);

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${toSentenceLabel(key)} must be a non-negative number.`);
  }

  return value;
}

function positiveNumber(formData: FormData, key: string) {
  const value = Number(requiredString(formData, key));

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${toSentenceLabel(key)} must be greater than zero.`);
  }

  return value;
}

function parseCreateOrderPaymentPayload(
  formData: FormData,
  adminUserId: string,
): Extract<AdminAction, { type: "create-order" }>["payment"] {
  const amountText = optionalString(formData, "downpaymentAmount");

  if (!amountText) {
    return null;
  }

  const amount = Number(amountText);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Downpayment amount must be greater than zero.");
  }

  return {
    amount,
    payment_method: enumValue(formData, "downpaymentMethod", paymentMethods),
    payment_terms: enumValue(formData, "downpaymentTerms", paymentTermsOptions),
    payment_date: requiredDateTimeFromFormData(formData, "downpaymentDate", "downpaymentTime"),
    recorded_by: adminUserId,
    reference_number: optionalString(formData, "downpaymentReferenceNumber"),
    notes: optionalString(formData, "downpaymentNotes"),
  };
}

function parseOrderItems(formData: FormData) {
  const productIds = formData.getAll("productId");
  const quantities = formData.getAll("quantity");
  const details = formData.getAll("addDetails");
  const itemCount = Math.max(productIds.length, quantities.length, details.length);
  const parsedItems = Array.from({ length: itemCount })
    .map((_, index) => parseOrderItem(productIds[index], quantities[index], details[index]))
    .filter((item): item is NonNullable<typeof item> => item !== null);

  if (parsedItems.length === 0) {
    throw new Error("At least one order item is required.");
  }

  return parsedItems;
}

function parseCreateAgentPayload(
  formData: FormData,
): Extract<AdminAction, { type: "create-agent" }>["payload"] {
  const email = optionalEmail(formData, "email");
  const contact = parseContactNumber(requiredString(formData, "contact"));
  const password = email
    ? z.string().min(8, "Password must be at least 8 characters.").parse(
        requiredString(formData, "password"),
      )
    : optionalString(formData, "password");

  return {
    ...parseAgentProfilePayload(formData),
    email,
    contact,
    password,
    status: "active",
  };
}

function parsePromoteCustomerAccountPayload(
  formData: FormData,
): Extract<AdminAction, { type: "promote-customer-to-agent" }>["account"] {
  const existingEmail = optionalString(formData, "existingEmail");
  const email = existingEmail
    ? z.email("Enter a valid email address.").parse(existingEmail.toLowerCase())
    : z.email("Enter a valid email address.").parse(
        requiredString(formData, "email").toLowerCase(),
      );
  const password = z.string().min(8, "Password must be at least 8 characters.").parse(
    requiredString(formData, "password"),
  );

  return {
    email,
    password,
    employee_id: optionalString(formData, "employeeId"),
  };
}

function parseAgentProfilePayload(formData: FormData) {
  const firstName = requiredString(formData, "firstName");
  const lastName = requiredString(formData, "lastName");

  return {
    employee_id: optionalString(formData, "employeeId"),
    first_name: firstName,
    last_name: lastName,
    display_name: `${firstName} ${lastName}`.trim(),
    address: requiredString(formData, "address"),
  };
}

function parseCustomerFormPayload(
  formData: FormData,
  adminUserId: string,
  options: { isNew: boolean },
): CustomerFormPayload {
  return {
    first_name: requiredString(formData, "firstName"),
    last_name: requiredString(formData, "lastName"),
    phone_number: requiredString(formData, "phoneNumber"),
    email: optionalEmail(formData, "email"),
    address: requiredString(formData, "address"),
    assigned_agent_id: optionalUuid(formData, "assignedAgentId") ?? null,
    is_reseller: formData.get("isReseller") === "on",
    credit_limit: optionalNonNegativeNumber(formData, "creditLimit", DEFAULT_CUSTOMER_CREDIT_LIMIT),
    created_by: options.isNew ? adminUserId : undefined,
    updated_at: new Date().toISOString(),
  };
}

function parseOrderItem(
  productIdValue: FormDataEntryValue | undefined,
  quantityValue: FormDataEntryValue | undefined,
  detailsValue: FormDataEntryValue | undefined,
) {
  const productId = normalizeFormDataEntry(productIdValue);
  const quantityText = normalizeFormDataEntry(quantityValue);
  const addDetails = normalizeFormDataEntry(detailsValue);

  if (!productId && !quantityText && !addDetails) return null;

  if (!productId) {
    throw new Error("Product id is required for every order item.");
  }

  if (!quantityText) {
    throw new Error("Order item quantity is required.");
  }

  const quantity = Number(quantityText);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Order item quantity must be greater than zero.");
  }

  return {
    product_id: uuidSchema.parse(productId),
    partial_quantity: quantity,
    final_quantity: quantity,
    add_details: addDetails || null,
  };
}

function normalizeFormDataEntry(value: FormDataEntryValue | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalSectionImage(formData: FormData, key: string) {
  return requiredProductImage(formData, key, { required: false });
}

function optionalSlideImageFiles(formData: FormData) {
  return formData
    .getAll("slideImages")
    .flatMap((entry) => {
      if (!(entry instanceof File) || entry.size === 0) {
        return [];
      }

      return [entry as ProductImageFile];
    });
}

function parseSlideNewImageIndexes(formData: FormData) {
  const rawValue = optionalString(formData, "slideNewImageIndexes");

  if (!rawValue) {
    return [];
  }

  return rawValue
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 0);
}

function requiredProductImage(
  formData: FormData,
  key: string,
  options: { required: boolean },
) {
  const value = formData.get(key);

  if (!(value instanceof File) || value.size === 0) {
    if (options.required) {
      throw new Error("Product image is required.");
    }

    return null;
  }

  if (!value.type.startsWith("image/")) {
    throw new Error("Product image must be a supported image file.");
  }

  if (value.size > maxProductImageBytes) {
    throw new Error("Product image must be 2 MB or smaller.");
  }

  return value as ProductImageFile;
}

function parseSectionContent(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);

    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      throw new Error("Section content must be a JSON object.");
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Section content must be valid JSON.", { cause: error });
    }

    throw error;
  }
}

function flattenZodErrors(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}

function getActionSuccessMessage(action: AdminAction) {
  switch (action.type) {
    case "save-page-section":
      return "Page section saved.";
    case "save-product":
      return "Product saved.";
    case "save-customer":
      return "Customer saved.";
    case "create-agent":
      return "Agent account created.";
    case "promote-customer-to-agent":
      return "Customer promoted to agent.";
    case "revoke-customer-agent-promotion":
      return "Customer promotion revoked.";
    case "update-agent":
      return "Agent updated.";
    case "set-agent-status":
      return action.status === "active" ? "Agent activated." : "Agent deactivated.";
    case "create-order":
      return "Order created.";
    case "update-order-status":
      return "Order status updated.";
    case "update-order-notes":
      return "Order notes saved.";
    case "mark-order-read":
      return "Order marked as read.";
    case "convert-customer-order-to-agent-distribution":
      return "Customer order converted to agent distribution order.";
    case "update-order-total-commission":
      return "Commission updated.";
    case "update-agent-order-total-commission":
      return "Commission updated.";
    case "update-commission":
      return "Commission updated.";
    case "update-agent-order-commission":
      return "Commission updated.";
    case "update-agent-order-item-quantity":
      return "Product quantity updated.";
    case "add-agent-order-item":
      return "Product added to agent order.";
    case "approve-agent-order":
      return "Agent order approved.";
    case "attach-agent-order-customer":
      return action.entries.length > 1
        ? "Customer orders attached."
        : "Customer order attached.";
    case "update-invoice-item-quantity":
      return "Quantity updated.";
    case "add-order-item":
      return "Order product added.";
    case "remove-order-item":
      return "Order product removed.";
    case "update-order-item-quantity":
      return "Quantity updated.";
    case "record-payment":
      return "Payment recorded.";
    case "confirm-agent-payment":
      return "Agent received payment confirmed.";
    case "confirm-agent-payments":
      return "Agent received payments confirmed.";
    case "record-admin-agent-payment-distribution":
      return "Customer payments distributed.";
    case "apply-customer-payment":
      return "Customer payment distributed.";
    case "apply-customer-orders-payment":
      return "Payment distributed to selected orders.";
    case "create-customer-registration-link":
      return ADMIN_REGISTRATION_LINK_SENT_MESSAGE;
    case "save-invoice":
      return "Invoice saved.";
    case "update-inquiry":
      return "Inquiry updated.";
    case "mark-inquiry-read":
      return "Inquiry marked as read.";
    case "update-reseller-application":
      return "Reseller application updated.";
    case "mark-reseller-application-read":
      return "Reseller application marked as read.";
    case "mark-admin-notification-read":
      return "Notification marked as read.";
    case "mark-all-admin-notifications-read":
      return "Notifications marked as read.";
    case "save-platform-settings-general":
    case "save-platform-settings-privacy":
    case "save-platform-settings-templates":
    case "change-admin-password":
    case "send-agent-password-reset":
      return getPlatformSettingsActionSuccessMessage(action);
  }
}

function getActionRedirectPath(action: AdminAction, fallbackPath: string) {
  if (action.type === "mark-order-read" && action.returnTo) {
    return action.returnTo;
  }

  if (action.type === "convert-customer-order-to-agent-distribution" && action.returnTo) {
    return action.returnTo;
  }

  if (action.type === "record-payment" && action.returnTo) {
    return action.returnTo;
  }

  return fallbackPath;
}

function withActionFeedback(
  path: string,
  key: "status" | "error",
  message: string,
  extra?: {
    registrationLink?: string;
    registrationLinkExpiresAt?: string;
    registrationLinkDuration?: RegistrationLinkDuration;
  },
) {
  const hashIndex = path.indexOf("#");
  const hash = hashIndex >= 0 ? path.slice(hashIndex) : "";
  const pathWithoutHash = hashIndex >= 0 ? path.slice(0, hashIndex) : path;
  const [pathname, search = ""] = pathWithoutHash.split("?", 2);
  const params = new URLSearchParams(search);

  params.set(key, message);

  if (extra?.registrationLink) {
    params.set("registrationLink", extra.registrationLink);
  }

  if (extra?.registrationLinkExpiresAt) {
    params.set("registrationLinkExpiresAt", extra.registrationLinkExpiresAt);
  }

  if (extra?.registrationLinkDuration) {
    params.set("registrationLinkDuration", extra.registrationLinkDuration);
  }

  const query = Array.from(params.entries())
    .map(([paramKey, paramValue]) => `${encodeURIComponent(paramKey)}=${encodeURIComponent(paramValue)}`)
    .join("&");

  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}

function getAdminActionFeedbackCleanPath(url: URL) {
  const cleanUrl = new URL(url.href);

  cleanUrl.searchParams.delete("status");
  cleanUrl.searchParams.delete("error");
  cleanUrl.searchParams.delete("registrationLink");
  cleanUrl.searchParams.delete("registrationLinkExpiresAt");
  cleanUrl.searchParams.delete("registrationLinkDuration");

  return `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`;
}

function normalizeQueryMessage(value: string | null) {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function acceptsJsonResponse(request: Request) {
  if (request.headers.get("Accept")?.includes("application/json")) {
    return true;
  }

  return request.headers.get("X-Requested-With") === "XMLHttpRequest";
}

export function adminRequestPrefersJson(request: Request) {
  return acceptsJsonResponse(request);
}

function toSentenceLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function slugifyFileSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function inferFileExtension(file: ProductImageFile) {
  const nameExtension = file.name.split(".").pop()?.toLowerCase();

  if (nameExtension && /^[a-z0-9]+$/.test(nameExtension)) {
    return nameExtension;
  }

  switch (file.type) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "bin";
  }
}

function createRegistrationToken() {
  return randomBytes(32).toString("base64url");
}

function hashRegistrationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function registrationDurationSeconds(duration: RegistrationLinkDuration) {
  switch (duration) {
    case "30m":
      return 30 * 60;
    case "1h":
      return 60 * 60;
    case "3h":
      return 3 * 60 * 60;
    case "12h":
      return 12 * 60 * 60;
    case "1d":
      return 24 * 60 * 60;
  }
}

export function formatRegistrationLinkDurationLabel(duration: RegistrationLinkDuration) {
  switch (duration) {
    case "30m":
      return "30 minutes";
    case "1h":
      return "1 hour";
    case "3h":
      return "3 hours";
    case "12h":
      return "12 hours";
    case "1d":
      return "1 day";
  }
}

export function formatRegistrationLinkExpiryFeedback(
  expiresAt: string,
  duration: RegistrationLinkDuration,
) {
  return `Expires ${formatDateTime(expiresAt)} (${formatRegistrationLinkDurationLabel(duration)}).`;
}

function parseRegistrationLinkDuration(value: string | null): RegistrationLinkDuration | undefined {
  if (!value) return undefined;

  return registrationLinkDurations.includes(value as RegistrationLinkDuration)
    ? value as RegistrationLinkDuration
    : undefined;
}
