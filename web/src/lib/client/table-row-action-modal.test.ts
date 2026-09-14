import { beforeEach, describe, expect, it } from "vitest";

import {
  initTableRowActionModals,
  populateTableRowActionsModal,
} from "./table-row-action-modal";

describe("table-row-action-modal", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button
        type="button"
        data-table-row-action-trigger
        data-open-dashboard-modal="sales-row-actions-modal"
        data-row-action-pdf-href="/admin/orders/customer/order-1/sales-invoice.pdf"
        data-row-action-details-href="/admin/sales/order-1"
        data-row-action-details-label="Sale Details"
        data-row-action-menu-label="Open actions for sale Acme"
        aria-label="Open actions for sale Acme"
      >
        Actions
      </button>
      <div
        id="sales-row-actions-modal"
        role="dialog"
        aria-labelledby="sales-row-actions-modal-title"
      >
        <h2 id="sales-row-actions-modal-title">Actions</h2>
        <a data-table-row-action-pdf hidden><span>Open PDF</span></a>
        <a data-table-row-action-details hidden>
          <span data-table-row-action-details-label>Order Details</span>
        </a>
      </div>
    `;
  });

  it("populates modal links and title from trigger data attributes", () => {
    const trigger = document.querySelector<HTMLElement>("[data-table-row-action-trigger]");
    expect(trigger).not.toBeNull();

    populateTableRowActionsModal(trigger!);

    const modal = document.getElementById("sales-row-actions-modal");
    const pdfLink = modal?.querySelector<HTMLAnchorElement>("[data-table-row-action-pdf]");
    const detailsLink = modal?.querySelector<HTMLAnchorElement>("[data-table-row-action-details]");

    expect(pdfLink?.href).toContain("/admin/orders/customer/order-1/sales-invoice.pdf");
    expect(pdfLink?.hidden).toBe(false);
    expect(detailsLink?.href).toContain("/admin/sales/order-1");
    expect(detailsLink?.hidden).toBe(false);
    expect(
      modal?.querySelector<HTMLElement>("[data-table-row-action-details-label]")?.textContent,
    ).toBe("Sale Details");
    expect(document.getElementById("sales-row-actions-modal-title")?.textContent).toBe(
      "Open actions for sale Acme",
    );
  });

  it("hides unavailable actions when hrefs are missing", () => {
    const trigger = document.querySelector<HTMLElement>("[data-table-row-action-trigger]");
    trigger?.removeAttribute("data-row-action-pdf-href");

    populateTableRowActionsModal(trigger!);

    const modal = document.getElementById("sales-row-actions-modal");
    expect(modal?.querySelector<HTMLAnchorElement>("[data-table-row-action-pdf]")?.hidden).toBe(
      true,
    );
    expect(
      modal?.querySelector<HTMLAnchorElement>("[data-table-row-action-details]")?.hidden,
    ).toBe(false);
  });

  it("initializes a single delegated click handler", () => {
    initTableRowActionModals();

    document.querySelector<HTMLElement>("[data-table-row-action-trigger]")?.click();

    expect(document.getElementById("sales-row-actions-modal-title")?.textContent).toBe(
      "Open actions for sale Acme",
    );
  });
});
