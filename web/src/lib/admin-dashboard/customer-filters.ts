import { optionalAdminListSort } from "./list-sort";
import {
  isAdminCustomerSortColumn,
  type AdminCustomerSortColumn,
  type AdminCustomerSortDirection,
} from "./customer-sort";

export {
  adminCustomerSortColumns,
  isAdminCustomerSortColumn,
  nextAdminCustomerSort,
} from "./customer-sort";
export type { AdminCustomerSortColumn, AdminCustomerSortDirection } from "./customer-sort";

export const customerTypes = ["retail", "reseller"] as const;

export type AdminCustomerType = (typeof customerTypes)[number];

export type AdminCustomerFilters = {
  search?: string;
  customerType?: AdminCustomerType;
  sort?: AdminCustomerSortColumn;
  direction?: AdminCustomerSortDirection;
};

export function parseAdminCustomerFilters(url: URL): AdminCustomerFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalFilter("customerType", url.searchParams.get("customerType"), customerTypes),
    ...optionalAdminListSort(
      isAdminCustomerSortColumn,
      url.searchParams.get("sort"),
      url.searchParams.get("direction"),
    ),
  };
}

export function serializeAdminCustomerFilters(filters: AdminCustomerFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.customerType) params.set("customerType", filters.customerType);
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
  key: keyof AdminCustomerFilters,
  value: string | null,
  allowedValues: readonly T[],
) {
  const normalized = value?.trim();

  return normalized && allowedValues.includes(normalized as T)
    ? { [key]: normalized as T }
    : {};
}
