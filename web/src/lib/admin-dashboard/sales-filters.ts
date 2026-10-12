import type { AdminOrderSource } from "./order-filters";
import { orderSources } from "./order-filters";
import { optionalAdminListSort } from "./list-sort";
import {
  isAdminSalesSortColumn,
  type AdminSalesSortColumn,
  type AdminSalesSortDirection,
} from "./sales-sort";

export {
  adminSalesSortColumns,
  isAdminSalesSortColumn,
  nextAdminSalesSort,
} from "./sales-sort";
export type { AdminSalesSortColumn, AdminSalesSortDirection } from "./sales-sort";

export type AdminSalesFilters = {
  search?: string;
  source?: AdminOrderSource;
  orderStatus?: string;
  paymentStatus?: string;
  sort?: AdminSalesSortColumn;
  direction?: AdminSalesSortDirection;
};

export function parseAdminSalesFilters(url: URL): AdminSalesFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalSourceFilter(url.searchParams.get("source")),
    ...optionalAdminListSort(
      isAdminSalesSortColumn,
      url.searchParams.get("sort"),
      url.searchParams.get("direction"),
    ),
  };
}

export function serializeAdminSalesFilters(filters: AdminSalesFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.source) params.set("source", filters.source);
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

function optionalSourceFilter(value: string | null) {
  const normalized = value?.trim();

  return normalized && orderSources.includes(normalized as AdminOrderSource)
    ? { source: normalized as AdminOrderSource }
    : {};
}
