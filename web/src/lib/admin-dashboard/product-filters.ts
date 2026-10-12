import type { ProductCategory, StockStatus } from "./actions";
import { getStockStatuses } from "./actions";
import { normalizeProductOptionValue } from "./product-options";
import {
  isAdminProductSortColumn,
  type AdminProductSortColumn,
  type AdminProductSortDirection,
} from "./product-sort";

export {
  adminProductSortColumns,
  isAdminProductSortColumn,
  nextAdminProductSort,
} from "./product-sort";
export type { AdminProductSortColumn, AdminProductSortDirection } from "./product-sort";

export type AdminProductFilters = {
  search?: string;
  category?: ProductCategory;
  stockStatus?: StockStatus;
  sort?: AdminProductSortColumn;
  direction?: AdminProductSortDirection;
};

export function parseAdminProductFilters(url: URL): AdminProductFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalCategoryFilter(url.searchParams.get("category")),
    ...optionalFilter("stockStatus", url.searchParams.get("stockStatus"), getStockStatuses()),
    ...optionalProductSort(url.searchParams.get("sort"), url.searchParams.get("direction")),
  };
}

export function serializeAdminProductFilters(filters: AdminProductFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.category) params.set("category", filters.category);
  if (filters.stockStatus) params.set("stockStatus", filters.stockStatus);
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

function optionalCategoryFilter(value: string | null) {
  const normalized = normalizeProductOptionValue(value).slice(0, 60);

  return normalized ? { category: normalized } : {};
}

function optionalProductSort(sort: string | null, direction: string | null) {
  const normalizedSort = sort?.trim();
  const normalizedDirection = direction?.trim();
  if (!isAdminProductSortColumn(normalizedSort)) {
    return {};
  }

  if (normalizedDirection !== "asc" && normalizedDirection !== "desc") {
    return {};
  }

  return {
    sort: normalizedSort,
    direction: normalizedDirection,
  };
}

function optionalFilter<T extends string>(
  key: keyof AdminProductFilters,
  value: string | null,
  allowedValues: readonly T[],
) {
  const normalized = value?.trim();

  return normalized && allowedValues.includes(normalized as T)
    ? { [key]: normalized as T }
    : {};
}
