import type { OrderStatus } from "./actions";
import { getOrderStatuses } from "./actions";
import {
  isAdminOrderSortColumn,
  type AdminOrderSortColumn,
  type AdminOrderSortDirection,
} from "./order-sort";

export {
  adminOrderSortColumns,
  isAdminOrderSortColumn,
  nextAdminOrderSort,
} from "./order-sort";
export type { AdminOrderSortColumn, AdminOrderSortDirection } from "./order-sort";

export const orderSources = ["guest_shop", "agent_submitted", "admin_manual"] as const;
export const paymentStatuses = ["unpaid", "partial", "paid", "refunded"] as const;
export const agentOrderStatuses = ["pending_customers", "pending_order", "processing", "closed"] as const;

export type AdminOrderSource = (typeof orderSources)[number];
export type AdminPaymentStatus = (typeof paymentStatuses)[number];
export type AdminOrderStatusFilter = OrderStatus | (typeof agentOrderStatuses)[number];

export type AdminOrderFilters = {
  search?: string;
  source?: AdminOrderSource;
  orderStatus?: AdminOrderStatusFilter;
  paymentStatus?: AdminPaymentStatus;
  sort?: AdminOrderSortColumn;
  direction?: AdminOrderSortDirection;
};

export function getAdminOrderStatusFilters(): AdminOrderStatusFilter[] {
  return [...new Set<AdminOrderStatusFilter>([
    ...getOrderStatuses(),
    ...agentOrderStatuses,
  ])];
}

export function parseAdminOrderFilters(url: URL): AdminOrderFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalFilter("source", url.searchParams.get("source"), orderSources),
    ...optionalFilter("orderStatus", url.searchParams.get("orderStatus"), getAdminOrderStatusFilters()),
    ...optionalFilter("paymentStatus", url.searchParams.get("paymentStatus"), paymentStatuses),
    ...optionalOrderSort(url.searchParams.get("sort"), url.searchParams.get("direction")),
  };
}

export function serializeAdminOrderFilters(filters: AdminOrderFilters): string {
  const params = new URLSearchParams();

  if (filters.search) params.set("search", filters.search);
  if (filters.source) params.set("source", filters.source);
  if (filters.orderStatus) params.set("orderStatus", filters.orderStatus);
  if (filters.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
  if (filters.sort && filters.direction) {
    params.set("sort", filters.sort);
    params.set("direction", filters.direction);
  }

  return params.toString();
}

function optionalOrderSort(sort: string | null, direction: string | null) {
  const normalizedSort = sort?.trim();
  const normalizedDirection = direction?.trim();
  if (!isAdminOrderSortColumn(normalizedSort)) {
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

function optionalSearchFilter(value: string | null) {
  const normalized = value?.trim().replace(/\s+/g, " ").slice(0, 80);

  return normalized ? { search: normalized } : {};
}

function optionalFilter<T extends string>(
  key: keyof AdminOrderFilters,
  value: string | null,
  allowedValues: readonly T[],
) {
  const normalized = value?.trim();

  return normalized && allowedValues.includes(normalized as T)
    ? { [key]: normalized as T }
    : {};
}
