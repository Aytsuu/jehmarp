export const adminProductSortColumns = [
  "created_at",
  "name",
  "default_price",
  "agent_commission_value",
] as const;

export type AdminProductSortColumn = (typeof adminProductSortColumns)[number];
export type AdminProductSortDirection = "asc" | "desc";

export function isAdminProductSortColumn(value: string | null | undefined): value is AdminProductSortColumn {
  return adminProductSortColumns.some((column) => column === value);
}

export function nextAdminProductSort(
  currentSort: string | null | undefined,
  currentDirection: string | null | undefined,
  column: AdminProductSortColumn,
): { sort: AdminProductSortColumn; direction: AdminProductSortDirection } {
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
