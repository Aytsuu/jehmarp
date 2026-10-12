import { describe, expect, it } from "vitest";

import {
  parseAdminSalesFilters,
  serializeAdminSalesFilters,
} from "./sales-filters";

describe("parseAdminSalesFilters", () => {
  it("parses search, source, and a sales sort without order-only columns", () => {
    expect(
      parseAdminSalesFilters(
        new URL("https://example.test/admin/sales?search= maria   cruz &source=guest_shop&sort=sale_date_value&direction=desc"),
      ),
    ).toEqual({
      search: "maria cruz",
      source: "guest_shop",
      sort: "sale_date_value",
      direction: "desc",
    });
  });

  it("ignores an unknown column, direction, or order-only sort", () => {
    expect(
      parseAdminSalesFilters(new URL("https://example.test/admin/sales?sort=remaining_receivable&direction=asc")),
    ).toEqual({});
    expect(
      parseAdminSalesFilters(new URL("https://example.test/admin/sales?sort=net_total&direction=sideways")),
    ).toEqual({});
    expect(
      parseAdminSalesFilters(new URL("https://example.test/admin/sales?source=marketplace")),
    ).toEqual({});
  });
});

describe("serializeAdminSalesFilters", () => {
  it("serializes a supported sort after the other filters", () => {
    expect(
      serializeAdminSalesFilters({
        source: "agent_submitted",
        sort: "payment_count",
        direction: "asc",
      }),
    ).toBe("source=agent_submitted&sort=payment_count&direction=asc");
  });
});
