import { buildLogoImageDrawCommand } from "@/lib/order-documents/pdf-logo";
import { pdfPageWidth } from "@/lib/order-documents/pdf-document";
import {
  addPdfText,
  DOCUMENT_HEADER_TITLE_FONT_SIZE,
  formatNumber,
} from "@/lib/order-documents/pdf-text";
import type { DocumentLayoutOptions } from "@/lib/platform-settings/types";

type DrawDocumentPageHeaderOptions = {
  logoImage?: DocumentLayoutOptions["logoImage"];
};

export function drawDocumentPageHeader(
  commands: string[],
  brandLines: string[],
  documentTitle: string,
  options: DrawDocumentPageHeaderOptions = {},
) {
  addPdfText(commands, pdfPageWidth / 2, 802, brandLines[0], {
    align: "center",
    size: DOCUMENT_HEADER_TITLE_FONT_SIZE,
    bold: true,
  });
  addPdfText(commands, pdfPageWidth / 2, 786, brandLines[1], { align: "center" });
  addPdfText(commands, pdfPageWidth / 2, 771, brandLines[2], { align: "center" });
  addPdfText(commands, pdfPageWidth / 2, 750, documentTitle, {
    align: "center",
    bold: true,
  });
  drawDocumentLogo(commands, options.logoImage ?? null);
}

function drawDocumentLogo(commands: string[], logoImage: DocumentLayoutOptions["logoImage"]) {
  if (logoImage) {
    commands.push(
      buildLogoImageDrawCommand(logoImage.name, logoImage.width, logoImage.height, {
        centerX: 525,
        centerY: 780,
        maxSize: 60,
      }),
    );
    return;
  }

  drawCircle(commands, 525, 780, 30);
  addPdfText(commands, 525, 778, "LOGO", { align: "center", bold: true });
}

function drawCircle(commands: string[], centerX: number, centerY: number, radius: number) {
  const c = radius * 0.5522847498;
  const x = centerX;
  const y = centerY;

  commands.push([
    `${formatNumber(x + radius)} ${formatNumber(y)} m`,
    `${formatNumber(x + radius)} ${formatNumber(y + c)} ${formatNumber(x + c)} ${formatNumber(y + radius)} ${formatNumber(x)} ${formatNumber(y + radius)} c`,
    `${formatNumber(x - c)} ${formatNumber(y + radius)} ${formatNumber(x - radius)} ${formatNumber(y + c)} ${formatNumber(x - radius)} ${formatNumber(y)} c`,
    `${formatNumber(x - radius)} ${formatNumber(y - c)} ${formatNumber(x - c)} ${formatNumber(y - radius)} ${formatNumber(x)} ${formatNumber(y - radius)} c`,
    `${formatNumber(x + c)} ${formatNumber(y - radius)} ${formatNumber(x + radius)} ${formatNumber(y - c)} ${formatNumber(x + radius)} ${formatNumber(y)} c`,
    "S",
  ].join(" "));
}
