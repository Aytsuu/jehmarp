export const adminOrderSortColumns = [
  "created_at",
  "customer_label",
  "order_total",
  "remaining_receivable",
] as const;

export type AdminOrderSortColumn = (typeof adminOrderSortColumns)[number];
export type AdminOrderSortDirection = "asc" | "desc";

export function isAdminOrderSortColumn(value: string | null | undefined): value is AdminOrderSortColumn {
  return adminOrderSortColumns.some((column) => column === value);
}

export function nextAdminOrderSort(
  currentSort: string | null | undefined,
  currentDirection: string | null | undefined,
  column: AdminOrderSortColumn,
): { sort: AdminOrderSortColumn; direction: AdminOrderSortDirection } {
  if (currentSort === column && (currentDirection === "asc" || currentDirection === "desc")) {
    return {
      sort: column,
      direction: currentDirection === "asc" ? "desc" : "asc",
    };
  }

  return {
    sort: column,
    direction: column === "created_at" ? "desc" : "asc",
  };
}
