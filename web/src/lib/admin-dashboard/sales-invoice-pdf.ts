import type { DocumentLayoutOptions } from "@/lib/order-documents/layout";
import { buildSalesInvoiceLayout } from "@/lib/order-documents/layout";
import type { DocumentOrder, DocumentOrderItem } from "@/lib/order-documents/view";
import { buildPdfDocument, documentTableTopY } from "@/lib/order-documents/pdf-document";
import { drawPdfLabeledField } from "@/lib/order-documents/pdf-fields";
import { drawDocumentPageHeader } from "@/lib/order-documents/pdf-header";
import {
  addPdfText,
  DOCUMENT_BODY_FONT_SIZE,
  formatNumber,
  getAlignedX,
  sanitizePdfText,
  type PdfTextOptions,
} from "@/lib/order-documents/pdf-text";

const marginX = 40;
const rightMargin = 555;
const secondColumnX = 310;
const tableRowsPerPage = 10;

type TextOptions = PdfTextOptions;

type SalesInvoicePage = {
  items: DocumentOrderItem[];
  pageNumber: number;
  pageCount: number;
};

export function buildSalesInvoiceContentStreams(order: DocumentOrder, options: DocumentLayoutOptions = {}): string[] {
  const pages = chunkOrderItems(order.customer_order_item);
  return pages.map((items, index) => buildSalesInvoicePageContent(order, {
    items, pageNumber: index + 1, pageCount: pages.length,
  }, options));
}

export function buildSalesInvoicePdf(order: DocumentOrder, options: DocumentLayoutOptions = {}): Uint8Array {
  return buildPdfDocument(buildSalesInvoiceContentStreams(order, options), {
    logoImage: options.logoImage ?? null,
  });
}

export function buildBulkSalesInvoicePdf(orders: DocumentOrder[], options: DocumentLayoutOptions = {}): Uint8Array {
  const contentStreams = orders.flatMap((order) => buildSalesInvoiceContentStreams(order, options));

  if (contentStreams.length === 0) {
    throw new Error("No sales invoice pages to generate.");
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

function buildSalesInvoicePageContent(order: DocumentOrder, page: SalesInvoicePage, options: DocumentLayoutOptions = {}) {
  const commands: string[] = [];
  const layout = buildSalesInvoiceLayout(order, options);
  drawHeader(commands, page, layout, options);
  drawInvoiceFields(commands, layout);
  const tableBottomY = drawItemsTable(commands, page.items, options);
  drawInvoiceTotal(commands, layout, tableBottomY);
  drawPaymentAndIssuer(commands, layout);
  return commands.join("\n");
}

function drawHeader(
  commands: string[],
  page: SalesInvoicePage,
  layout: ReturnType<typeof buildSalesInvoiceLayout>,
  options: DocumentLayoutOptions = {},
) {
  drawDocumentPageHeader(
    commands,
    layout.brandLines,
    page.pageCount > 1 ? `SALES INVOICE - Page ${page.pageNumber}` : "SALES INVOICE",
    { logoImage: options.logoImage },
  );
}

function drawInvoiceFields(commands: string[], layout: ReturnType<typeof buildSalesInvoiceLayout>) {
  drawPdfLabeledField(commands, marginX, 717, layout.dateField);
  drawPdfLabeledField(commands, marginX, 695, layout.soldToField, {
    maxUnderlineEndX: 280,
    minUnderlineWidth: 80,
  });
  drawPdfLabeledField(commands, secondColumnX, 695, layout.addressField, {
    maxUnderlineEndX: rightMargin,
    minUnderlineWidth: 80,
  });
}

function drawItemsTable(commands: string[], items: DocumentOrderItem[], options: DocumentLayoutOptions = {}) {
  const layout = buildSalesInvoiceLayout({
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
  addText(commands, tableLeftX + 241, headerY, layout.columns[1].label);
  addText(commands, tableLeftX + 321, headerY, layout.columns[2].label);
  addText(commands, tableLeftX + 421, headerY, layout.columns[3].label);

  layout.rows.forEach((row, index) => {
    const rowY = tableTopY - rowHeight * (index + 1) - 16;

    addText(commands, tableLeftX + 6, rowY, truncate(row.cells[0], 38));
    addText(commands, tableLeftX + 241, rowY, row.cells[1]);
    addText(commands, tableLeftX + 321, rowY, row.cells[2]);
    addText(commands, tableLeftX + 421, rowY, row.cells[3]);
  });

  return tableBottomY;
}

function drawInvoiceTotal(commands: string[], layout: ReturnType<typeof buildSalesInvoiceLayout>, tableBottomY: number) {
  const totalY = tableBottomY - 24;
  drawPdfLabeledField(commands, 330, totalY, layout.totalField, {
    labelGap: 32,
    underline: false,
  });
}

function drawPaymentAndIssuer(commands: string[], layout: ReturnType<typeof buildSalesInvoiceLayout>) {
  const issuerBlockLeftX = 330;
  const issuerBlockRightX = rightMargin;
  const issuerBlockCenterX = (issuerBlockLeftX + issuerBlockRightX) / 2;

  addText(commands, 40, 348, layout.modeOfPaymentHeading);
  addTextWithVectorCheckmarks(commands, 40, 330, layout.modeOfPaymentLine);
  addText(commands, issuerBlockLeftX, 184, layout.issuerHeading, { bold: true });
  addText(commands, issuerBlockCenterX, 156, layout.issuerName, { align: "center" });
  drawLine(commands, issuerBlockLeftX, 152, issuerBlockRightX, 152);
  addText(commands, issuerBlockCenterX, 136, layout.issuerSubline, { align: "center" });
}

function addText(commands: string[], x: number, y: number, value: string | null | undefined, options: TextOptions = {}) {
  addPdfText(commands, x, y, value, options);
}

function addTextWithVectorCheckmarks(
  commands: string[],
  x: number,
  y: number,
  value: string,
  options: TextOptions = {},
) {
  const size = options.size ?? DOCUMENT_BODY_FONT_SIZE;
  const displayText = value.replaceAll("✓", " ");
  const sanitizedText = sanitizePdfText(displayText);
  const adjustedX = getAlignedX(x, sanitizedText, size, options.align ?? "left");

  addText(commands, x, y, displayText, options);

  Array.from(value.matchAll(/✓/g)).forEach((match) => {
    if (typeof match.index !== "number") return;
    drawCheckmark(commands, adjustedX + match.index * size * 0.52, y, size);
  });
}

function drawCheckmark(commands: string[], x: number, y: number, size: number) {
  const startX = x - size * 0.08;
  const startY = y + size * 0.25;
  const middleX = x + size * 0.18;
  const middleY = y - size * 0.05;
  const endX = x + size * 0.7;
  const endY = y + size * 0.55;

  commands.push(
    `${formatNumber(startX)} ${formatNumber(startY)} m ${formatNumber(middleX)} ${formatNumber(middleY)} l ${formatNumber(endX)} ${formatNumber(endY)} l S`,
  );
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
