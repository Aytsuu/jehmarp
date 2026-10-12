import { createAdminListSort } from "./list-sort";

const customerSort = createAdminListSort(
  ["created_at", "customer_name", "is_reseller", "assigned_agent_name", "outstanding_credit_balance"] as const,
  ["created_at"] as const,
);

export const adminCustomerSortColumns = customerSort.columns;
export const isAdminCustomerSortColumn = customerSort.isColumn;
export const nextAdminCustomerSort = customerSort.nextSort;
export type AdminCustomerSortColumn = (typeof adminCustomerSortColumns)[number];
export type AdminCustomerSortDirection = "asc" | "desc";
