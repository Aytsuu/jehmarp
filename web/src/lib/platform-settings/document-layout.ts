import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DocumentLayoutOptions } from "@/lib/order-documents/layout";
import { loadPlatformSettings, type PlatformSettings } from "./index";

export function toDocumentLayoutOptions(settings: PlatformSettings): DocumentLayoutOptions {
  return {
    businessProfile: settings.businessProfile,
    documentPayment: settings.documentPayment,
    documentTemplates: settings.documentTemplates,
  };
}

export async function loadDocumentLayoutOptions(
  supabase: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient(),
): Promise<DocumentLayoutOptions> {
  return toDocumentLayoutOptions(await loadPlatformSettings(supabase));
}

export async function loadDocumentPdfLayoutOptions(
  supabase: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient(),
): Promise<DocumentLayoutOptions> {
  const settings = await loadPlatformSettings(supabase);
  const { loadDocumentLogoImage } = await import("@/lib/order-documents/pdf-logo");
  const logoImage = await loadDocumentLogoImage(settings.businessProfile.logoPath, supabase);

  return {
    ...toDocumentLayoutOptions(settings),
    logoImage,
  };
}
