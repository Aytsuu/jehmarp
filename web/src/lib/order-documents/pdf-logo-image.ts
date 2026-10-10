import { Buffer } from "node:buffer";
import { deflateSync, inflateSync } from "node:zlib";

import { PNG } from "pngjs";

const MAX_LOGO_EDGE_PX = 256;

export type DocumentLogoFilter = "DCTDecode" | "FlateDecode";

export type PreparedDocumentLogoImage = {
  width: number;
  height: number;
  filter: DocumentLogoFilter;
  bytes: Uint8Array;
};

export function isJpegImage(bytes: Uint8Array) {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

export function isPngImage(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

export function parseJpegDimensions(bytes: Uint8Array) {
  let offset = 2;

  while (offset < bytes.length - 8) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3) {
      const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
      const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
      if (width > 0 && height > 0) {
        return { width, height };
      }
      return null;
    }

    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2) {
      return null;
    }
    offset += 2 + segmentLength;
  }

  return null;
}

export function prepareDocumentLogoImage(bytes: Uint8Array): PreparedDocumentLogoImage | null {
  if (isJpegImage(bytes)) {
    const dimensions = parseJpegDimensions(bytes);
    if (!dimensions) {
      return null;
    }

    return {
      width: dimensions.width,
      height: dimensions.height,
      filter: "DCTDecode",
      bytes,
    };
  }

  if (!isPngImage(bytes)) {
    return null;
  }

  const png = PNG.sync.read(Buffer.from(bytes));
  if (png.width < 1 || png.height < 1) {
    return null;
  }

  const fitted = fitRgbImage(png.data, png.width, png.height, MAX_LOGO_EDGE_PX);
  return {
    width: fitted.width,
    height: fitted.height,
    filter: "FlateDecode",
    bytes: new Uint8Array(deflateSync(fitted.rgb)),
  };
}

export function inflateDocumentLogoRgb(bytes: Uint8Array) {
  return inflateSync(Buffer.from(bytes));
}

function fitRgbImage(rgba: Buffer, width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const rgb = Buffer.alloc(targetWidth * targetHeight * 3);

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor(((y + 0.5) * height) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor(((x + 0.5) * width) / targetWidth));
      const source = (sourceY * width + sourceX) * 4;
      const target = (y * targetWidth + x) * 3;
      const alpha = rgba[source + 3] / 255;
      const inverseAlpha = 1 - alpha;

      rgb[target] = Math.round(rgba[source] * alpha + 255 * inverseAlpha);
      rgb[target + 1] = Math.round(rgba[source + 1] * alpha + 255 * inverseAlpha);
      rgb[target + 2] = Math.round(rgba[source + 2] * alpha + 255 * inverseAlpha);
    }
  }

  return { rgb, width: targetWidth, height: targetHeight };
}
