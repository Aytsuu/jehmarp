import { DEFAULT_PLATFORM_SETTINGS } from "./defaults";
import { mergePlatformSettings, normalizePlatformSettings } from "./normalize";
import type { PlatformSettings, PlatformSettingsPatch } from "./types";
import { PLATFORM_SETTINGS_SINGLETON_ID } from "./types";

type SettingsClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: { settings?: unknown } | null; error: { message?: string } | null }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => PromiseLike<{ error: { message?: string } | null }>;
    };
  };
  rpc?: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message?: string } | null }>;
};

export function asPlatformSettingsClient(client: unknown): SettingsClient {
  return client as SettingsClient;
}

function cloneDefaults(): PlatformSettings {
  return {
    businessProfile: { ...DEFAULT_PLATFORM_SETTINGS.businessProfile },
    documentPayment: { ...DEFAULT_PLATFORM_SETTINGS.documentPayment },
    defaults: { ...DEFAULT_PLATFORM_SETTINGS.defaults },
    notifications: { routes: DEFAULT_PLATFORM_SETTINGS.notifications.routes.map((route) => ({ ...route })) },
    documentNumbering: { ...DEFAULT_PLATFORM_SETTINGS.documentNumbering },
    privacyNotice: { ...DEFAULT_PLATFORM_SETTINGS.privacyNotice },
    documentTemplates: {
      header: { ...DEFAULT_PLATFORM_SETTINGS.documentTemplates.header },
      orderSlip: {
        ...DEFAULT_PLATFORM_SETTINGS.documentTemplates.orderSlip,
        deliveryPreferences: [...DEFAULT_PLATFORM_SETTINGS.documentTemplates.orderSlip.deliveryPreferences],
        paymentTerms: [...DEFAULT_PLATFORM_SETTINGS.documentTemplates.orderSlip.paymentTerms],
      },
      salesInvoice: {
        ...DEFAULT_PLATFORM_SETTINGS.documentTemplates.salesInvoice,
        modeOfPayment: [...DEFAULT_PLATFORM_SETTINGS.documentTemplates.salesInvoice.modeOfPayment],
      },
    },
  };
}

function isMissingPlatformSettingsTable(error: { code?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const message = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST205"
    || error.code === "42P01"
    || (message.includes("platform_settings") && message.includes("does not exist"))
    || message.includes("could not find the table")
  );
}

export async function loadPlatformSettings(client: unknown): Promise<PlatformSettings> {
  const settingsClient = asPlatformSettingsClient(client);
  const { data, error } = await settingsClient
    .from("platform_settings")
    .select("settings")
    .eq("id", PLATFORM_SETTINGS_SINGLETON_ID)
    .maybeSingle();

  if (error) {
    if (isMissingPlatformSettingsTable(error)) {
      return cloneDefaults();
    }
    throw new Error("Unable to load platform settings.");
  }
  if (!data?.settings) return cloneDefaults();
  return normalizePlatformSettings(data.settings);
}

export async function savePlatformSettings(
  client: unknown,
  patch: PlatformSettingsPatch,
  userId: string,
): Promise<PlatformSettings> {
  const settingsClient = asPlatformSettingsClient(client);
  const current = await loadPlatformSettings(settingsClient);
  const next = mergePlatformSettings(current, patch);

  const { error } = await settingsClient
    .from("platform_settings")
    .update({ settings: next, updated_at: new Date().toISOString(), updated_by: userId })
    .eq("id", PLATFORM_SETTINGS_SINGLETON_ID);

  if (error) throw new Error("Unable to save platform settings.");

  if (patch.documentNumbering?.invoiceNext !== undefined && settingsClient.rpc) {
    const { error: sequenceError } = await settingsClient.rpc("sync_invoice_sequence_from_settings", {
      target_next: next.documentNumbering.invoiceNext,
    });
    if (sequenceError) throw new Error(sequenceError.message || "Unable to sync invoice sequence.");
  }

  return next;
}
