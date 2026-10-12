import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initAdminProductSort } from "./admin-product-sort";
import { initDashboardFragmentTable } from "./dashboard-fragment-table";

function renderProductsTable() {
  document.body.innerHTML = `
    <section data-admin-products-page>
      <form data-product-filter-form>
        <input name="search" value="" data-product-search-input />
        <input type="hidden" name="sort" value="" data-product-sort-input />
        <input type="hidden" name="direction" value="" data-product-direction-input />
      </form>
      <div data-interactive-table>
        <div data-product-table-shell>
          <div class="dashboard-table-board">
            <button type="button" data-product-sort="created_at">Date Created</button>
            <button type="button" data-product-sort="name">Product</button>
            <table><tbody><tr><td>Pork Belly</td></tr></tbody></table>
          </div>
        </div>
        <div data-server-pagination-footer></div>
      </div>
      <template data-product-filter-skeleton>
        <div class="dashboard-table-board" data-product-sort-skeleton>loading products</div>
      </template>
    </section>
  `;
}

function initProductsTable() {
  initAdminProductSort();
  initDashboardFragmentTable({
    cacheKey: "admin-products-filter-cache-v3",
    fragmentPath: "/admin/products-fragment",
    pagePath: "/admin/products",
    formSelector: "[data-product-filter-form]",
    tableShellSelector: "[data-product-table-shell]",
    skeletonTemplateSelector: "[data-product-filter-skeleton]",
    filterKeys: ["search", "category", "stockStatus", "sort", "direction"],
    searchInputSelector: "[data-product-search-input]",
    historyStateKey: "productFilterQuery",
  });
}

describe("admin product sort", () => {
  beforeEach(() => {
    vi.stubGlobal("location", {
      href: "https://jehmarp.example/admin/products",
      origin: "https://jehmarp.example",
      pathname: "/admin/products",
      search: "",
      assign: vi.fn(),
    });
    vi.stubGlobal("history", {
      replaceState: vi.fn(),
      state: null,
    });
    window.readDashboardFragmentResponse = async (response) => response.text();
    sessionStorage.clear();
    renderProductsTable();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("refreshes only the product table for a new sort", async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    const form = document.querySelector<HTMLFormElement>("[data-product-filter-form]")!;
    form.requestSubmit = vi.fn();
    initProductsTable();

    const board = document.querySelector<HTMLElement>(".dashboard-table-board")!;
    board.scrollLeft = 240;
    board.scrollTop = 80;
    document.querySelector<HTMLButtonElement>('[data-product-sort="created_at"]')!.click();

    expect(form.requestSubmit).not.toHaveBeenCalled();
    expect(document.querySelector("[data-product-sort-skeleton]")).not.toBeNull();
    expect(document.querySelector<HTMLElement>(".dashboard-table-board")?.scrollLeft).toBe(240);
    expect(document.querySelector<HTMLElement>(".dashboard-table-board")?.scrollTop).toBe(80);
    expect(fetchMock).toHaveBeenCalledWith(
      "/admin/products-fragment?sort=created_at&direction=desc",
      expect.objectContaining({ cache: "no-store" }),
    );

    resolveFetch(new Response(`
      <div data-product-table-shell>
        <div class="dashboard-table-board">
          <button type="button" data-product-sort="name">Product</button>
          <table><tbody><tr><td>Sorted product</td></tr></tbody></table>
        </div>
      </div>
    `, { status: 200 }));

    await vi.waitFor(() => {
      expect(document.querySelector("[data-product-table-shell]")?.textContent).toContain("Sorted product");
    });
    expect(document.querySelector<HTMLElement>(".dashboard-table-board")?.scrollLeft).toBe(240);
    expect(document.querySelector<HTMLElement>(".dashboard-table-board")?.scrollTop).toBe(80);
    expect(document.querySelector("[data-product-sort-skeleton]")).toBeNull();
  });

  it("flips the direction when the active column is clicked again", async () => {
    const fetchMock = vi.fn(async () => new Response(`
      <div data-product-table-shell>
        <button type="button" data-product-sort="name">Product</button>
      </div>
    `, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const sortInput = document.querySelector<HTMLInputElement>("[data-product-sort-input]")!;
    const directionInput = document.querySelector<HTMLInputElement>("[data-product-direction-input]")!;
    sortInput.value = "name";
    directionInput.value = "asc";
    initProductsTable();

    document.querySelector<HTMLButtonElement>('[data-product-sort="name"]')!.click();

    expect(sortInput.value).toBe("name");
    expect(directionInput.value).toBe("desc");
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/admin/products-fragment?sort=name&direction=desc",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });
});
