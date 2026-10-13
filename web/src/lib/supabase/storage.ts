import { getPublicEnv } from "@/lib/env";

export const PRODUCT_IMAGE_BUCKET = "product-images";

export function resolvePublicStorageUrl(path: string | null | undefined, bucket = PRODUCT_IMAGE_BUCKET) {
  if (!path) {
    return null;
  }

  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("/")) {
    return path;
  }

  const { supabaseUrl } = getPublicEnv();
  const normalizedPath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${normalizedPath}`;
}

export function isManagedStoragePath(path: string | null | undefined, bucket = PRODUCT_IMAGE_BUCKET) {
  return toManagedStorageObjectPath(path, bucket) !== null;
}

export function toManagedStorageObjectPath(path: string | null | undefined, bucket = PRODUCT_IMAGE_BUCKET) {
  const trimmed = path?.trim();
  if (!trimmed || bucket.length === 0) {
    return null;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return objectPathFromStorageUrl(trimmed, bucket);
  }

  if (trimmed.startsWith("/")) {
    return null;
  }

  const bucketPrefix = `${bucket}/`;
  const objectPath = trimmed.startsWith(bucketPrefix)
    ? trimmed.slice(bucketPrefix.length)
    : trimmed;

  return objectPath.length > 0 ? objectPath : null;
}

function objectPathFromStorageUrl(value: string, bucket: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const markers = [
    `/storage/v1/object/public/${bucket}/`,
    `/storage/v1/object/authenticated/${bucket}/`,
    `/storage/v1/object/sign/${bucket}/`,
  ];
  const marker = markers.find((candidate) => url.pathname.includes(candidate));
  if (!marker) {
    return null;
  }

  const encodedPath = url.pathname.slice(url.pathname.indexOf(marker) + marker.length);
  if (!encodedPath) {
    return null;
  }

  try {
    return encodedPath
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
  } catch {
    return null;
  }
}
