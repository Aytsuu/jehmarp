import { describe, expect, it } from "vitest";

import type { AdminOrder } from "./data";
import { buildOrderSlipPdf } from "./order-slip-pdf";

describe("buildOrderSlipPdf", () => {
  it("generates a viewable PDF order slip with order details and line items", () => {
    const pdf = buildOrderSlipPdf({
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      agent_id: null,
      source: "admin_manual",
      order_status: "processing",
      payment_status: "unpaid",
      notes: null,
      approved_at: null,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      customer: {
        id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
        first_name: "Maria",
        last_name: "Santos",
        phone_number: "09170000000",
        email: "maria@example.test",
        address: "Cebu",
        assigned_agent_id: "64568f81-108b-42bd-b926-7e825dad67c6",
        assigned_agent: null,
        is_reseller: false,
      },
      agent: {
        id: "64568f81-108b-42bd-b926-7e825dad67c6",
        display_name: "Ana Agent",
        email: null,
        contact: null,
      },
      customer_order_item: [
        {
          id: "8cf11ab4-5c98-47db-beb7-62f85c783115",
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2,
          final_quantity: 2,
          unit_price: 125,
          price_type: "retail",
          add_details: "Cut small",
          agent_commission_amount: 0,
          agent_commission_paid: false,
          product: {
            id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
            name: "Pork Belly",
            unit_label: "kg",
            default_price: 125,
            agent_commission_type: "value",
            agent_commission_value: 0,
          },
        },
      ],
      payment: [],
      invoice: [],
      customer_order_status_history: [],
    } as AdminOrder);
    const text = new TextDecoder().decode(pdf);

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("ORDER SLIP");
    expect(text).toContain("Meat and Poultry Products");
    expect(text).toContain("/F3 10 Tf");
    expect(text).toContain("(ORDER SLIP)");
    expect(text).toMatch(/\(ORDER SLIP\)[\s\S]*\/F3 8 Tf/);
    expect(text).toContain("(Seller:)");
    expect(text).toContain("(Narcisan S. Galamiton)");
    expect(text).toContain("Maria Santos");
    expect(text).toContain("Pork Belly");
    expect(text).toContain("Cut small");
    expect(text).toContain("(Total )");
    expect(text).toContain("(250.00)");
    expect(text).not.toContain("428.32 589 m");
    expect(text).toContain("(Name:)");
    expect(text).toContain("(Narcisan S. Galamiton)");
    expect(text).toContain("Delivery Preference");
    expect(text).toContain("Mode of Delivery:");
    expect(text).toContain("Preferred Delivery Date and Time");
    expect(text).toContain("Payment Due:");
    expect(text).toContain("\\( \\) Upon Delivery  \\( \\) Within___days");
    expect(text).toContain("/F2 8 Tf");
    expect(text).toContain("I hereby confirm the above order");
    expect(text).toContain("%%EOF");
  });

  it("creates additional PDF pages when an order has more than ten items", () => {
    const order = {
      created_at: "2026-07-03T00:00:00.000Z",
      customer: null,
      agent: null,
      customer_order_item: Array.from({ length: 11 }, (_, index) => ({
        partial_quantity: 1,
        final_quantity: 1,
        unit_price: 10,
        add_details: null,
        product: {
          name: `Product ${index + 1}`,
        },
      })),
    } as AdminOrder;

    const text = new TextDecoder().decode(buildOrderSlipPdf(order));

    expect(text).toContain("ORDER SLIP - Page 1");
    expect(text).toContain("ORDER SLIP - Page 2");
    expect(text).toContain("/Count 2");
  });
});
