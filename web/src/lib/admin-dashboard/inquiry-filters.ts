import { getInquiryStatuses } from "./actions";
import { optionalAdminListSort } from "./list-sort";
import {
  isAdminInquirySortColumn,
  type AdminInquirySortColumn,
  type AdminInquirySortDirection,
} from "./inquiry-sort";

export {
  adminInquirySortColumns,
  isAdminInquirySortColumn,
  nextAdminInquirySort,
} from "./inquiry-sort";
export type { AdminInquirySortColumn, AdminInquirySortDirection } from "./inquiry-sort";

export type AdminInquiryFilterStatus = ReturnType<typeof getInquiryStatuses>[number];

export type AdminInquiryFilters = {
  search?: string;
  status?: AdminInquiryFilterStatus;
  sort?: AdminInquirySortColumn;
  direction?: AdminInquirySortDirection;
};

export function parseAdminInquiryFilters(url: URL): AdminInquiryFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalFilter("status", url.searchParams.get("status"), getInquiryStatuses()),
    ...optionalAdminListSort(
      isAdminInquirySortColumn,
      url.searchParams.get("sort"),
      url.searchParams.get("direction"),
    ),
  };
}

export function serializeAdminInquiryFilters(filters: AdminInquiryFilters): string {
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
  key: keyof AdminInquiryFilters,
  value: string | null,
  allowedValues: readonly T[],
) {
  const normalized = value?.trim();

  return normalized && allowedValues.includes(normalized as T)
    ? { [key]: normalized as T }
    : {};
}
