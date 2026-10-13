import { describe, expect, it } from "vitest";

import {
  nextAdminProductSort,
  parseAdminProductFilters,
  serializeAdminProductFilters,
} from "./product-filters";

describe("parseAdminProductFilters", () => {
  it("parses supported search, category, and status filters", () => {
    const filters = parseAdminProductFilters(
      new URL("https://example.test/admin/products?search= belly &category=pork&stockStatus=limited"),
    );

    expect(filters).toEqual({
      search: "belly",
      category: "pork",
      stockStatus: "limited",
    });
  });

  it("parses a supported product sort", () => {
    const filters = parseAdminProductFilters(
      new URL("https://example.test/admin/products?sort=created_at&direction=desc"),
    );

    expect(filters).toEqual({
      sort: "created_at",
      direction: "desc",
    });
  });

  it("ignores an unknown column or direction", () => {
    expect(parseAdminProductFilters(
      new URL("https://example.test/admin/products?sort=status&direction=asc"),
    )).toEqual({});
    expect(parseAdminProductFilters(
      new URL("https://example.test/admin/products?sort=name&direction=sideways"),
    )).toEqual({});
    expect(parseAdminProductFilters(
      new URL("https://example.test/admin/products?sort=name"),
    )).toEqual({});
  });

  it("allows custom categories and ignores invalid status filters", () => {
    const filters = parseAdminProductFilters(
      new URL("https://example.test/admin/products?category= Frozen Foods &stockStatus=hidden"),
    );

    expect(filters).toEqual({
      category: "frozen foods",
    });
  });
});

describe("serializeAdminProductFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminProductFilters({
        search: "egg tray",
        stockStatus: "in_stock",
        category: "egg",
      }),
    ).toBe("search=egg+tray&category=egg&stockStatus=in_stock");
  });

  it("appends the active sort after the filters", () => {
    expect(serializeAdminProductFilters({
      search: "egg tray",
      sort: "name",
      direction: "asc",
    })).toBe("search=egg+tray&sort=name&direction=asc");
  });
});

describe("nextAdminProductSort", () => {
  it("uses the column's first direction when that column is not active", () => {
    expect(nextAdminProductSort(undefined, undefined, "created_at")).toEqual({
      sort: "created_at",
      direction: "desc",
    });
    expect(nextAdminProductSort("created_at", "desc", "name")).toEqual({
      sort: "name",
      direction: "asc",
    });
    expect(nextAdminProductSort(undefined, undefined, "default_price")).toEqual({
      sort: "default_price",
      direction: "asc",
    });
    expect(nextAdminProductSort(undefined, undefined, "agent_commission_value")).toEqual({
      sort: "agent_commission_value",
      direction: "asc",
    });
  });

  it("flips the direction of the active column", () => {
    expect(nextAdminProductSort("name", "asc", "name")).toEqual({
      sort: "name",
      direction: "desc",
    });
    expect(nextAdminProductSort("created_at", "desc", "created_at")).toEqual({
      sort: "created_at",
      direction: "asc",
    });
  });
});
