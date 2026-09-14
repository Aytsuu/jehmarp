import { describe, expect, it } from "vitest";

import type { AdminOrder } from "./data";
import { buildSalesInvoicePdf } from "./sales-invoice-pdf";

describe("buildSalesInvoicePdf", () => {
  it("generates a viewable PDF sales invoice with invoice details and final quantities", () => {
    const pdf = buildSalesInvoicePdf({
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
        assigned_agent_id: null,
        assigned_agent: null,
        is_reseller: false,
      },
      agent: null,
      customer_order_item: [
        {
          id: "8cf11ab4-5c98-47db-beb7-62f85c783115",
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2,
          final_quantity: 3,
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
      payment: [
        {
          id: "f31976e6-b478-41b6-9b85-9b830154f962",
          amount: 375,
          payment_method: "Check",
          payment_terms: "Bank Transfer",
          payment_date: "2026-07-03",
          reference_number: null,
          notes: null,
          created_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      invoice: [
        {
          id: "7c66f907-8324-473c-b0b5-d017a4728121",
          order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
          invoice_number: "INV-00000042",
          status: "issued",
          issued_at: "2026-07-03T00:00:00.000Z",
          due_at: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      customer_order_status_history: [],
    } as AdminOrder);
    const text = new TextDecoder().decode(pdf);

    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("SALES INVOICE");
    expect(text).not.toContain("Invoice No:");
    expect(text).toContain("Maria Santos");
    expect(text).toContain("(Address:)");
    expect(text).toContain("(Cebu)");
    expect(text).toContain("Pork Belly");
    expect(text).toContain("Amount");
    expect(text).toContain("(Total Amount Due )");
    expect(text).toContain("(375.00)");
    expect(text).not.toContain("431.24 589 m");
    expect(text).toContain("Mode of Payment \\(/\\)");
    expect(text).toContain("\\( \\) Cash   \\( \\) Check");
    expect(text).toContain("89.28 332 m 91.36 329.60 l 95.52 334.40 l S");
    expect(text).not.toContain("Delivery Preference");
    expect(text).not.toContain("Payment Terms");
    expect(text).not.toContain("(?)");
    expect(text).toContain("Narcisan S. Galamiton");
    expect(text).toContain("40 632 515 48 re S");
    expect(text).not.toContain("40 425 355 264 re S");
    expect(text).toContain("%%EOF");
  });
});
