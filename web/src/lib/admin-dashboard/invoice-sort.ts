import { createAdminListSort } from "./list-sort";

const invoiceSort = createAdminListSort(
  ["invoice_created_at", "customer_label", "invoice_total", "paid_total", "balance"] as const,
  ["invoice_created_at"] as const,
);

export const adminInvoiceSortColumns = invoiceSort.columns;
export const isAdminInvoiceSortColumn = invoiceSort.isColumn;
export const nextAdminInvoiceSort = invoiceSort.nextSort;
export type AdminInvoiceSortColumn = (typeof adminInvoiceSortColumns)[number];
export type AdminInvoiceSortDirection = "asc" | "desc";
