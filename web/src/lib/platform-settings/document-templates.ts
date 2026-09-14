import type {
  DocumentHeaderSettings,
  DocumentTemplateSettings,
  OrderSlipTemplateSettings,
  SalesInvoiceTemplateSettings,
} from "./types";

const DEFAULT_TEMPLATE_SIGNATORY_NAME = "Narcisan S. Galamiton";

export const DEFAULT_DOCUMENT_HEADER: DocumentHeaderSettings = {
  businessName: "Meat and Poultry Products",
  address: "Brgy. Tolo-Tolo Consolacion, Cebu",
  phoneLine: "Cell #: 0917 777 0118 | 0932 215 9289",
};

export const DEFAULT_ORDER_SLIP_TEMPLATE: OrderSlipTemplateSettings = {
  sellerName: DEFAULT_TEMPLATE_SIGNATORY_NAME,
  acceptedByName: DEFAULT_TEMPLATE_SIGNATORY_NAME,
  deliveryPreferences: [
    "Pick-Up",
    "Delivery",
  ],
  paymentTerms: [
    "Cash on Delivery (COD)",
    "Bank Transfer",
    "Gcash",
  ],
};

export const DEFAULT_SALES_INVOICE_TEMPLATE: SalesInvoiceTemplateSettings = {
  issuedByName: DEFAULT_TEMPLATE_SIGNATORY_NAME,
  issuedBySubline: "Owner / Authorized Representative",
  modeOfPayment: [
    "Cash",
    "Check",
  ],
};

export const DEFAULT_DOCUMENT_TEMPLATES: DocumentTemplateSettings = {
  header: { ...DEFAULT_DOCUMENT_HEADER },
  orderSlip: { ...DEFAULT_ORDER_SLIP_TEMPLATE, deliveryPreferences: [...DEFAULT_ORDER_SLIP_TEMPLATE.deliveryPreferences], paymentTerms: [...DEFAULT_ORDER_SLIP_TEMPLATE.paymentTerms] },
  salesInvoice: { ...DEFAULT_SALES_INVOICE_TEMPLATE, modeOfPayment: [...DEFAULT_SALES_INVOICE_TEMPLATE.modeOfPayment] },
};

export function getDocumentHeaderBrandLines(templates?: DocumentTemplateSettings | null): string[] {
  const header = normalizeDocumentHeader(templates?.header);
  return [header.businessName, header.address, header.phoneLine];
}

const MAX_TEMPLATE_LINE_LENGTH = 240;
const MAX_TEMPLATE_LINES = 20;

function normalizeStringList(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const lines = value
    .flatMap((entry) => (typeof entry === "string" ? entry.split(/\r?\n/) : []))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.slice(0, MAX_TEMPLATE_LINE_LENGTH));

  return lines.length > 0 ? lines.slice(0, MAX_TEMPLATE_LINES) : [...fallback];
}

export function normalizeDocumentHeader(value: unknown): DocumentHeaderSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_DOCUMENT_HEADER };
  }

  const record = value as Record<string, unknown>;
  const businessName = typeof record.businessName === "string"
    ? record.businessName.trim().slice(0, 120)
    : DEFAULT_DOCUMENT_HEADER.businessName;
  const address = typeof record.address === "string"
    ? record.address.trim().slice(0, 160)
    : DEFAULT_DOCUMENT_HEADER.address;
  const phoneLine = typeof record.phoneLine === "string"
    ? record.phoneLine.trim().slice(0, 160)
    : DEFAULT_DOCUMENT_HEADER.phoneLine;

  return {
    businessName: businessName || DEFAULT_DOCUMENT_HEADER.businessName,
    address: address || DEFAULT_DOCUMENT_HEADER.address,
    phoneLine: phoneLine || DEFAULT_DOCUMENT_HEADER.phoneLine,
  };
}

export function normalizeOrderSlipTemplate(value: unknown): OrderSlipTemplateSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ...DEFAULT_ORDER_SLIP_TEMPLATE,
      deliveryPreferences: [...DEFAULT_ORDER_SLIP_TEMPLATE.deliveryPreferences],
      paymentTerms: [...DEFAULT_ORDER_SLIP_TEMPLATE.paymentTerms],
    };
  }

  const record = value as Record<string, unknown>;
  const sellerName = typeof record.sellerName === "string"
    ? record.sellerName.trim().slice(0, 120)
    : DEFAULT_ORDER_SLIP_TEMPLATE.sellerName;
  const acceptedByName = typeof record.acceptedByName === "string"
    ? record.acceptedByName.trim().slice(0, 120)
    : DEFAULT_ORDER_SLIP_TEMPLATE.acceptedByName;

  return {
    sellerName: sellerName || DEFAULT_ORDER_SLIP_TEMPLATE.sellerName,
    acceptedByName: acceptedByName || DEFAULT_ORDER_SLIP_TEMPLATE.acceptedByName,
    deliveryPreferences: normalizeStringList(record.deliveryPreferences, DEFAULT_ORDER_SLIP_TEMPLATE.deliveryPreferences),
    paymentTerms: normalizeStringList(record.paymentTerms, DEFAULT_ORDER_SLIP_TEMPLATE.paymentTerms),
  };
}

export function normalizeSalesInvoiceTemplate(value: unknown): SalesInvoiceTemplateSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ...DEFAULT_SALES_INVOICE_TEMPLATE,
      modeOfPayment: [...DEFAULT_SALES_INVOICE_TEMPLATE.modeOfPayment],
    };
  }

  const record = value as Record<string, unknown>;
  const issuedByName = typeof record.issuedByName === "string"
    ? record.issuedByName.trim().slice(0, 120)
    : DEFAULT_SALES_INVOICE_TEMPLATE.issuedByName;
  const issuedBySubline = typeof record.issuedBySubline === "string"
    ? record.issuedBySubline.trim().slice(0, 120)
    : DEFAULT_SALES_INVOICE_TEMPLATE.issuedBySubline;

  return {
    issuedByName: issuedByName || DEFAULT_SALES_INVOICE_TEMPLATE.issuedByName,
    issuedBySubline: issuedBySubline || DEFAULT_SALES_INVOICE_TEMPLATE.issuedBySubline,
    modeOfPayment: normalizeStringList(record.modeOfPayment, DEFAULT_SALES_INVOICE_TEMPLATE.modeOfPayment),
  };
}

export function normalizeDocumentTemplates(value: unknown): DocumentTemplateSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      header: normalizeDocumentHeader(null),
      orderSlip: normalizeOrderSlipTemplate(null),
      salesInvoice: normalizeSalesInvoiceTemplate(null),
    };
  }

  const record = value as Record<string, unknown>;
  return {
    header: normalizeDocumentHeader(record.header),
    orderSlip: normalizeOrderSlipTemplate(record.orderSlip),
    salesInvoice: normalizeSalesInvoiceTemplate(record.salesInvoice),
  };
}

export function parseTemplateLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatTemplateCheckboxLine(
  options: readonly string[],
  selectedLabels: readonly string[] = [],
): string {
  const selected = new Set(selectedLabels.map((label) => label.trim()).filter(Boolean));

  return options
    .map((option) => {
      const label = option.trim();
      const marker = selected.has(label) ? "(✓)" : "( )";
      return `${marker} ${label}`;
    })
    .join("   ");
}

export function formatOrderSlipPaymentTermsLine(
  options: readonly string[],
  selectedLabels: readonly string[] = [],
): string {
  if (options.length === 0) {
    return "";
  }

  const selected = new Set(selectedLabels.map((label) => label.trim()).filter(Boolean));
  const markers = options.map((option) => {
    const label = option.trim();
    const marker = selected.has(label) ? "(✓)" : "( )";
    return `${marker} ${label}`;
  });

  if (markers.length === 1) {
    return markers[0];
  }

  if (markers.length === 2) {
    return markers.join("  ");
  }

  return `${markers.slice(0, -1).join("  ")}   ${markers[markers.length - 1]}`;
}

export function formatOrderSlipModeOfDeliveryLine(options: readonly string[]): string {
  return `Mode of Delivery: ${formatTemplateCheckboxLine(options)}`;
}

type SalesInvoicePayment = {
  payment_method: string | null;
  payment_terms: string | null;
} | null | undefined;

export function formatSalesInvoiceModeOfPaymentLine(
  options: readonly string[],
  payment: SalesInvoicePayment,
): string {
  const selected: string[] = [];
  if (payment?.payment_method?.trim()) {
    selected.push(payment.payment_method.trim());
  }

  return formatTemplateCheckboxLine(options, selected);
}

/** @deprecated Use formatSalesInvoiceModeOfPaymentLine for plain-text template options. */
export function applySalesInvoicePaymentCheckmarks(lines: readonly string[], payment: SalesInvoicePayment): string[] {
  if (!payment) {
    return [...lines];
  }

  return lines.map((line) => {
    let result = line;

    if (payment.payment_method === "Cash") {
      result = result.replace(/\( \)\s*Cash(?!\s+on)/, "(✓) Cash");
    }
    if (payment.payment_method === "Check") {
      result = result.replace(/\( \)\s*Check/, "(✓) Check");
    }
    if (payment.payment_terms === "Cash on Delivery (COD)") {
      result = result.replace(/\( \)\s*Cash on Delivery \(COD\)/, "(✓) Cash on Delivery (COD)");
    }
    if (payment.payment_terms === "Bank Transfer") {
      result = result.replace(/\( \)\s*Bank Transfer/, "(✓) Bank Transfer");
    }
    if (payment.payment_terms === "Gcash" || payment.payment_terms === "GCash") {
      result = result.replace(/\( \)\s*Gcash/i, "(✓) GCash");
    }

    return result;
  });
}
