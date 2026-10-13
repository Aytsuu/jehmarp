import { createAdminListSort } from "./list-sort";

const salesSort = createAdminListSort(
  ["created_at", "sale_date_value", "customer_label", "order_total", "net_total", "payment_count"] as const,
  ["created_at", "sale_date_value"] as const,
);

export const adminSalesSortColumns = salesSort.columns;
export const isAdminSalesSortColumn = salesSort.isColumn;
export const nextAdminSalesSort = salesSort.nextSort;
export type AdminSalesSortColumn = (typeof adminSalesSortColumns)[number];
export type AdminSalesSortDirection = "asc" | "desc";
