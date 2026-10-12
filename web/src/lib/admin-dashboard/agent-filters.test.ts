import { describe, expect, it } from "vitest";

import { parseAdminAgentFilters, serializeAdminAgentFilters } from "./agent-filters";

describe("parseAdminAgentFilters", () => {
  it("parses supported search and status filters", () => {
    expect(
      parseAdminAgentFilters(
        new URL("https://example.test/admin/agents?search= maria   dela cruz &status=active"),
      ),
    ).toEqual({
      search: "maria dela cruz",
      status: "active",
    });
  });
});

describe("serializeAdminAgentFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminAgentFilters({
        search: "Ana",
        status: "inactive",
      }),
    ).toBe("search=Ana&status=inactive");
  });

  it("serializes a supported sort after the other filters", () => {
    expect(
      serializeAdminAgentFilters({
        status: "active",
        sort: "display_name",
        direction: "asc",
      }),
    ).toBe("status=active&sort=display_name&direction=asc");
  });
});

describe("agent sort filters", () => {
  it("accepts agent columns and asc or desc", () => {
    expect(
      parseAdminAgentFilters(new URL("https://example.test/admin/agents?sort=created_at&direction=desc")),
    ).toEqual({ sort: "created_at", direction: "desc" });
  });

  it("ignores an unknown column or direction", () => {
    expect(
      parseAdminAgentFilters(new URL("https://example.test/admin/agents?sort=email&direction=asc")),
    ).toEqual({});
    expect(
      parseAdminAgentFilters(new URL("https://example.test/admin/agents?sort=display_name&direction=sideways")),
    ).toEqual({});
  });
});
