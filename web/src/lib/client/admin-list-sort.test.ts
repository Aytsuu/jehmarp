import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isAdminAgentSortColumn, nextAdminAgentSort } from "@/lib/admin-dashboard/agent-sort";
import { isAdminCustomerSortColumn, nextAdminCustomerSort } from "@/lib/admin-dashboard/customer-sort";
import { isAdminInquirySortColumn, nextAdminInquirySort } from "@/lib/admin-dashboard/inquiry-sort";
import { isAdminInvoiceSortColumn, nextAdminInvoiceSort } from "@/lib/admin-dashboard/invoice-sort";
import {
  isAdminResellerApplicationSortColumn,
  nextAdminResellerApplicationSort,
} from "@/lib/admin-dashboard/reseller-application-sort";
import { isAdminSalesSortColumn, nextAdminSalesSort } from "@/lib/admin-dashboard/sales-sort";
import { initAdminListSort } from "./admin-list-sort";
import { initDashboardFragmentTable } from "./dashboard-fragment-table";

const lists = [
  {
    name: "sales",
    pageAttribute: "data-admin-sales-page",
    formAttribute: "data-sales-filter-form",
    shellAttribute: "data-sales-table-shell",
    searchAttribute: "data-sales-search-input",
    sortAttribute: "data-sales-sort",
    sortInputAttribute: "data-sales-sort-input",
    directionInputAttribute: "data-sales-direction-input",
    dateColumn: "created_at",
    flipColumn: "customer_label",
    fragmentPath: "/admin/sales-fragment",
    pagePath: "/admin/sales",
    cacheKey: "admin-sales-filter-cache-v2",
    filterKeys: ["search", "source", "sort", "direction"],
    historyStateKey: "salesFilterQuery",
    initSort: () => initAdminListSort({
      buttonSelector: "[data-sales-sort]",
      pageSelector: "[data-admin-sales-page]",
      formSelector: "[data-sales-filter-form]",
      sortInputSelector: "[data-sales-sort-input]",
      directionInputSelector: "[data-sales-direction-input]",
      readColumn: (button) => button.dataset.salesSort,
      isColumn: isAdminSalesSortColumn,
      nextSort: nextAdminSalesSort,
    }),
  },
  {
    name: "invoices",
    pageAttribute: "data-admin-invoices-page",
    formAttribute: "data-invoice-filter-form",
    shellAttribute: "data-invoice-table-shell",
    searchAttribute: "data-invoice-search-input",
    sortAttribute: "data-invoice-sort",
    sortInputAttribute: "data-invoice-sort-input",
    directionInputAttribute: "data-invoice-direction-input",
    dateColumn: "invoice_created_at",
    flipColumn: "customer_label",
    fragmentPath: "/admin/invoices-fragment",
    pagePath: "/admin/invoices",
    cacheKey: "admin-invoices-filter-cache-v3",
    filterKeys: ["search", "balanceStatus", "sort", "direction"],
    historyStateKey: "invoiceFilterQuery",
    initSort: () => initAdminListSort({
      buttonSelector: "[data-invoice-sort]",
      pageSelector: "[data-admin-invoices-page]",
      formSelector: "[data-invoice-filter-form]",
      sortInputSelector: "[data-invoice-sort-input]",
      directionInputSelector: "[data-invoice-direction-input]",
      readColumn: (button) => button.dataset.invoiceSort,
      isColumn: isAdminInvoiceSortColumn,
      nextSort: nextAdminInvoiceSort,
    }),
  },
  {
    name: "customers",
    pageAttribute: "data-admin-customers-page",
    formAttribute: "data-customer-filter-form",
    shellAttribute: "data-customer-table-shell",
    searchAttribute: "data-customer-search-input",
    sortAttribute: "data-customer-sort",
    sortInputAttribute: "data-customer-sort-input",
    directionInputAttribute: "data-customer-direction-input",
    dateColumn: "created_at",
    flipColumn: "customer_name",
    fragmentPath: "/admin/customers-fragment",
    pagePath: "/admin/customers",
    cacheKey: "admin-customers-filter-cache-v3",
    filterKeys: ["search", "customerType", "sort", "direction"],
    historyStateKey: "customerFilterQuery",
    initSort: () => initAdminListSort({
      buttonSelector: "[data-customer-sort]",
      pageSelector: "[data-admin-customers-page]",
      formSelector: "[data-customer-filter-form]",
      sortInputSelector: "[data-customer-sort-input]",
      directionInputSelector: "[data-customer-direction-input]",
      readColumn: (button) => button.dataset.customerSort,
      isColumn: isAdminCustomerSortColumn,
      nextSort: nextAdminCustomerSort,
    }),
  },
  {
    name: "agents",
    pageAttribute: "data-admin-agents-page",
    formAttribute: "data-agent-filter-form",
    shellAttribute: "data-agent-table-shell",
    searchAttribute: "data-agent-search-input",
    sortAttribute: "data-agent-sort",
    sortInputAttribute: "data-agent-sort-input",
    directionInputAttribute: "data-agent-direction-input",
    dateColumn: "created_at",
    flipColumn: "display_name",
    fragmentPath: "/admin/agents-fragment",
    pagePath: "/admin/agents",
    cacheKey: "admin-agents-filter-cache-v3",
    filterKeys: ["search", "status", "sort", "direction"],
    historyStateKey: "agentFilterQuery",
    initSort: () => initAdminListSort({
      buttonSelector: "[data-agent-sort]",
      pageSelector: "[data-admin-agents-page]",
      formSelector: "[data-agent-filter-form]",
      sortInputSelector: "[data-agent-sort-input]",
      directionInputSelector: "[data-agent-direction-input]",
      readColumn: (button) => button.dataset.agentSort,
      isColumn: isAdminAgentSortColumn,
      nextSort: nextAdminAgentSort,
    }),
  },
  {
    name: "reseller applications",
    pageAttribute: "data-admin-reseller-applications-page",
    formAttribute: "data-reseller-filter-form",
    shellAttribute: "data-reseller-table-shell",
    searchAttribute: "data-reseller-search-input",
    sortAttribute: "data-reseller-sort",
    sortInputAttribute: "data-reseller-sort-input",
    directionInputAttribute: "data-reseller-direction-input",
    dateColumn: "created_at",
    flipColumn: "name",
    fragmentPath: "/admin/reseller-applications-fragment",
    pagePath: "/admin/reseller-applications",
    cacheKey: "admin-reseller-filter-cache-v3",
    filterKeys: ["search", "status", "sort", "direction"],
    historyStateKey: "resellerFilterQuery",
    initSort: () => initAdminListSort({
      buttonSelector: "[data-reseller-sort]",
      pageSelector: "[data-admin-reseller-applications-page]",
      formSelector: "[data-reseller-filter-form]",
      sortInputSelector: "[data-reseller-sort-input]",
      directionInputSelector: "[data-reseller-direction-input]",
      readColumn: (button) => button.dataset.resellerSort,
      isColumn: isAdminResellerApplicationSortColumn,
      nextSort: nextAdminResellerApplicationSort,
    }),
  },
  {
    name: "inquiries",
    pageAttribute: "data-admin-inquiries-page",
    formAttribute: "data-inquiry-filter-form",
    shellAttribute: "data-inquiry-table-shell",
    searchAttribute: "data-inquiry-search-input",
    sortAttribute: "data-inquiry-sort",
    sortInputAttribute: "data-inquiry-sort-input",
    directionInputAttribute: "data-inquiry-direction-input",
    dateColumn: "created_at",
    flipColumn: "name",
    fragmentPath: "/admin/inquiries-fragment",
    pagePath: "/admin/inquiries",
    cacheKey: "admin-inquiry-filter-cache-v3",
    filterKeys: ["search", "status", "sort", "direction"],
    historyStateKey: "inquiryFilterQuery",
    initSort: () => initAdminListSort({
      buttonSelector: "[data-inquiry-sort]",
      pageSelector: "[data-admin-inquiries-page]",
      formSelector: "[data-inquiry-filter-form]",
      sortInputSelector: "[data-inquiry-sort-input]",
      directionInputSelector: "[data-inquiry-direction-input]",
      readColumn: (button) => button.dataset.inquirySort,
      isColumn: isAdminInquirySortColumn,
      nextSort: nextAdminInquirySort,
    }),
  },
] as const;

function renderList(list: (typeof lists)[number]) {
  document.body.innerHTML = `
    <section ${list.pageAttribute}>
      <form ${list.formAttribute}>
        <input name="search" value="" ${list.searchAttribute} />
        <input type="hidden" name="sort" value="" ${list.sortInputAttribute} />
        <input type="hidden" name="direction" value="" ${list.directionInputAttribute} />
      </form>
      <div data-interactive-table>
        <div ${list.shellAttribute}>
          <button type="button" ${list.sortAttribute}="${list.dateColumn}">Date</button>
          <button type="button" ${list.sortAttribute}="${list.flipColumn}">Name</button>
          <table><tbody><tr><td>Current row</td></tr></tbody></table>
        </div>
        <div data-server-pagination-footer></div>
      </div>
      <template data-${list.name === "reseller applications" ? "reseller" : list.name === "invoices" ? "invoice" : list.name === "customers" ? "customer" : list.name === "agents" ? "agent" : list.name === "inquiries" ? "inquiry" : "sales"}-filter-skeleton>
        <div data-list-sort-skeleton>loading</div>
      </template>
    </section>
  `;
}

function skeletonSelector(list: (typeof lists)[number]) {
  if (list.name === "sales") return "[data-sales-filter-skeleton]";
  if (list.name === "invoices") return "[data-invoice-filter-skeleton]";
  if (list.name === "customers") return "[data-customer-filter-skeleton]";
  if (list.name === "agents") return "[data-agent-filter-skeleton]";
  if (list.name === "reseller applications") return "[data-reseller-filter-skeleton]";
  return "[data-inquiry-filter-skeleton]";
}

describe("admin list sort", () => {
  beforeEach(() => {
    vi.stubGlobal("history", {
      replaceState: vi.fn(),
      state: null,
    });
    window.readDashboardFragmentResponse = async (response) => response.text();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it.each(lists)("refreshes only the $name table for a new date sort", async (list) => {
    vi.stubGlobal("location", {
      href: `https://jehmarp.example${list.pagePath}`,
      origin: "https://jehmarp.example",
      pathname: list.pagePath,
      search: "",
      assign: vi.fn(),
    });
    renderList(list);
    let resolveFetch: (response: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    vi.stubGlobal("fetch", fetchMock);
    const form = document.querySelector<HTMLFormElement>(`[${list.formAttribute}]`)!;
    form.requestSubmit = vi.fn();
    list.initSort();
    initDashboardFragmentTable({
      cacheKey: list.cacheKey,
      fragmentPath: list.fragmentPath,
      pagePath: list.pagePath,
      formSelector: `[${list.formAttribute}]`,
      tableShellSelector: `[${list.shellAttribute}]`,
      skeletonTemplateSelector: skeletonSelector(list),
      filterKeys: list.filterKeys,
      searchInputSelector: `[${list.searchAttribute}]`,
      historyStateKey: list.historyStateKey,
    });

    document.querySelector<HTMLButtonElement>(`[${list.sortAttribute}="${list.dateColumn}"]`)!.click();

    expect(form.requestSubmit).not.toHaveBeenCalled();
    expect(document.querySelector("[data-list-sort-skeleton]")).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      `${list.fragmentPath}?sort=${list.dateColumn}&direction=desc`,
      expect.objectContaining({ cache: "no-store" }),
    );

    resolveFetch(new Response(`
      <div ${list.shellAttribute}>
        <table><tbody><tr><td>Sorted row</td></tr></tbody></table>
      </div>
    `, { status: 200 }));

    await vi.waitFor(() => {
      expect(document.querySelector(`[${list.shellAttribute}]`)?.textContent).toContain("Sorted row");
    });
    expect(document.querySelector("[data-list-sort-skeleton]")).toBeNull();
  });

  it.each(lists)("flips the active $name column", async (list) => {
    vi.stubGlobal("location", {
      href: `https://jehmarp.example${list.pagePath}`,
      origin: "https://jehmarp.example",
      pathname: list.pagePath,
      search: "",
      assign: vi.fn(),
    });
    renderList(list);
    const fetchMock = vi.fn(async () => new Response(`
      <div ${list.shellAttribute}>
        <button type="button" ${list.sortAttribute}="${list.flipColumn}">Name</button>
      </div>
    `, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const sortInput = document.querySelector<HTMLInputElement>(`[${list.sortInputAttribute}]`)!;
    const directionInput = document.querySelector<HTMLInputElement>(`[${list.directionInputAttribute}]`)!;
    sortInput.value = list.flipColumn;
    directionInput.value = "asc";
    list.initSort();
    initDashboardFragmentTable({
      cacheKey: list.cacheKey,
      fragmentPath: list.fragmentPath,
      pagePath: list.pagePath,
      formSelector: `[${list.formAttribute}]`,
      tableShellSelector: `[${list.shellAttribute}]`,
      skeletonTemplateSelector: skeletonSelector(list),
      filterKeys: list.filterKeys,
      searchInputSelector: `[${list.searchAttribute}]`,
      historyStateKey: list.historyStateKey,
    });

    document.querySelector<HTMLButtonElement>(`[${list.sortAttribute}="${list.flipColumn}"]`)!.click();

    expect(sortInput.value).toBe(list.flipColumn);
    expect(directionInput.value).toBe("desc");
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${list.fragmentPath}?sort=${list.flipColumn}&direction=desc`,
        expect.objectContaining({ cache: "no-store" }),
      );
    });
  });
});
