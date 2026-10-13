import { createAdminListSort } from "./list-sort";

const resellerApplicationSort = createAdminListSort(
  ["created_at", "name"] as const,
  ["created_at"] as const,
);

export const adminResellerApplicationSortColumns = resellerApplicationSort.columns;
export const isAdminResellerApplicationSortColumn = resellerApplicationSort.isColumn;
export const nextAdminResellerApplicationSort = resellerApplicationSort.nextSort;
export type AdminResellerApplicationSortColumn = (typeof adminResellerApplicationSortColumns)[number];
export type AdminResellerApplicationSortDirection = "asc" | "desc";
