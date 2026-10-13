import { describe, expect, it } from "vitest";

import { parseAdminInquiryFilters, serializeAdminInquiryFilters } from "./inquiry-filters";

describe("parseAdminInquiryFilters", () => {
  it("parses supported search and status filters", () => {
    expect(
      parseAdminInquiryFilters(
        new URL("https://example.test/admin/inquiries?search= maria   cruz &status=reviewing"),
      ),
    ).toEqual({
      search: "maria cruz",
      status: "reviewing",
    });
  });
});

describe("serializeAdminInquiryFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminInquiryFilters({
        search: "Ana",
        status: "closed",
      }),
    ).toBe("search=Ana&status=closed");
  });

  it("serializes a supported sort after the other filters", () => {
    expect(
      serializeAdminInquiryFilters({
        status: "new",
        sort: "name",
        direction: "asc",
      }),
    ).toBe("status=new&sort=name&direction=asc");
  });
});

describe("inquiry sort filters", () => {
  it("accepts inquiry columns and asc or desc", () => {
    expect(
      parseAdminInquiryFilters(new URL("https://example.test/admin/inquiries?sort=created_at&direction=desc")),
    ).toEqual({ sort: "created_at", direction: "desc" });
    expect(
      parseAdminInquiryFilters(new URL("https://example.test/admin/inquiries?sort=name&direction=asc")),
    ).toEqual({ sort: "name", direction: "asc" });
  });

  it("ignores an unknown column or direction", () => {
    expect(
      parseAdminInquiryFilters(new URL("https://example.test/admin/inquiries?sort=email&direction=asc")),
    ).toEqual({});
    expect(
      parseAdminInquiryFilters(new URL("https://example.test/admin/inquiries?sort=name&direction=sideways")),
    ).toEqual({});
  });
});
