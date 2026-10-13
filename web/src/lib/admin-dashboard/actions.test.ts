import { describe, expect, it, vi } from "vitest";

import { combineDateAndTime } from "@/lib/datetime";

const mocks = vi.hoisted(() => ({
  createSupabaseAdminClient: vi.fn(),
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

vi.mock("@/lib/public-website/content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/public-website/content")>();

  return {
    ...actual,
    invalidatePublicPageContentCacheForPage: vi.fn(async () => undefined),
  };
});

import {
  executeAdminAction,
  formatAdminActionFeedback,
  getAllowedNextOrderStatuses,
  handleAdminDashboardAction,
  markUnreadAdminResellerApplicationsRead,
  markViewedResellerApplicationsRead,
  parseAdminActionFormData,
  parseViewedResellerApplicationIds,
} from "./actions";

const adminUserId = "8bcce9f3-2a1b-43c0-9e51-70667e017111";

function createActionContext(formData: FormData, headers?: HeadersInit) {
  const request = {
    headers: new Headers(headers),
    formData: vi.fn(async () => formData),
  } as unknown as Request;

  return {
    request,
    cookies: {},
    redirect: vi.fn((url: string, status: number) => new Response(null, {
      status,
      headers: {
        Location: url,
      },
    })),
  };
}

function createUpdateClient(error: unknown = null) {
  const eq = vi.fn(async () => ({ error }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));

  return {
    client: { from },
    from,
    update,
    eq,
  };
}

function asAdminDashboardContext(context: ReturnType<typeof createActionContext>) {
  return context as unknown as Parameters<typeof handleAdminDashboardAction>[0];
}

describe("handleAdminDashboardAction", () => {
  it("returns JSON for fetch-based admin actions that accept JSON", async () => {
    const formData = new FormData();
    formData.set("action", "update-order-status");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("orderStatus", "processing");
    const db = createUpdateClient();
    mocks.createSupabaseServerClient.mockReturnValue(db.client);
    const context = createActionContext(formData, {
      Accept: "application/json",
    });

    const response = await handleAdminDashboardAction(
      asAdminDashboardContext(context),
      adminUserId,
      "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      status: "Order status updated.",
      redirectPath: "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      action: "update-order-status",
    });
    expect(context.redirect).not.toHaveBeenCalled();
    expect(db.from).toHaveBeenCalledWith("order");
  });

  it("returns JSON validation errors for fetch-based admin actions", async () => {
    const formData = new FormData();
    formData.set("action", "update-order-status");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("orderStatus", "draft");
    const context = createActionContext(formData, {
      Accept: "application/json",
    });

    const response = await handleAdminDashboardAction(
      asAdminDashboardContext(context),
      adminUserId,
      "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: "Order status is not supported.",
    });
    expect(context.redirect).not.toHaveBeenCalled();
  });

  it("keeps redirect responses for regular admin form posts", async () => {
    const formData = new FormData();
    formData.set("action", "update-order-status");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("orderStatus", "processing");
    const db = createUpdateClient();
    mocks.createSupabaseServerClient.mockReturnValue(db.client);
    const context = createActionContext(formData, {
      Accept: "text/html",
    });

    const response = await handleAdminDashboardAction(
      asAdminDashboardContext(context),
      adminUserId,
      "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb?status=Order%20status%20updated.",
    );
    expect(context.redirect).toHaveBeenCalledTimes(1);
  });
});

describe("parseAdminActionFormData", () => {
  it("parses admin-created orders with normalized order items", () => {
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("agentId", "  ");
    formData.set("releaseDate", "2026-07-18");
    formData.set("releaseTime", "09:30");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "2");
    formData.append("addDetails", "  Slice thin  ");
    formData.append("productId", "  ");
    formData.append("quantity", "  ");
    formData.append("addDetails", "  ");
    formData.append("productId", "9ad456ad-1d2e-41b2-b297-8ddf6304ece0");
    formData.append("quantity", "1.5");
    formData.append("addDetails", "  ");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "create-order",
        customer: {
          type: "existing",
          customerId: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
        },
        agentOrderType: null,
        payload: {
          agent_id: null,
          source: "admin_manual",
          order_status: "processing",
          payment_status: "unpaid",
          release_date: combineDateAndTime("2026-07-18", "09:30"),
          submitted_by: adminUserId,
          approved_by: adminUserId,
          approved_at: expect.any(String),
          created_at: expect.any(String),
          updated_at: expect.any(String),
        },
        payment: null,
        items: [
          {
            product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
            partial_quantity: 2,
            final_quantity: 2,
            add_details: "Slice thin",
          },
          {
            product_id: "9ad456ad-1d2e-41b2-b297-8ddf6304ece0",
            partial_quantity: 1.5,
            final_quantity: 1.5,
            add_details: null,
          },
        ],
      },
    });
  });

  it("rejects admin-created orders without at least one order item", () => {
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("releaseDate", "2026-07-18");
    formData.set("releaseTime", "09:30");
    formData.append("productId", "");
    formData.append("quantity", "");
    formData.append("addDetails", "");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["At least one order item is required."],
    });
  });

  it("rejects admin-created orders without a release date", () => {
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("releaseTime", "09:30");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "2");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Release date is required."],
    });
  });

  it("rejects admin-created orders without a release time", () => {
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("releaseDate", "2026-07-18");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "2");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Release time is required."],
    });
  });

  it("parses admin-created order release date and downpayment fields", () => {
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("releaseDate", "2026-07-18");
    formData.set("releaseTime", "10:45");
    formData.set("downpaymentAmount", "700");
    formData.set("downpaymentMethod", "Cash");
    formData.set("downpaymentTerms", "Gcash");
    formData.set("downpaymentDate", "2026-07-16");
    formData.set("downpaymentReferenceNumber", "REF-700");
    formData.set("downpaymentNotes", "  Downpayment before release  ");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "2");
    formData.append("addDetails", "");

    expect(parseAdminActionFormData(formData, adminUserId)).toMatchObject({
      success: true,
      action: {
        type: "create-order",
        payload: {
          release_date: combineDateAndTime("2026-07-18", "10:45"),
        },
        payment: {
          amount: 700,
          payment_method: "Cash",
          payment_terms: "Gcash",
          payment_date: combineDateAndTime("2026-07-16"),
          recorded_by: adminUserId,
          reference_number: "REF-700",
          notes: "Downpayment before release",
        },
      },
    });
  });

  it("parses order product additions for existing orders", () => {
    const formData = new FormData();
    formData.set("action", "add-order-item");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.set("quantity", "2.5");
    formData.set("addDetails", "  Whole pieces  ");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "add-order-item",
        orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        payload: {
          order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2.5,
          final_quantity: 2.5,
          add_details: "Whole pieces",
        },
      },
    });
  });

  it("parses admin-created personal orders for an agent", () => {
    const agentId = "64568f81-108b-42bd-b926-7e825dad67c6";
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("agentId", agentId);
    formData.set("agentOrderType", "personal");
    formData.set("releaseDate", "2026-07-18");
    formData.set("releaseTime", "11:15");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "3");
    formData.append("addDetails", "");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "create-order",
        customer: {
          type: "agent",
          agentId,
        },
        agentOrderType: "personal",
        payload: {
          agent_id: agentId,
          source: "admin_manual",
          order_status: "processing",
          payment_status: "unpaid",
          release_date: combineDateAndTime("2026-07-18", "11:15"),
          submitted_by: adminUserId,
          approved_by: adminUserId,
          approved_at: expect.any(String),
          created_at: expect.any(String),
          updated_at: expect.any(String),
        },
        payment: null,
        items: [
          {
            product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
            partial_quantity: 3,
            final_quantity: 3,
            add_details: null,
          },
        ],
      },
    });
  });

  it("parses admin-created distribution orders for an agent", () => {
    const agentId = "64568f81-108b-42bd-b926-7e825dad67c6";
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("agentId", agentId);
    formData.set("agentOrderType", "distribution");
    formData.set("releaseDate", "2026-07-18");
    formData.set("releaseTime", "11:15");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "3");
    formData.append("addDetails", "For agent customers");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "create-order",
        customer: {
          type: "agent",
          agentId,
        },
        agentOrderType: "distribution",
        payload: {
          agent_id: agentId,
          source: "admin_manual",
          order_status: "processing",
          payment_status: "unpaid",
          release_date: combineDateAndTime("2026-07-18", "11:15"),
          submitted_by: adminUserId,
          approved_by: adminUserId,
          approved_at: expect.any(String),
          created_at: expect.any(String),
          updated_at: expect.any(String),
        },
        payment: null,
        items: [
          {
            product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
            partial_quantity: 3,
            final_quantity: 3,
            add_details: "For agent customers",
          },
        ],
      },
    });
  });

  it("rejects downpayments for admin-created distribution orders", () => {
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("agentId", "64568f81-108b-42bd-b926-7e825dad67c6");
    formData.set("agentOrderType", "distribution");
    formData.set("releaseDate", "2026-07-18");
    formData.set("releaseTime", "11:15");
    formData.set("downpaymentAmount", "100");
    formData.set("downpaymentMethod", "Cash");
    formData.set("downpaymentTerms", "Cash on Delivery (COD)");
    formData.set("downpaymentDate", "2026-07-22");
    formData.set("downpaymentTime", "10:00");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "3");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Downpayment is not supported for agent distribution orders."],
    });
  });

  it("rejects zero quantities when adding order products", () => {
    const formData = new FormData();
    formData.set("action", "add-order-item");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.set("quantity", "0");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Quantity must be greater than zero."],
    });
  });

  it("rejects zero quantities when updating order products", () => {
    const formData = new FormData();
    formData.set("action", "update-order-item-quantity");
    formData.set("orderItemId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("quantity", "0");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Quantity must be greater than zero."],
    });
  });

  it("parses order product removal requests", () => {
    const formData = new FormData();
    formData.set("action", "remove-order-item");
    formData.set("orderItemId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "remove-order-item",
        orderItemId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
      },
    });
  });

  it("parses admin-created orders with inline customer details when no existing customer is selected", () => {
    const formData = new FormData();
    formData.set("action", "create-order");
    formData.set("firstName", "  Luz  ");
    formData.set("lastName", "Dela Cruz");
    formData.set("phoneNumber", " 09171112222 ");
    formData.set("email", "luz@example.test");
    formData.set("address", "  Stall 8  ");
    formData.set("assignedAgentId", "64568f81-108b-42bd-b926-7e825dad67c6");
    formData.set("isReseller", "on");
    formData.set("releaseDate", "2026-07-18");
    formData.set("releaseTime", "09:30");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("quantity", "3");
    formData.append("addDetails", "");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "create-order",
        customer: {
          type: "new",
          payload: {
            first_name: "Luz",
            last_name: "Dela Cruz",
            phone_number: "09171112222",
            email: "luz@example.test",
            address: "Stall 8",
            assigned_agent_id: "64568f81-108b-42bd-b926-7e825dad67c6",
            created_by: adminUserId,
            credit_limit: 1000,
            is_reseller: true,
            updated_at: expect.any(String),
          },
        },
        agentOrderType: null,
        payload: {
          agent_id: null,
          source: "admin_manual",
          order_status: "processing",
          payment_status: "unpaid",
          release_date: combineDateAndTime("2026-07-18", "09:30"),
          submitted_by: adminUserId,
          approved_by: adminUserId,
          approved_at: expect.any(String),
          created_at: expect.any(String),
          updated_at: expect.any(String),
        },
        payment: null,
        items: [
          {
            product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
            partial_quantity: 3,
            final_quantity: 3,
            add_details: null,
          },
        ],
      },
    });
  });

  it("rejects page saves because admin content only updates existing predefined pages", () => {
    const formData = new FormData();
    formData.set("action", "save-page");
    formData.set("slug", "new-page");
    formData.set("title", "New Page");
    formData.set("status", "draft");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Unknown admin action."],
    });
  });

  it("parses product saves with normalized numeric and optional fields", () => {
    const formData = new FormData();
    const imageFile = new File(["image-bytes"], "pork.png", {
      type: "image/png",
    });
    formData.set("action", "save-product");
    formData.set("name", "  Pork Belly  ");
    formData.set("category", "pork");
    formData.set("unitLabel", "kg");
    formData.set("defaultPrice", "250.50");
    formData.set("resellerDeductionType", "value");
    formData.set("resellerDeductionValue", "30.50");
    formData.set("agentCommissionType", "percentage");
    formData.set("agentCommissionValue", "5");
    formData.set("stockStatus", "limited");
    formData.set("description", "  ");
    formData.set("imageFile", imageFile);
    formData.set("isActive", "on");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "save-product",
        payload: {
          category: "pork",
          default_price: 250.5,
          description: null,
          agent_commission_type: "percentage",
          agent_commission_value: 5,
          image_file: imageFile,
          is_active: true,
          name: "Pork Belly",
          reseller_price: 220,
          reseller_deduction_type: "value",
          reseller_deduction_value: 30.5,
          stock_status: "limited",
          unit_label: "kg",
        },
      },
    });
  });

  it("requires a product image when creating a product", () => {
    const formData = new FormData();
    formData.set("action", "save-product");
    formData.set("name", "Pork Belly");
    formData.set("category", "pork");
    formData.set("unitLabel", "kg");
    formData.set("defaultPrice", "250.50");
    formData.set("resellerDeductionType", "value");
    formData.set("resellerDeductionValue", "30.50");
    formData.set("agentCommissionType", "value");
    formData.set("agentCommissionValue", "0");
    formData.set("stockStatus", "limited");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Product image is required."],
    });
  });

  it("parses custom product unit labels from the other option", () => {
    const formData = new FormData();
    const imageFile = new File(["image-bytes"], "pork.png", {
      type: "image/png",
    });
    formData.set("action", "save-product");
    formData.set("name", "Pork Belly");
    formData.set("category", "__other");
    formData.set("categoryOther", "Frozen Foods");
    formData.set("unitLabel", "__other");
    formData.set("unitLabelOther", "Box");
    formData.set("defaultPrice", "250.50");
    formData.set("resellerDeductionType", "percentage");
    formData.set("resellerDeductionValue", "10");
    formData.set("agentCommissionType", "value");
    formData.set("agentCommissionValue", "15");
    formData.set("stockStatus", "limited");
    formData.set("imageFile", imageFile);

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result.success).toBe(true);
    expect(result.success ? result.action : null).toMatchObject({
      type: "save-product",
      payload: {
        category: "frozen foods",
        unit_label: "box",
        reseller_price: 225.45,
        agent_commission_type: "value",
        agent_commission_value: 15,
      },
    });
  });

  it("parses selected product ids for deletion", () => {
    const formData = new FormData();
    formData.set("action", "delete-products");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.append("productId", "9ad456ad-1d2e-41b2-b297-8ddf6304ece0");
    formData.append("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "delete-products",
        productIds: [
          "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          "9ad456ad-1d2e-41b2-b297-8ddf6304ece0",
        ],
      },
    });
  });

  it("rejects product deletion when no products are selected", () => {
    const formData = new FormData();
    formData.set("action", "delete-products");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Select at least one product."],
    });
  });

  it("parses customer reseller classification when saving customers", () => {
    const formData = new FormData();
    formData.set("action", "save-customer");
    formData.set("firstName", "  Ana  ");
    formData.set("lastName", "Buyer");
    formData.set("phoneNumber", "09170000000");
    formData.set("email", "ana@example.test");
    formData.set("address", "Market stall 12");
    formData.set("assignedAgentId", "");
    formData.set("isReseller", "on");
    formData.set("creditLimit", "1500");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "save-customer",
        payload: {
          first_name: "Ana",
          last_name: "Buyer",
          phone_number: "09170000000",
          email: "ana@example.test",
          address: "Market stall 12",
          assigned_agent_id: null,
          created_by: adminUserId,
          credit_limit: 1500,
          is_reseller: true,
          updated_at: expect.any(String),
        },
      },
    });
  });

  it("defaults new customer credit limit to 1000 when saving customers", () => {
    const formData = new FormData();
    formData.set("action", "save-customer");
    formData.set("firstName", "Ana");
    formData.set("lastName", "Buyer");
    formData.set("phoneNumber", "09170000000");
    formData.set("address", "Market stall 12");

    expect(parseAdminActionFormData(formData, adminUserId)).toMatchObject({
      success: true,
      action: {
        type: "save-customer",
        payload: {
          credit_limit: 1000,
        },
      },
    });
  });

  it("parses create-agent actions with profile names, optional employee ID, normalized email, and contact", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("employeeId", " EMP-001 ");
    formData.set("firstName", " New ");
    formData.set("lastName", " Agent ");
    formData.set("email", "  Agent@Example.Test ");
    formData.set("contact", " 09171234567 ");
    formData.set("address", " 123 Main St, Quezon City ");
    formData.set("password", "password123");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "create-agent",
        payload: {
          employee_id: "EMP-001",
          first_name: "New",
          last_name: "Agent",
          display_name: "New Agent",
          email: "agent@example.test",
          contact: "09171234567",
          address: "123 Main St, Quezon City",
          password: "password123",
          status: "active",
        },
      },
    });
  });

  it("parses create-agent actions without email or auth password", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("firstName", "New");
    formData.set("lastName", "Agent");
    formData.set("email", " ");
    formData.set("contact", "09171234567");
    formData.set("address", "123 Main St, Quezon City");
    formData.set("password", " ");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "create-agent",
        payload: {
          employee_id: null,
          first_name: "New",
          last_name: "Agent",
          display_name: "New Agent",
          email: null,
          contact: "09171234567",
          address: "123 Main St, Quezon City",
          password: null,
          status: "active",
        },
      },
    });
  });

  it("rejects create-agent actions without a contact number", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("firstName", "New");
    formData.set("lastName", "Agent");
    formData.set("email", "agent@example.test");
    formData.set("contact", "   ");
    formData.set("address", "123 Main St, Quezon City");
    formData.set("password", "password123");

    expect(parseAdminActionFormData(formData, adminUserId).success).toBe(false);
  });

  it("rejects create-agent actions with non-numeric contact numbers", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("firstName", "New");
    formData.set("lastName", "Agent");
    formData.set("email", "agent@example.test");
    formData.set("contact", "0917-123-4567");
    formData.set("address", "123 Main St, Quezon City");
    formData.set("password", "password123");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Contact number must be exactly 11 digits."],
    });
  });

  it("rejects create-agent actions when contact number is not 11 digits", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("firstName", "New");
    formData.set("lastName", "Agent");
    formData.set("email", "agent@example.test");
    formData.set("contact", "0917123456");
    formData.set("address", "123 Main St, Quezon City");
    formData.set("password", "password123");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Contact number must be exactly 11 digits."],
    });
  });

  it("rejects create-agent actions with invalid email before other field errors", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("firstName", "New");
    formData.set("lastName", "Agent");
    formData.set("email", "not-an-email");
    formData.set("contact", "letters");
    formData.set("address", "123 Main St, Quezon City");
    formData.set("password", "short");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Enter a valid email address."],
    });
  });

  it("rejects create-agent actions without an address", () => {
    const formData = new FormData();
    formData.set("action", "create-agent");
    formData.set("firstName", "New");
    formData.set("lastName", "Agent");
    formData.set("email", "agent@example.test");
    formData.set("contact", "09171234567");
    formData.set("address", "   ");
    formData.set("password", "password123");

    expect(parseAdminActionFormData(formData, adminUserId).success).toBe(false);
  });

  it("parses promote-customer-to-agent actions with account credentials", () => {
    const formData = new FormData();
    formData.set("action", "promote-customer-to-agent");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("email", "agent@example.com");
    formData.set("password", "password123");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "promote-customer-to-agent",
        customerId: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
        account: {
          email: "agent@example.com",
          password: "password123",
          employee_id: null,
        },
      },
    });
  });

  it("parses promote-customer-to-agent actions with an optional employee ID", () => {
    const formData = new FormData();
    formData.set("action", "promote-customer-to-agent");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("email", "agent@example.com");
    formData.set("password", "password123");
    formData.set("employeeId", " EMP-001 ");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "promote-customer-to-agent",
        customerId: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
        account: {
          email: "agent@example.com",
          password: "password123",
          employee_id: "EMP-001",
        },
      },
    });
  });

  it("parses promote-customer-to-agent actions using an existing customer email", () => {
    const formData = new FormData();
    formData.set("action", "promote-customer-to-agent");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("existingEmail", "Existing@Example.com");
    formData.set("password", "password123");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "promote-customer-to-agent",
        customerId: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
        account: {
          email: "existing@example.com",
          password: "password123",
          employee_id: null,
        },
      },
    });
  });

  it("rejects promote-customer-to-agent actions without a valid password", () => {
    const formData = new FormData();
    formData.set("action", "promote-customer-to-agent");
    formData.set("customerId", "b10bb955-d8b1-4a26-a6e2-928fd33949e1");
    formData.set("email", "agent@example.com");
    formData.set("password", "short");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Password must be at least 8 characters."],
    });
  });

  it("rejects malformed page section JSON before writing", () => {
    const formData = new FormData();
    formData.set("action", "save-page-section");
    formData.set("sectionId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("pageId", "9db3dfbf-4271-456f-a7dd-6897ad099515");
    formData.set("type", "hero");
    formData.set("sortOrder", "0");
    formData.set("status", "published");
    formData.set("content", "{\"heading\":");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Section content must be valid JSON."],
    });
  });

  it("requires page section id so content updates cannot create new sections", () => {
    const formData = new FormData();
    formData.set("action", "save-page-section");
    formData.set("pageId", "9db3dfbf-4271-456f-a7dd-6897ad099515");
    formData.set("type", "hero");
    formData.set("sortOrder", "0");
    formData.set("status", "published");
    formData.set("content", "{}");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Section id is required."],
    });
  });

  it("merges a single page section field when contentField is provided", () => {
    const formData = new FormData();
    formData.set("action", "save-page-section");
    formData.set("sectionId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("pageId", "9db3dfbf-4271-456f-a7dd-6897ad099515");
    formData.set("type", "hero");
    formData.set("sortOrder", "0");
    formData.set("status", "published");
    formData.set("contentField", "heading");
    formData.set("contentValue", "Updated heading");
    formData.set("currentContent", JSON.stringify({ heading: "Old heading", summary: "Summary" }));

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.action).toMatchObject({
        type: "save-page-section",
        payload: {
          content: {
            heading: "Updated heading",
            summary: "Summary",
          },
        },
      });
    }
  });

  it("deletes a hero slide when slideAction is delete", () => {
    const formData = new FormData();
    formData.set("action", "save-page-section");
    formData.set("sectionId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("pageId", "9db3dfbf-4271-456f-a7dd-6897ad099515");
    formData.set("type", "hero");
    formData.set("sortOrder", "0");
    formData.set("status", "published");
    formData.set("slideAction", "delete");
    formData.set("slideIndex", "1");
    formData.set("slideSrc", "/images/hero_carousel_2.jpg");
    formData.set(
      "currentContent",
      JSON.stringify({
        heading: "FROM FARM TO TABLE",
        slides: [
          { src: "/images/hero_carousel_1.jpg", alt: "Slide 1" },
          { src: "/images/hero_carousel_2.jpg", alt: "Slide 2" },
        ],
      }),
    );

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result.success).toBe(true);
    if (result.success && result.action.type === "save-page-section") {
      expect(result.action.slideAction).toBe("delete");
      expect(result.action.slideIndex).toBe(1);
      expect(result.action.slideSrc).toBe("/images/hero_carousel_2.jpg");
      expect(result.action.payload.content.slides).toEqual([
        { src: "/images/hero_carousel_1.jpg", alt: "Slide 1" },
      ]);
    }
  });

  it("replaces hero slides when contentField is slides", () => {
    const formData = new FormData();
    formData.set("action", "save-page-section");
    formData.set("sectionId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("pageId", "9db3dfbf-4271-456f-a7dd-6897ad099515");
    formData.set("type", "hero");
    formData.set("sortOrder", "0");
    formData.set("status", "published");
    formData.set("contentField", "slides");
    formData.set(
      "contentValue",
      JSON.stringify([
        { src: "/images/hero_carousel_2.jpg", alt: "Slide 2" },
        { src: "/images/hero_carousel_1.jpg", alt: "Slide 1" },
      ]),
    );
    formData.set(
      "currentContent",
      JSON.stringify({
        heading: "FROM FARM TO TABLE",
        slides: [
          { src: "/images/hero_carousel_1.jpg", alt: "Slide 1" },
          { src: "/images/hero_carousel_2.jpg", alt: "Slide 2" },
        ],
      }),
    );

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result.success).toBe(true);
    if (result.success && result.action.type === "save-page-section") {
      expect(result.action.payload.content.slides).toEqual([
        { src: "/images/hero_carousel_2.jpg", alt: "Slide 2" },
        { src: "/images/hero_carousel_1.jpg", alt: "Slide 1" },
      ]);
      expect(result.action.slideImageFiles).toEqual([]);
      expect(result.action.slideNewImageIndexes).toEqual([]);
    }
  });

  it("replaces tagline items when contentField is items", () => {
    const formData = new FormData();
    formData.set("action", "save-page-section");
    formData.set("sectionId", "0f99f0c8-c846-4217-a289-ce643d9c1c49");
    formData.set("pageId", "9db3dfbf-4271-456f-a7dd-6897ad099515");
    formData.set("type", "taglines");
    formData.set("sortOrder", "3");
    formData.set("status", "published");
    formData.set("contentField", "items");
    formData.set(
      "contentValue",
      JSON.stringify([
        {
          runs: [
            {
              text: "Fresh - Quality - Trusted",
              fontSize: "lg",
              fontWeight: 600,
              italic: false,
            },
          ],
        },
        {
          runs: [
            { text: "From farmers to ", fontSize: "lg", fontWeight: 600, italic: false },
            { text: "families", fontSize: "xl", fontWeight: 700, italic: true },
            { text: " - Quality you can trust", fontSize: "lg", fontWeight: 600, italic: false },
          ],
        },
      ]),
    );
    formData.set(
      "currentContent",
      JSON.stringify({
        heading: "Taglines",
        items: ["Old tagline"],
      }),
    );

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result.success).toBe(true);
    if (result.success && result.action.type === "save-page-section") {
      expect(result.action.payload.content.items).toEqual([
        {
          runs: [
            {
              text: "Fresh - Quality - Trusted",
              fontSize: "lg",
              fontWeight: 600,
              italic: false,
            },
          ],
        },
        {
          runs: [
            { text: "From farmers to ", fontSize: "lg", fontWeight: 600, italic: false },
            { text: "families", fontSize: "xl", fontWeight: 700, italic: true },
            { text: " - Quality you can trust", fontSize: "lg", fontWeight: 600, italic: false },
          ],
        },
      ]);
    }
  });

  it("replaces FAQ content when the full content payload is posted", () => {
    const formData = new FormData();
    formData.set("action", "save-page-section");
    formData.set("sectionId", "a4f8c1d2-6e7b-4a9f-9c3d-2b1e8f5a6d70");
    formData.set("pageId", "cbbe5f4d-7ce5-4d84-90fe-020735a7fc50");
    formData.set("type", "faq");
    formData.set("sortOrder", "6");
    formData.set("status", "published");
    formData.set(
      "content",
      JSON.stringify({
        heading: "FAQ",
        description: "Answers for shoppers.",
        items: [{ question: "Fresh?", answer: "Yes." }],
      }),
    );
    formData.set(
      "currentContent",
      JSON.stringify({
        heading: "Old heading",
        description: "Old description",
        items: [{ question: "Old?", answer: "Old." }],
      }),
    );

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result.success).toBe(true);
    if (result.success && result.action.type === "save-page-section") {
      expect(result.action.payload.content).toEqual({
        heading: "FAQ",
        description: "Answers for shoppers.",
        items: [{ question: "Fresh?", answer: "Yes." }],
      });
    }
  });

  it("sets commission audit fields when a commission is managed", () => {
    const formData = new FormData();
    formData.set("action", "update-commission");
    formData.set("orderItemId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("amount", "125.25");
    formData.set("isPaid", "on");

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.action.type).toBe("update-commission");
    }
    if (result.success && result.action.type === "update-commission") {
      expect(result.action).toMatchObject({
        type: "update-commission",
        payload: {
          agent_commission_amount: 125.25,
          agent_commission_set_by: adminUserId,
          agent_commission_paid: true,
        },
      });
      expect(result.action.payload.agent_commission_set_at).toEqual(expect.any(String));
    }
  });

  it("clears commission audit fields when commission amount is zero", () => {
    const formData = new FormData();
    formData.set("action", "update-commission");
    formData.set("orderItemId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("amount", "0");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "update-commission",
        orderItemId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
        payload: {
          agent_commission_amount: 0,
          agent_commission_set_at: null,
          agent_commission_set_by: null,
          agent_commission_paid: false,
        },
      },
    });
  });

  it("parses total order commission updates from the order information card", () => {
    const formData = new FormData();
    formData.set("action", "update-order-total-commission");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("amount", "60");

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result).toEqual({
      success: true,
      action: {
        type: "update-order-total-commission",
        orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        amount: 60,
      },
    });
  });

  it("parses total agent order commission updates from the summary card", () => {
    const formData = new FormData();
    formData.set("action", "update-agent-order-total-commission");
    formData.set("agentOrderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("amount", "60");

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result).toEqual({
      success: true,
      action: {
        type: "update-agent-order-total-commission",
        agentOrderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        amount: 60,
      },
    });
  });

  it("parses agent order commission updates as a single amount", () => {
    const formData = new FormData();
    formData.set("action", "update-agent-order-commission");
    formData.set("agentOrderItemId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("amount", "95.75");

    const result = parseAdminActionFormData(formData, adminUserId);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.action).toEqual({
        type: "update-agent-order-commission",
        agentOrderItemId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
        payload: {
          agent_commission_amount: 95.75,
          agent_commission_updated_by: adminUserId,
          agent_commission_updated_at: expect.any(String),
        },
      });
    }
  });

  it("parses agent order product additions", () => {
    const formData = new FormData();
    formData.set("action", "add-agent-order-item");
    formData.set("agentOrderId", "11111111-1111-4111-8111-111111111111");
    formData.set("productId", "4f65578f-3f1f-4216-9fc2-013ef06661d1");
    formData.set("quantity", "2.5");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "add-agent-order-item",
        agentOrderId: "11111111-1111-4111-8111-111111111111",
        productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
        quantity: 2.5,
      },
    });
  });

  it("parses agent order approval actions", () => {
    const formData = new FormData();
    formData.set("action", "approve-agent-order");
    formData.set("agentOrderId", "11111111-1111-4111-8111-111111111111");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "approve-agent-order",
        agentOrderId: "11111111-1111-4111-8111-111111111111",
        approvedBy: adminUserId,
      },
    });
  });

  it("parses invoice saves without date or status fields", () => {
    const formData = new FormData();
    formData.set("action", "save-invoice");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "save-invoice",
        payload: {
          order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
          status: "issued",
          issued_at: expect.any(String),
          due_at: null,
          updated_at: expect.any(String),
        },
      },
    });
  });

  it("rejects zero quantities when updating invoice products", () => {
    const formData = new FormData();
    formData.set("action", "update-invoice-item-quantity");
    formData.set("orderItemId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("quantity", "0");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Quantity must be greater than zero."],
    });
  });

  it("parses payment records with a selected customer type", () => {
    const formData = new FormData();
    formData.set("action", "record-payment");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("amount", "230");
    formData.set("paymentMethod", "Cash");
    formData.set("paymentTerms", "Bank Transfer");
    formData.set("paymentDate", "2026-07-16");
    formData.set("customerType", "reseller");
    formData.set("returnTo", "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb?tab=payment-record");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "record-payment",
        returnTo: "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb?tab=payment-record",
        customerType: "reseller",
        payload: {
          order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
          amount: 230,
          payment_method: "Cash",
          payment_terms: "Bank Transfer",
          payment_date: combineDateAndTime("2026-07-16"),
          recorded_by: adminUserId,
          reference_number: null,
          notes: null,
        },
      },
    });
  });

  it("rejects unsupported payment method values for payment records", () => {
    const formData = new FormData();
    formData.set("action", "record-payment");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("amount", "230");
    formData.set("paymentMethod", "Gcash");
    formData.set("paymentTerms", "Gcash");
    formData.set("paymentDate", "2026-07-16");
    formData.set("customerType", "regular");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Payment method is not supported."],
    });
  });

  it("parses agent received payment confirmation actions", () => {
    const formData = new FormData();
    formData.set("action", "confirm-agent-payment");
    formData.set("agentPaymentId", "9ff2f3cf-14a3-4208-8e6b-886d4a6c8d74");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "confirm-agent-payment",
        agentPaymentId: "9ff2f3cf-14a3-4208-8e6b-886d4a6c8d74",
        recordedBy: adminUserId,
      },
    });
  });

  it("parses bulk agent received payment confirmation actions", () => {
    const formData = new FormData();
    formData.set("action", "confirm-agent-payments");
    formData.append("agentPaymentId", "9ff2f3cf-14a3-4208-8e6b-886d4a6c8d74");
    formData.append("agentPaymentId", "12468070-4044-4788-8c5d-2c4471f2aef6");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "confirm-agent-payments",
        agentPaymentIds: [
          "9ff2f3cf-14a3-4208-8e6b-886d4a6c8d74",
          "12468070-4044-4788-8c5d-2c4471f2aef6",
        ],
        recordedBy: adminUserId,
      },
    });
  });

  it("parses reseller application status updates", () => {
    const formData = new FormData();
    formData.set("action", "update-reseller-application");
    formData.set("applicationId", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
    formData.set("applicationStatus", "contacted");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "update-reseller-application",
        applicationId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
        payload: {
          application_status: "contacted",
          admin_read_at: expect.any(String),
          admin_read_by: adminUserId,
          updated_at: expect.any(String),
        },
      },
    });
  });

  it("parses order read actions with safe admin return paths", () => {
    const formData = new FormData();
    formData.set("action", "mark-order-read");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("returnTo", "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "mark-order-read",
        orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        returnTo: "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      },
    });
  });

  it("rejects read-action return paths outside the admin dashboard", () => {
    const formData = new FormData();
    formData.set("action", "mark-order-read");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("returnTo", "https://example.test/admin/orders");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Return path is not supported."],
    });
  });

  it("rejects unsupported return paths for payment records", () => {
    const formData = new FormData();
    formData.set("action", "record-payment");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("amount", "230");
    formData.set("paymentMethod", "Cash");
    formData.set("paymentTerms", "Bank Transfer");
    formData.set("paymentDate", "2026-07-16");
    formData.set("customerType", "regular");
    formData.set("returnTo", "https://example.test/admin/orders");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Return path is not supported."],
    });
  });

  it("parses promoted customer order conversion actions with an admin return path", () => {
    const formData = new FormData();
    formData.set("action", "convert-customer-order-to-agent-distribution");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("returnTo", "/admin/agents/1b1e62e9-8203-4bfd-884e-4f64d4ed5f89");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "convert-customer-order-to-agent-distribution",
        orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        returnTo: "/admin/agents/1b1e62e9-8203-4bfd-884e-4f64d4ed5f89",
      },
    });
  });

  it("parses admin agent order payment distributions in selected order", () => {
    const formData = new FormData();
    formData.set("action", "record-admin-agent-payment-distribution");
    formData.set("agentOrderId", "11111111-1111-4111-8111-111111111111");
    formData.append("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.append("orderId", "0d805818-837b-42d9-996e-79a6a3559f9b");
    formData.set("amount", "550.25");
    formData.set("paymentMethod", "Cash");
    formData.set("paymentTerms", "Bank Transfer");
    formData.set("paymentDate", "2026-07-18");
    formData.set("referenceNumber", "  ADMIN-REMIT-001  ");
    formData.set("notes", "  Admin collected batch payment  ");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: true,
      action: {
        type: "record-admin-agent-payment-distribution",
        agentOrderId: "11111111-1111-4111-8111-111111111111",
        payload: {
          orderIds: [
            "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
            "0d805818-837b-42d9-996e-79a6a3559f9b",
          ],
          amount: 550.25,
          payment_method: "Cash",
          payment_terms: "Bank Transfer",
          payment_date: combineDateAndTime("2026-07-18"),
          recorded_by: adminUserId,
          reference_number: "ADMIN-REMIT-001",
          notes: "Admin collected batch payment",
        },
      },
    });
  });

  it("rejects promoted customer order conversion return paths outside the admin dashboard", () => {
    const formData = new FormData();
    formData.set("action", "convert-customer-order-to-agent-distribution");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("returnTo", "//example.test/admin/agents");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Return path is not supported."],
    });
  });

  it("rejects removed order adjustment saves", () => {
    const formData = new FormData();
    formData.set("action", "update-order-adjustments");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("agentId", "");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Unknown admin action."],
    });
  });

  it("rejects removed order update saves", () => {
    const formData = new FormData();
    formData.set("action", "add-order-update");
    formData.set("orderId", "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb");
    formData.set("updateType", "admin_note");
    formData.set("title", "Removed order update action");

    expect(parseAdminActionFormData(formData, adminUserId)).toEqual({
      success: false,
      errors: ["Unknown admin action."],
    });
  });

});

describe("markViewedResellerApplicationsRead", () => {
  const applicationId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";

  it("deduplicates and validates application ids", () => {
    expect(
      parseViewedResellerApplicationIds([
        applicationId,
        applicationId,
      ]),
    ).toEqual([applicationId]);
  });

  it("marks only submitted unread reseller applications", async () => {
    const select = vi.fn(() => Promise.resolve({
      data: [{ id: applicationId }],
      error: null,
    }));
    const eq = vi.fn(() => ({ is: vi.fn(() => ({ select })) }));
    const inFilter = vi.fn(() => ({ eq }));
    const update = vi.fn(() => ({ in: inFilter }));
    const from = vi.fn(() => ({ update }));

    const result = await markViewedResellerApplicationsRead(
      { from } as never,
      [applicationId],
      adminUserId,
    );

    expect(result).toEqual({ markedCount: 1 });
    expect(from).toHaveBeenCalledWith("reseller_application");
    expect(update).toHaveBeenCalledWith({
      admin_read_at: expect.any(String),
      admin_read_by: adminUserId,
    });
    expect(inFilter).toHaveBeenCalledWith("id", [applicationId]);
    expect(eq).toHaveBeenCalledWith("application_status", "submitted");
  });
});

describe("markUnreadAdminResellerApplicationsRead", () => {
  it("marks all submitted unread reseller applications", async () => {
    const is = vi.fn(async () => ({ error: null }));
    const eq = vi.fn(() => ({ is }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));

    mocks.createSupabaseServerClient.mockReturnValue({ from });

    await markUnreadAdminResellerApplicationsRead(
      createActionContext(new FormData()) as unknown as Parameters<typeof markUnreadAdminResellerApplicationsRead>[0],
      adminUserId,
    );

    expect(from).toHaveBeenCalledWith("reseller_application");
    expect(update).toHaveBeenCalledWith({
      admin_read_at: expect.any(String),
      admin_read_by: adminUserId,
    });
    expect(eq).toHaveBeenCalledWith("application_status", "submitted");
    expect(is).toHaveBeenCalledWith("admin_read_at", null);
  });
});

describe("executeAdminAction", () => {
  function createApproveAgentOrderClient(linkedCustomerOrders: Array<{ id: string }> = []) {
    const customerOrderLimit = vi.fn(async () => ({
      data: linkedCustomerOrders,
      error: null,
    }));
    const customerOrderIs = vi.fn(() => ({ limit: customerOrderLimit }));
    const customerOrderEq = vi.fn(() => ({ is: customerOrderIs }));
    const customerOrderKindIn = vi.fn(() => ({ eq: customerOrderEq }));
    const customerOrderSelect = vi.fn(() => ({ in: customerOrderKindIn }));
    const agentOrderStatusEq = vi.fn(async () => ({ error: null }));
    const agentOrderKindEq = vi.fn(() => ({ eq: agentOrderStatusEq }));
    const agentOrderIdEq = vi.fn(() => ({ eq: agentOrderKindEq }));
    const agentOrderUpdate = vi.fn(() => ({ eq: agentOrderIdEq }));
    let orderCall = 0;
    const from = vi.fn((table: string) => {
      if (table === "order") {
        orderCall += 1;
        return orderCall === 1
          ? { select: customerOrderSelect }
          : { update: agentOrderUpdate };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    return {
      client: { from },
      from,
      customerOrderSelect,
      customerOrderEq,
      customerOrderKindIn,
      customerOrderIs,
      customerOrderLimit,
      agentOrderUpdate,
      agentOrderIdEq,
      agentOrderKindEq,
      agentOrderStatusEq,
    };
  }

  it("deletes products that are not on an order and removes their images", async () => {
    const productId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";
    const orderItemIn = vi.fn(async () => ({ data: [], error: null }));
    const productSelectIn = vi.fn(async () => ({
      data: [{ id: productId, image_path: "products/pork.png" }],
      error: null,
    }));
    const productDeleteIn = vi.fn(async () => ({ error: null }));
    const remove = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return { select: () => ({ in: orderItemIn }) };
      }

      if (table === "product") {
        return {
          select: () => ({ in: productSelectIn }),
          delete: () => ({ in: productDeleteIn }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from,
      storage: { from: () => ({ remove }) },
    });

    const result = await executeAdminAction({ from: vi.fn() } as never, {
      type: "delete-products",
      productIds: [productId],
    }, adminUserId);

    expect(productDeleteIn).toHaveBeenCalledWith("id", [productId]);
    expect(remove).toHaveBeenCalledWith(["products/pork.png"]);
    expect(result).toEqual({ statusMessage: "Product deleted." });
  });

  it("removes a product image stored as a public storage url", async () => {
    const productId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";
    const remove = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
      }

      if (table === "product") {
        return {
          select: () => ({
            in: async () => ({
              data: [{
                id: productId,
                image_path: "http://127.0.0.1:54321/storage/v1/object/public/product-images/products/pork%20belly.png",
              }],
              error: null,
            }),
          }),
          delete: () => ({ in: async () => ({ error: null }) }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from,
      storage: { from: () => ({ remove }) },
    });

    await executeAdminAction({ from: vi.fn() } as never, {
      type: "delete-products",
      productIds: [productId],
    }, adminUserId);

    expect(remove).toHaveBeenCalledWith(["products/pork belly.png"]);
  });

  it("fails when the product image cannot be removed from storage", async () => {
    const productId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return { select: () => ({ in: async () => ({ data: [], error: null }) }) };
      }

      if (table === "product") {
        return {
          select: () => ({
            in: async () => ({
              data: [{ id: productId, image_path: "products/pork.png" }],
              error: null,
            }),
          }),
          delete: () => ({ in: async () => ({ error: null }) }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from,
      storage: {
        from: () => ({
          remove: async () => ({ error: { message: "permission denied" } }),
        }),
      },
    });

    await expect(executeAdminAction({ from: vi.fn() } as never, {
      type: "delete-products",
      productIds: [productId],
    }, adminUserId)).rejects.toThrow("Unable to delete the product image.");
  });

  it("keeps products that are already on an order and deletes the rest", async () => {
    const deletableId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";
    const referencedId = "9ad456ad-1d2e-41b2-b297-8ddf6304ece0";
    const orderItemIn = vi.fn(async () => ({
      data: [{ product_id: referencedId }],
      error: null,
    }));
    const productSelectIn = vi.fn(async () => ({
      data: [{ id: deletableId, image_path: "products/pork.png" }],
      error: null,
    }));
    const productDeleteIn = vi.fn(async () => ({ error: null }));
    const remove = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return { select: () => ({ in: orderItemIn }) };
      }

      if (table === "product") {
        return {
          select: () => ({ in: productSelectIn }),
          delete: () => ({ in: productDeleteIn }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from,
      storage: { from: () => ({ remove }) },
    });

    const result = await executeAdminAction({ from: vi.fn() } as never, {
      type: "delete-products",
      productIds: [deletableId, referencedId],
    }, adminUserId);

    expect(productDeleteIn).toHaveBeenCalledWith("id", [deletableId]);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(["products/pork.png"]);
    expect(result).toEqual({
      statusMessage: "Deleted 1 product. Products on an order were kept.",
    });
  });

  it("rejects deletion when every selected product is on an order", async () => {
    const productId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";
    const productDeleteIn = vi.fn(async () => ({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return {
          select: () => ({
            in: async () => ({ data: [{ product_id: productId }], error: null }),
          }),
        };
      }

      if (table === "product") {
        return { delete: () => ({ in: productDeleteIn }) };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from });

    await expect(executeAdminAction({ from: vi.fn() } as never, {
      type: "delete-products",
      productIds: [productId],
    }, adminUserId)).rejects.toThrow("Products on an order cannot be deleted.");
    expect(productDeleteIn).not.toHaveBeenCalled();
  });

  it("approves pending agent orders without customers into pending customers status", async () => {
    const db = createApproveAgentOrderClient();

    await executeAdminAction(db.client as never, {
      type: "approve-agent-order",
      agentOrderId: "11111111-1111-4111-8111-111111111111",
      approvedBy: adminUserId,
    }, adminUserId);

    expect(db.customerOrderSelect).toHaveBeenCalledWith("id");
    expect(db.customerOrderEq).toHaveBeenCalledWith("parent_order_id", "11111111-1111-4111-8111-111111111111");
    expect(db.customerOrderLimit).toHaveBeenCalledWith(1);
    expect(db.agentOrderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      order_status: "pending_customers",
      admin_read_by: adminUserId,
      admin_read_at: expect.any(String),
      updated_at: expect.any(String),
    }));
    expect(db.agentOrderIdEq).toHaveBeenCalledWith("id", "11111111-1111-4111-8111-111111111111");
    expect(db.agentOrderKindEq).toHaveBeenCalledWith("order_kind", "distribution");
    expect(db.agentOrderStatusEq).toHaveBeenCalledWith("order_status", "pending_order");
  });

  it("approves pending agent orders with linked customers into processing status", async () => {
    const db = createApproveAgentOrderClient([
      { id: "22222222-2222-4222-8222-222222222222" },
    ]);

    await executeAdminAction(db.client as never, {
      type: "approve-agent-order",
      agentOrderId: "11111111-1111-4111-8111-111111111111",
      approvedBy: adminUserId,
    }, adminUserId);

    expect(db.agentOrderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      order_status: "processing",
      admin_read_by: adminUserId,
    }));
  });

  it("attaches a customer order after verifying agent order status with explicit queries", async () => {
    const agentOrderMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        order_status: "processing",
        release_date: "2026-07-18T01:30:00.000Z",
      },
      error: null,
    }));
    const agentOrderEq = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: agentOrderMaybeSingle })) }));
    const agentOrderSelect = vi.fn(() => ({ eq: agentOrderEq }));
    const customerOrderIs = vi.fn(() => Promise.resolve({
      data: [{ payment_status: "partial" }],
      error: null,
    }));
    const customerOrderEq = vi.fn(() => ({ is: customerOrderIs }));
    const customerOrderIn = vi.fn(() => ({ eq: customerOrderEq }));
    const customerOrderSelect = vi.fn(() => ({ in: customerOrderIn }));
    const rpc = vi.fn(() => Promise.resolve({
      data: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      error: null,
    }));
    let orderCall = 0;
    const from = vi.fn((table: string) => {
      if (table === "order") {
        orderCall += 1;
        return orderCall === 1
          ? { select: agentOrderSelect }
          : { select: customerOrderSelect };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from, rpc } as never, {
      type: "attach-agent-order-customer",
      agentOrderId: "11111111-1111-4111-8111-111111111111",
      entries: [
        {
          customer: {
            type: "existing",
            customerId: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
          },
          items: [
            {
              productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
              quantity: 2,
              addDetails: null,
            },
          ],
        },
      ],
      requireApproval: false,
    }, adminUserId);

    expect(agentOrderSelect).toHaveBeenCalledWith("order_status, release_date");
    expect(agentOrderEq).toHaveBeenCalledWith("id", "11111111-1111-4111-8111-111111111111");
    expect(customerOrderSelect).toHaveBeenCalledWith("payment_status");
    expect(customerOrderEq).toHaveBeenCalledWith("parent_order_id", "11111111-1111-4111-8111-111111111111");
    expect(rpc).toHaveBeenCalledWith("attach_customer_to_agent_order", {
      target_agent_order_id: "11111111-1111-4111-8111-111111111111",
      target_customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      item_payload: [
        {
          productId: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          quantity: 2,
          addDetails: null,
        },
      ],
      customer_payload: {
        releaseDate: "2026-07-18",
        releaseTime: "09:30",
      },
      require_approval: false,
    });
  });

  function createAgentPaymentConfirmationSupabase(rpc: ReturnType<typeof vi.fn>) {
    return {
      rpc,
      from(table: string) {
        if (table === "agent_received_payment") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { order_id: "order-id", amount: 100 },
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === "invoice") {
          return {
            select: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { id: "invoice-id" },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      },
    };
  }

  it("converts promoted customer orders through the trusted RPC", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: "1b1e62e9-8203-4bfd-884e-4f64d4ed5f89",
      error: null,
    }));

    const result = await executeAdminAction({ rpc } as never, {
      type: "convert-customer-order-to-agent-distribution",
      orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      returnTo: "/admin/agents/1b1e62e9-8203-4bfd-884e-4f64d4ed5f89",
    }, adminUserId);

    expect(rpc).toHaveBeenCalledWith("convert_customer_order_to_agent_distribution_order", {
      target_order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    });
    expect(result).toEqual({
      redirectPath: "/admin/orders/agent/1b1e62e9-8203-4bfd-884e-4f64d4ed5f89",
    });
  });

  it("surfaces customer order conversion RPC errors", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: null,
      error: { message: "Only unpaid customer orders can be converted." },
    }));

    await expect(executeAdminAction({ rpc } as never, {
      type: "convert-customer-order-to-agent-distribution",
      orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    }, adminUserId)).rejects.toThrow("Only unpaid customer orders can be converted.");
  });

  it("updates a customer order total commission across its order items", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const firstItemId = "11111111-1111-4111-8111-111111111111";
    const secondItemId = "22222222-2222-4222-8222-222222222222";
    const itemsEq = vi.fn(() => Promise.resolve({
      data: [
        {
          id: firstItemId,
          final_quantity: 3,
          unit_price: 300,
        },
        {
          id: secondItemId,
          final_quantity: 1,
          unit_price: 100,
        },
      ],
      error: null,
    }));
    const itemSelect = vi.fn(() => ({ eq: itemsEq }));
    const itemUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const itemUpdate = vi.fn(() => ({ eq: itemUpdateEq }));
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return {
          select: itemSelect,
          update: itemUpdate,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from } as never, {
      type: "update-order-total-commission",
      orderId,
      amount: 60,
    }, adminUserId);

    expect(itemSelect).toHaveBeenCalledWith("id, final_quantity, unit_price");
    expect(itemsEq).toHaveBeenCalledWith("order_id", orderId);
    expect(itemUpdate).toHaveBeenNthCalledWith(1, {
      agent_commission_amount: 54,
      agent_commission_paid: false,
      agent_commission_set_by: adminUserId,
      agent_commission_set_at: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(itemUpdateEq).toHaveBeenNthCalledWith(1, "id", firstItemId);
    expect(itemUpdate).toHaveBeenNthCalledWith(2, {
      agent_commission_amount: 6,
      agent_commission_paid: false,
      agent_commission_set_by: adminUserId,
      agent_commission_set_at: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(itemUpdateEq).toHaveBeenNthCalledWith(2, "id", secondItemId);
  });

  it("updates an agent order total commission across its order items", async () => {
    const agentOrderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const firstItemId = "11111111-1111-4111-8111-111111111111";
    const secondItemId = "22222222-2222-4222-8222-222222222222";
    const customerOrderIs = vi.fn(() => Promise.resolve({
      data: [
        { id: "customer-order-1", payment_status: "partial" },
      ],
      error: null,
    }));
    const customerOrderEq = vi.fn(() => ({ is: customerOrderIs }));
    const customerOrderIn = vi.fn(() => ({ eq: customerOrderEq }));
    const customerOrderSelect = vi.fn(() => ({ in: customerOrderIn }));
    const itemsEq = vi.fn(() => Promise.resolve({
      data: [
        {
          id: firstItemId,
          final_quantity: 3,
          partial_quantity: 3,
          unit_price: 300,
        },
        {
          id: secondItemId,
          final_quantity: 1,
          partial_quantity: 1,
          unit_price: 100,
        },
      ],
      error: null,
    }));
    const itemSelect = vi.fn(() => ({ eq: itemsEq }));
    const itemUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const itemUpdate = vi.fn(() => ({ eq: itemUpdateEq }));
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return {
          select: itemSelect,
          update: itemUpdate,
        };
      }

      if (table === "order") {
        return { select: customerOrderSelect };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from } as never, {
      type: "update-agent-order-total-commission",
      agentOrderId,
      amount: 60,
    }, adminUserId);

    expect(customerOrderSelect).toHaveBeenCalledWith("id, payment_status");
    expect(customerOrderEq).toHaveBeenCalledWith("parent_order_id", agentOrderId);
    expect(itemSelect).toHaveBeenCalledWith("id, final_quantity, partial_quantity, unit_price");
    expect(itemsEq).toHaveBeenCalledWith("order_id", agentOrderId);
    expect(itemUpdate).toHaveBeenNthCalledWith(1, {
      agent_commission_amount: 54,
      agent_commission_updated_by: adminUserId,
      agent_commission_updated_at: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(itemUpdateEq).toHaveBeenNthCalledWith(1, "id", firstItemId);
    expect(itemUpdate).toHaveBeenNthCalledWith(2, {
      agent_commission_amount: 6,
      agent_commission_updated_by: adminUserId,
      agent_commission_updated_at: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(itemUpdateEq).toHaveBeenNthCalledWith(2, "id", secondItemId);
  });

  it("adds a product to an agent distribution order when payments are still editable", async () => {
    const agentOrderId = "11111111-1111-4111-8111-111111111111";
    const productId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";
    const customerOrderIs = vi.fn(() => Promise.resolve({
      data: [{ id: "customer-order-1", payment_status: "partial" }],
      error: null,
    }));
    const customerOrderEq = vi.fn(() => ({ is: customerOrderIs }));
    const customerOrderIn = vi.fn(() => ({ eq: customerOrderEq }));
    const agentOrderMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: agentOrderId },
      error: null,
    }));
    const agentOrderKindEq = vi.fn(() => ({ maybeSingle: agentOrderMaybeSingle }));
    const agentOrderIdEq = vi.fn(() => ({ eq: agentOrderKindEq }));
    const existingItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: null,
      error: null,
    }));
    const existingItemLimit = vi.fn(() => ({ maybeSingle: existingItemMaybeSingle }));
    const existingItemProductEq = vi.fn(() => ({ limit: existingItemLimit }));
    const existingItemOrderEq = vi.fn(() => ({ eq: existingItemProductEq }));
    const existingItemSelect = vi.fn(() => ({ eq: existingItemOrderEq }));
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "order") {
        return {
          select: (columns: string) => {
            if (columns === "id, payment_status") {
              return { in: customerOrderIn };
            }

            return { eq: agentOrderIdEq };
          },
        };
      }

      if (table === "order_item") {
        return {
          select: existingItemSelect,
          insert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from } as never, {
      type: "add-agent-order-item",
      agentOrderId,
      productId,
      quantity: 2.5,
    }, adminUserId);

    expect(agentOrderIdEq).toHaveBeenCalledWith("id", agentOrderId);
    expect(agentOrderKindEq).toHaveBeenCalledWith("order_kind", "distribution");
    expect(existingItemOrderEq).toHaveBeenCalledWith("order_id", agentOrderId);
    expect(existingItemProductEq).toHaveBeenCalledWith("product_id", productId);
    expect(insert).toHaveBeenCalledWith({
      order_id: agentOrderId,
      order_kind: "distribution",
      product_id: productId,
      partial_quantity: 2.5,
      final_quantity: 2.5,
      add_details: null,
    });
  });

  it("rejects adding a duplicate product to an agent distribution order", async () => {
    const agentOrderId = "11111111-1111-4111-8111-111111111111";
    const productId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";
    const customerOrderIs = vi.fn(() => Promise.resolve({
      data: [{ id: "customer-order-1", payment_status: "partial" }],
      error: null,
    }));
    const customerOrderEq = vi.fn(() => ({ is: customerOrderIs }));
    const customerOrderIn = vi.fn(() => ({ eq: customerOrderEq }));
    const agentOrderMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: agentOrderId },
      error: null,
    }));
    const agentOrderKindEq = vi.fn(() => ({ maybeSingle: agentOrderMaybeSingle }));
    const agentOrderIdEq = vi.fn(() => ({ eq: agentOrderKindEq }));
    const existingItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: "existing-item-id" },
      error: null,
    }));
    const existingItemLimit = vi.fn(() => ({ maybeSingle: existingItemMaybeSingle }));
    const existingItemProductEq = vi.fn(() => ({ limit: existingItemLimit }));
    const existingItemOrderEq = vi.fn(() => ({ eq: existingItemProductEq }));
    const existingItemSelect = vi.fn(() => ({ eq: existingItemOrderEq }));
    const insert = vi.fn(() => Promise.resolve({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "order") {
        return {
          select: (columns: string) => {
            if (columns === "id, payment_status") {
              return { in: customerOrderIn };
            }

            return { eq: agentOrderIdEq };
          },
        };
      }

      if (table === "order_item") {
        return {
          select: existingItemSelect,
          insert,
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "add-agent-order-item",
      agentOrderId,
      productId,
      quantity: 2.5,
    }, adminUserId)).rejects.toThrow("This product is already on the agent order.");

    expect(insert).not.toHaveBeenCalled();
  });

  it("promotes a customer to an agent, attaches existing orders, and marks the customer promoted", async () => {
    const customerId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";
    const customerProfileId = "5d676243-8403-40e3-8281-819983892f62";
    const agentId = "1b1e62e9-8203-4bfd-884e-4f64d4ed5f89";
    const userId = "35ca1c8d-d92e-4d36-a14f-8be4bb616a40";
    const customerRow = {
      id: customerId,
      profile_id: customerProfileId,
      assigned_agent_id: null,
      is_reseller: false,
      credit_limit: 1000,
      credit_limit_exceeded: false,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
      profile: {
        first_name: "Ana",
        last_name: "Buyer",
        display_name: "Ana Buyer",
        email: "ana@example.test",
        phone_number: "09170000000",
        address: "Market stall 12",
      },
    };
    const customerMaybeSingle = vi.fn(() => Promise.resolve({
      data: customerRow,
      error: null,
    }));
    const customerPromotionEq = vi.fn(() => Promise.resolve({ error: null }));
    const customerUpdate = vi.fn(() => ({ eq: customerPromotionEq }));
    const customerDelete = vi.fn(() => {
      throw new Error("Customer records should not be deleted during promotion.");
    });
    const customerEq = vi.fn(() => ({ maybeSingle: customerMaybeSingle }));
    const customerSelect = vi.fn(() => ({ eq: customerEq }));
    const existingAgentMaybeSingle = vi.fn(() => Promise.resolve({
      data: null,
      error: null,
    }));
    const existingAgentLimit = vi.fn(() => ({ maybeSingle: existingAgentMaybeSingle }));
    const existingAgentEq = vi.fn(() => ({ limit: existingAgentLimit }));
    const agentSelect = vi.fn(() => ({ eq: existingAgentEq }));
    const agentInsertSingle = vi.fn(() => Promise.resolve({
      data: { id: agentId },
      error: null,
    }));
    const agentInsertSelect = vi.fn(() => ({ single: agentInsertSingle }));
    const agentInsert = vi.fn(() => ({ select: agentInsertSelect }));
    const orderProcessingStatusEq = vi.fn(() => Promise.resolve({
      data: [{ id: "6cc25f47-3798-401a-a341-9f1454aa56e1" }],
      error: null,
    }));
    const orderProcessingCustomerEq = vi.fn(() => ({ eq: orderProcessingStatusEq }));
    const orderSelect = vi.fn(() => ({ eq: orderProcessingCustomerEq }));
    const orderStatusUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const orderCustomerEq = vi.fn(() => ({ eq: orderStatusUpdateEq }));
    const orderUpdate = vi.fn(() => ({ eq: orderCustomerEq }));
    const orderItemRows = [{
      id: "f3c0566d-f334-4a20-b4ee-e98c06034d31",
      final_quantity: 3,
      partial_quantity: 3,
      unit_price: 300,
      product: {
        agent_commission_type: "value",
        agent_commission_value: 20,
      },
    }];
    const orderItemIn = vi.fn(() => Promise.resolve({
      data: orderItemRows,
      error: null,
    }));
    const orderItemSelect = vi.fn(() => ({ in: orderItemIn }));
    const orderItemUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const orderItemUpdate = vi.fn(() => ({ eq: orderItemUpdateEq }));
    const duplicateProfileMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: customerProfileId },
      error: null,
    }));
    const excludedProfileMaybeSingle = vi.fn(() => Promise.resolve({
      data: null,
      error: null,
    }));
    const profileLookupNeqLimit = vi.fn(() => ({ maybeSingle: excludedProfileMaybeSingle }));
    const profileLookupNeq = vi.fn(() => ({ limit: profileLookupNeqLimit }));
    const profileLookupLimit = vi.fn(() => ({ maybeSingle: duplicateProfileMaybeSingle }));
    const profileLookupEq = vi.fn(() => ({
      limit: profileLookupLimit,
      neq: profileLookupNeq,
    }));
    const profileSelect = vi.fn(() => ({ eq: profileLookupEq }));
    const listUsers = vi.fn(() => Promise.resolve({
      data: { users: [] },
      error: null,
    }));
    const createUser = vi.fn(() => Promise.resolve({
      data: { user: { id: userId } },
      error: null,
    }));
    const deleteUser = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "customer") return { select: customerSelect, update: customerUpdate, delete: customerDelete };
      if (table === "agent") return { select: agentSelect, insert: agentInsert };
      if (table === "order") return { select: orderSelect, update: orderUpdate };
      if (table === "order_item") return { select: orderItemSelect, update: orderItemUpdate };
      if (table === "profile") return { select: profileSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      auth: {
        admin: {
          createUser,
          deleteUser,
          listUsers,
        },
      },
      from,
    });

    await executeAdminAction({ from: vi.fn() } as never, {
      type: "promote-customer-to-agent",
      customerId,
      account: {
        email: "ana@example.test",
        password: "password123",
        employee_id: "EMP-001",
      },
    }, adminUserId);

    expect(profileLookupEq).toHaveBeenCalledWith("phone_number", "09170000000");
    expect(profileLookupNeq).toHaveBeenCalledWith("id", customerProfileId);
    expect(duplicateProfileMaybeSingle).not.toHaveBeenCalled();
    expect(createUser).toHaveBeenCalledWith({
      email: "ana@example.test",
      password: "password123",
      email_confirm: true,
    });
    expect(agentInsert).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: customerId,
      profile_id: customerProfileId,
      employee_id: "EMP-001",
      promoted_from_customer_id: customerId,
      promoted_from_customer_at: expect.any(String),
      user_id: userId,
    }));
    expect(agentInsertSelect).toHaveBeenCalledWith("id");
    expect(orderUpdate).toHaveBeenCalledWith({
      agent_id: agentId,
      updated_at: expect.any(String),
    });
    expect(orderSelect).toHaveBeenCalledWith("id");
    expect(orderProcessingCustomerEq).toHaveBeenCalledWith("customer_id", customerId);
    expect(orderProcessingStatusEq).toHaveBeenCalledWith("order_status", "processing");
    expect(orderCustomerEq).toHaveBeenCalledWith("customer_id", customerId);
    expect(orderStatusUpdateEq).toHaveBeenCalledWith("order_status", "processing");
    expect(orderItemSelect).toHaveBeenCalledWith(`
      id,
      final_quantity,
      partial_quantity,
      unit_price,
      product:product_id (
        agent_commission_type,
        agent_commission_value
      )
    `);
    expect(orderItemIn).toHaveBeenCalledWith("order_id", ["6cc25f47-3798-401a-a341-9f1454aa56e1"]);
    expect(orderItemUpdate).toHaveBeenCalledWith({
      agent_commission_amount: 60,
      agent_commission_paid: false,
      agent_commission_set_by: null,
      agent_commission_set_at: null,
      updated_at: expect.any(String),
    });
    expect(orderItemUpdateEq).toHaveBeenCalledWith("id", "f3c0566d-f334-4a20-b4ee-e98c06034d31");
    expect(customerUpdate).toHaveBeenCalledWith({
      promoted_to_agent_id: agentId,
      promoted_to_agent_at: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(customerPromotionEq).toHaveBeenCalledWith("id", customerId);
    expect(customerDelete).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("reuses an unlinked auth account when retrying customer promotion", async () => {
    const customerId = "fb24371e-49b7-43ac-95f0-60efde316b0f";
    const customerProfileId = "f92f64e8-e68f-4725-8a05-6066c77c9922";
    const agentId = "f27e928f-47ac-40eb-aaf5-a5efeffa1666";
    const existingUserId = "5653cb27-c224-44d6-9a3c-8978570de62f";
    const customerRow = {
      id: customerId,
      profile_id: customerProfileId,
      assigned_agent_id: null,
      is_reseller: false,
      credit_limit: 1000,
      credit_limit_exceeded: false,
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
      profile: {
        first_name: "Paolo",
        last_name: "Araneta",
        display_name: "Paolo Araneta",
        email: "paoloaraneta008@gmail.com",
        phone_number: "09170000000",
        address: "Market stall 12",
      },
    };
    const customerMaybeSingle = vi.fn(() => Promise.resolve({
      data: customerRow,
      error: null,
    }));
    const customerPromotionEq = vi.fn(() => Promise.resolve({ error: null }));
    const customerUpdate = vi.fn(() => ({ eq: customerPromotionEq }));
    const customerDelete = vi.fn(() => {
      throw new Error("Customer records should not be deleted during promotion.");
    });
    const customerEq = vi.fn(() => ({ maybeSingle: customerMaybeSingle }));
    const customerSelect = vi.fn(() => ({ eq: customerEq }));
    const existingCustomerAgentMaybeSingle = vi.fn(() => Promise.resolve({
      data: null,
      error: null,
    }));
    const existingCustomerAgentLimit = vi.fn(() => ({
      maybeSingle: existingCustomerAgentMaybeSingle,
    }));
    const linkedAgentMaybeSingle = vi.fn(() => Promise.resolve({
      data: null,
      error: null,
    }));
    const linkedAgentLimit = vi.fn(() => ({ maybeSingle: linkedAgentMaybeSingle }));
    const agentEq = vi.fn((field: string, value: string) => {
      if (field === "customer_id" && value === customerId) {
        return { limit: existingCustomerAgentLimit };
      }

      if (field === "user_id" && value === existingUserId) {
        return { limit: linkedAgentLimit };
      }

      throw new Error(`Unexpected eq on agent: ${field}=${value}`);
    });
    const agentSelect = vi.fn(() => ({ eq: agentEq }));
    const agentInsertSingle = vi.fn(() => Promise.resolve({
      data: { id: agentId },
      error: null,
    }));
    const agentInsertSelect = vi.fn(() => ({ single: agentInsertSingle }));
    const agentInsert = vi.fn(() => ({ select: agentInsertSelect }));
    const adminRoleMaybeSingle = vi.fn(() => Promise.resolve({
      data: null,
      error: null,
    }));
    const adminRoleLimit = vi.fn(() => ({ maybeSingle: adminRoleMaybeSingle }));
    const adminRoleEq = vi.fn((field: string, value: string) => {
      if (field === "user_id" && value === existingUserId) {
        return { limit: adminRoleLimit };
      }

      throw new Error(`Unexpected eq on admin_role: ${field}=${value}`);
    });
    const adminRoleSelect = vi.fn(() => ({ eq: adminRoleEq }));
    const orderProcessingStatusEq = vi.fn(() => Promise.resolve({
      data: [],
      error: null,
    }));
    const orderProcessingCustomerEq = vi.fn(() => ({ eq: orderProcessingStatusEq }));
    const orderSelect = vi.fn(() => ({ eq: orderProcessingCustomerEq }));
    const orderStatusUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const orderCustomerEq = vi.fn(() => ({ eq: orderStatusUpdateEq }));
    const orderUpdate = vi.fn(() => ({ eq: orderCustomerEq }));
    const excludedProfileMaybeSingle = vi.fn(() => Promise.resolve({
      data: null,
      error: null,
    }));
    const profileLookupNeqLimit = vi.fn(() => ({ maybeSingle: excludedProfileMaybeSingle }));
    const profileLookupNeq = vi.fn(() => ({ limit: profileLookupNeqLimit }));
    const profileLookupEq = vi.fn(() => ({
      neq: profileLookupNeq,
    }));
    const profileSelect = vi.fn(() => ({ eq: profileLookupEq }));
    const listUsers = vi.fn(() => Promise.resolve({
      data: {
        users: [{
          id: existingUserId,
          email: "paoloaraneta008@gmail.com",
        }],
      },
      error: null,
    }));
    const createUser = vi.fn();
    const updateUserById = vi.fn(() => Promise.resolve({
      data: { user: { id: existingUserId } },
      error: null,
    }));
    const deleteUser = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "customer") return { select: customerSelect, update: customerUpdate, delete: customerDelete };
      if (table === "agent") return { select: agentSelect, insert: agentInsert };
      if (table === "admin_role") return { select: adminRoleSelect };
      if (table === "order") return { select: orderSelect, update: orderUpdate };
      if (table === "profile") return { select: profileSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      auth: {
        admin: {
          createUser,
          deleteUser,
          listUsers,
          updateUserById,
        },
      },
      from,
    });

    await executeAdminAction({ from: vi.fn() } as never, {
      type: "promote-customer-to-agent",
      customerId,
      account: {
        email: "paoloaraneta008@gmail.com",
        password: "password123",
        employee_id: null,
      },
    }, adminUserId);

    expect(createUser).not.toHaveBeenCalled();
    expect(updateUserById).toHaveBeenCalledWith(existingUserId, {
      password: "password123",
      email_confirm: true,
    });
    expect(agentInsert).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: customerId,
      profile_id: customerProfileId,
      promoted_from_customer_id: customerId,
      promoted_from_customer_at: expect.any(String),
      user_id: existingUserId,
    }));
    expect(orderCustomerEq).toHaveBeenCalledWith("customer_id", customerId);
    expect(orderStatusUpdateEq).toHaveBeenCalledWith("order_status", "processing");
    expect(customerUpdate).toHaveBeenCalledWith({
      promoted_to_agent_id: agentId,
      promoted_to_agent_at: expect.any(String),
      updated_at: expect.any(String),
    });
    expect(customerPromotionEq).toHaveBeenCalledWith("id", customerId);
    expect(customerDelete).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("rejects revoking customer promotion when the linked agent has distribution orders", async () => {
    const customerId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";
    const agentId = "1b1e62e9-8203-4bfd-884e-4f64d4ed5f89";
    const customerMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        id: customerId,
        promoted_to_agent_id: agentId,
      },
      error: null,
    }));
    const customerEq = vi.fn(() => ({ maybeSingle: customerMaybeSingle }));
    const customerSelect = vi.fn(() => ({ eq: customerEq }));
    const agentMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        id: agentId,
        promoted_from_customer_id: customerId,
      },
      error: null,
    }));
    const agentEq = vi.fn(() => ({ maybeSingle: agentMaybeSingle }));
    const agentSelect = vi.fn(() => ({ eq: agentEq }));
    const distributionAgentEq = vi.fn(() => Promise.resolve({
      count: 1,
      error: null,
    }));
    const distributionKindEq = vi.fn(() => ({ eq: distributionAgentEq }));
    const from = vi.fn((table: string) => {
      if (table === "customer") {
        return { select: customerSelect };
      }

      if (table === "agent") {
        return { select: agentSelect };
      }

      if (table === "order") {
        return {
          select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
            if (options?.count === "exact" && options.head) {
              return { eq: distributionKindEq };
            }

            throw new Error(`Unexpected order select: ${columns}`);
          }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from });

    await expect(executeAdminAction({ from: vi.fn() } as never, {
      type: "revoke-customer-agent-promotion",
      customerId,
    }, adminUserId)).rejects.toThrow(
      "Cannot cancel agent promotion while the agent has linked distribution orders.",
    );
  });

  it("confirms agent received payments through the trusted RPC", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: "1b1e62e9-8203-4bfd-884e-4f64d4ed5f89",
      error: null,
    }));

    await executeAdminAction(
      createAgentPaymentConfirmationSupabase(rpc) as never,
      {
      type: "confirm-agent-payment",
      agentPaymentId: "9ff2f3cf-14a3-4208-8e6b-886d4a6c8d74",
      recordedBy: adminUserId,
    }, adminUserId);

    expect(rpc).toHaveBeenCalledWith("confirm_agent_received_payment", {
      agent_payment_id: "9ff2f3cf-14a3-4208-8e6b-886d4a6c8d74",
      recorded_by_value: adminUserId,
    });
  });

  it("surfaces a safe error when agent received payment confirmation fails", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: null,
      error: { message: "Only pending agent received payments can be confirmed." },
    }));

    await expect(executeAdminAction(
      createAgentPaymentConfirmationSupabase(rpc) as never,
      {
      type: "confirm-agent-payment",
      agentPaymentId: "9ff2f3cf-14a3-4208-8e6b-886d4a6c8d74",
      recordedBy: adminUserId,
    }, adminUserId)).rejects.toThrow("Unable to confirm agent received payment.");
  });

  it("confirms multiple agent received payments through the trusted RPC", async () => {
    const rpc = vi.fn(() => Promise.resolve({
      data: "1b1e62e9-8203-4bfd-884e-4f64d4ed5f89",
      error: null,
    }));

    await executeAdminAction(
      createAgentPaymentConfirmationSupabase(rpc) as never,
      {
      type: "confirm-agent-payments",
      agentPaymentIds: [
        "9ff2f3cf-14a3-4208-8e6b-886d4a6c8d74",
        "12468070-4044-4788-8c5d-2c4471f2aef6",
      ],
      recordedBy: adminUserId,
    }, adminUserId);

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenNthCalledWith(1, "confirm_agent_received_payment", {
      agent_payment_id: "9ff2f3cf-14a3-4208-8e6b-886d4a6c8d74",
      recorded_by_value: adminUserId,
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "confirm_agent_received_payment", {
      agent_payment_id: "12468070-4044-4788-8c5d-2c4471f2aef6",
      recorded_by_value: adminUserId,
    });
  });

  it("distributes admin-recorded agent order payments directly to selected customer orders", async () => {
    const agentOrderId = "11111111-1111-4111-8111-111111111111";
    const firstOrderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const secondOrderId = "0d805818-837b-42d9-996e-79a6a3559f9b";
    const paymentInsert = vi.fn(async () => ({ error: null }));
    const markReadEq = vi.fn(async () => ({ error: null }));
    const markReadUpdate = vi.fn(() => ({ eq: markReadEq }));
    const invoiceMaybeSingle = vi.fn(async () => ({ data: null, error: null }));
    const invoiceLimit = vi.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
    const invoiceEq = vi.fn(() => ({ limit: invoiceLimit }));
    const invoiceSelect = vi.fn(() => ({ eq: invoiceEq }));
    const serverFrom = vi.fn((table: string) => {
      if (table === "payment") return { insert: paymentInsert };
      if (table === "invoice") return { select: invoiceSelect };
      if (table === "order") return { update: markReadUpdate };
      throw new Error(`Unexpected server table ${table}`);
    });
    const balanceByOrderId = new Map([
      [firstOrderId, 500],
      [secondOrderId, 200],
    ]);
    const adminRpc = vi.fn(async (_name: string, params: { target_order_id: string }) => ({
      data: balanceByOrderId.get(params.target_order_id) ?? 0,
      error: null,
    }));
    const selectedOrdersIn = vi.fn(async () => ({
      data: [
        { id: firstOrderId, parent_order_id: agentOrderId },
        { id: secondOrderId, parent_order_id: agentOrderId },
      ],
      error: null,
    }));
    const selectedOrdersSelect = vi.fn(() => ({ in: selectedOrdersIn }));
    const invoiceBalanceMaybeSingle = vi.fn(async () => ({
      data: {
        order_status: "pending",
        agent_id: null,
        parent_order_id: agentOrderId,
        payment: [],
        order_item: [],
      },
      error: null,
    }));
    const invoiceBalanceEq = vi.fn(() => ({ maybeSingle: invoiceBalanceMaybeSingle }));
    const invoiceBalanceSelect = vi.fn(() => ({ eq: invoiceBalanceEq }));
    const adminFrom = vi.fn((table: string) => {
      if (table !== "order") {
        throw new Error(`Unexpected admin table ${table}`);
      }

      return {
        select: (columns: string) => columns === "id, parent_order_id"
          ? selectedOrdersSelect()
          : invoiceBalanceSelect(),
      };
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: adminFrom,
      rpc: adminRpc,
    });

    await executeAdminAction({
      from: serverFrom,
    } as never, {
      type: "record-admin-agent-payment-distribution",
      agentOrderId,
      payload: {
        orderIds: [firstOrderId, secondOrderId],
        amount: 550.25,
        payment_method: "Cash",
        payment_terms: "Bank Transfer",
        payment_date: combineDateAndTime("2026-07-18"),
        recorded_by: adminUserId,
        reference_number: "ADMIN-REMIT-001",
        notes: "Admin collected batch payment",
      },
    }, adminUserId);

    expect(paymentInsert).toHaveBeenNthCalledWith(1, {
      order_id: firstOrderId,
      amount: 500,
      payment_method: "Cash",
      payment_terms: "Bank Transfer",
      payment_date: combineDateAndTime("2026-07-18"),
      recorded_by: adminUserId,
      reference_number: "ADMIN-REMIT-001",
      notes: "Admin collected batch payment",
    });
    expect(paymentInsert).toHaveBeenNthCalledWith(2, {
      order_id: secondOrderId,
      amount: 50.25,
      payment_method: "Cash",
      payment_terms: "Bank Transfer",
      payment_date: combineDateAndTime("2026-07-18"),
      recorded_by: adminUserId,
      reference_number: "ADMIN-REMIT-001",
      notes: "Admin collected batch payment",
    });
    expect(adminRpc).toHaveBeenCalledWith("compute_payment_balance", {
      target_order_id: firstOrderId,
    });
    expect(adminRpc).toHaveBeenCalledWith("compute_payment_balance", {
      target_order_id: secondOrderId,
    });
  });

  it("rejects non-reseller payment pricing for reseller customers", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const invoiceMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: "invoice-1" },
      error: null,
    }));
    const invoiceLimit = vi.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
    const invoiceEq = vi.fn(() => ({ limit: invoiceLimit }));
    const invoiceSelect = vi.fn(() => ({ eq: invoiceEq }));
    const orderMaybeSingle = vi.fn(() => Promise.resolve({
      data: { customer: { is_reseller: true } },
      error: null,
    }));
    const orderEq = vi.fn(() => ({ maybeSingle: orderMaybeSingle }));
    const orderSelect = vi.fn(() => ({ eq: orderEq }));
    const paymentInsert = vi.fn();
    const itemUpdate = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "invoice") return { select: invoiceSelect };
      if (table === "order") return { select: orderSelect };
      if (table === "payment") return { insert: paymentInsert };
      if (table === "order_item") return { update: itemUpdate };
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "record-payment",
      customerType: "regular",
      payload: {
        order_id: orderId,
        amount: 100,
        payment_method: "Cash",
        payment_terms: "Cash on Delivery (COD)",
        payment_date: "2026-07-18",
        recorded_by: adminUserId,
        reference_number: null,
        notes: null,
      },
    }, adminUserId)).rejects.toThrow("Reseller customer payments must use reseller pricing.");

    expect(orderSelect).toHaveBeenCalledWith(expect.stringContaining("customer:customer_id"));
    expect(orderSelect).toHaveBeenCalledWith(expect.stringContaining("agent_id"));
    expect(orderEq).toHaveBeenCalledWith("id", orderId);
    expect(paymentInsert).not.toHaveBeenCalled();
    expect(itemUpdate).not.toHaveBeenCalled();
  });

  it("records payment after loading product prices with a trusted admin client", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const productId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";
    const orderItemId = "45e73d23-f25f-4de7-ae3a-ebcf34e995f1";
    const invoiceMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: "invoice-1" },
      error: null,
    }));
    const invoiceLimit = vi.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
    const invoiceEq = vi.fn(() => ({ limit: invoiceLimit }));
    const invoiceSelect = vi.fn(() => ({ eq: invoiceEq }));
    const orderMaybeSingle = vi.fn(() => Promise.resolve({
      data: { customer: { is_reseller: false } },
      error: null,
    }));
    const orderSelectEq = vi.fn(() => ({ maybeSingle: orderMaybeSingle }));
    const orderSelect = vi.fn(() => ({ eq: orderSelectEq }));
    const orderUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const orderUpdate = vi.fn(() => ({ eq: orderUpdateEq }));
    const paymentSelectEq = vi.fn(() => Promise.resolve({
      data: [],
      error: null,
    }));
    const paymentSelect = vi.fn(() => ({ eq: paymentSelectEq }));
    const paymentInsert = vi.fn(() => Promise.resolve({ error: null }));
    const itemSelectEq = vi.fn(() => Promise.resolve({
      data: [
        {
          id: orderItemId,
          product_id: productId,
          final_quantity: 2,
          price_type: "retail",
          unit_price: 100,
        },
      ],
      error: null,
    }));
    const itemSelect = vi.fn(() => ({ eq: itemSelectEq }));
    const itemUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const itemUpdate = vi.fn(() => ({ eq: itemUpdateEq }));
    const productIn = vi.fn(() => Promise.resolve({
      data: [
        {
          id: productId,
          default_price: 100,
          reseller_price: 80,
          agent_commission_type: "value",
          agent_commission_value: 0,
        },
      ],
      error: null,
    }));
    const productSelect = vi.fn(() => ({ in: productIn }));
    const invoiceBalanceMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        order_status: "processing",
        agent_id: null,
        parent_order_id: null,        payment: [{ amount: 100 }],
        customer_order_item: [
          {
            final_quantity: 2,
            unit_price: 100,
            agent_commission_amount: 0,
            product: null,
          },
        ],
      },
      error: null,
    }));
    const adminOrderEq = vi.fn(() => ({ maybeSingle: invoiceBalanceMaybeSingle }));
    const adminOrderSelect = vi.fn(() => ({ eq: adminOrderEq }));
    const adminFrom = vi.fn((table: string) => {
      if (table === "product") return { select: productSelect };
      if (table === "order") return { select: adminOrderSelect };
      throw new Error(`Unexpected admin table ${table}`);
    });
    const from = vi.fn((table: string) => {
      if (table === "invoice") return { select: invoiceSelect };
      if (table === "order") return { select: orderSelect, update: orderUpdate };
      if (table === "payment") return { select: paymentSelect, insert: paymentInsert };
      if (table === "order_item") return { select: itemSelect, update: itemUpdate };
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    await executeAdminAction({ from } as never, {
      type: "record-payment",
      customerType: "regular",
      payload: {
        order_id: orderId,
        amount: 100,
        payment_method: "Cash",
        payment_terms: "Cash on Delivery (COD)",
        payment_date: "2026-07-18",
        recorded_by: adminUserId,
        reference_number: null,
        notes: null,
      },
    }, adminUserId);

    expect(itemSelect).toHaveBeenCalledWith(expect.stringContaining("product_id"));
    expect(itemSelect).not.toHaveBeenCalledWith(expect.stringContaining("product:product_id"));
    expect(from).not.toHaveBeenCalledWith("product");
    expect(adminFrom).toHaveBeenCalledWith("product");
    expect(productSelect).toHaveBeenCalledWith(expect.stringContaining("default_price"));
    expect(productSelect).toHaveBeenCalledWith(expect.stringContaining("agent_commission_value"));
    expect(productIn).toHaveBeenCalledWith("id", [productId]);
    expect(itemUpdate).toHaveBeenCalledWith({
      price_type: "retail",
      unit_price: 100,
    });
    expect(itemUpdateEq).toHaveBeenCalledWith("id", orderItemId);
    expect(paymentInsert).toHaveBeenCalledWith({
      order_id: orderId,
      amount: 100,
      payment_method: "Cash",
      payment_terms: "Cash on Delivery (COD)",
      payment_date: "2026-07-18",
      recorded_by: adminUserId,
      reference_number: null,
      notes: null,
    });
    expect(orderUpdateEq).toHaveBeenCalledWith("id", orderId);
  });

  it("creates a sales invoice after a payment record fulfills the computed order balance", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const productId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";
    const orderItemId = "45e73d23-f25f-4de7-ae3a-ebcf34e995f1";
    const invoiceMaybeSingle = vi.fn(() => Promise.resolve({
      data: null,
      error: null,
    }));
    const invoiceLimit = vi.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
    const invoiceEq = vi.fn(() => ({ limit: invoiceLimit }));
    const invoiceSelect = vi.fn(() => ({ eq: invoiceEq }));
    const invoiceInsert = vi.fn(() => Promise.resolve({ error: null }));
    const pricingOrderMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        agent_id: "64568f81-108b-42bd-b926-7e825dad67c6",
        parent_order_id: null,        customer: { is_reseller: false },
      },
      error: null,
    }));
    const orderStatusMaybeSingle = vi.fn(() => Promise.resolve({
      data: { order_status: "processing" },
      error: null,
    }));
    const invoiceBalanceMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        order_status: "processing",
        agent_id: "64568f81-108b-42bd-b926-7e825dad67c6",
        parent_order_id: null,        payment: [{ amount: 840 }],
        customer_order_item: [
          {
            final_quantity: 3,
            unit_price: 300,
            agent_commission_amount: 0,
            product: {
              agent_commission_type: "value",
              agent_commission_value: 20,
            },
          },
        ],
      },
      error: null,
    }));
    const pricingOrderEq = vi.fn(() => ({ maybeSingle: pricingOrderMaybeSingle }));
    const orderStatusEq = vi.fn(() => ({ maybeSingle: orderStatusMaybeSingle }));
    const invoiceBalanceEq = vi.fn(() => ({ maybeSingle: invoiceBalanceMaybeSingle }));
    const orderSelect = vi.fn((columns: string) => ({
      eq: columns.includes("customer:customer_id")
        ? pricingOrderEq
        : columns.includes("order_item")
        ? invoiceBalanceEq
        : orderStatusEq,
    }));
    const orderUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const orderUpdate = vi.fn(() => ({ eq: orderUpdateEq }));
    const paymentSelectEq = vi.fn(() => Promise.resolve({
      data: [],
      error: null,
    }));
    const paymentSelect = vi.fn(() => ({ eq: paymentSelectEq }));
    const paymentInsert = vi.fn(() => Promise.resolve({ error: null }));
    const itemSelectEq = vi.fn(() => Promise.resolve({
      data: [
        {
          id: orderItemId,
          product_id: productId,
          final_quantity: 3,
          price_type: "retail",
          unit_price: 300,
          agent_commission_amount: 0,
        },
      ],
      error: null,
    }));
    const itemSelect = vi.fn(() => ({ eq: itemSelectEq }));
    const itemUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const itemUpdate = vi.fn(() => ({ eq: itemUpdateEq }));
    const productIn = vi.fn(() => Promise.resolve({
      data: [
        {
          id: productId,
          default_price: 300,
          reseller_price: 280,
          agent_commission_type: "value",
          agent_commission_value: 20,
        },
      ],
      error: null,
    }));
    const productSelect = vi.fn(() => ({ in: productIn }));
    const adminInvoiceBalanceEq = vi.fn(() => ({ maybeSingle: invoiceBalanceMaybeSingle }));
    const adminOrderSelect = vi.fn(() => ({ eq: adminInvoiceBalanceEq }));
    const adminFrom = vi.fn((table: string) => {
      if (table === "product") return { select: productSelect };
      if (table === "order") return { select: adminOrderSelect };
      throw new Error(`Unexpected admin table ${table}`);
    });
    const rpc = vi.fn(() => Promise.resolve({ data: 0, error: null }));
    const from = vi.fn((table: string) => {
      if (table === "invoice") return { select: invoiceSelect, insert: invoiceInsert };
      if (table === "order") return { select: orderSelect, update: orderUpdate };
      if (table === "payment") return { select: paymentSelect, insert: paymentInsert };
      if (table === "order_item") return { select: itemSelect, update: itemUpdate };
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    await executeAdminAction({ from, rpc } as never, {
      type: "record-payment",
      customerType: "regular",
      payload: {
        order_id: orderId,
        amount: 840,
        payment_method: "Cash",
        payment_terms: "Cash on Delivery (COD)",
        payment_date: "2026-07-18",
        recorded_by: adminUserId,
        reference_number: null,
        notes: null,
      },
    }, adminUserId);

    expect(paymentInsert).toHaveBeenCalledWith(expect.objectContaining({
      order_id: orderId,
      amount: 840,
    }));
    expect(rpc).not.toHaveBeenCalled();
    expect(invoiceInsert).toHaveBeenCalledWith(expect.objectContaining({
      order_id: orderId,
      status: "issued",
      due_at: null,
    }));
    expect(orderUpdateEq).toHaveBeenCalledWith("id", orderId);
  });

  it("rejects zero payment amounts before saving payment records", async () => {
    const from = vi.fn();

    await expect(executeAdminAction({ from } as never, {
      type: "record-payment",
      customerType: "regular",
      payload: {
        order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        amount: 0,
        payment_method: "Cash",
        payment_terms: "Cash on Delivery (COD)",
        payment_date: "2026-07-18",
        recorded_by: adminUserId,
        reference_number: null,
        notes: null,
      },
    }, adminUserId)).rejects.toThrow("Payment amount must be greater than zero.");

    expect(from).not.toHaveBeenCalled();
  });

  it("rejects payment amounts above the commission-adjusted balance", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const productId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";
    const orderItemId = "45e73d23-f25f-4de7-ae3a-ebcf34e995f1";
    const invoiceSelect = vi.fn();
    const orderMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        agent_id: "64568f81-108b-42bd-b926-7e825dad67c6",
        parent_order_id: null,        customer: { is_reseller: false },
      },
      error: null,
    }));
    const orderSelectEq = vi.fn(() => ({ maybeSingle: orderMaybeSingle }));
    const orderSelect = vi.fn(() => ({ eq: orderSelectEq }));
    const paymentSelectEq = vi.fn(() => Promise.resolve({
      data: [],
      error: null,
    }));
    const paymentSelect = vi.fn(() => ({ eq: paymentSelectEq }));
    const paymentInsert = vi.fn();
    const itemSelectEq = vi.fn(() => Promise.resolve({
      data: [
        {
          id: orderItemId,
          product_id: productId,
          final_quantity: 3,
          price_type: "retail",
          unit_price: 300,
          agent_commission_amount: 0,
        },
      ],
      error: null,
    }));
    const itemSelect = vi.fn(() => ({ eq: itemSelectEq }));
    const itemUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const itemUpdate = vi.fn(() => ({ eq: itemUpdateEq }));
    const productIn = vi.fn(() => Promise.resolve({
      data: [
        {
          id: productId,
          default_price: 300,
          reseller_price: 280,
          agent_commission_type: "value",
          agent_commission_value: 20,
        },
      ],
      error: null,
    }));
    const productSelect = vi.fn(() => ({ in: productIn }));
    const adminFrom = vi.fn((table: string) => {
      if (table === "product") return { select: productSelect };
      throw new Error(`Unexpected admin table ${table}`);
    });
    const from = vi.fn((table: string) => {
      if (table === "invoice") return { select: invoiceSelect };
      if (table === "order") return { select: orderSelect };
      if (table === "payment") return { select: paymentSelect, insert: paymentInsert };
      if (table === "order_item") return { select: itemSelect, update: itemUpdate };
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    await expect(executeAdminAction({ from } as never, {
      type: "record-payment",
      customerType: "regular",
      payload: {
        order_id: orderId,
        amount: 900,
        payment_method: "Cash",
        payment_terms: "Cash on Delivery (COD)",
        payment_date: "2026-07-18",
        recorded_by: adminUserId,
        reference_number: null,
        notes: null,
      },
    }, adminUserId)).rejects.toThrow("Payment amount cannot exceed the remaining balance.");

    expect(orderSelect).toHaveBeenCalledWith(expect.stringContaining("agent_id"));
    expect(itemSelect).toHaveBeenCalledWith(expect.stringContaining("agent_commission_amount"));
    expect(productSelect).toHaveBeenCalledWith(expect.stringContaining("agent_commission_value"));
    expect(paymentInsert).not.toHaveBeenCalled();
  });

  it("accepts full gross payment for direct customer orders with an assigned agent", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const productId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";
    const orderItemId = "45e73d23-f25f-4de7-ae3a-ebcf34e995f1";
    const invoiceMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const invoiceLimit = vi.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
    const invoiceSelectEq = vi.fn(() => ({ limit: invoiceLimit }));
    const invoiceSelect = vi.fn(() => ({ eq: invoiceSelectEq }));
    const invoiceInsert = vi.fn(() => Promise.resolve({ error: null }));
    const pricingOrderMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        agent_id: null,
        parent_order_id: null,        customer: {
          is_reseller: false,
          assigned_agent_id: "64568f81-108b-42bd-b926-7e825dad67c6",
        },
      },
      error: null,
    }));
    const orderStatusMaybeSingle = vi.fn(() => Promise.resolve({
      data: { order_status: "processing" },
      error: null,
    }));
    const invoiceBalanceMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        order_status: "processing",
        agent_id: null,
        parent_order_id: null,        payment: [{ amount: 900 }],
        customer_order_item: [
          {
            final_quantity: 3,
            unit_price: 300,
            agent_commission_amount: 0,
            product: {
              agent_commission_type: "value",
              agent_commission_value: 20,
            },
          },
        ],
      },
      error: null,
    }));
    const pricingOrderEq = vi.fn(() => ({ maybeSingle: pricingOrderMaybeSingle }));
    const orderStatusEq = vi.fn(() => ({ maybeSingle: orderStatusMaybeSingle }));
    const orderSelect = vi.fn((columns: string) => ({
      eq: columns.includes("customer:customer_id") ? pricingOrderEq : orderStatusEq,
    }));
    const orderUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const orderUpdate = vi.fn(() => ({ eq: orderUpdateEq }));
    const paymentSelectEq = vi.fn(() => Promise.resolve({
      data: [],
      error: null,
    }));
    const paymentSelect = vi.fn(() => ({ eq: paymentSelectEq }));
    const paymentInsert = vi.fn(() => Promise.resolve({ error: null }));
    const itemSelectEq = vi.fn(() => Promise.resolve({
      data: [
        {
          id: orderItemId,
          product_id: productId,
          final_quantity: 3,
          price_type: "retail",
          unit_price: 300,
          agent_commission_amount: 0,
        },
      ],
      error: null,
    }));
    const itemSelect = vi.fn(() => ({ eq: itemSelectEq }));
    const itemUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const itemUpdate = vi.fn(() => ({ eq: itemUpdateEq }));
    const productIn = vi.fn(() => Promise.resolve({
      data: [
        {
          id: productId,
          default_price: 300,
          reseller_price: 280,
          agent_commission_type: "value",
          agent_commission_value: 20,
        },
      ],
      error: null,
    }));
    const productSelect = vi.fn(() => ({ in: productIn }));
    const adminInvoiceBalanceEq = vi.fn(() => ({ maybeSingle: invoiceBalanceMaybeSingle }));
    const adminOrderSelect = vi.fn(() => ({ eq: adminInvoiceBalanceEq }));
    const adminFrom = vi.fn((table: string) => {
      if (table === "product") return { select: productSelect };
      if (table === "order") return { select: adminOrderSelect };
      throw new Error(`Unexpected admin table ${table}`);
    });
    const rpc = vi.fn(() => Promise.resolve({ data: 0, error: null }));
    const from = vi.fn((table: string) => {
      if (table === "invoice") return { select: invoiceSelect, insert: invoiceInsert };
      if (table === "order") return { select: orderSelect, update: orderUpdate };
      if (table === "payment") return { select: paymentSelect, insert: paymentInsert };
      if (table === "order_item") return { select: itemSelect, update: itemUpdate };
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    await executeAdminAction({ from, rpc } as never, {
      type: "record-payment",
      customerType: "regular",
      payload: {
        order_id: orderId,
        amount: 900,
        payment_method: "Cash",
        payment_terms: "Cash on Delivery (COD)",
        payment_date: "2026-07-18",
        recorded_by: adminUserId,
        reference_number: null,
        notes: null,
      },
    }, adminUserId);

    expect(paymentInsert).toHaveBeenCalledWith(expect.objectContaining({
      order_id: orderId,
      amount: 900,
    }));
    expect(invoiceInsert).toHaveBeenCalledWith(expect.objectContaining({
      order_id: orderId,
      status: "issued",
    }));
  });

  it("validates and creates a direct customer record", async () => {
    const payload = {
      first_name: "Ana",
      last_name: "Buyer",
      phone_number: "09170000000",
      email: "ana@example.test",
      address: "Market stall 12",
      assigned_agent_id: null,
      created_by: adminUserId,
      credit_limit: 1000,
      is_reseller: false,
      updated_at: "2026-07-01T00:00:00.000Z",
    };
    const phoneMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const phoneLookupEq = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: phoneMaybeSingle })) }));
    const emailMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const emailLookupIlike = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: emailMaybeSingle })) }));
    const profileSelect = vi.fn(() => ({
      eq: phoneLookupEq,
      ilike: emailLookupIlike,
    }));
    const profileInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: "profile-id" }, error: null })),
      })),
    }));
    const customerInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: "customer-id" }, error: null })),
      })),
    }));
    const customerTrackingEq = vi.fn(() => ({
      maybeSingle: vi.fn(() => Promise.resolve({
        data: { tracking_number: "JHM-TEST1234" },
        error: null,
      })),
    }));
    const customerSelect = vi.fn(() => ({
      eq: customerTrackingEq,
    }));
    const from = vi.fn((table: string) => {
      if (table === "profile") return { select: profileSelect, insert: profileInsert };
      if (table === "customer") return { insert: customerInsert, select: customerSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from });

    await executeAdminAction({ from } as never, {
      type: "save-customer",
      payload,
    }, adminUserId);

    expect(profileSelect).toHaveBeenCalledWith("id");
    expect(phoneLookupEq).toHaveBeenCalledWith("phone_number", "09170000000");
    expect(emailLookupIlike).toHaveBeenCalledWith("email", "ana@example.test");
    expect(profileInsert).toHaveBeenCalled();
    expect(customerInsert).toHaveBeenCalledWith(expect.objectContaining({
      profile_id: "profile-id",
      assigned_agent_id: null,
      is_reseller: false,
    }));
  });

  it("rejects direct customer creation when the phone number already exists", async () => {
    const maybeSingle = vi.fn(() => Promise.resolve({
      data: { id: "existing-profile-id" },
      error: null,
    }));
    const profileLookupEq = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle })) }));
    const profileSelect = vi.fn(() => ({ eq: profileLookupEq }));
    const customerInsert = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "profile") return { select: profileSelect };
      if (table === "customer") return { insert: customerInsert };
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from });

    await expect(executeAdminAction({ from } as never, {
      type: "save-customer",
      payload: {
        first_name: "Ana",
        last_name: "Buyer",
        phone_number: "09170000000",
        email: null,
        address: "Market stall 12",
        assigned_agent_id: null,
        created_by: adminUserId,
        credit_limit: 1000,
        is_reseller: false,
        updated_at: "2026-07-01T00:00:00.000Z",
      },
    }, adminUserId)).rejects.toThrow("Phone number already exists for another customer.");

    expect(profileSelect).toHaveBeenCalledWith("id");
    expect(profileLookupEq).toHaveBeenCalledWith("phone_number", "09170000000");
    expect(customerInsert).not.toHaveBeenCalled();
  });

  it("creates an admin order and inserts each order item with the returned order id", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const orderInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: orderId }, error: null })),
      })),
    }));
    const itemInsert = vi.fn(() => Promise.resolve({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "order") return { insert: orderInsert };
      if (table === "order_item") return { insert: itemInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from } as never, {
      type: "create-order",
      customer: {
        type: "existing",
        customerId: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      },
      payload: {
        agent_id: null,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        release_date: "2026-07-18T03:15:00.000Z",
        submitted_by: adminUserId,
        approved_by: adminUserId,
        approved_at: "2026-07-01T00:00:00.000Z",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      items: [
        {
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2,
          final_quantity: 2,
          add_details: null,
        },
      ],
    });

    expect(from).toHaveBeenCalledWith("order");
    expect(from).toHaveBeenCalledWith("order_item");
    expect(orderInsert).toHaveBeenCalledWith(expect.objectContaining({
      order_kind: "customer",
      customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      agent_id: null,
      source: "admin_manual",
      order_status: "processing",
      payment_status: "unpaid",
      release_date: "2026-07-18T03:15:00.000Z",
      submitted_by: adminUserId,
      approved_by: adminUserId,
      approved_at: "2026-07-01T00:00:00.000Z",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    }));
    expect(itemInsert).toHaveBeenCalledWith([
      {
        order_id: orderId,
        order_kind: "customer",
        product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
        partial_quantity: 2,
        final_quantity: 2,
        add_details: null,
      },
    ]);
  });

  it("creates an admin personal order for an agent through the agent customer record", async () => {
    const agentId = "64568f81-108b-42bd-b926-7e825dad67c6";
    const customerId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const agentMaybeSingle = vi.fn(() => Promise.resolve({
      data: { customer_id: customerId },
      error: null,
    }));
    const agentEq = vi.fn(() => ({ maybeSingle: agentMaybeSingle }));
    const agentSelect = vi.fn(() => ({ eq: agentEq }));
    const orderInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: orderId }, error: null })),
      })),
    }));
    const itemInsert = vi.fn(() => Promise.resolve({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "agent") return { select: agentSelect };
      if (table === "order") return { insert: orderInsert };
      if (table === "order_item") return { insert: itemInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from } as never, {
      type: "create-order",
      customer: {
        type: "agent",
        agentId,
      },
      agentOrderType: "personal",
      payload: {
        agent_id: agentId,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        release_date: "2026-07-18T03:15:00.000Z",
        submitted_by: adminUserId,
        approved_by: adminUserId,
        approved_at: "2026-07-01T00:00:00.000Z",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      items: [
        {
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2,
          final_quantity: 2,
          add_details: null,
        },
      ],
    });

    expect(agentSelect).toHaveBeenCalledWith("customer_id");
    expect(agentEq).toHaveBeenCalledWith("id", agentId);
    expect(orderInsert).toHaveBeenCalledWith(expect.objectContaining({
      order_kind: "customer",
      customer_id: customerId,
      agent_id: agentId,
      source: "admin_manual",
      order_status: "processing",
      payment_status: "unpaid",
      release_date: "2026-07-18T03:15:00.000Z",
      submitted_by: adminUserId,
      approved_by: adminUserId,
      approved_at: "2026-07-01T00:00:00.000Z",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
    }));
    expect(itemInsert).toHaveBeenCalledWith([
      {
        order_id: orderId,
        order_kind: "customer",
        product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
        partial_quantity: 2,
        final_quantity: 2,
        add_details: null,
      },
    ]);
  });

  it("creates an admin distribution order for an agent", async () => {
    const agentId = "64568f81-108b-42bd-b926-7e825dad67c6";
    const agentOrderId = "9dfbf3fe-4215-4213-b515-36d0509ea6ec";
    const orderInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: agentOrderId }, error: null })),
      })),
    }));
    const itemInsert = vi.fn(() => Promise.resolve({ error: null }));
    const from = vi.fn((table: string) => {
      if (table === "order") return { insert: orderInsert };
      if (table === "order_item") return { insert: itemInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await executeAdminAction({ from } as never, {
      type: "create-order",
      customer: {
        type: "agent",
        agentId,
      },
      agentOrderType: "distribution",
      payload: {
        agent_id: agentId,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        release_date: "2026-07-18T03:15:00.000Z",
        submitted_by: adminUserId,
        approved_by: adminUserId,
        approved_at: "2026-07-01T00:00:00.000Z",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      items: [
        {
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2,
          final_quantity: 2,
          add_details: "For distribution",
        },
      ],
    });

    expect(orderInsert).toHaveBeenCalledWith(expect.objectContaining({
      order_kind: "distribution",
      agent_id: agentId,
      source: "agent_submitted",
      payment_status: "unpaid",
      order_status: "pending_customers",
      notes: null,
      submitted_by: adminUserId,
      approved_by: adminUserId,
      approved_at: expect.any(String),
      created_at: expect.any(String),
      admin_read_by: adminUserId,
      release_date: "2026-07-18T03:15:00.000Z",
    }));
    expect(itemInsert).toHaveBeenCalledWith([
      {
        order_id: agentOrderId,
        order_kind: "distribution",
        product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
        partial_quantity: 2,
        final_quantity: 2,
        add_details: "For distribution",
      },
    ]);
    expect(result).toEqual({
      redirectPath: `/admin/orders/agent/${agentOrderId}`,
    });
  });

  it("creates a sales invoice when an admin-created order is fully paid on creation", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const orderInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: orderId }, error: null })),
      })),
    }));
    const invoiceBalanceMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        order_status: "processing",
        agent_id: null,
        parent_order_id: null,
        payment: [{ amount: 700 }],
        order_item: [
          {
            final_quantity: 2,
            unit_price: 350,
            agent_commission_amount: 0,
            product: null,
          },
        ],
      },
      error: null,
    }));
    const orderSelectEq = vi.fn(() => ({ maybeSingle: invoiceBalanceMaybeSingle }));
    const orderSelect = vi.fn(() => ({ eq: orderSelectEq }));
    const itemInsert = vi.fn(() => Promise.resolve({ error: null }));
    const paymentInsert = vi.fn(() => Promise.resolve({ error: null }));
    const invoiceMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const invoiceLimit = vi.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
    const invoiceSelectEq = vi.fn(() => ({ limit: invoiceLimit }));
    const invoiceSelect = vi.fn(() => ({ eq: invoiceSelectEq }));
    const invoiceInsert = vi.fn(() => Promise.resolve({ error: null }));
    const orderUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const orderUpdate = vi.fn(() => ({ eq: orderUpdateEq }));
    const rpc = vi.fn(() => Promise.resolve({ data: 0, error: null }));
    const adminFrom = vi.fn((table: string) => {
      if (table === "order") return { select: orderSelect };
      throw new Error(`Unexpected admin table ${table}`);
    });
    const from = vi.fn((table: string) => {
      if (table === "order") return { insert: orderInsert, select: orderSelect, update: orderUpdate };
      if (table === "order_item") return { insert: itemInsert };
      if (table === "payment") return { insert: paymentInsert };
      if (table === "invoice") return { select: invoiceSelect, insert: invoiceInsert };
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    await executeAdminAction({ from, rpc } as never, {
      type: "create-order",
      customer: {
        type: "existing",
        customerId: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      },
      payload: {
        agent_id: null,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        release_date: "2026-07-18T03:15:00.000Z",
        submitted_by: adminUserId,
        approved_by: adminUserId,
        approved_at: "2026-07-01T00:00:00.000Z",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      items: [
        {
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2,
          final_quantity: 2,
          add_details: null,
        },
      ],
      payment: {
        amount: 700,
        payment_method: "Cash",
        payment_terms: "Gcash",
        payment_date: "2026-07-18",
        recorded_by: adminUserId,
        reference_number: null,
        notes: null,
      },
    }, adminUserId);

    expect(paymentInsert).toHaveBeenCalledWith({
      order_id: orderId,
      amount: 700,
      payment_method: "Cash",
      payment_terms: "Gcash",
      payment_date: "2026-07-18",
      recorded_by: adminUserId,
      reference_number: null,
      notes: null,
    });
    expect(invoiceSelect).toHaveBeenCalledWith("id");
    expect(invoiceSelectEq).toHaveBeenCalledWith("order_id", orderId);
    expect(orderSelect).toHaveBeenCalledWith(expect.stringContaining("order_item"));
    expect(orderSelectEq).toHaveBeenCalledWith("id", orderId);
    expect(rpc).not.toHaveBeenCalled();
    expect(invoiceInsert).toHaveBeenCalledWith(expect.objectContaining({
      order_id: orderId,
      status: "issued",
      due_at: null,
    }));
    expect(orderUpdate).toHaveBeenCalledWith(expect.objectContaining({
      order_status: "closed",
    }));
    expect(orderUpdateEq).toHaveBeenCalledWith("id", orderId);
  });

  it("creates a new customer before creating an admin order even when the phone number already exists", async () => {
    const customerId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const customerPayload = {
      first_name: "Luz",
      last_name: "Dela Cruz",
      phone_number: "09171112222",
      email: "luz@example.test",
      address: "Stall 8",
      assigned_agent_id: null,
      created_by: adminUserId,
      credit_limit: 1000,
      is_reseller: false,
      updated_at: "2026-07-01T00:00:00.000Z",
    };
    const phoneMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const phoneLookupEq = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: phoneMaybeSingle })) }));
    const emailMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const emailLookupIlike = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: emailMaybeSingle })) }));
    const profileSelect = vi.fn(() => ({
      eq: phoneLookupEq,
      ilike: emailLookupIlike,
    }));
    const profileInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: "profile-id" }, error: null })),
      })),
    }));
    const customerInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: customerId }, error: null })),
      })),
    }));
    const customerTrackingEq = vi.fn(() => ({
      maybeSingle: vi.fn(() => Promise.resolve({
        data: { tracking_number: "JHM-TEST1234" },
        error: null,
      })),
    }));
    const customerSelect = vi.fn(() => ({
      eq: customerTrackingEq,
    }));
    const orderInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: orderId }, error: null })),
      })),
    }));
    const itemInsert = vi.fn(() => Promise.resolve({ error: null }));
    const adminFrom = vi.fn((table: string) => {
      if (table === "profile") return { select: profileSelect, insert: profileInsert };
      if (table === "customer") return { insert: customerInsert, select: customerSelect };
      throw new Error(`Unexpected admin table ${table}`);
    });
    const serverFrom = vi.fn((table: string) => {
      if (table === "order") return { insert: orderInsert };
      if (table === "order_item") return { insert: itemInsert };
      throw new Error(`Unexpected server table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    await executeAdminAction({ from: serverFrom } as never, {
      type: "create-order",
      customer: {
        type: "new",
        payload: customerPayload,
      },
      payload: {
        agent_id: null,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        release_date: "2026-07-18T03:15:00.000Z",
        submitted_by: adminUserId,
        approved_by: adminUserId,
        approved_at: "2026-07-01T00:00:00.000Z",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      items: [
        {
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2,
          final_quantity: 2,
          add_details: null,
        },
      ],
    });

    expect(profileSelect).toHaveBeenCalledWith("id");
    expect(phoneLookupEq).toHaveBeenCalledWith("phone_number", "09171112222");
    expect(emailLookupIlike).toHaveBeenCalledWith("email", "luz@example.test");
    expect(profileInsert).toHaveBeenCalled();
    expect(customerInsert).toHaveBeenCalledWith(expect.objectContaining({
      profile_id: "profile-id",
    }));
    expect(orderInsert).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: customerId,
    }));
  });

  it("rejects admin order creation when the new customer phone number already exists", async () => {
    const maybeSingle = vi.fn(() => Promise.resolve({
      data: { id: "existing-profile-id" },
      error: null,
    }));
    const profileLookupEq = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle })) }));
    const profileSelect = vi.fn(() => ({ eq: profileLookupEq }));
    const customerInsert = vi.fn();
    const orderInsert = vi.fn();
    const adminFrom = vi.fn((table: string) => {
      if (table === "profile") return { select: profileSelect };
      if (table === "customer") return { insert: customerInsert };
      throw new Error(`Unexpected admin table ${table}`);
    });
    const serverFrom = vi.fn((table: string) => {
      if (table === "order") return { insert: orderInsert };
      throw new Error(`Unexpected server table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    await expect(executeAdminAction({ from: serverFrom } as never, {
      type: "create-order",
      customer: {
        type: "new",
        payload: {
          first_name: "Luz",
          last_name: "Dela Cruz",
          phone_number: "09171112222",
          email: "luz@example.test",
          address: "Stall 8",
          assigned_agent_id: null,
          created_by: adminUserId,
          credit_limit: 1000,
          is_reseller: false,
          updated_at: "2026-07-01T00:00:00.000Z",
        },
      },
      payload: {
        agent_id: null,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        release_date: "2026-07-18T03:15:00.000Z",
        submitted_by: adminUserId,
        approved_by: adminUserId,
        approved_at: "2026-07-01T00:00:00.000Z",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      items: [
        {
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2,
          final_quantity: 2,
          add_details: null,
        },
      ],
    })).rejects.toThrow("Phone number already exists for another customer.");

    expect(profileSelect).toHaveBeenCalledWith("id");
    expect(profileLookupEq).toHaveBeenCalledWith("phone_number", "09171112222");
    expect(customerInsert).not.toHaveBeenCalled();
    expect(orderInsert).not.toHaveBeenCalled();
  });

  it("rejects admin order creation when the new customer email already exists", async () => {
    const phoneMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const phoneLookupEq = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: phoneMaybeSingle })) }));
    const emailMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: "existing-profile-id" },
      error: null,
    }));
    const emailLookupIlike = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: emailMaybeSingle })) }));
    const profileSelect = vi.fn(() => ({
      eq: phoneLookupEq,
      ilike: emailLookupIlike,
    }));
    const customerInsert = vi.fn();
    const orderInsert = vi.fn();
    const adminFrom = vi.fn((table: string) => {
      if (table === "profile") return { select: profileSelect };
      if (table === "customer") return { insert: customerInsert };
      throw new Error(`Unexpected admin table ${table}`);
    });
    const serverFrom = vi.fn((table: string) => {
      if (table === "order") return { insert: orderInsert };
      throw new Error(`Unexpected server table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    await expect(executeAdminAction({ from: serverFrom } as never, {
      type: "create-order",
      customer: {
        type: "new",
        payload: {
          first_name: "Luz",
          last_name: "Dela Cruz",
          phone_number: "09171112222",
          email: "LUZ@example.test",
          address: "Stall 8",
          assigned_agent_id: null,
          created_by: adminUserId,
          credit_limit: 1000,
          is_reseller: false,
          updated_at: "2026-07-01T00:00:00.000Z",
        },
      },
      payload: {
        agent_id: null,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        release_date: "2026-07-18T03:15:00.000Z",
        submitted_by: adminUserId,
        approved_by: adminUserId,
        approved_at: "2026-07-01T00:00:00.000Z",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      items: [
        {
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2,
          final_quantity: 2,
          add_details: null,
        },
      ],
    })).rejects.toThrow("Email already exists for another customer.");

    expect(profileSelect).toHaveBeenCalledWith("id");
    expect(phoneLookupEq).toHaveBeenCalledWith("phone_number", "09171112222");
    expect(emailLookupIlike).toHaveBeenCalledWith("email", "luz@example.test");
    expect(customerInsert).not.toHaveBeenCalled();
    expect(orderInsert).not.toHaveBeenCalled();
  });

  it("creates a new customer before creating an admin order when no phone match exists", async () => {
    const customerId = "b10bb955-d8b1-4a26-a6e2-928fd33949e1";
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const customerPayload = {
      first_name: "Luz",
      last_name: "Dela Cruz",
      phone_number: "09171112222",
      email: "luz@example.test",
      address: "Stall 8",
      assigned_agent_id: null,
      created_by: adminUserId,
      credit_limit: 1000,
      is_reseller: false,
      updated_at: "2026-07-01T00:00:00.000Z",
    };
    const phoneMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const phoneLookupEq = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: phoneMaybeSingle })) }));
    const emailMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const emailLookupIlike = vi.fn(() => ({ limit: vi.fn(() => ({ maybeSingle: emailMaybeSingle })) }));
    const profileSelect = vi.fn(() => ({
      eq: phoneLookupEq,
      ilike: emailLookupIlike,
    }));
    const profileInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: "profile-id" }, error: null })),
      })),
    }));
    const customerInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: customerId }, error: null })),
      })),
    }));
    const customerTrackingEq = vi.fn(() => ({
      maybeSingle: vi.fn(() => Promise.resolve({
        data: { tracking_number: "JHM-TEST1234" },
        error: null,
      })),
    }));
    const customerSelect = vi.fn(() => ({
      eq: customerTrackingEq,
    }));
    const orderInsert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn(() => Promise.resolve({ data: { id: orderId }, error: null })),
      })),
    }));
    const itemInsert = vi.fn(() => Promise.resolve({ error: null }));
    const adminFrom = vi.fn((table: string) => {
      if (table === "profile") return { select: profileSelect, insert: profileInsert };
      if (table === "customer") return { insert: customerInsert, select: customerSelect };
      throw new Error(`Unexpected admin table ${table}`);
    });
    const serverFrom = vi.fn((table: string) => {
      if (table === "order") return { insert: orderInsert };
      if (table === "order_item") return { insert: itemInsert };
      throw new Error(`Unexpected server table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    await executeAdminAction({ from: serverFrom } as never, {
      type: "create-order",
      customer: {
        type: "new",
        payload: customerPayload,
      },
      payload: {
        agent_id: null,
        source: "admin_manual",
        order_status: "processing",
        payment_status: "unpaid",
        release_date: "2026-07-18T03:15:00.000Z",
        submitted_by: adminUserId,
        approved_by: adminUserId,
        approved_at: "2026-07-01T00:00:00.000Z",
        created_at: "2026-07-01T00:00:00.000Z",
        updated_at: "2026-07-01T00:00:00.000Z",
      },
      items: [
        {
          product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
          partial_quantity: 2,
          final_quantity: 2,
          add_details: null,
        },
      ],
    });

    expect(profileSelect).toHaveBeenCalledWith("id");
    expect(phoneLookupEq).toHaveBeenCalledWith("phone_number", "09171112222");
    expect(emailLookupIlike).toHaveBeenCalledWith("email", "luz@example.test");
    expect(profileInsert).toHaveBeenCalled();
    expect(customerInsert).toHaveBeenCalledWith(expect.objectContaining({
      profile_id: "profile-id",
    }));
    expect(orderInsert).toHaveBeenCalledWith(expect.objectContaining({
      customer_id: customerId,
    }));
  });

  it("blocks marking a commission as paid when no payment record exists", async () => {
    const customerOrderItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        id: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
        order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        final_quantity: 2,
        unit_price: 100,
        agent_commission_paid: false,
      },
      error: null,
    }));
    const customerOrderItemEq = vi.fn((field: string, value: string) => {
      if (field === "id" && value === "45e73d23-f25f-4de7-ae3a-ebcf34e995f1") {
        return { maybeSingle: customerOrderItemMaybeSingle };
      }

      if (field === "order_id" && value === "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb") {
        return Promise.resolve({
          data: [
            {
              id: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
              final_quantity: 2,
              unit_price: 100,
              agent_commission_paid: false,
            },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected eq on customer_order_item: ${field}=${value}`);
    });
    const customerOrderItemSelect = vi.fn(() => ({ eq: customerOrderItemEq }));
    const customerOrderItemUpdate = vi.fn(() => ({ eq: vi.fn() }));
    const paymentEq = vi.fn(() => Promise.resolve({ data: [], error: null }));
    const paymentSelect = vi.fn(() => ({ eq: paymentEq }));
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return { select: customerOrderItemSelect, update: customerOrderItemUpdate };
      }

      if (table === "payment") {
        return { select: paymentSelect };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "update-commission",
      orderItemId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
      payload: {
        agent_commission_amount: 125.25,
        agent_commission_paid: true,
        agent_commission_set_by: adminUserId,
        agent_commission_set_at: "2026-07-11T00:00:00.000Z",
      },
    }, adminUserId)).rejects.toThrow("Record a payment before marking commission as paid.");

    expect(customerOrderItemUpdate).not.toHaveBeenCalled();
  });

  it("blocks marking a commission as paid when recorded payments do not cover the item total", async () => {
    const customerOrderItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        id: "item-2",
        order_id: "order-1",
        final_quantity: 3,
        unit_price: 100,
        agent_commission_paid: false,
      },
      error: null,
    }));
    const customerOrderItemEq = vi.fn((field: string, value: string) => {
      if (field === "id" && value === "item-2") {
        return { maybeSingle: customerOrderItemMaybeSingle };
      }

      if (field === "order_id" && value === "order-1") {
        return Promise.resolve({
          data: [
            { id: "item-1", final_quantity: 2, unit_price: 100, agent_commission_paid: true },
            { id: "item-2", final_quantity: 3, unit_price: 100, agent_commission_paid: false },
          ],
          error: null,
        });
      }

      throw new Error(`Unexpected eq on customer_order_item: ${field}=${value}`);
    });
    const customerOrderItemSelect = vi.fn(() => ({ eq: customerOrderItemEq }));
    const customerOrderItemUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const customerOrderItemUpdate = vi.fn(() => ({ eq: customerOrderItemUpdateEq }));
    const paymentEq = vi.fn(() => Promise.resolve({
      data: [{ amount: 400 }],
      error: null,
    }));
    const paymentSelect = vi.fn(() => ({ eq: paymentEq }));
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return { select: customerOrderItemSelect, update: customerOrderItemUpdate };
      }

      if (table === "payment") {
        return { select: paymentSelect };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "update-commission",
      orderItemId: "item-2",
      payload: {
        agent_commission_amount: 125.25,
        agent_commission_paid: true,
        agent_commission_set_by: adminUserId,
        agent_commission_set_at: "2026-07-11T00:00:00.000Z",
      },
    }, adminUserId)).rejects.toThrow(
      "This commission cannot be marked as paid because recorded payments do not cover the item total.",
    );

    expect(customerOrderItemUpdateEq).not.toHaveBeenCalled();
  });

  it("updates an agent order item commission amount while customer orders are not fully paid", async () => {
    const agentOrderItemId = "45e73d23-f25f-4de7-ae3a-ebcf34e995f1";
    const agentOrderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const agentOrderItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: agentOrderItemId, order_id: agentOrderId },
      error: null,
    }));
    const agentOrderItemSelectEq = vi.fn(() => ({ maybeSingle: agentOrderItemMaybeSingle }));
    const agentOrderItemSelect = vi.fn(() => ({ eq: agentOrderItemSelectEq }));
    const agentOrderItemUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const agentOrderItemUpdate = vi.fn(() => ({ eq: agentOrderItemUpdateEq }));
    const customerOrderIs = vi.fn(() => Promise.resolve({
      data: [
        { id: "customer-order-1", payment_status: "paid" },
        { id: "customer-order-2", payment_status: "partial" },
      ],
      error: null,
    }));
    const customerOrderEq = vi.fn(() => ({ is: customerOrderIs }));
    const customerOrderIn = vi.fn(() => ({ eq: customerOrderEq }));
    const customerOrderSelect = vi.fn(() => ({ in: customerOrderIn }));
    const payload = {
      agent_commission_amount: 95.75,
      agent_commission_updated_by: adminUserId,
      agent_commission_updated_at: "2026-07-14T10:00:00.000Z",
    };
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return {
          select: agentOrderItemSelect,
          update: agentOrderItemUpdate,
        };
      }

      if (table === "order") {
        return { select: customerOrderSelect };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await executeAdminAction({ from } as never, {
      type: "update-agent-order-commission",
      agentOrderItemId,
      payload,
    }, adminUserId);

    expect(agentOrderItemSelect).toHaveBeenCalledWith("id, order_id");
    expect(customerOrderSelect).toHaveBeenCalledWith("id, payment_status");
    expect(customerOrderEq).toHaveBeenCalledWith("parent_order_id", agentOrderId);
    expect(agentOrderItemUpdate).toHaveBeenCalledWith(payload);
    expect(agentOrderItemUpdateEq).toHaveBeenCalledWith("id", agentOrderItemId);
  });

  it("blocks agent order item commission changes after all linked customer orders are paid", async () => {
    const agentOrderItemId = "45e73d23-f25f-4de7-ae3a-ebcf34e995f1";
    const agentOrderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const agentOrderItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: agentOrderItemId, order_id: agentOrderId },
      error: null,
    }));
    const agentOrderItemSelectEq = vi.fn(() => ({ maybeSingle: agentOrderItemMaybeSingle }));
    const agentOrderItemSelect = vi.fn(() => ({ eq: agentOrderItemSelectEq }));
    const agentOrderItemUpdate = vi.fn();
    const customerOrderIs = vi.fn(() => Promise.resolve({
      data: [
        { id: "customer-order-1", payment_status: "paid" },
        { id: "customer-order-2", payment_status: "paid" },
      ],
      error: null,
    }));
    const customerOrderEq = vi.fn(() => ({ is: customerOrderIs }));
    const customerOrderIn = vi.fn(() => ({ eq: customerOrderEq }));
    const customerOrderSelect = vi.fn(() => ({ in: customerOrderIn }));
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return {
          select: agentOrderItemSelect,
          update: agentOrderItemUpdate,
        };
      }

      if (table === "order") {
        return { select: customerOrderSelect };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "update-agent-order-commission",
      agentOrderItemId,
      payload: {
        agent_commission_amount: 95.75,
        agent_commission_updated_by: adminUserId,
        agent_commission_updated_at: "2026-07-14T10:00:00.000Z",
      },
    }, adminUserId)).rejects.toThrow(
      "Agent order commission cannot be edited after all customer orders are fully paid.",
    );

    expect(agentOrderItemUpdate).not.toHaveBeenCalled();
  });

  it("blocks order product additions after a sales invoice exists", async () => {
    const invoiceMaybeSingle = vi.fn(() => Promise.resolve({
      data: { id: "invoice-1" },
      error: null,
    }));
    const invoiceLimit = vi.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
    const invoiceEq = vi.fn(() => ({ limit: invoiceLimit }));
    const invoiceSelect = vi.fn(() => ({ eq: invoiceEq }));
    const itemInsert = vi.fn();
    const from = vi.fn((table: string) => {
      if (table === "invoice") return { select: invoiceSelect };
      if (table === "order_item") return { insert: itemInsert };
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(executeAdminAction({ from } as never, {
      type: "add-order-item",
      orderId: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      payload: {
        order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
        product_id: "4f65578f-3f1f-4216-9fc2-013ef06661d1",
        partial_quantity: 2,
        final_quantity: 2,
        add_details: null,
      },
    }, adminUserId)).rejects.toThrow(
      "Order products cannot be edited after a sales invoice has been created.",
    );

    expect(itemInsert).not.toHaveBeenCalled();
  });

  it("blocks order product quantity reductions below the recorded payment total", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const orderItemId = "45e73d23-f25f-4de7-ae3a-ebcf34e995f1";
    const orderItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: { order_id: orderId },
      error: null,
    }));
    const orderItemEq = vi.fn(() => ({ maybeSingle: orderItemMaybeSingle }));
    const orderItemSelect = vi.fn(() => ({ eq: orderItemEq }));
    const orderItemUpdate = vi.fn();
    const invoiceMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const invoiceLimit = vi.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
    const invoiceEq = vi.fn(() => ({ limit: invoiceLimit }));
    const invoiceSelect = vi.fn(() => ({ eq: invoiceEq }));
    const orderMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        id: orderId,
        agent_id: null,
        parent_order_id: null,
        customer: { promoted_to_agent_id: null },
        payment: [{ amount: 600 }],
        order_item: [
          {
            id: orderItemId,
            final_quantity: 3,
            unit_price: 300,
            agent_commission_amount: 0,
            product: {
              agent_commission_type: "value",
              agent_commission_value: 0,
            },
          },
        ],
      },
      error: null,
    }));
    const orderEq = vi.fn(() => ({ maybeSingle: orderMaybeSingle }));
    const orderSelect = vi.fn(() => ({ eq: orderEq }));
    const adminFrom = vi.fn((table: string) => {
      if (table === "order") return { select: orderSelect };

      throw new Error(`Unexpected admin table ${table}`);
    });
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return { select: orderItemSelect, update: orderItemUpdate };
      }

      if (table === "invoice") return { select: invoiceSelect };

      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    await expect(executeAdminAction({ from } as never, {
      type: "update-order-item-quantity",
      orderItemId,
      payload: {
        partial_quantity: 1.5,
      },
    }, adminUserId)).rejects.toThrow(
      "Order product quantities cannot be reduced below the recorded payment total.",
    );

    expect(orderItemUpdate).not.toHaveBeenCalled();
  });

  it("allows order product quantity increases after a payment record exists", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const orderItemId = "45e73d23-f25f-4de7-ae3a-ebcf34e995f1";
    const orderItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: { order_id: orderId },
      error: null,
    }));
    const orderItemEq = vi.fn(() => ({ maybeSingle: orderItemMaybeSingle }));
    const orderItemSelect = vi.fn(() => ({ eq: orderItemEq }));
    const orderItemUpdateEq = vi.fn(() => Promise.resolve({ error: null }));
    const orderItemUpdate = vi.fn(() => ({ eq: orderItemUpdateEq }));
    const invoiceMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const invoiceLimit = vi.fn(() => ({ maybeSingle: invoiceMaybeSingle }));
    const invoiceEq = vi.fn(() => ({ limit: invoiceLimit }));
    const invoiceSelect = vi.fn(() => ({ eq: invoiceEq }));
    const orderMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        id: orderId,
        agent_id: null,
        parent_order_id: null,
        customer: { promoted_to_agent_id: null },
        payment: [{ amount: 600 }],
        order_item: [
          {
            id: orderItemId,
            final_quantity: 3,
            unit_price: 300,
            agent_commission_amount: 0,
            product: {
              agent_commission_type: "value",
              agent_commission_value: 0,
            },
          },
        ],
      },
      error: null,
    }));
    const orderEq = vi.fn(() => ({ maybeSingle: orderMaybeSingle }));
    const orderSelect = vi.fn(() => ({ eq: orderEq }));
    const adminFrom = vi.fn((table: string) => {
      if (table === "order") return { select: orderSelect };

      throw new Error(`Unexpected admin table ${table}`);
    });
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return { select: orderItemSelect, update: orderItemUpdate };
      }

      if (table === "invoice") return { select: invoiceSelect };

      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    await executeAdminAction({ from } as never, {
      type: "update-order-item-quantity",
      orderItemId,
      payload: {
        partial_quantity: 4,
      },
    }, adminUserId);

    expect(orderItemUpdate).toHaveBeenCalledWith({ partial_quantity: 4 });
    expect(orderItemUpdateEq).toHaveBeenCalledWith("id", orderItemId);
  });

  it("removes order products only after edit checks pass", async () => {
    const orderId = "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb";
    const orderItemMaybeSingle = vi.fn(() => Promise.resolve({
      data: { order_id: orderId },
      error: null,
    }));
    const orderItemsEq = vi.fn((field: string, value: string) => {
      if (field === "id" && value === "45e73d23-f25f-4de7-ae3a-ebcf34e995f1") {
        return { maybeSingle: orderItemMaybeSingle };
      }

      if (field === "order_id" && value === orderId) {
        return Promise.resolve({
          data: [{ id: "item-1" }, { id: "item-2" }],
          error: null,
        });
      }

      throw new Error(`Unexpected eq on customer_order_item: ${field}=${value}`);
    });
    const orderItemsSelect = vi.fn(() => ({ eq: orderItemsEq }));
    const orderItemsDeleteEq = vi.fn(() => Promise.resolve({ error: null }));
    const orderItemsDelete = vi.fn(() => ({ eq: orderItemsDeleteEq }));
    const emptyMaybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const limit = vi.fn(() => ({ maybeSingle: emptyMaybeSingle }));
    const eq = vi.fn(() => ({ limit }));
    const select = vi.fn(() => ({ eq }));
    const orderMaybeSingle = vi.fn(() => Promise.resolve({
      data: {
        id: orderId,
        agent_id: null,
        parent_order_id: null,        customer: { promoted_to_agent_id: null },
        payment: [],
        customer_order_item: [
          {
            id: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
            final_quantity: 1,
            unit_price: 100,
            agent_commission_amount: 0,
            product: {
              agent_commission_type: "value",
              agent_commission_value: 0,
            },
          },
          {
            id: "item-2",
            final_quantity: 1,
            unit_price: 100,
            agent_commission_amount: 0,
            product: {
              agent_commission_type: "value",
              agent_commission_value: 0,
            },
          },
        ],
      },
      error: null,
    }));
    const orderEq = vi.fn(() => ({ maybeSingle: orderMaybeSingle }));
    const orderSelect = vi.fn(() => ({ eq: orderEq }));
    const adminFrom = vi.fn((table: string) => {
      if (table === "order") return { select: orderSelect };

      throw new Error(`Unexpected admin table ${table}`);
    });
    const from = vi.fn((table: string) => {
      if (table === "order_item") {
        return { select: orderItemsSelect, delete: orderItemsDelete };
      }

      if (table === "invoice" || table === "payment") {
        return { select };
      }

      throw new Error(`Unexpected table ${table}`);
    });
    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    await executeAdminAction({ from } as never, {
      type: "remove-order-item",
      orderItemId: "45e73d23-f25f-4de7-ae3a-ebcf34e995f1",
    }, adminUserId);

    expect(orderItemsDeleteEq).toHaveBeenCalledWith("id", "45e73d23-f25f-4de7-ae3a-ebcf34e995f1");
  });

  it("deletes a hero carousel slide from persisted section content", async () => {
    const sectionId = "45e73d23-f25f-4de7-ae3a-ebcf34e995f1";
    const pageId = "9db3dfbf-4271-456f-a7dd-6897ad099515";
    const existingSlides = [
      { src: "/images/hero_carousel_1.jpg", alt: "Slide 1" },
      { src: "/images/hero_carousel_2.jpg", alt: "Slide 2" },
      { src: "/images/hero_carousel_3.jpg", alt: "Slide 3" },
    ];
    const existingContent = {
      heading: "FROM FARM TO TABLE",
      slides: existingSlides,
    };
    const pageSectionUpdateEq = vi.fn(async () => ({ error: null }));
    const pageSectionUpdate = vi.fn(() => ({ eq: pageSectionUpdateEq }));
    const pageSectionMaybeSingle = vi.fn(async () => ({
      data: { content: existingContent },
      error: null,
    }));
    const pageSectionSelectEq = vi.fn(() => ({ maybeSingle: pageSectionMaybeSingle }));
    const pageSectionSelect = vi.fn(() => ({ eq: pageSectionSelectEq }));
    const adminFrom = vi.fn((table: string) => {
      if (table === "page_section") {
        return {
          select: pageSectionSelect,
          update: pageSectionUpdate,
        };
      }

      throw new Error(`Unexpected admin table ${table}`);
    });

    mocks.createSupabaseAdminClient.mockReturnValue({ from: adminFrom });

    const result = await executeAdminAction({ from: vi.fn() } as never, {
      type: "save-page-section",
      sectionId,
      imageFile: null,
      slideIndex: 1,
      categoryIndex: null,
      slideAction: "delete",
      slideSrc: "/images/hero_carousel_2.jpg",
      slideImageFiles: [],
      slideNewImageIndexes: [],
      payload: {
        page_id: pageId,
        type: "hero",
        sort_order: 0,
        content: {
          heading: "FROM FARM TO TABLE",
          slides: [existingSlides[0], existingSlides[2]],
        },
        status: "published",
        updated_at: "2026-07-26T11:00:00.000Z",
      },
    });

    expect(result).toEqual({
      sectionContent: {
        heading: "FROM FARM TO TABLE",
        slides: [existingSlides[0], existingSlides[2]],
      },
    });
    expect(pageSectionUpdate).toHaveBeenCalledWith({
      page_id: pageId,
      type: "hero",
      sort_order: 0,
      content: {
        heading: "FROM FARM TO TABLE",
        slides: [existingSlides[0], existingSlides[2]],
      },
      status: "published",
      updated_at: "2026-07-26T11:00:00.000Z",
    });
    expect(pageSectionUpdateEq).toHaveBeenCalledWith("id", sectionId);
  });
});

describe("getAllowedNextOrderStatuses", () => {
  it("allows pending orders to move into processing or closed", () => {
    expect(getAllowedNextOrderStatuses("pending")).toEqual([
      "processing",
      "closed",
    ]);
  });

  it("allows closed unpaid orders to reopen into processing", () => {
    expect(getAllowedNextOrderStatuses("closed", "unpaid")).toEqual([
      "processing",
    ]);
    expect(getAllowedNextOrderStatuses("closed", "partial")).toEqual([
      "processing",
    ]);
    expect(getAllowedNextOrderStatuses("closed", "refunded")).toEqual([
      "processing",
    ]);
  });

  it("prevents paid closed orders from reopening", () => {
    expect(getAllowedNextOrderStatuses("closed", "paid")).toEqual([]);
  });
});

describe("formatAdminActionFeedback", () => {
  it("returns transient feedback with a clean reload URL", () => {
    const url = new URL(
      "https://jehmarp.example/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb?status=Order%20marked%20as%20read.&page=2#error-anchor",
    );

    expect(formatAdminActionFeedback(url)).toEqual({
      status: "Order marked as read.",
      error: undefined,
      registrationLink: undefined,
      registrationLinkExpiresAt: undefined,
      registrationLinkDuration: undefined,
      cleanPath: "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb?page=2#error-anchor",
    });
  });

  it("returns registration link feedback with a clean reload URL", () => {
    const url = new URL(
      "https://jehmarp.example/admin/customers?status=Registration%20link%20created.&registrationLink=https%3A%2F%2Fjehmarp.example%2Fcustomer-registration%2Fabc123&registrationLinkExpiresAt=2026-09-07T10%3A00%3A00.000Z&registrationLinkDuration=1h",
    );

    expect(formatAdminActionFeedback(url)).toEqual({
      status: "Registration link created.",
      error: undefined,
      registrationLink: "https://jehmarp.example/customer-registration/abc123",
      registrationLinkExpiresAt: "2026-09-07T10:00:00.000Z",
      registrationLinkDuration: "1h",
      cleanPath: "/admin/customers",
    });
  });

  it("does not provide a clean URL when no feedback is present", () => {
    const url = new URL("https://jehmarp.example/admin/orders?page=2");

    expect(formatAdminActionFeedback(url)).toEqual({
      status: undefined,
      error: undefined,
      registrationLink: undefined,
      registrationLinkExpiresAt: undefined,
      registrationLinkDuration: undefined,
      cleanPath: undefined,
    });
  });
});
