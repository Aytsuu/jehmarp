import { describe, expect, it } from "vitest";

import {
  parseAdminCustomerFilters,
  serializeAdminCustomerFilters,
} from "./customer-filters";

describe("parseAdminCustomerFilters", () => {
  it("parses supported search and type filters", () => {
    const filters = parseAdminCustomerFilters(
      new URL("https://example.test/admin/customers?search= maria   cruz &customerType=reseller"),
    );

    expect(filters).toEqual({
      search: "maria cruz",
      customerType: "reseller",
    });
  });

  it("ignores unsupported filter values", () => {
    const filters = parseAdminCustomerFilters(
      new URL("https://example.test/admin/customers?customerType=vip"),
    );

    expect(filters).toEqual({});
  });
});

describe("serializeAdminCustomerFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminCustomerFilters({
        search: "Ana Reyes",
        customerType: "retail",
      }),
    ).toBe("search=Ana+Reyes&customerType=retail");
  });

  it("serializes a supported sort after the other filters", () => {
    expect(
      serializeAdminCustomerFilters({
        customerType: "retail",
        sort: "is_reseller",
        direction: "asc",
      }),
    ).toBe("customerType=retail&sort=is_reseller&direction=asc");
  });
});

describe("customer sort filters", () => {
  it("accepts customer columns and asc or desc", () => {
    expect(
      parseAdminCustomerFilters(new URL("https://example.test/admin/customers?sort=created_at&direction=desc")),
    ).toEqual({ sort: "created_at", direction: "desc" });
    expect(
      parseAdminCustomerFilters(new URL("https://example.test/admin/customers?sort=outstanding_credit_balance&direction=asc")),
    ).toEqual({ sort: "outstanding_credit_balance", direction: "asc" });
  });

  it("ignores an unknown column or direction", () => {
    expect(
      parseAdminCustomerFilters(new URL("https://example.test/admin/customers?sort=email&direction=asc")),
    ).toEqual({});
    expect(
      parseAdminCustomerFilters(new URL("https://example.test/admin/customers?sort=customer_name")),
    ).toEqual({});
  });
});
