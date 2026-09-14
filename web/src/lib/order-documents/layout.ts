import type { DocumentOrder, DocumentOrderItem } from "@/lib/order-documents/view";
import { fullName, orderTotal } from "@/lib/order-documents/view";
import {
  DEFAULT_ORDER_SLIP_TEMPLATE,
  DEFAULT_SALES_INVOICE_TEMPLATE,
  formatSalesInvoiceModeOfPaymentLine,
  formatOrderSlipModeOfDeliveryLine,
  formatOrderSlipPaymentTermsLine,
  getDocumentHeaderBrandLines,
} from "@/lib/platform-settings/document-templates";
import type { DocumentLayoutOptions } from "@/lib/platform-settings/types";
import { resolvePublicStorageUrl } from "@/lib/supabase/storage";

const orderSlipColumnWidths = [145, 60, 75, 75, 160] as const;
const salesInvoiceColumnWidths = [235, 80, 100, 100] as const;
const defaultSellerName = "Narcisan S. Galamiton";

export const ORDER_SLIP_PREFERRED_DELIVERY_DATE_LINE = "Preferred Delivery Date and Time: ___________________";
export const ORDER_SLIP_PAYMENT_DUE_HEADING = "Payment Due:";
export const ORDER_SLIP_PAYMENT_DUE_LINE = "( ) Upon Delivery  ( ) Within___days";
export const ORDER_SLIP_CONFIRMATION_TEXT =
  "I hereby confirm the above order and agree to the pricing, delivery arrangement, and payment terms stated herein.";

export type DocumentTableColumn = {
  label: string;
  width: number;
  align?: "left" | "center" | "right";
};

export type DocumentTableRow = {
  cells: string[];
};

export type DocumentLabeledField = {
  label: string;
  value: string;
  labelSuffix?: string;
};

export type OrderSlipLayout = {
  brandLines: string[];
  logoUrl: string | null;
  title: string;
  dateField: DocumentLabeledField;
  sellerField: DocumentLabeledField;
  orderedByField: DocumentLabeledField;
  columns: DocumentTableColumn[];
  rows: DocumentTableRow[];
  totalField: DocumentLabeledField;
  deliveryHeading: string;
  deliveryLines: string[];
  paymentHeading: string;
  paymentLines: string[];
  paymentDueHeading: string;
  paymentDueLine: string;
  confirmationText: string;
  buyerSignatureLines: string[];
  sellerSignatureHeading: string;
  sellerNameField: DocumentLabeledField;
  sellerSignatureLines: string[];
};

export type SalesInvoiceLayout = {
  brandLines: string[];
  logoUrl: string | null;
  title: string;
  dateField: DocumentLabeledField;
  soldToField: DocumentLabeledField;
  addressField: DocumentLabeledField;
  columns: DocumentTableColumn[];
  rows: DocumentTableRow[];
  totalField: DocumentLabeledField;
  modeOfPaymentHeading: string;
  modeOfPaymentLine: string;
  issuerHeading: string;
  issuerName: string;
  issuerSubline: string;
};

export function buildOrderSlipLayout(order: DocumentOrder, options: DocumentLayoutOptions = {}): OrderSlipLayout {
  const orderSlipTemplate = options.documentTemplates?.orderSlip ?? DEFAULT_ORDER_SLIP_TEMPLATE;
  const sellerName = getSellerName(order, options, orderSlipTemplate.sellerName);
  const acceptedByName = orderSlipTemplate.acceptedByName.trim() || sellerName;
  return {
    brandLines: getDocumentHeaderBrandLines(options.documentTemplates),
    logoUrl: resolveDocumentLogoUrl(options),
    title: "ORDER SLIP",
    dateField: { label: "Date", value: formatDocumentDate(order.created_at) },
    sellerField: { label: "Seller", value: sellerName },
    orderedByField: { label: "Ordered by", value: fullName(order.customer) },
    columns: [
      { label: "Product", width: orderSlipColumnWidths[0] },
      { label: "Quantity", width: orderSlipColumnWidths[1], align: "center" },
      { label: "Unit Price", width: orderSlipColumnWidths[2], align: "right" },
      { label: "Total", width: orderSlipColumnWidths[3], align: "right" },
      { label: "Additional Details", width: orderSlipColumnWidths[4] },
    ],
    rows: order.customer_order_item.map((item) => ({
      cells: [
        item.product?.name ?? "Missing product",
        formatQuantity(item.partial_quantity),
        formatMoney(item.unit_price),
        formatMoney(item.partial_quantity * item.unit_price),
        item.add_details ?? "",
      ],
    })),
    totalField: {
      label: "Total",
      value: formatMoney(orderTotal(order, "partial_quantity")),
      labelSuffix: " ",
    },
    deliveryHeading: "Delivery Preference",
    deliveryLines: [
      formatOrderSlipModeOfDeliveryLine(orderSlipTemplate.deliveryPreferences),
      ORDER_SLIP_PREFERRED_DELIVERY_DATE_LINE,
    ],
    paymentHeading: "Payment Terms (For Order Confirmation)",
    paymentLines: [
      formatOrderSlipPaymentTermsLine(orderSlipTemplate.paymentTerms),
    ],
    paymentDueHeading: ORDER_SLIP_PAYMENT_DUE_HEADING,
    paymentDueLine: ORDER_SLIP_PAYMENT_DUE_LINE,
    confirmationText: ORDER_SLIP_CONFIRMATION_TEXT,
    buyerSignatureLines: [
      "Confirmed by (Buyer):",
      "Name: ________________________",
      "Signature: ___________________",
      "Date: ________________________",
    ],
    sellerSignatureHeading: "Accepted by(Seller)",
    sellerNameField: { label: "Name", value: acceptedByName },
    sellerSignatureLines: [
      "Signature: ___________________",
      "Date: ________________________",
    ],
  };
}

export function buildSalesInvoiceLayout(order: DocumentOrder, options: DocumentLayoutOptions = {}): SalesInvoiceLayout {
  const invoice = order.invoice[0];
  const payment = order.payment?.[0] ?? null;
  const salesInvoiceTemplate = options.documentTemplates?.salesInvoice ?? DEFAULT_SALES_INVOICE_TEMPLATE;
  const issuerName = getIssuerName(order, options, salesInvoiceTemplate.issuedByName);
  const modeOfPaymentLine = formatSalesInvoiceModeOfPaymentLine(salesInvoiceTemplate.modeOfPayment, payment);
  return {
    brandLines: getDocumentHeaderBrandLines(options.documentTemplates),
    logoUrl: resolveDocumentLogoUrl(options),
    title: "SALES INVOICE",
    dateField: {
      label: "Date",
      value: formatDocumentDate(invoice?.issued_at ?? invoice?.created_at ?? order.created_at),
    },
    soldToField: { label: "Sold to", value: fullName(order.customer) },
    addressField: { label: "Address", value: order.customer?.address ?? "" },
    columns: [
      { label: "Product", width: salesInvoiceColumnWidths[0] },
      { label: "Quantity", width: salesInvoiceColumnWidths[1], align: "center" },
      { label: "Unit Price", width: salesInvoiceColumnWidths[2], align: "right" },
      { label: "Amount", width: salesInvoiceColumnWidths[3], align: "right" },
    ],
    rows: order.customer_order_item.map((item) => ({
      cells: [
        item.product?.name ?? "Missing product",
        formatQuantity(item.final_quantity),
        formatMoney(item.unit_price),
        formatMoney(item.final_quantity * item.unit_price),
      ],
    })),
    totalField: {
      label: "Total Amount Due",
      value: formatMoney(orderTotal(order, "final_quantity")),
      labelSuffix: " ",
    },
    modeOfPaymentHeading: "Mode of Payment (/)",
    modeOfPaymentLine,
    issuerHeading: "Issued by:",
    issuerName,
    issuerSubline: salesInvoiceTemplate.issuedBySubline,
  };
}

export function getDocumentColumnTemplate(columns: DocumentTableColumn[]) {
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  return columns
    .map((column) => `minmax(0, ${((column.width / totalWidth) * 100).toFixed(4)}fr)`)
    .join(" ");
}

export function resolveDocumentLogoUrl(options: DocumentLayoutOptions = {}) {
  return resolvePublicStorageUrl(options.businessProfile?.logoPath ?? null);
}

export function getSellerName(
  order: DocumentOrder,
  options: DocumentLayoutOptions = {},
  templateSellerName?: string,
) {
  const configuredSeller = templateSellerName?.trim();
  if (configuredSeller) {
    return configuredSeller;
  }

  return order.agent?.display_name
    ?? options.businessProfile?.legalName?.trim()
    ?? options.businessProfile?.tradeName?.trim()
    ?? defaultSellerName;
}

function getIssuerName(
  order: DocumentOrder,
  options: DocumentLayoutOptions = {},
  templateIssuerName?: string,
) {
  const configuredIssuer = templateIssuerName?.trim();
  if (configuredIssuer) {
    return configuredIssuer;
  }

  return options.businessProfile?.legalName?.trim()
    || options.businessProfile?.tradeName?.trim()
    || getSellerName(order, options);
}

export function formatDocumentDate(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function formatMoney(value: number) {
  return value.toFixed(2);
}

export function formatQuantity(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

export function documentRowKey(item: DocumentOrderItem, index: number) {
  return `${item.product?.name ?? "item"}-${index}`;
}

export type { DocumentLayoutOptions };
