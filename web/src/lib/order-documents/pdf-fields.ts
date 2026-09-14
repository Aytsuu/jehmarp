import {
  addPdfText,
  DOCUMENT_BODY_FONT_SIZE,
  estimatePdfTextWidth,
  formatNumber,
} from "@/lib/order-documents/pdf-text";
import type { DocumentLabeledField } from "@/lib/order-documents/layout";

const UNDERLINE_OFFSET = 4;

export type DrawPdfLabeledFieldOptions = {
  size?: number;
  labelGap?: number;
  underlinePadding?: number;
  minUnderlineWidth?: number;
  maxUnderlineEndX?: number;
  underline?: boolean;
};

export function formatDocumentFieldLabel(field: DocumentLabeledField) {
  return `${field.label}${field.labelSuffix ?? ":"}`;
}

export function drawPdfFieldUnderline(
  commands: string[],
  x1: number,
  baselineY: number,
  x2: number,
) {
  const y = baselineY - UNDERLINE_OFFSET;
  commands.push(`${formatNumber(x1)} ${formatNumber(y)} m ${formatNumber(x2)} ${formatNumber(y)} l S`);
}

export function drawPdfLabeledField(
  commands: string[],
  x: number,
  y: number,
  field: DocumentLabeledField,
  options: DrawPdfLabeledFieldOptions = {},
) {
  const size = options.size ?? DOCUMENT_BODY_FONT_SIZE;
  const labelGap = options.labelGap ?? 4;
  const underlinePadding = options.underlinePadding ?? 10;
  const labelText = formatDocumentFieldLabel(field);

  addPdfText(commands, x, y, labelText, { size });

  const valueX = x + estimatePdfTextWidth(labelText, size) + labelGap;
  const hasValue = Boolean(field.value?.trim());
  if (hasValue) {
    addPdfText(commands, valueX, y, field.value, { size });
  }

  const valueUnderlineWidth = hasValue
    ? estimatePdfTextWidth(field.value, size) + underlinePadding
    : (options.minUnderlineWidth ?? 80);

  if (options.underline === false) {
    return;
  }

  let underlineEndX = valueX + valueUnderlineWidth;
  if (options.maxUnderlineEndX !== undefined) {
    underlineEndX = Math.min(underlineEndX, options.maxUnderlineEndX);
  }

  drawPdfFieldUnderline(commands, valueX, y, underlineEndX);
}
