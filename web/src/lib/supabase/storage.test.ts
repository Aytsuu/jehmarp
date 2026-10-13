import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PRODUCT_IMAGE_BUCKET,
  isManagedStoragePath,
  resolvePublicStorageUrl,
  toManagedStorageObjectPath,
} from "./storage";

describe("resolvePublicStorageUrl", () => {
  beforeEach(() => {
    vi.stubEnv("PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
    vi.stubEnv("LOCAL_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("LOCAL_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  });

  it("builds a public storage url for managed object paths", () => {
    expect(resolvePublicStorageUrl("products/pork belly.png")).toBe(
      `https://project.supabase.co/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/products/pork%20belly.png`,
    );
  });

  it("preserves absolute and app-local paths", () => {
    expect(resolvePublicStorageUrl("https://cdn.example.test/pork.png")).toBe(
      "https://cdn.example.test/pork.png",
    );
    expect(resolvePublicStorageUrl("/images/pork.png")).toBe("/images/pork.png");
  });
});

describe("isManagedStoragePath", () => {
  it("detects Supabase-managed object paths only", () => {
    expect(isManagedStoragePath("products/pork.png")).toBe(true);
    expect(isManagedStoragePath("/images/pork.png")).toBe(false);
    expect(isManagedStoragePath("https://cdn.example.test/pork.png")).toBe(false);
  });
});

describe("toManagedStorageObjectPath", () => {
  it("keeps object keys that already live in the bucket", () => {
    expect(toManagedStorageObjectPath("products/pork belly.png")).toBe("products/pork belly.png");
  });

  it("strips a leading bucket prefix from a stored full path", () => {
    expect(toManagedStorageObjectPath("product-images/products/pork.png")).toBe("products/pork.png");
  });

  it("reads the object key from a public storage url", () => {
    expect(toManagedStorageObjectPath(
      "http://127.0.0.1:54321/storage/v1/object/public/product-images/products/pork%20belly.png",
    )).toBe("products/pork belly.png");
  });

  it("ignores app-local and external images", () => {
    expect(toManagedStorageObjectPath("/images/pork.png")).toBeNull();
    expect(toManagedStorageObjectPath("https://cdn.example.test/pork.png")).toBeNull();
    expect(toManagedStorageObjectPath("")).toBeNull();
    expect(toManagedStorageObjectPath(null)).toBeNull();
  });
});
