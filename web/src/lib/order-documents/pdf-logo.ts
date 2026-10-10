import { Buffer } from "node:buffer";

import {
  DEFAULT_DOCUMENT_LOGO_FLATE_BASE64,
  DEFAULT_DOCUMENT_LOGO_HEIGHT,
  DEFAULT_DOCUMENT_LOGO_WIDTH,
} from "@/lib/order-documents/default-document-logo";
import { prepareDocumentLogoImage } from "@/lib/order-documents/pdf-logo-image";
import type { DocumentLogoImage } from "@/lib/platform-settings/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PRODUCT_IMAGE_BUCKET } from "@/lib/supabase/storage";

export const DOCUMENT_LOGO_IMAGE_NAME = "ImLogo";

export async function loadDocumentLogoImage(
  logoPath: string | null | undefined,
  supabase: ReturnType<typeof createSupabaseAdminClient> = createSupabaseAdminClient(),
): Promise<DocumentLogoImage | null> {
  if (logoPath?.trim()) {
    const uploadedLogo = await loadDocumentLogoImageFromStorage(logoPath, supabase);
    if (uploadedLogo) {
      return uploadedLogo;
    }
  }

  return loadBundledDefaultDocumentLogoImage();
}

async function loadDocumentLogoImageFromStorage(
  logoPath: string,
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<DocumentLogoImage | null> {
  const { data, error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).download(logoPath);
  if (error || !data) {
    return null;
  }

  const input = new Uint8Array(await data.arrayBuffer());
  return toDocumentLogoImage(prepareDocumentLogoImage(input));
}

function loadBundledDefaultDocumentLogoImage(): DocumentLogoImage {
  return {
    name: DOCUMENT_LOGO_IMAGE_NAME,
    width: DEFAULT_DOCUMENT_LOGO_WIDTH,
    height: DEFAULT_DOCUMENT_LOGO_HEIGHT,
    filter: "FlateDecode",
    bytes: Uint8Array.from(Buffer.from(DEFAULT_DOCUMENT_LOGO_FLATE_BASE64, "base64")),
  };
}

function toDocumentLogoImage(
  prepared: ReturnType<typeof prepareDocumentLogoImage>,
): DocumentLogoImage | null {
  if (!prepared) {
    return null;
  }

  return {
    name: DOCUMENT_LOGO_IMAGE_NAME,
    width: prepared.width,
    height: prepared.height,
    filter: prepared.filter,
    bytes: prepared.bytes,
  };
}

export function buildLogoImageDrawCommand(
  imageName: string,
  imageWidth: number,
  imageHeight: number,
  box: { centerX: number; centerY: number; maxSize: number },
) {
  const scale = Math.min(box.maxSize / imageWidth, box.maxSize / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const x = box.centerX - drawWidth / 2;
  const y = box.centerY - drawHeight / 2;

  return [
    "q",
    `${formatPdfNumber(drawWidth)} 0 0 ${formatPdfNumber(drawHeight)} ${formatPdfNumber(x)} ${formatPdfNumber(y)} cm`,
    `/${imageName} Do`,
    "Q",
  ].join("\n");
}

function formatPdfNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
