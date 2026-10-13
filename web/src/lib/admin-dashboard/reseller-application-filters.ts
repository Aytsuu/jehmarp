import { getResellerApplicationStatuses } from "./actions";
import { optionalAdminListSort } from "./list-sort";
import {
  isAdminResellerApplicationSortColumn,
  type AdminResellerApplicationSortColumn,
  type AdminResellerApplicationSortDirection,
} from "./reseller-application-sort";

export {
  adminResellerApplicationSortColumns,
  isAdminResellerApplicationSortColumn,
  nextAdminResellerApplicationSort,
} from "./reseller-application-sort";
export type { AdminResellerApplicationSortColumn, AdminResellerApplicationSortDirection } from "./reseller-application-sort";

export type AdminResellerApplicationStatus = ReturnType<typeof getResellerApplicationStatuses>[number];

export type AdminResellerApplicationFilters = {
  search?: string;
  status?: AdminResellerApplicationStatus;
  sort?: AdminResellerApplicationSortColumn;
  direction?: AdminResellerApplicationSortDirection;
};

export function parseAdminResellerApplicationFilters(url: URL): AdminResellerApplicationFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalFilter("status", url.searchParams.get("status"), getResellerApplicationStatuses()),
    ...optionalAdminListSort(
      isAdminResellerApplicationSortColumn,
      url.searchParams.get("sort"),
      url.searchParams.get("direction"),
    ),
  };
}

export function serializeAdminResellerApplicationFilters(
  filters: AdminResellerApplicationFilters,
): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.sort && filters.direction) {
    params.set("sort", filters.sort);
    params.set("direction", filters.direction);
  }

  return params.toString();
}

function optionalSearchFilter(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, 80);

  return normalized ? { search: normalized } : {};
}

function optionalFilter<T extends string>(
  key: keyof AdminResellerApplicationFilters,
  value: string | null,
  allowedValues: readonly T[],
) {
  const normalized = value?.trim();

  return normalized && allowedValues.includes(normalized as T)
    ? { [key]: normalized as T }
    : {};
}
