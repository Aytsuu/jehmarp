import { describe, expect, it } from "vitest";

import {
  parseAdminResellerApplicationFilters,
  serializeAdminResellerApplicationFilters,
} from "./reseller-application-filters";

describe("parseAdminResellerApplicationFilters", () => {
  it("parses supported search and status filters", () => {
    expect(
      parseAdminResellerApplicationFilters(
        new URL("https://example.test/admin/reseller-applications?search= maria   cruz &status=submitted"),
      ),
    ).toEqual({
      search: "maria cruz",
      status: "submitted",
    });
  });
});

describe("serializeAdminResellerApplicationFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminResellerApplicationFilters({
        search: "Ana",
        status: "contacted",
      }),
    ).toBe("search=Ana&status=contacted");
  });

  it("serializes a supported sort after the other filters", () => {
    expect(
      serializeAdminResellerApplicationFilters({
        status: "submitted",
        sort: "name",
        direction: "asc",
      }),
    ).toBe("status=submitted&sort=name&direction=asc");
  });
});

describe("reseller application sort filters", () => {
  it("accepts reseller application columns and asc or desc", () => {
    expect(
      parseAdminResellerApplicationFilters(new URL("https://example.test/admin/reseller-applications?sort=created_at&direction=desc")),
    ).toEqual({ sort: "created_at", direction: "desc" });
    expect(
      parseAdminResellerApplicationFilters(new URL("https://example.test/admin/reseller-applications?sort=name&direction=asc")),
    ).toEqual({ sort: "name", direction: "asc" });
  });

  it("ignores an unknown column or direction", () => {
    expect(
      parseAdminResellerApplicationFilters(new URL("https://example.test/admin/reseller-applications?sort=email&direction=asc")),
    ).toEqual({});
    expect(
      parseAdminResellerApplicationFilters(new URL("https://example.test/admin/reseller-applications?sort=name")),
    ).toEqual({});
  });
});
