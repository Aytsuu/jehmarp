import { describe, expect, it } from "vitest";

import {
  parseAdminInvoiceFilters,
  serializeAdminInvoiceFilters,
} from "./invoice-filters";

describe("parseAdminInvoiceFilters", () => {
  it("parses supported search and balance filters", () => {
    const filters = parseAdminInvoiceFilters(
      new URL("https://example.test/admin/invoices?search= inv-0042   maria cruz &balanceStatus=partial"),
    );

    expect(filters).toEqual({
      search: "inv-0042 maria cruz",
      balanceStatus: "partial",
    });
  });

  it("ignores unsupported or invalid invoice filter values", () => {
    const filters = parseAdminInvoiceFilters(
      new URL("https://example.test/admin/invoices?balanceStatus=refunded"),
    );

    expect(filters).toEqual({});
  });
});

describe("serializeAdminInvoiceFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminInvoiceFilters({
        search: "INV-42 maria",
        balanceStatus: "paid",
      }),
    ).toBe("search=INV-42+maria&balanceStatus=paid");
  });

  it("serializes a supported sort after the other filters", () => {
    expect(
      serializeAdminInvoiceFilters({
        balanceStatus: "paid",
        sort: "invoice_total",
        direction: "asc",
      }),
    ).toBe("balanceStatus=paid&sort=invoice_total&direction=asc");
  });
});

describe("invoice sort filters", () => {
  it("accepts invoice columns and asc or desc", () => {
    expect(
      parseAdminInvoiceFilters(new URL("https://example.test/admin/invoices?sort=invoice_created_at&direction=desc")),
    ).toEqual({ sort: "invoice_created_at", direction: "desc" });
    expect(
      parseAdminInvoiceFilters(new URL("https://example.test/admin/invoices?sort=balance&direction=asc")),
    ).toEqual({ sort: "balance", direction: "asc" });
  });

  it("ignores an unknown column or direction", () => {
    expect(
      parseAdminInvoiceFilters(new URL("https://example.test/admin/invoices?sort=invoice_number&direction=asc")),
    ).toEqual({});
    expect(
      parseAdminInvoiceFilters(new URL("https://example.test/admin/invoices?sort=balance&direction=sideways")),
    ).toEqual({});
  });
});
