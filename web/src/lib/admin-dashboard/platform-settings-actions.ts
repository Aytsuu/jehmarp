import {
  loadPlatformSettings,
  normalizeBusinessProfile,
  normalizeDefaults,
  normalizeDocumentTemplates,
  normalizeNotifications,
  normalizePrivacyNotice,
  parseTemplateLines,
  savePlatformSettings,
} from "@/lib/platform-settings";
import { syncContactDetailsFromBusinessProfile } from "@/lib/platform-settings/contact-sync";
import { notificationEvents } from "@/lib/platform-settings/types";
import { PRODUCT_IMAGE_BUCKET, isManagedStoragePath, resolvePublicStorageUrl } from "@/lib/supabase/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>;
type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;
type ProductImageFile = File & { name: string };

export type PlatformSettingsGeneralSaveResult = {
  logoPath: string | null;
  logoUrl: string | null;
  primaryEmail: string;
  secondaryEmail: string;
  customerCreditLimit: number;
};

const allowedLogoMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function inferLogoExtension(file: ProductImageFile) {
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
    default:
      return "png";
  }
}

function resolveLogoMimeType(file: ProductImageFile) {
  if (file.type && allowedLogoMimeTypes.has(file.type)) {
    return file.type;
  }

  switch (inferLogoExtension(file)) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return "";
  }
}

async function uploadPlatformLogo(adminClient: SupabaseAdminClient, file: ProductImageFile) {
  const contentType = resolveLogoMimeType(file);
  if (!contentType) {
    throw new Error("Logo must be a JPG, PNG, WebP, or GIF image.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Logo must be 2 MB or smaller.");
  }

  const objectPath = `platform/logo-${crypto.randomUUID()}.${inferLogoExtension(file)}`;
  const { data, error } = await adminClient.storage.from(PRODUCT_IMAGE_BUCKET).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });

  if (error || !data?.path) {
    throw new Error("Unable to upload logo.");
  }

  return data.path;
}

async function removePlatformLogo(adminClient: SupabaseAdminClient, logoPath: string | null | undefined) {
  if (logoPath && isManagedStoragePath(logoPath)) {
    await adminClient.storage.from(PRODUCT_IMAGE_BUCKET).remove([logoPath]);
  }
}

export type PlatformSettingsAdminAction =
  | {
      type: "save-platform-settings-general";
      businessProfile: ReturnType<typeof normalizeBusinessProfile>;
      defaults: ReturnType<typeof normalizeDefaults>;
      logoFile: ProductImageFile | null;
      removeLogo: boolean;
    }
  | {
      type: "save-platform-settings-privacy";
      privacyNotice: ReturnType<typeof normalizePrivacyNotice>;
    }
  | {
      type: "save-platform-settings-templates";
      documentTemplates: ReturnType<typeof normalizeDocumentTemplates>;
    }
  | { type: "change-admin-password"; currentPassword: string; newPassword: string; confirmPassword: string }
  | { type: "send-agent-password-reset"; agentId: string };

const PLATFORM_ACTIONS = [
  "save-platform-settings-general",
  "save-platform-settings-privacy",
  "save-platform-settings-templates",
  "change-admin-password",
  "send-agent-password-reset",
] as const;

export function isPlatformSettingsAdminAction(actionName: string) {
  return (PLATFORM_ACTIONS as readonly string[]).includes(actionName);
}

function requiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${key} is required.`);
  return value.trim();
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalEmail(formData: FormData, key: string) {
  const value = optionalString(formData, key);
  if (!value) {
    return "";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`${key} must be a valid email.`);
  }

  return value.toLowerCase();
}

function buildNotificationRoutes(primaryEmail: string, secondaryEmail: string) {
  return notificationEvents.map((event) => ({
    event,
    primaryEmail,
    secondaryEmail,
  }));
}

export function parsePlatformSettingsAdminAction(actionName: string, formData: FormData): PlatformSettingsAdminAction {
  switch (actionName) {
    case "save-platform-settings-general": {
      const creditLimit = Number(requiredString(formData, "customerCreditLimit"));
      if (!Number.isFinite(creditLimit) || creditLimit < 0) {
        throw new Error("Default customer credit limit must be zero or greater.");
      }

      const logoFile = formData.get("logoFile");
      const primaryEmail = optionalEmail(formData, "primaryEmail");
      const secondaryEmail = optionalEmail(formData, "secondaryEmail");
      return {
        type: "save-platform-settings-general",
        businessProfile: normalizeBusinessProfile({
          tradeName: requiredString(formData, "tradeName"),
          phone: requiredString(formData, "phone"),
          primaryEmail,
          secondaryEmail,
          logoPath: optionalString(formData, "logoPath") || null,
        }),
        defaults: normalizeDefaults({ customerCreditLimit: creditLimit }),
        logoFile: logoFile instanceof File && logoFile.size > 0 ? logoFile as ProductImageFile : null,
        removeLogo: formData.get("removeLogo") === "on",
      };
    }
    case "save-platform-settings-privacy": {
      const privacyContactEmail = optionalEmail(formData, "privacyContactEmail");
      if (!privacyContactEmail) {
        throw new Error("privacyContactEmail must be a valid email.");
      }

      return {
        type: "save-platform-settings-privacy",
        privacyNotice: normalizePrivacyNotice({
          controllerLegalName: requiredString(formData, "controllerLegalName"),
          philippineBusinessAddress: requiredString(formData, "philippineBusinessAddress"),
          privacyContactEmail,
          noticeVersion: requiredString(formData, "noticeVersion"),
          effectiveDate: requiredString(formData, "effectiveDate"),
          retentionInquiries: requiredString(formData, "retentionInquiries"),
          retentionResellerApplications: requiredString(formData, "retentionResellerApplications"),
          retentionOrders: requiredString(formData, "retentionOrders"),
          retentionAccounts: requiredString(formData, "retentionAccounts"),
          retentionSecurityLogs: requiredString(formData, "retentionSecurityLogs"),
          retentionBackups: requiredString(formData, "retentionBackups"),
        }),
      };
    }
    case "save-platform-settings-templates":
      return {
        type: "save-platform-settings-templates",
        documentTemplates: normalizeDocumentTemplates({
          header: {
            businessName: requiredString(formData, "documentHeaderBusinessName"),
            address: requiredString(formData, "documentHeaderAddress"),
            phoneLine: requiredString(formData, "documentHeaderPhoneLine"),
          },
          orderSlip: {
            sellerName: requiredString(formData, "orderSlipSellerName"),
            acceptedByName: optionalString(formData, "orderSlipAcceptedByName"),
            deliveryPreferences: parseTemplateLines(requiredString(formData, "orderSlipDeliveryPreferences")),
            paymentTerms: parseTemplateLines(requiredString(formData, "orderSlipPaymentTerms")),
          },
          salesInvoice: {
            issuedByName: optionalString(formData, "salesInvoiceIssuedByName"),
            issuedBySubline: requiredString(formData, "salesInvoiceIssuedBySubline"),
            modeOfPayment: parseTemplateLines(requiredString(formData, "salesInvoiceModeOfPayment")),
          },
        }),
      };
    case "change-admin-password": {
      const currentPassword = requiredString(formData, "currentPassword");
      const newPassword = requiredString(formData, "newPassword");
      const confirmPassword = requiredString(formData, "confirmPassword");
      if (newPassword.length < 8) throw new Error("New password must be at least 8 characters.");
      if (newPassword !== confirmPassword) throw new Error("New password confirmation does not match.");
      return { type: "change-admin-password", currentPassword, newPassword, confirmPassword };
    }
    case "send-agent-password-reset":
      return {
        type: "send-agent-password-reset",
        agentId: requiredString(formData, "agentId"),
      };
    default:
      throw new Error("Unknown admin action.");
  }
}

export function getPlatformSettingsActionSuccessMessage(action: PlatformSettingsAdminAction) {
  switch (action.type) {
    case "save-platform-settings-general":
      return "Settings saved.";
    case "save-platform-settings-privacy":
      return "Privacy notice settings saved.";
    case "save-platform-settings-templates":
      return "Document template settings saved.";
    case "change-admin-password":
      return "Password updated.";
    case "send-agent-password-reset":
      return "Password reset email sent.";
  }
}

export async function executePlatformSettingsAdminAction(
  supabase: SupabaseServerClient,
  action: PlatformSettingsAdminAction,
  adminUserId: string,
  options: { adminEmail?: string | null; siteOrigin?: string } = {},
): Promise<PlatformSettingsGeneralSaveResult | void> {
  const adminClient = createSupabaseAdminClient();

  switch (action.type) {
    case "save-platform-settings-general":
      return executeGeneralSettingsSave(adminClient, action, adminUserId);
    case "save-platform-settings-privacy":
      await savePlatformSettings(adminClient, { privacyNotice: action.privacyNotice }, adminUserId);
      return;
    case "save-platform-settings-templates":
      await savePlatformSettings(adminClient, { documentTemplates: action.documentTemplates }, adminUserId);
      return;
    case "change-admin-password":
      await executeAdminPasswordChange(supabase, action, options.adminEmail);
      return;
    case "send-agent-password-reset":
      await executeAgentPasswordReset(adminClient, action, options.siteOrigin);
      return;
  }
}

async function executeGeneralSettingsSave(
  adminClient: SupabaseAdminClient,
  action: Extract<PlatformSettingsAdminAction, { type: "save-platform-settings-general" }>,
  adminUserId: string,
): Promise<PlatformSettingsGeneralSaveResult> {
  const current = await loadPlatformSettings(adminClient);
  let logoPath = action.businessProfile.logoPath ?? current.businessProfile.logoPath;

  if (action.removeLogo) {
    await removePlatformLogo(adminClient, logoPath);
    logoPath = null;
  }

  if (action.logoFile) {
    await removePlatformLogo(adminClient, current.businessProfile.logoPath);
    logoPath = await uploadPlatformLogo(adminClient, action.logoFile);
  }

  const businessProfile = normalizeBusinessProfile({
    ...current.businessProfile,
    tradeName: action.businessProfile.tradeName,
    phone: action.businessProfile.phone,
    primaryEmail: action.businessProfile.primaryEmail,
    secondaryEmail: action.businessProfile.secondaryEmail,
    logoPath,
  });

  await savePlatformSettings(
    adminClient,
    {
      businessProfile,
      defaults: action.defaults,
      notifications: normalizeNotifications({
        routes: buildNotificationRoutes(
          businessProfile.primaryEmail,
          businessProfile.secondaryEmail,
        ),
      }),
    },
    adminUserId,
  );

  await syncContactDetailsFromBusinessProfile(adminClient, {
    phone: businessProfile.phone,
    primaryEmail: businessProfile.primaryEmail,
  });

  return {
    logoPath,
    logoUrl: resolvePublicStorageUrl(logoPath),
    primaryEmail: businessProfile.primaryEmail,
    secondaryEmail: businessProfile.secondaryEmail,
    customerCreditLimit: action.defaults.customerCreditLimit,
  };
}

async function executeAdminPasswordChange(
  supabase: SupabaseServerClient,
  action: Extract<PlatformSettingsAdminAction, { type: "change-admin-password" }>,
  adminEmail?: string | null,
) {
  if (!adminEmail) throw new Error("Unable to verify the current admin account.");
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: action.currentPassword,
  });
  if (signInError) throw new Error("Current password is incorrect.");
  const { error } = await supabase.auth.updateUser({ password: action.newPassword });
  if (error) throw new Error(error.message || "Unable to update password.");
}

async function executeAgentPasswordReset(
  adminClient: SupabaseAdminClient,
  action: Extract<PlatformSettingsAdminAction, { type: "send-agent-password-reset" }>,
  siteOrigin?: string,
) {
  const { data: agent, error } = await adminClient
    .from("agent")
    .select("id, user_id")
    .eq("id", action.agentId)
    .maybeSingle();

  if (error || !agent?.user_id) {
    throw new Error("Agent account was not found.");
  }

  const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(agent.user_id);
  const email = authData.user?.email?.trim();

  if (authError || !email) {
    throw new Error("This agent does not have a login email on file.");
  }

  const { error: resetError } = await adminClient.auth.resetPasswordForEmail(email, {
    redirectTo: siteOrigin ? `${siteOrigin}/login` : undefined,
  });

  if (resetError) {
    throw new Error(resetError.message || "Unable to send password reset email.");
  }
}
