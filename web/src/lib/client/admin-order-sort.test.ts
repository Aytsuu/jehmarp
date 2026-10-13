import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initAdminOrderSort } from "./admin-order-sort";
import { initDashboardFragmentTable } from "./dashboard-fragment-table";

function renderOrdersTable() {
  document.body.innerHTML = `
    <section data-admin-orders-page>
      <form data-order-filter-form>
        <input name="search" value="" data-order-search-input />
        <input type="hidden" name="sort" value="" data-order-sort-input />
        <input type="hidden" name="direction" value="" data-order-direction-input />
      </form>
      <div data-interactive-table>
        <div data-order-table-shell>
          <div class="dashboard-table-board">
            <button type="button" data-order-sort="created_at">Date Created</button>
            <button type="button" data-order-sort="customer_label">Customer</button>
            <table><tbody><tr><td>Maria Cruz</td></tr></tbody></table>
          </div>
        </div>
        <div data-server-pagination-footer></div>
      </div>
      <template data-order-filter-skeleton>
        <div class="dashboard-table-board" data-order-sort-skeleton>loading orders</div>
      </template>
    </section>
  `;
}

function initOrdersTable() {
  initAdminOrderSort();
  initDashboardFragmentTable({
    cacheKey: "admin-orders-filter-cache-v3",
    fragmentPath: "/admin/orders-fragment",
    pagePath: "/admin/orders",
    formSelector: "[data-order-filter-form]",
    tableShellSelector: "[data-order-table-shell]",
    skeletonTemplateSelector: "[data-order-filter-skeleton]",
    filterKeys: ["search", "source", "orderStatus", "paymentStatus", "sort", "direction"],
    searchInputSelector: "[data-order-search-input]",
    historyStateKey: "orderFilterQuery",
  });
}

describe("admin order sort", () => {
  beforeEach(() => {
    vi.stubGlobal("location", {
      href: "https://jehmarp.example/admin/orders",
      origin: "https://jehmarp.example",
      pathname: "/admin/orders",
      search: "",
      assign: vi.fn(),
    });
    vi.stubGlobal("history", {
      replaceState: vi.fn(),
      state: null,
    });
    window.readDashboardFragmentResponse = async (response) => response.text();
    sessionStorage.clear();
    renderOrdersTable();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("refreshes only the order table for a new sort", async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    const form = document.querySelector<HTMLFormElement>("[data-order-filter-form]")!;
    form.requestSubmit = vi.fn();
    initOrdersTable();

    const board = document.querySelector<HTMLElement>(".dashboard-table-board")!;
    board.scrollLeft = 240;
    board.scrollTop = 80;
    document.querySelector<HTMLButtonElement>('[data-order-sort="created_at"]')!.click();

    expect(form.requestSubmit).not.toHaveBeenCalled();
    expect(document.querySelector("[data-order-sort-skeleton]")).not.toBeNull();
    expect(document.querySelector<HTMLElement>(".dashboard-table-board")?.scrollLeft).toBe(240);
    expect(document.querySelector<HTMLElement>(".dashboard-table-board")?.scrollTop).toBe(80);
    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/orders-fragment?sort=created_at&direction=desc",
      expect.objectContaining({ cache: "no-store" }),
    );

    resolveFetch(new Response(`
      <div data-order-table-shell>
        <div class="dashboard-table-board">
          <button type="button" data-order-sort="customer_label">Customer</button>
          <table><tbody><tr><td>Sorted order</td></tr></tbody></table>
        </div>
      </div>
    `, { status: 200 }));

    await vi.waitFor(() => {
      expect(document.querySelector("[data-order-table-shell]")?.textContent).toContain("Sorted order");
    });
    expect(document.querySelector<HTMLElement>(".dashboard-table-board")?.scrollLeft).toBe(240);
    expect(document.querySelector<HTMLElement>(".dashboard-table-board")?.scrollTop).toBe(80);
    expect(document.querySelector("[data-order-sort-skeleton]")).toBeNull();
  });

  it("flips the direction when the active column is clicked again", async () => {
    const fetchMock = vi.fn(async () => new Response(`
      <div data-order-table-shell>
        <button type="button" data-order-sort="customer_label">Customer</button>
      </div>
    `, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const sortInput = document.querySelector<HTMLInputElement>("[data-order-sort-input]")!;
    const directionInput = document.querySelector<HTMLInputElement>("[data-order-direction-input]")!;
    sortInput.value = "customer_label";
    directionInput.value = "asc";
    initOrdersTable();

    document.querySelector<HTMLButtonElement>('[data-order-sort="customer_label"]')!.click();

    expect(sortInput.value).toBe("customer_label");
    expect(directionInput.value).toBe("desc");
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/admin/orders-fragment?sort=customer_label&direction=desc",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });
});
