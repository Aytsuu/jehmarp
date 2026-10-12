import { optionalAdminListSort } from "./list-sort";
import {
  isAdminInvoiceSortColumn,
  type AdminInvoiceSortColumn,
  type AdminInvoiceSortDirection,
} from "./invoice-sort";

export {
  adminInvoiceSortColumns,
  isAdminInvoiceSortColumn,
  nextAdminInvoiceSort,
} from "./invoice-sort";
export type { AdminInvoiceSortColumn, AdminInvoiceSortDirection } from "./invoice-sort";

export const invoiceBalanceStatuses = ["unpaid", "partial", "paid"] as const;

export type AdminInvoiceBalanceStatus = (typeof invoiceBalanceStatuses)[number];

export type AdminInvoiceFilters = {
  search?: string;
  balanceStatus?: AdminInvoiceBalanceStatus;
  sort?: AdminInvoiceSortColumn;
  direction?: AdminInvoiceSortDirection;
};

export function parseAdminInvoiceFilters(url: URL): AdminInvoiceFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalFilter("balanceStatus", url.searchParams.get("balanceStatus"), invoiceBalanceStatuses),
    ...optionalAdminListSort(
      isAdminInvoiceSortColumn,
      url.searchParams.get("sort"),
      url.searchParams.get("direction"),
    ),
  };
}

export function serializeAdminInvoiceFilters(filters: AdminInvoiceFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.balanceStatus) params.set("balanceStatus", filters.balanceStatus);
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
  key: keyof AdminInvoiceFilters,
  value: string | null,
  allowedValues: readonly T[],
) {
  const normalized = value?.trim();

  return normalized && allowedValues.includes(normalized as T)
    ? { [key]: normalized as T }
    : {};
}
