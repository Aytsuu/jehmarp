import { optionalAdminListSort } from "./list-sort";
import {
  isAdminAgentSortColumn,
  type AdminAgentSortColumn,
  type AdminAgentSortDirection,
} from "./agent-sort";

export {
  adminAgentSortColumns,
  isAdminAgentSortColumn,
  nextAdminAgentSort,
} from "./agent-sort";
export type { AdminAgentSortColumn, AdminAgentSortDirection } from "./agent-sort";

export const agentStatuses = ["active", "inactive", "suspended"] as const;

export type AdminAgentStatus = (typeof agentStatuses)[number];

export type AdminAgentFilters = {
  search?: string;
  status?: AdminAgentStatus;
  sort?: AdminAgentSortColumn;
  direction?: AdminAgentSortDirection;
};

export function parseAdminAgentFilters(url: URL): AdminAgentFilters {
  return {
    ...optionalSearchFilter(url.searchParams.get("search")),
    ...optionalFilter("status", url.searchParams.get("status"), agentStatuses),
    ...optionalAdminListSort(
      isAdminAgentSortColumn,
      url.searchParams.get("sort"),
      url.searchParams.get("direction"),
    ),
  };
}

export function serializeAdminAgentFilters(filters: AdminAgentFilters): string {
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
  key: keyof AdminAgentFilters,
  value: string | null,
  allowedValues: readonly T[],
) {
  const normalized = value?.trim();

  return normalized && allowedValues.includes(normalized as T)
    ? { [key]: normalized as T }
    : {};
}
