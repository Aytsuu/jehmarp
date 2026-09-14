import { describe, expect, it } from "vitest";

import { DEFAULT_PLATFORM_SETTINGS } from "./defaults";
import {
  DEFAULT_DOCUMENT_HEADER,
  formatOrderSlipPaymentTermsLine,
  formatSalesInvoiceModeOfPaymentLine,
  formatTemplateCheckboxLine,
  getDocumentHeaderBrandLines,
  normalizeDocumentTemplates,
  parseTemplateLines,
} from "./document-templates";
import { mergePlatformSettings, normalizePlatformSettings } from "./normalize";

describe("normalizeDocumentTemplates", () => {
  it("returns defaults for invalid payloads", () => {
    expect(normalizeDocumentTemplates(null)).toEqual(DEFAULT_PLATFORM_SETTINGS.documentTemplates);
  });

  it("normalizes shared document header fields", () => {
    const templates = normalizeDocumentTemplates({
      header: {
        businessName: "Custom Meat Shop",
        address: "Custom Address",
        phoneLine: "Cell #: 09170000000",
      },
      orderSlip: {
        sellerName: "Jane Seller",
        acceptedByName: "Jane Seller",
        deliveryPreferences: ["Pick-Up only"],
        paymentTerms: ["COD only"],
      },
      salesInvoice: {
        issuedByName: "Jane Seller",
        issuedBySubline: "Authorized signatory",
        modeOfPayment: ["Cash", "Check"],
      },
    });

    expect(templates.header).toEqual({
      businessName: "Custom Meat Shop",
      address: "Custom Address",
      phoneLine: "Cell #: 09170000000",
    });
    expect(getDocumentHeaderBrandLines(templates)).toEqual([
      "Custom Meat Shop",
      "Custom Address",
      "Cell #: 09170000000",
    ]);
  });

  it("normalizes order slip and sales invoice template fields", () => {
    const templates = normalizeDocumentTemplates({
      header: { ...DEFAULT_DOCUMENT_HEADER },
      orderSlip: {
        sellerName: "Jane Seller",
        acceptedByName: "Jane Seller",
        deliveryPreferences: ["Pick-Up only"],
        paymentTerms: ["COD only"],
      },
      salesInvoice: {
        issuedByName: "Jane Seller",
        issuedBySubline: "Authorized signatory",
        modeOfPayment: ["Cash", "Check"],
      },
    });

    expect(templates.orderSlip.sellerName).toBe("Jane Seller");
    expect(templates.orderSlip.deliveryPreferences).toEqual(["Pick-Up only"]);
    expect(templates.salesInvoice.issuedBySubline).toBe("Authorized signatory");
    expect(templates.salesInvoice.modeOfPayment).toEqual(["Cash", "Check"]);
  });
});

describe("formatTemplateCheckboxLine", () => {
  it("formats plain options into checkbox text", () => {
    expect(formatTemplateCheckboxLine(["Pick-Up", "Delivery"])).toBe(
      "( ) Pick-Up   ( ) Delivery",
    );
  });
});

describe("formatOrderSlipPaymentTermsLine", () => {
  it("uses format-specific spacing between payment term options", () => {
    expect(formatOrderSlipPaymentTermsLine([
      "Cash on Delivery (COD)",
      "Bank Transfer",
      "Gcash",
    ])).toBe("( ) Cash on Delivery (COD)  ( ) Bank Transfer   ( ) Gcash");
  });
});

describe("formatSalesInvoiceModeOfPaymentLine", () => {
  it("marks the selected payment method", () => {
    expect(formatSalesInvoiceModeOfPaymentLine(["Cash", "Check"], {
      payment_method: "Check",
      payment_terms: null,
    })).toBe("( ) Cash   (✓) Check");
  });
});

describe("parseTemplateLines", () => {
  it("splits textarea content into trimmed lines", () => {
    expect(parseTemplateLines("  Cash\r\nCheck\n\nBank Transfer  ")).toEqual([
      "Cash",
      "Check",
      "Bank Transfer",
    ]);
  });
});

describe("platform settings document templates", () => {
  it("merges nested document template fields", () => {
    const current = normalizePlatformSettings({});
    const next = mergePlatformSettings(current, {
      documentTemplates: {
        orderSlip: { sellerName: "Updated Seller" },
      },
    });

    expect(next.documentTemplates.orderSlip.sellerName).toBe("Updated Seller");
    expect(next.documentTemplates.orderSlip.paymentTerms).toEqual(
      DEFAULT_PLATFORM_SETTINGS.documentTemplates.orderSlip.paymentTerms,
    );
  });
});
