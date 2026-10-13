import { createAdminListSort } from "./list-sort";

const agentSort = createAdminListSort(
  ["created_at", "display_name"] as const,
  ["created_at"] as const,
);

export const adminAgentSortColumns = agentSort.columns;
export const isAdminAgentSortColumn = agentSort.isColumn;
export const nextAdminAgentSort = agentSort.nextSort;
export type AdminAgentSortColumn = (typeof adminAgentSortColumns)[number];
export type AdminAgentSortDirection = "asc" | "desc";
