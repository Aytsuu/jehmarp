export type AdminListSortDirection = "asc" | "desc";

export function createAdminListSort<T extends string>(
  columns: readonly T[],
  dateColumns: readonly T[],
) {
  function isColumn(value: string | null | undefined): value is T {
    return columns.some((column) => column === value);
  }

  function nextSort(
    currentSort: string | null | undefined,
    currentDirection: string | null | undefined,
    column: T,
  ): { sort: T; direction: AdminListSortDirection } {
    if (currentSort === column && (currentDirection === "asc" || currentDirection === "desc")) {
      return {
        sort: column,
        direction: currentDirection === "asc" ? "desc" : "asc",
      };
    }

    return {
      sort: column,
      direction: dateColumns.some((dateColumn) => dateColumn === column) ? "desc" : "asc",
    };
  }

  return { columns, isColumn, nextSort };
}

export function optionalAdminListSort<T extends string>(
  isColumn: (value: string | null | undefined) => value is T,
  sort: string | null,
  direction: string | null,
) {
  const normalizedSort = sort?.trim();
  const normalizedDirection = direction?.trim();
  if (!isColumn(normalizedSort)) return {};
  if (normalizedDirection !== "asc" && normalizedDirection !== "desc") return {};

  return {
    sort: normalizedSort,
    direction: normalizedDirection,
  };
}
