import { describe, expect, it } from "vitest";

import type { DocumentOrder } from "./view";
import { buildOrderSlipLayout, buildSalesInvoiceLayout } from "./layout";

describe("buildOrderSlipLayout", () => {
  const order = {
    id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    created_at: "2026-07-18T00:00:00.000Z",
    customer: {
      first_name: "Maria",
      last_name: "Santos",
      address: "Cebu",
    },
    customer_order_item: [],
    invoice: [],
  } satisfies DocumentOrder;

  it("includes fixed delivery and payment lines that are not template-editable", () => {
    const layout = buildOrderSlipLayout(order);

    expect(layout.deliveryHeading).toBe("Delivery Preference");
    expect(layout.deliveryLines).toEqual([
      "Mode of Delivery: ( ) Pick-Up   ( ) Delivery",
      "Preferred Delivery Date and Time: ___________________",
    ]);
    expect(layout.paymentLines).toEqual([
      "( ) Cash on Delivery (COD)  ( ) Bank Transfer   ( ) Gcash",
    ]);
    expect(layout.paymentDueHeading).toBe("Payment Due:");
    expect(layout.paymentDueLine).toBe("( ) Upon Delivery  ( ) Within___days");
    expect(layout.confirmationText).toContain("I hereby confirm the above order");
    expect(layout.dateField).toEqual({ label: "Date", value: "2026-07-18" });
    expect(layout.totalField).toEqual({
      label: "Total",
      value: "0.00",
      labelSuffix: " ",
    });
  });
});

describe("buildSalesInvoiceLayout", () => {
  it("checks the selected payment method and terms from the saved payment record", () => {
    const layout = buildSalesInvoiceLayout({
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      created_at: "2026-07-18T00:00:00.000Z",
      customer: {
        first_name: "Maria",
        last_name: "Santos",
        address: "Cebu",
      },
      customer_order_item: [
        {
          partial_quantity: 2,
          final_quantity: 2,
          unit_price: 350,
          add_details: null,
          product: {
            name: "Chicken Legs",
          },
        },
      ],
      payment: [
        {
          payment_method: "Check",
          payment_terms: "Bank Transfer",
        },
      ],
      invoice: [
        {
          invoice_number: "INV-00000042",
          issued_at: "2026-07-18T00:00:00.000Z",
          created_at: "2026-07-18T00:00:00.000Z",
        },
      ],
    } satisfies DocumentOrder);

    expect(layout.modeOfPaymentHeading).toBe("Mode of Payment (/)");
    expect(layout.modeOfPaymentLine).toBe("( ) Cash   (✓) Check");
  });
});

describe("document logo", () => {
  const order = {
    id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    created_at: "2026-07-18T00:00:00.000Z",
    customer: null,
    customer_order_item: [],
    invoice: [],
  } satisfies DocumentOrder;

  it("resolves the platform logo URL for order slips and invoices", () => {
    const options = {
      businessProfile: {
        tradeName: "Test Shop",
        legalName: "Test Shop LLC",
        address: "Cebu",
        phone: "09170000000",
        tin: "",
        logoPath: "platform/logo-test.png",
        primaryEmail: "shop@example.test",
        secondaryEmail: "",
      },
    };

    expect(buildOrderSlipLayout(order, options).logoUrl).toContain("platform/logo-test.png");
    expect(buildSalesInvoiceLayout(order, options).logoUrl).toContain("platform/logo-test.png");
  });

  it("returns null when no logo is configured", () => {
    expect(buildOrderSlipLayout(order).logoUrl).toBeNull();
    expect(buildSalesInvoiceLayout(order).logoUrl).toBeNull();
  });
});
