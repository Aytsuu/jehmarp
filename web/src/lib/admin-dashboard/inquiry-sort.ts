import { createAdminListSort } from "./list-sort";

const inquirySort = createAdminListSort(
  ["created_at", "name"] as const,
  ["created_at"] as const,
);

export const adminInquirySortColumns = inquirySort.columns;
export const isAdminInquirySortColumn = inquirySort.isColumn;
export const nextAdminInquirySort = inquirySort.nextSort;
export type AdminInquirySortColumn = (typeof adminInquirySortColumns)[number];
export type AdminInquirySortDirection = "asc" | "desc";
