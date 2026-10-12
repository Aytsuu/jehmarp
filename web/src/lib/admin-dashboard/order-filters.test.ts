import { describe, expect, it } from "vitest";

import {
  nextAdminOrderSort,
  parseAdminOrderFilters,
  serializeAdminOrderFilters,
} from "./order-filters";

describe("parseAdminOrderFilters", () => {
  it("parses supported search, source, status, and payment filters", () => {
    const filters = parseAdminOrderFilters(
      new URL("https://example.test/admin/orders?search= maria   cruz &source=guest_shop&orderStatus=pending&paymentStatus=partial"),
    );

    expect(filters).toEqual({
      search: "maria cruz",
      source: "guest_shop",
      orderStatus: "pending",
      paymentStatus: "partial",
    });
  });

  it("ignores unsupported or invalid filter values", () => {
    const filters = parseAdminOrderFilters(
      new URL("https://example.test/admin/orders?source=marketplace&orderStatus=missing&paymentStatus=unknown"),
    );

    expect(filters).toEqual({});
  });

  it("parses agent order status filters", () => {
    const filters = parseAdminOrderFilters(
      new URL("https://example.test/admin/orders?orderStatus=pending_customers"),
    );

    expect(filters).toEqual({
      orderStatus: "pending_customers",
    });
  });
});

describe("serializeAdminOrderFilters", () => {
  it("serializes filters in a stable query order", () => {
    expect(
      serializeAdminOrderFilters({
        search: "order 42",
        paymentStatus: "paid",
        orderStatus: "processing",
        source: "agent_submitted",
      }),
    ).toBe("search=order+42&source=agent_submitted&orderStatus=processing&paymentStatus=paid");
  });

  it("serializes a supported sort after the other filters", () => {
    expect(
      serializeAdminOrderFilters({
        source: "guest_shop",
        sort: "customer_label",
        direction: "asc",
      }),
    ).toBe("source=guest_shop&sort=customer_label&direction=asc");
  });
});

describe("order sort filters", () => {
  it("accepts the four order columns and asc or desc", () => {
    expect(
      parseAdminOrderFilters(new URL("https://example.test/admin/orders?sort=created_at&direction=desc")),
    ).toEqual({ sort: "created_at", direction: "desc" });
    expect(
      parseAdminOrderFilters(new URL("https://example.test/admin/orders?sort=customer_label&direction=asc")),
    ).toEqual({ sort: "customer_label", direction: "asc" });
    expect(
      parseAdminOrderFilters(new URL("https://example.test/admin/orders?sort=order_total&direction=desc")),
    ).toEqual({ sort: "order_total", direction: "desc" });
    expect(
      parseAdminOrderFilters(new URL("https://example.test/admin/orders?sort=remaining_receivable&direction=asc")),
    ).toEqual({ sort: "remaining_receivable", direction: "asc" });
  });

  it("ignores an unknown column or direction", () => {
    expect(
      parseAdminOrderFilters(new URL("https://example.test/admin/orders?sort=id&direction=asc")),
    ).toEqual({});
    expect(
      parseAdminOrderFilters(new URL("https://example.test/admin/orders?sort=created_at&direction=sideways")),
    ).toEqual({});
    expect(
      parseAdminOrderFilters(new URL("https://example.test/admin/orders?sort=customer_label")),
    ).toEqual({});
  });
});

describe("nextAdminOrderSort", () => {
  it("starts date newest-first and the amount and customer columns low-to-high", () => {
    expect(nextAdminOrderSort(undefined, undefined, "created_at")).toEqual({
      sort: "created_at",
      direction: "desc",
    });
    expect(nextAdminOrderSort(undefined, undefined, "customer_label")).toEqual({
      sort: "customer_label",
      direction: "asc",
    });
    expect(nextAdminOrderSort(undefined, undefined, "order_total")).toEqual({
      sort: "order_total",
      direction: "asc",
    });
    expect(nextAdminOrderSort(undefined, undefined, "remaining_receivable")).toEqual({
      sort: "remaining_receivable",
      direction: "asc",
    });
  });

  it("flips the active column and starts a new column from its first direction", () => {
    expect(nextAdminOrderSort("customer_label", "asc", "customer_label")).toEqual({
      sort: "customer_label",
      direction: "desc",
    });
    expect(nextAdminOrderSort("created_at", "desc", "created_at")).toEqual({
      sort: "created_at",
      direction: "asc",
    });
    expect(nextAdminOrderSort("order_total", "asc", "remaining_receivable")).toEqual({
      sort: "remaining_receivable",
      direction: "asc",
    });
  });
});
