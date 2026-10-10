import { resolvePublicStorageUrl } from "@/lib/supabase/storage";

export const DEFAULT_WEB_LOGO_URL = "/default_logo.png";
export const DEFAULT_WEB_LOGO_FILE_NAME = "default_logo.png";

export function resolveBrandLogoUrl(logoPath: string | null | undefined): string {
  return resolvePublicStorageUrl(logoPath ?? null) ?? DEFAULT_WEB_LOGO_URL;
}

export function hasCustomBrandLogo(logoPath: string | null | undefined): boolean {
  return Boolean(resolvePublicStorageUrl(logoPath ?? null));
}
