export const DOCUMENT_BODY_FONT_SIZE = 8;
export const DOCUMENT_HEADER_TITLE_FONT_SIZE = 10;

export type PdfTextOptions = {
  size?: number;
  align?: "left" | "center" | "right";
  italic?: boolean;
  bold?: boolean;
};

export function resolvePdfFont(options: PdfTextOptions): string {
  if (options.bold) {
    return "F3";
  }
  if (options.italic) {
    return "F2";
  }
  return "F1";
}

export function addPdfText(
  commands: string[],
  x: number,
  y: number,
  value: string | null | undefined,
  options: PdfTextOptions = {},
) {
  const size = options.size ?? DOCUMENT_BODY_FONT_SIZE;
  const text = sanitizePdfText(value);
  if (!text) {
    return;
  }

  const adjustedX = getAlignedX(x, text, size, options.align ?? "left");
  const fontName = resolvePdfFont(options);

  commands.push(
    `BT /${fontName} ${size} Tf 1 0 0 1 ${formatNumber(adjustedX)} ${formatNumber(y)} Tm (${escapePdfText(text)}) Tj ET`,
  );
}

export function estimatePdfTextWidth(value: string, size: number) {
  return value.length * size * 0.52;
}

export function getAlignedX(x: number, value: string, size: number, align: "left" | "center" | "right") {
  if (align === "left") {
    return x;
  }

  const estimatedWidth = estimatePdfTextWidth(value, size);
  return align === "center" ? x - estimatedWidth / 2 : x - estimatedWidth;
}

export function sanitizePdfText(value: string | null | undefined) {
  return (value ?? "").replace(/[^\x20-\x7E]/g, "?");
}

export function escapePdfText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

export function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
