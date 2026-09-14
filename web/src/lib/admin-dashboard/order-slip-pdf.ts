import type { DocumentLayoutOptions } from "@/lib/order-documents/layout";
import {
  buildOrderSlipLayout,
} from "@/lib/order-documents/layout";
import type { DocumentOrder, DocumentOrderItem } from "@/lib/order-documents/view";
import { buildPdfDocument, documentTableTopY } from "@/lib/order-documents/pdf-document";
import { drawPdfLabeledField } from "@/lib/order-documents/pdf-fields";
import { drawDocumentPageHeader } from "@/lib/order-documents/pdf-header";
import {
  addPdfText,
  DOCUMENT_BODY_FONT_SIZE,
  estimatePdfTextWidth,
  formatNumber,
  type PdfTextOptions,
} from "@/lib/order-documents/pdf-text";

const marginX = 40;
const rightMargin = 555;
const secondColumnX = 310;
const tableRowsPerPage = 10;

type TextOptions = PdfTextOptions;

type OrderSlipPage = {
  items: DocumentOrderItem[];
  pageNumber: number;
  pageCount: number;
};

export function buildOrderSlipContentStreams(order: DocumentOrder, options: DocumentLayoutOptions = {}): string[] {
  const pages = chunkOrderItems(order.customer_order_item);
  return pages.map((items, index) => buildOrderSlipPageContent(order, {
    items, pageNumber: index + 1, pageCount: pages.length,
  }, options));
}

export function buildOrderSlipPdf(order: DocumentOrder, options: DocumentLayoutOptions = {}): Uint8Array {
  return buildPdfDocument(buildOrderSlipContentStreams(order, options), {
    logoImage: options.logoImage ?? null,
  });
}

export function buildBulkOrderSlipPdf(orders: DocumentOrder[], options: DocumentLayoutOptions = {}): Uint8Array {
  const contentStreams = orders.flatMap((order) => buildOrderSlipContentStreams(order, options));

  if (contentStreams.length === 0) {
    throw new Error("No order slip pages to generate.");
  }

  return buildPdfDocument(contentStreams, {
    logoImage: options.logoImage ?? null,
  });
}

function chunkOrderItems(items: DocumentOrderItem[]) {
  if (items.length === 0) return [[]];

  return Array.from({ length: Math.ceil(items.length / tableRowsPerPage) }, (_, index) => {
    const start = index * tableRowsPerPage;
    return items.slice(start, start + tableRowsPerPage);
  });
}

function buildOrderSlipPageContent(order: DocumentOrder, page: OrderSlipPage, options: DocumentLayoutOptions = {}) {
  const commands: string[] = [];
  const layout = buildOrderSlipLayout(order, options);
  drawHeader(commands, page, layout, options);
  drawOrderFields(commands, layout);
  const tableBottomY = drawItemsTable(commands, page.items, options);
  drawOrderTotal(commands, layout, tableBottomY);
  drawTermsAndSignatures(commands, layout);
  return commands.join("\n");
}

function drawHeader(
  commands: string[],
  page: OrderSlipPage,
  layout: ReturnType<typeof buildOrderSlipLayout>,
  options: DocumentLayoutOptions = {},
) {
  drawDocumentPageHeader(
    commands,
    layout.brandLines,
    page.pageCount > 1 ? `ORDER SLIP - Page ${page.pageNumber}` : "ORDER SLIP",
    { logoImage: options.logoImage },
  );
}

function drawOrderFields(commands: string[], layout: ReturnType<typeof buildOrderSlipLayout>) {
  drawPdfLabeledField(commands, marginX, 717, layout.dateField);
  drawPdfLabeledField(commands, marginX, 695, layout.sellerField, {
    maxUnderlineEndX: secondColumnX - 16,
    minUnderlineWidth: 80,
  });
  drawPdfLabeledField(commands, secondColumnX, 695, layout.orderedByField, {
    maxUnderlineEndX: rightMargin,
    minUnderlineWidth: 80,
  });
}

function drawItemsTable(commands: string[], items: DocumentOrderItem[], options: DocumentLayoutOptions = {}) {
  const layout = buildOrderSlipLayout({
    id: "", created_at: "", customer: null, agent: null, customer_order_item: items, invoice: [],
  }, options);
  const tableColumnWidths = layout.columns.map((column) => column.width);
  const tableTopY = documentTableTopY;
  const rowHeight = 24;
  const tableWidth = tableColumnWidths.reduce((total, width) => total + width, 0);
  const tableLeftX = marginX;
  const rowCount = items.length + 1;
  const tableBottomY = tableTopY - rowHeight * rowCount;

  drawRect(commands, tableLeftX, tableBottomY, tableWidth, rowHeight * rowCount);

  let currentX = tableLeftX;
  tableColumnWidths.slice(0, -1).forEach((width) => {
    currentX += width;
    drawLine(commands, currentX, tableBottomY, currentX, tableTopY);
  });

  Array.from({ length: rowCount + 1 }).forEach((_, index) => {
    const y = tableTopY - rowHeight * index;
    drawLine(commands, tableLeftX, y, tableLeftX + tableWidth, y);
  });

  const headerY = tableTopY - 16;
  addText(commands, tableLeftX + 6, headerY, layout.columns[0].label);
  addText(commands, tableLeftX + 151, headerY, layout.columns[1].label);
  addText(commands, tableLeftX + 211, headerY, layout.columns[2].label);
  addText(commands, tableLeftX + 286, headerY, layout.columns[3].label);
  addText(commands, tableLeftX + 361, headerY, layout.columns[4].label);

  layout.rows.forEach((row, index) => {
    const rowY = tableTopY - rowHeight * (index + 1) - 16;

    addText(commands, tableLeftX + 6, rowY, truncate(row.cells[0], 24));
    addText(commands, tableLeftX + 151, rowY, row.cells[1]);
    addText(commands, tableLeftX + 211, rowY, row.cells[2]);
    addText(commands, tableLeftX + 286, rowY, row.cells[3]);
    addText(commands, tableLeftX + 361, rowY, truncate(row.cells[4], 28));
  });

  return tableBottomY;
}

function drawOrderTotal(commands: string[], layout: ReturnType<typeof buildOrderSlipLayout>, tableBottomY: number) {
  const totalY = tableBottomY - 24;
  drawPdfLabeledField(commands, 390, totalY, layout.totalField, {
    labelGap: 40,
    underline: false,
  });
}

function drawTermsAndSignatures(commands: string[], layout: ReturnType<typeof buildOrderSlipLayout>) {
  addText(commands, 40, 348, layout.deliveryHeading, { bold: true });
  layout.deliveryLines.forEach((line, index) => {
    addText(commands, 40, 330 - index * 18, line);
  });

  addText(commands, 40, 277, layout.paymentHeading, { bold: true });
  layout.paymentLines.forEach((line, index) => {
    addText(commands, 40, 259 - index * 18, line);
  });

  const paymentDueLabelX = 40;
  addText(commands, paymentDueLabelX, 223, layout.paymentDueHeading, { bold: true });
  addText(
    commands,
    paymentDueLabelX + estimatePdfTextWidth(layout.paymentDueHeading, DOCUMENT_BODY_FONT_SIZE) + 4,
    223,
    layout.paymentDueLine,
  );
  addText(commands, 40, 184, layout.confirmationText, { italic: true });

  addText(commands, 40, 145, layout.buyerSignatureLines[0], { bold: true });
  addText(commands, 40, 120, layout.buyerSignatureLines[1]);
  addText(commands, 40, 98, layout.buyerSignatureLines[2]);
  addText(commands, 40, 76, layout.buyerSignatureLines[3]);

  addText(commands, 330, 145, layout.sellerSignatureHeading, { bold: true });
  drawPdfLabeledField(commands, 330, 120, layout.sellerNameField, {
    maxUnderlineEndX: 520,
    minUnderlineWidth: 100,
  });
  addText(commands, 330, 98, layout.sellerSignatureLines[0]);
  addText(commands, 330, 76, layout.sellerSignatureLines[1]);
}

function addText(commands: string[], x: number, y: number, value: string | null | undefined, options: TextOptions = {}) {
  addPdfText(commands, x, y, value, options);
}

function drawLine(commands: string[], x1: number, y1: number, x2: number, y2: number) {
  commands.push(`${formatNumber(x1)} ${formatNumber(y1)} m ${formatNumber(x2)} ${formatNumber(y2)} l S`);
}

function drawRect(commands: string[], x: number, y: number, width: number, height: number) {
  commands.push(`${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re S`);
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}
