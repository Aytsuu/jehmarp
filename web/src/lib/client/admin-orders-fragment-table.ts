import { initDashboardFragmentTable } from "@/lib/client/dashboard-fragment-table";

export function initAdminOrdersFragmentTable() {
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
