import { beforeEach, describe, expect, it, vi } from "vitest";

const createSupabaseAdminClient = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient,
}));

type MockResponse = {
  data: unknown[];
  error: null;
  count?: number | null;
};

const emptyResponse: MockResponse = {
  data: [],
  error: null,
};

function createQueryBuilder(response: MockResponse = emptyResponse) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    not: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    or: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve({
      data: response.data[0] ?? null,
      error: response.error,
    })),
    order: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(response)),
    range: vi.fn(() => Promise.resolve(response)),
    then: (resolve: (value: MockResponse) => unknown) => resolve(response),
  };

  return builder;
}

function createMockOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    parent_order_id: null,
    customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
    agent_id: null,
    source: "guest_shop",
    order_status: "pending",
    payment_status: "partial",
    approved_at: null,
    created_at: "2026-07-03T00:00:00.000Z",
    updated_at: "2026-07-03T00:00:00.000Z",
    customer: {
      id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      first_name: "Maria",
      last_name: "Cruz",
      phone_number: "09170000000",
      email: "maria@example.test",
      address: "Quezon City",
      is_reseller: false,
    },
    agent: null,
    customer_order_item: [
      {
        id: "a10bb955-d8b1-4a26-a6e2-928fd33949e1",
        product_id: "p10bb955-d8b1-4a26-a6e2-928fd33949e1",
        partial_quantity: 2,
        final_quantity: 3,
        unit_price: 600,
        price_type: "retail",
        add_details: null,
        agent_commission_amount: 0,
        agent_commission_paid: false,
        product: null,
      },
    ],
    payment: [],
    invoice: [],
    customer_order_status_history: [],
    ...overrides,
  };
}

describe("loadAdminDashboardData", () => {
  beforeEach(() => {
    vi.resetModules();
    createSupabaseAdminClient.mockReset();
  });

  it("uses the server-only admin client so protected admin columns can be read without broadening public grants", async () => {
    const from = vi.fn(() => createQueryBuilder());
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminDashboardData } = await import("./data");

    const result = await loadAdminDashboardData();

    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("product");
    expect(result.products).toEqual([]);
  });

  it("applies admin product filters to the database query", async () => {
    const productBuilder = createQueryBuilder();
    const from = vi.fn((table: string) => (
      table === "product" ? productBuilder : createQueryBuilder()
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminDashboardData } = await import("./data");

    await loadAdminDashboardData({
      productFilters: {
        search: "belly",
        category: "pork",
        stockStatus: "limited",
      },
    });

    expect(productBuilder.or).toHaveBeenCalledWith("name.ilike.%belly%,description.ilike.%belly%");
    expect(productBuilder.eq).toHaveBeenCalledWith("category", "pork");
    expect(productBuilder.eq).toHaveBeenCalledWith("stock_status", "limited");
  });

  it("loads product management data without loading the rest of the dashboard", async () => {
    const productBuilder = createQueryBuilder({ data: [], error: null, count: 37 });
    const from = vi.fn(() => productBuilder);
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminProductManagementData } = await import("./data");

    const result = await loadAdminProductManagementData({
      search: "belly",
    });

    expect(createSupabaseAdminClient).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenNthCalledWith(1, "product");
    expect(productBuilder.or).toHaveBeenCalledWith("name.ilike.%belly%,description.ilike.%belly%");
    expect(productBuilder.select).toHaveBeenCalledWith(expect.any(String), { count: "exact" });
    expect(productBuilder.order).toHaveBeenNthCalledWith(1, "is_active", { ascending: false });
    expect(productBuilder.order).toHaveBeenNthCalledWith(2, "name", { ascending: true });
    expect(productBuilder.range).toHaveBeenCalledWith(0, 9);
    expect(result).toEqual({
      products: [],
      pagination: {
        page: 1,
        pageSize: 10,
        totalRows: 37,
        totalPages: 4,
        fromRow: 1,
        toRow: 10,
      },
    });
  });

  it("sorts the product page in the database by the requested column", async () => {
    const productBuilder = createQueryBuilder({ data: [], error: null, count: 0 });
    const from = vi.fn(() => productBuilder);
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminProductManagementData } = await import("./data");

    await loadAdminProductManagementData({
      sort: "default_price",
      direction: "asc",
    });

    expect(productBuilder.order).toHaveBeenNthCalledWith(1, "default_price", { ascending: true });
    expect(productBuilder.order).toHaveBeenNthCalledWith(2, "id", { ascending: true });
  });

  it("marks products that are already on an order", async () => {
    const productId = "4f65578f-3f1f-4216-9fc2-013ef06661d1";
    const productBuilder = createQueryBuilder({
      data: [{ id: productId, name: "Pork Belly" }],
      error: null,
      count: 1,
    });
    const orderItemBuilder = createQueryBuilder({
      data: [{ product_id: productId }],
      error: null,
    });
    const from = vi.fn((table: string) => (
      table === "order_item" ? orderItemBuilder : productBuilder
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminProductManagementData } = await import("./data");

    const result = await loadAdminProductManagementData();

    expect(from).toHaveBeenCalledWith("order_item");
    expect(orderItemBuilder.in).toHaveBeenCalledWith("product_id", [productId]);
    expect(result.products).toEqual([
      {
        id: productId,
        name: "Pork Belly",
        referencedByOrder: true,
      },
    ]);
  });

  it("applies direct admin order filters to the database query", async () => {
    const orderBuilder = createQueryBuilder();
    const from = vi.fn((table: string) => (
      table === "order" ? orderBuilder : createQueryBuilder()
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminDashboardData } = await import("./data");

    await loadAdminDashboardData({
      orderFilters: {
        source: "guest_shop",
        orderStatus: "pending",
        paymentStatus: "partial",
      },
    });

    expect(orderBuilder.eq).toHaveBeenCalledWith("source", "guest_shop");
    expect(orderBuilder.eq).toHaveBeenCalledWith("order_status", "pending");
    expect(orderBuilder.eq).toHaveBeenCalledWith("payment_status", "partial");
    expect(orderBuilder.is).toHaveBeenCalledWith("converted_at", null);
  });

  it("loads admin order management rows through the paginated order RPC", async () => {
    const orderRow = {
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      row_type: "customer",
      created_at: "2026-07-03T00:00:00.000Z",
      status: "pending",
      customer_label: "Maria Cruz",
      source_label: "Shop",
      payment_status: "partial",
      total_amount: "1200.00",
      commission_total: "60.00",
      paid_total: "300.00",
      remaining_receivable: "840.00",
      href: "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      linked_customer_count: null,
      pending_customer_order_count: null,
    };
    const orderBuilder = createQueryBuilder();
    const from = vi.fn((table: string) => (
      table === "order" ? orderBuilder : createQueryBuilder()
    ));
    const rpc = vi.fn(() => Promise.resolve({
      data: [{ records: [orderRow], total_rows: "1" }],
      error: null,
    }));
    createSupabaseAdminClient.mockReturnValue({ from, rpc });
    const { loadAdminOrderManagementData } = await import("./data");

    const result = await loadAdminOrderManagementData({
      search: "maria",
      source: "guest_shop",
      orderStatus: "pending",
      paymentStatus: "partial",
    });

    expect(rpc).toHaveBeenCalledWith("list_admin_order_rows", {
      search_query: "maria",
      source_filter: "guest_shop",
      order_status_filter: "pending",
      payment_status_filter: "partial",
      page_number: 1,
      page_size: 10,
      sort_column: null,
      sort_direction: null,
    });
    expect(result.orderRows).toEqual([{
      ...orderRow,
      release_date: null,
      total_amount: 1140,
      commission_total: 60,
      paid_total: 300,
      remaining_receivable: 840,
      pending_customer_order_count: null,
    }]);
    expect(result.pagination.totalRows).toBe(1);

    await loadAdminOrderManagementData({
      sort: "order_total",
      direction: "asc",
    });

    expect(rpc).toHaveBeenLastCalledWith("list_admin_order_rows", {
      search_query: null,
      source_filter: null,
      order_status_filter: null,
      payment_status_filter: null,
      page_number: 1,
      page_size: 10,
      sort_column: "order_total",
      sort_direction: "asc",
    });
  });

  it("loads admin sales rows through the paginated sales RPC", async () => {
    const salesRow = {
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      created_at: "2026-07-03T00:00:00.000Z",
      sale_date: "2026-07-06",
      release_date: "2026-07-05",
      customer_label: "Maria Cruz",
      source_label: "Shop",
      order_status: "closed",
      payment_status: "paid",
      invoice_number: "INV-00000042",
      order_total: "1200.00",
      net_total: "1080.00",
      paid_total: "1080.00",
      balance: "0.00",
      payment_count: 1,
      href: "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    };
    const rpc = vi.fn(() => Promise.resolve({
      data: [{ records: [salesRow], total_rows: "1" }],
      error: null,
    }));
    createSupabaseAdminClient.mockReturnValue({ rpc });
    const { loadAdminSalesManagementData } = await import("./data");

    const result = await loadAdminSalesManagementData({
      search: "maria",
      source: "guest_shop",
      orderStatus: "closed",
      paymentStatus: "paid",
    });

    expect(rpc).toHaveBeenCalledWith("list_admin_sales_rows", {
      search_query: "maria",
      source_filter: "guest_shop",
      order_status_filter: "closed",
      payment_status_filter: "paid",
      page_number: 1,
      page_size: 10,
      sort_column: null,
      sort_direction: null,
    });
    expect(result.salesRows).toEqual([{
      ...salesRow,
      order_total: 1200,
      net_total: 1080,
      paid_total: 1080,
      balance: 0,
      payment_count: 1,
    }]);
    expect(result.pagination.totalRows).toBe(1);

    await loadAdminSalesManagementData({
      sort: "net_total",
      direction: "asc",
    });

    expect(rpc).toHaveBeenLastCalledWith("list_admin_sales_rows", {
      search_query: null,
      source_filter: null,
      order_status_filter: null,
      payment_status_filter: null,
      page_number: 1,
      page_size: 10,
      sort_column: "net_total",
      sort_direction: "asc",
    });
  });

  it("does not replace a missing admin sales date with the order date", async () => {
    const salesRow = {
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      created_at: "2026-07-03T00:00:00.000Z",
      sale_date: null,
      release_date: null,
      customer_label: "Maria Cruz",
      source_label: "Shop",
      order_status: "closed",
      payment_status: "paid",
      invoice_number: "INV-00000042",
      order_total: "1200.00",
      net_total: "1080.00",
      paid_total: "1080.00",
      balance: "0.00",
      payment_count: 1,
      href: "/admin/orders/customer/49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
    };
    const rpc = vi.fn(() => Promise.resolve({
      data: [{ records: [salesRow], total_rows: "1" }],
      error: null,
    }));
    createSupabaseAdminClient.mockReturnValue({ rpc });
    const { loadAdminSalesManagementData } = await import("./data");

    const result = await loadAdminSalesManagementData();

    expect(result.salesRows[0]?.sale_date).toBeNull();
  });

  it("loads admin invoice rows through the paginated invoice RPC", async () => {
    const invoiceRow = {
      order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      invoice_id: "7c66f907-8324-473c-b0b5-d017a4728121",
      invoice_number: "INV-00000042",
      customer_label: "Maria Cruz",
      invoice_created_at: "2026-07-03T00:00:00.000Z",
      invoice_total: "1200.00",
      paid_total: "400.00",
      balance: "800.00",
      payment_status: "partial",
    };
    const rpc = vi.fn(() => Promise.resolve({
      data: [{ records: [invoiceRow], total_rows: 1 }],
      error: null,
    }));
    createSupabaseAdminClient.mockReturnValue({ rpc });
    const { loadAdminInvoiceManagementData } = await import("./data");

    const result = await loadAdminInvoiceManagementData({
      search: "inv-00000042 maria",
      balanceStatus: "partial",
    });

    expect(rpc).toHaveBeenCalledWith("list_admin_invoice_rows", {
      search_query: "inv-00000042 maria",
      balance_status_filter: "partial",
      page_number: 1,
      page_size: 10,
      sort_column: null,
      sort_direction: null,
    });
    expect(result.invoiceRows).toEqual([{
      ...invoiceRow,
      invoice_total: 1200,
      paid_total: 400,
      balance: 800,
    }]);
    expect(result.pagination.totalRows).toBe(1);

    await loadAdminInvoiceManagementData({
      sort: "balance",
      direction: "desc",
    });

    expect(rpc).toHaveBeenLastCalledWith("list_admin_invoice_rows", {
      search_query: null,
      balance_status_filter: null,
      page_number: 1,
      page_size: 10,
      sort_column: "balance",
      sort_direction: "desc",
    });
  });

  it("loads admin customer rows through the paginated customer RPC", async () => {
    const customerRow = {
      id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      tracking_number: "JHM-ABCD2345",
      first_name: "Maria",
      last_name: "Cruz",
      phone_number: "09170000000",
      email: "maria@example.test",
      address: "Quezon City",
      assigned_agent_id: "agent-1",
      assigned_agent_name: "Carlos Dela Cruz",
      is_reseller: true,
      credit_limit: 1500,
      credit_limit_exceeded: true,
      outstanding_credit_balance: 1800,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
    };
    const rpc = vi.fn(() => Promise.resolve({
      data: [{ records: [customerRow], total_rows: 1 }],
      error: null,
    }));
    const from = vi.fn(() => createQueryBuilder());
    createSupabaseAdminClient.mockReturnValue({ rpc, from });
    const { loadAdminCustomerManagementData } = await import("./data");

    const result = await loadAdminCustomerManagementData({
      search: "maria carlos 0917",
      customerType: "reseller",
    });

    expect(rpc).toHaveBeenCalledWith("list_admin_customer_rows", {
      search_query: "maria carlos 0917",
      customer_type_filter: "reseller",
      page_number: 1,
      page_size: 10,
      sort_column: null,
      sort_direction: null,
    });
    expect(from).toHaveBeenCalledWith("agent");
    expect(result.customers).toEqual([customerRow]);
    expect(result.agents).toEqual([]);
    expect(result.defaultCustomerCreditLimit).toBe(1000);
    expect(result.pagination.totalRows).toBe(1);

    await loadAdminCustomerManagementData({
      sort: "customer_name",
      direction: "asc",
    });

    expect(rpc).toHaveBeenLastCalledWith("list_admin_customer_rows", {
      search_query: null,
      customer_type_filter: null,
      page_number: 1,
      page_size: 10,
      sort_column: "customer_name",
      sort_direction: "asc",
    });
  });

  it("filters promoted customers out of direct admin customer loads", async () => {
    const customerBuilder = createQueryBuilder();
    const from = vi.fn((table: string) => (
      table === "customer" ? customerBuilder : createQueryBuilder()
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminDashboardData } = await import("./data");

    await loadAdminDashboardData();

    expect(customerBuilder.is).toHaveBeenCalledWith("promoted_to_agent_id", null);
  });

  it("loads admin agent rows through the paginated agent RPC", async () => {
    const agentRow = {
      id: "agent-1",
      user_id: "user-1",
      employee_id: "EMP-001",
      first_name: "Carlos",
      last_name: "Dela Cruz",
      display_name: "Carlos Dela Cruz",
      status: "active",
      email: "carlos@example.test",
      contact: "09170000000",
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
    };
    const rpc = vi.fn(() => Promise.resolve({
      data: [{ records: [agentRow], total_rows: 1 }],
      error: null,
    }));
    createSupabaseAdminClient.mockReturnValue({ rpc });
    const { loadAdminAgentManagementData } = await import("./data");

    const result = await loadAdminAgentManagementData({
      search: "carlos",
      status: "active",
    });

    expect(rpc).toHaveBeenCalledWith("list_admin_agent_rows", {
      search_query: "carlos",
      status_filter: "active",
      page_number: 1,
      page_size: 10,
      sort_column: null,
      sort_direction: null,
    });
    expect(result.agents.map((agent) => agent.id)).toEqual(["agent-1"]);
    expect(result.pagination.totalRows).toBe(1);

    await loadAdminAgentManagementData({
      sort: "display_name",
      direction: "asc",
    });

    expect(rpc).toHaveBeenLastCalledWith("list_admin_agent_rows", {
      search_query: null,
      status_filter: null,
      page_number: 1,
      page_size: 10,
      sort_column: "display_name",
      sort_direction: "asc",
    });
  });

  it("separates assigned-customer balance from an agent's own customer balance on agent details", async () => {
    const agentCustomerId = "customer-agent";
    const assignedCustomerId = "customer-assigned";
    const agentRow = {
      id: "agent-1",
      user_id: "user-1",
      customer_id: agentCustomerId,
      employee_id: "EMP-001",
      status: "active",
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      profile: {
        first_name: "Carlos",
        last_name: "Dela Cruz",
        display_name: "Carlos Dela Cruz",
        email: "carlos@example.test",
        phone_number: "09170000000",
        address: null,
      },
    };
    const assignedCustomerRow = {
      id: assignedCustomerId,
      tracking_number: "JHM-ASSIGNED1",
      assigned_agent_id: "agent-1",
      is_reseller: false,
      credit_limit: 1000,
      credit_limit_exceeded: false,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      profile: {
        first_name: "Maria",
        last_name: "Cruz",
        display_name: "Maria Cruz",
        email: "maria@example.test",
        phone_number: "09171111111",
        address: "Quezon City",
      },
    };
    const agentCustomerRow = {
      ...assignedCustomerRow,
      id: agentCustomerId,
      profile: {
        first_name: "Carlos",
        last_name: "Dela Cruz",
        display_name: "Carlos Dela Cruz",
        email: "carlos@example.test",
        phone_number: "09170000000",
        address: "Agent personal order",
      },
    };
    const assignedOrder = createMockOrder({
      id: "order-assigned-1",
      customer_id: assignedCustomerId,
      customer: null,
      customer_order_item: [{ final_quantity: 5, unit_price: 100 }],
      payment: [{ amount: 100 }],
    });
    const agentOwnOrder = createMockOrder({
      id: "order-agent-own-1",
      customer_id: agentCustomerId,
      customer: null,
      customer_order_item: [{ final_quantity: 3, unit_price: 100 }],
      payment: [{ amount: 50 }],
    });
    const createOrderQueryMock = () => {
      let lastCustomerIds: string[] = [];
      const orderChain = {
        select: vi.fn(function select() { return orderChain; }),
        in: vi.fn((field: string, values: string[]) => {
          if (field === "customer_id") {
            lastCustomerIds = values;
          }
          return orderChain;
        }),
        eq: vi.fn((field: string, value: unknown) => {
          if (field === "order_kind" && value === "distribution") {
            return {
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            };
          }
          return orderChain;
        }),
        is: vi.fn(() => orderChain),
        order: vi.fn(() => ({
          then: (resolve: (value: MockResponse) => unknown) => {
            const data = lastCustomerIds.includes(assignedCustomerId)
              ? [assignedOrder]
              : lastCustomerIds.includes(agentCustomerId)
                ? [agentOwnOrder]
                : [];
            return resolve({ data, error: null });
          },
        })),
      };
      return orderChain;
    };
    const agentBuilder = createQueryBuilder({ data: [agentRow], error: null });
    const customerBuilder = createQueryBuilder({
      data: [assignedCustomerRow, agentCustomerRow],
      error: null,
    });
    const from = vi.fn((table: string) => {
      if (table === "agent") return agentBuilder;
      if (table === "customer") return customerBuilder;
      if (table === "order") return createOrderQueryMock();
      return createQueryBuilder();
    });
    const listUsers = vi.fn(() => Promise.resolve({
      data: {
        users: [
          {
            id: "user-1",
            email: "carlos@example.test",
          },
        ],
      },
      error: null,
    }));
    createSupabaseAdminClient.mockReturnValue({
      from,
      auth: {
        admin: {
          listUsers,
        },
      },
    });
    const { loadAdminAgentDetailsData } = await import("./data");

    const result = await loadAdminAgentDetailsData("agent-1");

    expect(result?.assignedCustomers.map((customer) => customer.id)).toEqual([assignedCustomerId]);
    expect(result?.customerOrders.map((order) => order.id).sort()).toEqual([
      agentOwnOrder.id,
      assignedOrder.id,
    ].sort());
    expect(result?.remainingBalance).toBe(400);
    expect(result?.agentRemainingBalance).toBe(250);
    expect(result?.previousCustomerOrders).toEqual([]);
    expect(result?.agentRemittanceRecords).toEqual([]);
  });

  it("loads remittance records directly for an agent", async () => {
    const agentId = "agent-1";
    const agentRow = {
      id: agentId,
      user_id: "user-1",
      customer_id: null,
      employee_id: "EMP-001",
      status: "active",
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      profile: {
        first_name: "Carlos",
        last_name: "Dela Cruz",
        display_name: "Carlos Dela Cruz",
        email: "carlos@example.test",
        phone_number: "09170000000",
        address: null,
      },
    };
    const remittanceRow = {
      id: "remit-1",
      order_id: "order-1",
      agent_id: agentId,
      amount: 500,
      payment_method: "Cash",
      payment_terms: "Cash on Delivery (COD)",
      payment_date: "2026-07-04T00:00:00.000Z",
      reference_number: null,
      notes: null,
      status: "confirmed",
      confirmed_at: "2026-07-04T08:00:00.000Z",
      created_at: "2026-07-04T08:00:00.000Z",
      updated_at: "2026-07-04T08:00:00.000Z",
      order: {
        id: "order-1",
        sale_date: "2026-07-01",
        created_at: "2026-07-01T00:00:00.000Z",
      },
    };
    const agentBuilder = createQueryBuilder({ data: [agentRow], error: null });
    const customerBuilder = createQueryBuilder({ data: [], error: null });
    const remittanceBuilder = createQueryBuilder({ data: [remittanceRow], error: null });
    const from = vi.fn((table: string) => {
      if (table === "agent") return agentBuilder;
      if (table === "customer") return customerBuilder;
      if (table === "agent_received_payment") return remittanceBuilder;
      if (table === "order") return createQueryBuilder();
      return createQueryBuilder();
    });
    createSupabaseAdminClient.mockReturnValue({
      from,
      auth: {
        admin: {
          listUsers: vi.fn(() => Promise.resolve({ data: { users: [] }, error: null })),
        },
      },
    });
    const { loadAdminAgentDetailsData } = await import("./data");

    const result = await loadAdminAgentDetailsData(agentId);

    expect(result?.agentRemittanceRecords).toHaveLength(1);
    expect(result?.agentRemittanceRecords[0]?.payment.id).toBe("remit-1");
    expect(result?.agentRemittanceRecords[0]?.payment.amount).toBe(500);
    expect(result?.agentRemittanceRecords[0]?.order.id).toBe("order-1");
  });

  it("includes a promoted agent's pre-promotion customer orders in agent details customerOrders", async () => {
    const promotedCustomerId = "customer-promoted";
    const agentRow = {
      id: "agent-promoted",
      user_id: "user-promoted",
      customer_id: promotedCustomerId,
      promoted_from_customer_id: promotedCustomerId,
      promoted_from_customer_at: "2026-07-03T00:00:00.000Z",
      employee_id: "EMP-002",
      status: "active",
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      profile: {
        first_name: "Ana",
        last_name: "Reyes",
        display_name: "Ana Reyes",
        email: "ana@example.test",
        phone_number: "09172222222",
        address: null,
      },
    };
    const promotedOrder = createMockOrder({
      id: "order-promoted-1",
      customer_id: promotedCustomerId,
      customer: null,
      customer_order_item: [{ final_quantity: 2, unit_price: 100 }],
      payment: [],
    });
    const convertedOrder = createMockOrder({
      id: "order-promoted-converted",
      customer_id: promotedCustomerId,
      customer: null,
      converted_at: "2026-07-04T00:00:00.000Z",
      parent_order_id: "distribution-1",
      customer_order_item: [{ final_quantity: 1, unit_price: 100 }],
      payment: [],
    });
    const createOrderQueryMock = () => {
      let lastCustomerIds: string[] = [];
      let excludeConvertedOrders = false;
      const orderChain = {
        select: vi.fn(function select() { return orderChain; }),
        in: vi.fn((field: string, values: string[]) => {
          if (field === "customer_id") {
            lastCustomerIds = values;
          }
          return orderChain;
        }),
        eq: vi.fn((field: string, value: unknown) => {
          if (field === "order_kind" && value === "distribution") {
            return {
              eq: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            };
          }
          return orderChain;
        }),
        is: vi.fn((field: string) => {
          if (field === "converted_at") {
            excludeConvertedOrders = true;
          }
          return orderChain;
        }),
        order: vi.fn(() => ({
          then: (resolve: (value: MockResponse) => unknown) => {
            if (!lastCustomerIds.includes(promotedCustomerId)) {
              return resolve({ data: [], error: null });
            }

            const data = excludeConvertedOrders
              ? [promotedOrder]
              : [convertedOrder, promotedOrder];
            excludeConvertedOrders = false;
            return resolve({ data, error: null });
          },
        })),
      };
      return orderChain;
    };
    const agentBuilder = createQueryBuilder({ data: [agentRow], error: null });
    const customerBuilder = createQueryBuilder({ data: [], error: null });
    const from = vi.fn((table: string) => {
      if (table === "agent") return agentBuilder;
      if (table === "customer") return customerBuilder;
      if (table === "order") return createOrderQueryMock();
      return createQueryBuilder();
    });
    createSupabaseAdminClient.mockReturnValue({
      from,
      auth: {
        admin: {
          listUsers: vi.fn(() => Promise.resolve({ data: { users: [] }, error: null })),
        },
      },
    });
    const { loadAdminAgentDetailsData } = await import("./data");

    const result = await loadAdminAgentDetailsData("agent-promoted");

    expect(result?.customerOrders.map((order) => order.id)).toEqual([promotedOrder.id]);
    expect(result?.previousCustomerOrders.map((order) => order.id).sort()).toEqual([
      convertedOrder.id,
      promotedOrder.id,
    ].sort());
  });

  it("loads all orders for a single customer on customer details", async () => {
    const customerId = "customer-1";
    const customerRow = {
      id: customerId,
      tracking_number: "JHM-CUST1",
      assigned_agent_id: null,
      is_reseller: false,
      credit_limit: 1000,
      credit_limit_exceeded: false,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      profile: {
        first_name: "Maria",
        last_name: "Cruz",
        display_name: "Maria Cruz",
        email: "maria@example.test",
        phone_number: "09171111111",
        address: "Quezon City",
      },
    };
    const customerOrder = createMockOrder({
      id: "order-1",
      customer_id: customerId,
      customer: null,
    });
    const customerBuilder = createQueryBuilder({ data: [customerRow], error: null });
    const orderBuilder = createQueryBuilder({ data: [customerOrder], error: null });
    const from = vi.fn((table: string) => {
      if (table === "customer") return customerBuilder;
      if (table === "order") return orderBuilder;
      return createQueryBuilder();
    });
    createSupabaseAdminClient.mockReturnValue({
      from,
      auth: {
        admin: {
          listUsers: vi.fn(() => Promise.resolve({ data: { users: [] }, error: null })),
        },
      },
    });
    const { loadAdminCustomerDetailsData } = await import("./data");

    const result = await loadAdminCustomerDetailsData(customerId);

    expect(result?.customer.id).toBe(customerId);
    expect(result?.customerOrders.map((order) => order.id)).toEqual(["order-1"]);
    expect(orderBuilder.in).toHaveBeenCalledWith("customer_id", [customerId]);
  });

  it("loads converted source order metadata with an admin agent order", async () => {
    const agentOrder = {
      id: "agent-order-1",
      agent_id: "agent-1",
      order_status: "pending_customers",
      notes: null,
      submitted_by: null,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      agent: null,
      agent_order_item: [],
      customer_order: [],
    };
    const sourceOrder = createMockOrder({
      id: "source-order-1",
      parent_order_id: "agent-order-1",
      converted_at: "2026-07-01T00:00:00.000Z",
      customer: null,
    });
    const agentOrderBuilder = createQueryBuilder({ data: [agentOrder], error: null });
    const sourceOrderBuilder = createQueryBuilder({ data: [sourceOrder], error: null });
    let orderCall = 0;
    const from = vi.fn((table: string) => {
      if (table === "order") {
        orderCall += 1;
        return orderCall === 1 ? agentOrderBuilder : sourceOrderBuilder;
      }
      return createQueryBuilder();
    });
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminAgentOrder } = await import("./data");

    const result = await loadAdminAgentOrder("agent-order-1");

    expect(sourceOrderBuilder.eq).toHaveBeenCalledWith("parent_order_id", "agent-order-1");
    expect(result?.converted_source_order?.id).toBe("source-order-1");
  });

  it("applies reseller application filters and pagination to the database query", async () => {
    const resellerBuilder = createQueryBuilder({
      data: [
        {
          id: "application-1",
          name: "Maria Cruz",
          email: "maria@example.test",
          contact_number: "09170000000",
          planned_transaction_type: "Retail",
          expected_quantity_per_week: "50kg",
          message: "Interested",
          application_status: "submitted",
          email_delivery_status: "pending",
          price_list_sent_at: null,
          email_error: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
      count: 1,
    });
    const from = vi.fn((table: string) => (
      table === "reseller_application" ? resellerBuilder : createQueryBuilder()
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminResellerApplicationManagementData } = await import("./data");

    const result = await loadAdminResellerApplicationManagementData({
      search: "maria 0917",
      status: "submitted",
    });

    expect(resellerBuilder.or).toHaveBeenCalledWith(
      "name.ilike.%maria 0917%,email.ilike.%maria 0917%,contact_number.ilike.%maria 0917%",
    );
    expect(resellerBuilder.eq).toHaveBeenCalledWith("application_status", "submitted");
    expect(resellerBuilder.range).toHaveBeenCalledWith(0, 9);
    expect(resellerBuilder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result.resellerApplications.map((application) => application.id)).toEqual(["application-1"]);
    expect(result.pagination?.totalRows).toBe(1);

    await loadAdminResellerApplicationManagementData({
      sort: "name",
      direction: "asc",
    });

    expect(resellerBuilder.order).toHaveBeenCalledWith("name", { ascending: true });
    expect(resellerBuilder.order).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("applies inquiry filters and pagination to the database query", async () => {
    const inquiryBuilder = createQueryBuilder({
      data: [
        {
          id: "inquiry-1",
          name: "Maria Cruz",
          email: "maria@example.test",
          phone_number: "09170000000",
          message: "Need pricing",
          inquiry_status: "reviewing",
          internal_notes: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
      count: 1,
    });
    const from = vi.fn((table: string) => (
      table === "contact_inquiry" ? inquiryBuilder : createQueryBuilder()
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminInquiryManagementData } = await import("./data");

    const result = await loadAdminInquiryManagementData({
      search: "maria 0917",
      status: "reviewing",
    });

    expect(inquiryBuilder.or).toHaveBeenCalledWith(
      "name.ilike.%maria 0917%,email.ilike.%maria 0917%,phone_number.ilike.%maria 0917%",
    );
    expect(inquiryBuilder.eq).toHaveBeenCalledWith("inquiry_status", "reviewing");
    expect(inquiryBuilder.range).toHaveBeenCalledWith(0, 9);
    expect(inquiryBuilder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result.contactInquiries.map((inquiry) => inquiry.id)).toEqual(["inquiry-1"]);
    expect(result.pagination?.totalRows).toBe(1);

    await loadAdminInquiryManagementData({
      sort: "name",
      direction: "desc",
    });

    expect(inquiryBuilder.order).toHaveBeenCalledWith("name", { ascending: false });
    expect(inquiryBuilder.order).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("normalizes nullable order child relations to empty arrays", async () => {
    const order = {
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      agent_id: null,
      source: "admin_manual",
      order_status: "processing",
      payment_status: "unpaid",
      approved_at: null,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      customer: null,
      agent: null,
      customer_order_item: null,
      payment: null,
      invoice: null,
      customer_order_status_history: null,
    };
    const from = vi.fn((table: string) => createQueryBuilder(
      table === "order"
        ? {
            data: [order],
            error: null,
          }
        : emptyResponse,
    ));
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminDashboardData } = await import("./data");

    const result = await loadAdminDashboardData();

    expect(result.orders[0]).toMatchObject({
      customer_order_item: [],
      payment: [],
      invoice: [],
      customer_order_status_history: [],
    });
  });

  it("loads and normalizes one admin order for document rendering", async () => {
    const order = {
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      agent_id: null,
      source: "admin_manual",
      order_status: "processing",
      payment_status: "unpaid",
      approved_at: null,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      customer: null,
      agent: null,
      customer_order_item: null,
      payment: null,
      invoice: null,
      customer_order_status_history: null,
    };
    const builder = createQueryBuilder({
      data: [order],
      error: null,
    });
    const from = vi.fn(() => builder);
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminOrder } = await import("./data");

    const result = await loadAdminOrder(order.id);

    expect(from).toHaveBeenCalledWith("order");
    expect(builder.eq).toHaveBeenCalledWith("id", order.id);
    expect(result).toMatchObject({
      id: order.id,
      invoice: [],
      customer_order_item: [],
    });
  });

  it("preserves a single nested invoice object on an admin order", async () => {
    const invoice = {
      id: "7c66f907-8324-473c-b0b5-d017a4728121",
      order_id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      invoice_number: "INV-00000042",
      status: "issued",
      issued_at: "2026-07-03T00:00:00.000Z",
      due_at: null,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
    };
    const order = {
      id: "49d07a2e-a8bb-4dc9-8ee5464286fb",
      customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      agent_id: null,
      source: "admin_manual",
      order_status: "processing",
      payment_status: "unpaid",
      approved_at: null,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      customer: null,
      agent: null,
      customer_order_item: [],
      payment: [],
      invoice,
      customer_order_status_history: [],
    };
    const builder = createQueryBuilder({
      data: [order],
      error: null,
    });
    const from = vi.fn(() => builder);
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminOrder } = await import("./data");

    const result = await loadAdminOrder(order.id);

    expect(result?.invoice).toEqual([invoice]);
  });

  it("normalizes the parent distributed agent order for linked customer orders", async () => {
    const order = {
      id: "49d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
      parent_order_id: "11111111-1111-4111-8111-111111111111",
      customer_id: "b10bb955-d8b1-4a26-a6e2-928fd33949e1",
      agent_id: null,
      source: "agent_submitted",
      order_status: "processing",
      payment_status: "unpaid",
      approved_at: null,
      created_at: "2026-07-03T00:00:00.000Z",
      updated_at: "2026-07-03T00:00:00.000Z",
      customer: null,
      agent: null,
      agent_order: {
        id: "11111111-1111-4111-8111-111111111111",
        agent_id: "b5f2b9bb-5704-4d75-83c1-812d9f9e1111",
        agent: {
          id: "b5f2b9bb-5704-4d75-83c1-812d9f9e1111",
          user_id: "8bcce9f3-2a1b-43c0-9e51-70667e017111",
          status: "active",
          created_at: "2026-07-01T00:00:00.000Z",
          updated_at: "2026-07-01T00:00:00.000Z",
          profile: {
            display_name: "Agent Maria",
            phone_number: "09171234567",
            email: "agent@example.test",
          },
        },
      },
      customer_order_item: [],
      payment: [],
      invoice: [],
      customer_order_status_history: [],
    };
    const builder = createQueryBuilder({
      data: [order],
      error: null,
    });
    const from = vi.fn(() => builder);
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminOrder } = await import("./data");

    const result = await loadAdminOrder(order.id);

    expect(result?.agent_order).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      agent_id: "b5f2b9bb-5704-4d75-83c1-812d9f9e1111",
      agent: {
        id: "b5f2b9bb-5704-4d75-83c1-812d9f9e1111",
        user_id: "8bcce9f3-2a1b-43c0-9e51-70667e017111",
        display_name: "Agent Maria",
        email: "agent@example.test",
        contact: "09171234567",
      },
    });
  });

  it("builds dashboard summary totals from all matching records", async () => {
    const orderBuilder = createQueryBuilder({
      data: [
        createMockOrder({ order_status: "pending" }),
        createMockOrder({
          id: "59d07a2e-a8bb-4dc9-8df5-8ee5464286fb",
          order_status: "closed",
        }),
      ],
      error: null,
    });
    const customerBuilder = createQueryBuilder({
      data: [
        {
          id: "customer-1",
          first_name: "Maria",
          last_name: "Cruz",
          phone_number: "09170000000",
          email: "maria@example.test",
          address: "Quezon City",
          assigned_agent_id: null,
          is_reseller: false,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const inquiryBuilder = createQueryBuilder({
      data: [
        {
          id: "inquiry-1",
          name: "Maria Cruz",
          email: "maria@example.test",
          phone_number: "09170000000",
          message: "Need pricing",
          inquiry_status: "reviewing",
          internal_notes: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "inquiry-2",
          name: "Ana Reyes",
          email: "ana@example.test",
          phone_number: "09171111111",
          message: "Hello",
          inquiry_status: "closed",
          internal_notes: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const productBuilder = createQueryBuilder({
      data: [
        {
          id: "product-1",
          name: "Pork Belly",
          category: "pork",
          description: null,
          unit_label: "kg",
          default_price: 250,
          reseller_price: 230,
          stock_status: "in_stock",
          image_path: null,
          is_active: true,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "product-2",
          name: "Chicken Breast",
          category: "chicken",
          description: null,
          unit_label: "kg",
          default_price: 200,
          reseller_price: 180,
          stock_status: "limited",
          image_path: null,
          is_active: false,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const resellerBuilder = createQueryBuilder({
      data: [
        {
          id: "application-1",
          name: "Maria Cruz",
          email: "maria@example.test",
          contact_number: "09170000000",
          planned_transaction_type: "Retail",
          expected_quantity_per_week: "50kg",
          message: "Interested",
          application_status: "submitted",
          email_delivery_status: "pending",
          price_list_sent_at: null,
          email_error: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
        {
          id: "application-2",
          name: "Ana Reyes",
          email: "ana@example.test",
          contact_number: "09171111111",
          planned_transaction_type: "Wholesale",
          expected_quantity_per_week: "20kg",
          message: null,
          application_status: "closed",
          email_delivery_status: "sent",
          price_list_sent_at: null,
          email_error: null,
          admin_read_at: null,
          admin_read_by: null,
          created_at: "2026-07-03T00:00:00.000Z",
          updated_at: "2026-07-03T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const agentOrderBuilder = createQueryBuilder({
      data: [
        { order_status: "pending_customers" },
        { order_status: "processing" },
      ],
      error: null,
    });
    const agentBuilder = createQueryBuilder({
      data: [
        { id: "agent-1" },
        { id: "agent-2" },
      ],
      error: null,
    });
    let orderCall = 0;
    const from = vi.fn((table: string) => {
      if (table === "order") {
        orderCall += 1;
        return orderCall === 1 ? orderBuilder : agentOrderBuilder;
      }
      if (table === "agent") return agentBuilder;
      if (table === "customer") return customerBuilder;
      if (table === "contact_inquiry") return inquiryBuilder;
      if (table === "product") return productBuilder;
      if (table === "reseller_application") return resellerBuilder;
      return createQueryBuilder();
    });
    createSupabaseAdminClient.mockReturnValue({ from });
    const { loadAdminDashboardSummaryData } = await import("./data");

    const result = await loadAdminDashboardSummaryData();

    expect(result).toEqual({
      totalOrders: 4,
      pendingOrders: 2,
      processingOrders: 1,
      pendingOrder: 1,
      pendingCustomer: 1,
      processing: 1,
      closed: 1,
      agents: 2,
      inquiries: 2,
      customers: 1,
      products: 2,
      resellerApplications: 2,
    });
  });
});
