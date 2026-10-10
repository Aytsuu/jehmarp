import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  inflateDocumentLogoRgb,
  isJpegImage,
  isPngImage,
  prepareDocumentLogoImage,
} from "./pdf-logo-image";

describe("pdf-logo-image", () => {
  it("detects jpeg and png signatures", () => {
    expect(isJpegImage(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toBe(true);
    expect(isPngImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      true,
    );
  });

  it("prepares the default public logo as a PDF flate image", async () => {
    const logoPath = path.join(process.cwd(), "public", "default_logo.png");
    const bytes = new Uint8Array(await readFile(logoPath));
    const prepared = prepareDocumentLogoImage(bytes);

    expect(prepared).not.toBeNull();
    expect(prepared?.filter).toBe("FlateDecode");
    expect(prepared?.width).toBeLessThanOrEqual(256);
    expect(prepared?.height).toBeLessThanOrEqual(256);
    expect(inflateDocumentLogoRgb(prepared!.bytes).byteLength).toBe(
      (prepared?.width ?? 0) * (prepared?.height ?? 0) * 3,
    );
  });
});
