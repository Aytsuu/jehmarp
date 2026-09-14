import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  initAdminOrderBulkPdf,
  syncOrderRowSelectionFromSelectAll,
} from "./admin-order-bulk-pdf";

function renderOrdersTable() {
  document.body.innerHTML = `
    <section id="admin-orders">
      <div data-interactive-table class="dashboard-interactive-table">
        <div class="order-management-toolbar">
          <div class="table-action-menu" id="admin-orders-document-menu">
            <button type="button" data-table-action-menu-trigger disabled>Document</button>
            <div hidden data-table-action-menu-content>
              <button type="button" data-action-menu-item data-action="bulk-sales-invoice-pdf">
                Sales Invoice
              </button>
            </div>
          </div>
        </div>
        <div data-order-table-shell>
          <table>
            <thead>
              <tr>
                <th>
                  <label class="dashboard-table__select-all">
                    <input type="checkbox" data-order-select-all />
                  </label>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <label class="dashboard-table__row-select">
                    <input
                      type="checkbox"
                      value="order-1"
                      data-order-row-checkbox
                      data-order-row-type="customer"
                    />
                  </label>
                </td>
              </tr>
              <tr>
                <td>
                  <label class="dashboard-table__row-select">
                    <input
                      type="checkbox"
                      value="order-2"
                      data-order-row-checkbox
                      data-order-row-type="agent"
                    />
                  </label>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  `;
}

function getDocumentTrigger() {
  return document.querySelector<HTMLButtonElement>(
    "#admin-orders-document-menu [data-table-action-menu-trigger]",
  );
}

function getMobileDocumentTrigger() {
  return document.querySelector<HTMLButtonElement>(
    "[data-order-document-modal-trigger]",
  );
}

function getRowCheckboxes() {
  return Array.from(
    document.querySelectorAll<HTMLInputElement>("[data-order-row-checkbox]"),
  );
}

describe("initAdminOrderBulkPdf", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("enables the document menu when a row checkbox is selected", () => {
    renderOrdersTable();
    initAdminOrderBulkPdf();

    const trigger = getDocumentTrigger();
    expect(trigger?.disabled).toBe(true);

    getRowCheckboxes()[0]!.checked = true;
    getRowCheckboxes()[0]!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(trigger?.disabled).toBe(false);
  });

  it("opens bulk pdf from the mobile documents modal when it is portaled outside the section", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    document.body.innerHTML = `
      <section id="admin-orders">
        <div data-order-table-shell>
          <input
            type="checkbox"
            value="order-1"
            data-order-row-checkbox
            data-order-row-type="customer"
            checked
          />
        </div>
      </section>
      <div id="order-documents-modal">
        <button type="button" data-dashboard-modal-close>Close</button>
        <button type="button" data-action-menu-item data-action="bulk-sales-invoice-pdf">
          Sales Invoice
        </button>
      </div>
    `;

    initAdminOrderBulkPdf();

    document.querySelector<HTMLButtonElement>("[data-action-menu-item]")?.click();

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining("/admin/orders/bulk-sales-invoice.pdf"),
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("enables the mobile document modal trigger when a row checkbox is selected", () => {
    document.body.innerHTML = `
      <section id="admin-orders">
        <button type="button" data-order-document-modal-trigger disabled>Document</button>
        <div id="order-documents-modal">
          <button type="button" data-action-menu-item data-action="bulk-order-slip-pdf">
            Order Slip
          </button>
        </div>
        <div class="table-action-menu" id="admin-orders-document-menu">
          <button type="button" data-table-action-menu-trigger disabled>Document</button>
        </div>
        <div data-order-table-shell>
          <input
            type="checkbox"
            value="order-1"
            data-order-row-checkbox
            data-order-row-type="customer"
          />
        </div>
      </section>
    `;

    initAdminOrderBulkPdf();

    const mobileTrigger = getMobileDocumentTrigger();
    expect(mobileTrigger?.disabled).toBe(true);

    const rowCheckbox = document.querySelector<HTMLInputElement>("[data-order-row-checkbox]")!;
    rowCheckbox.checked = true;
    rowCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

    expect(mobileTrigger?.disabled).toBe(false);
    expect(getDocumentTrigger()?.disabled).toBe(false);
  });

  it("selects every row when the header checkbox is toggled", () => {
    renderOrdersTable();
    initAdminOrderBulkPdf();

    const selectAll = document.querySelector<HTMLInputElement>("[data-order-select-all]")!;
    selectAll.checked = true;
    selectAll.dispatchEvent(new Event("change", { bubbles: true }));

    expect(getRowCheckboxes().every((checkbox) => checkbox.checked)).toBe(true);
    expect(getDocumentTrigger()?.disabled).toBe(false);
  });

  it("clears every row when the header checkbox is unchecked", () => {
    renderOrdersTable();
    initAdminOrderBulkPdf();

    const selectAll = document.querySelector<HTMLInputElement>("[data-order-select-all]")!;

    selectAll.checked = true;
    selectAll.dispatchEvent(new Event("change", { bubbles: true }));
    selectAll.checked = false;
    selectAll.dispatchEvent(new Event("change", { bubbles: true }));

    expect(getRowCheckboxes().every((checkbox) => !checkbox.checked)).toBe(true);
    expect(getDocumentTrigger()?.disabled).toBe(true);
  });

  it("keeps the document menu wired after the toolbar trigger is replaced", () => {
    renderOrdersTable();
    initAdminOrderBulkPdf();

    const menu = document.querySelector("#admin-orders-document-menu")!;
    const replacement = document.createElement("button");
    replacement.type = "button";
    replacement.setAttribute("data-table-action-menu-trigger", "");
    replacement.disabled = true;
    replacement.textContent = "Document";
    menu.querySelector("[data-table-action-menu-trigger]")?.replaceWith(replacement);

    getRowCheckboxes()[0]!.checked = true;
    getRowCheckboxes()[0]!.dispatchEvent(new Event("change", { bubbles: true }));

    expect(replacement.disabled).toBe(false);
  });

  it("ignores checkboxes outside the orders table shell", () => {
    document.body.innerHTML = `
      <section id="admin-orders">
        <input type="checkbox" data-order-row-checkbox value="outside" />
        <div id="admin-orders-document-menu">
          <button type="button" data-table-action-menu-trigger disabled>Document</button>
        </div>
        <div data-order-table-shell>
          <input type="checkbox" data-order-row-checkbox value="inside" data-order-row-type="customer" />
        </div>
      </section>
    `;

    initAdminOrderBulkPdf();

    const outsideCheckbox = document.querySelector<HTMLInputElement>('[value="outside"]')!;
    outsideCheckbox.checked = true;
    outsideCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

    expect(getDocumentTrigger()?.disabled).toBe(true);

    const insideCheckbox = document.querySelector<HTMLInputElement>('[value="inside"]')!;
    insideCheckbox.checked = true;
    insideCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

    expect(getDocumentTrigger()?.disabled).toBe(false);
  });

  it("rebinds listeners when initialization runs again after a table swap", () => {
    renderOrdersTable();
    initAdminOrderBulkPdf();

    const tableShell = document.querySelector("[data-order-table-shell]")!;
    tableShell.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>
              <label class="dashboard-table__select-all">
                <input type="checkbox" data-order-select-all />
              </label>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <input
                type="checkbox"
                value="order-3"
                data-order-row-checkbox
                data-order-row-type="customer"
              />
            </td>
          </tr>
        </tbody>
      </table>
    `;

    initAdminOrderBulkPdf();

    const rowCheckbox = document.querySelector<HTMLInputElement>('[value="order-3"]')!;
    rowCheckbox.checked = true;
    rowCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

    expect(getDocumentTrigger()?.disabled).toBe(false);
  });

  it("keeps checkbox selection working after the orders section is replaced", () => {
    renderOrdersTable();
    initAdminOrderBulkPdf();

    const oldSection = document.querySelector("#admin-orders")!;
    const replacement = document.createElement("section");
    replacement.id = "admin-orders";
    replacement.innerHTML = `
      <div id="admin-orders-document-menu">
        <button type="button" data-table-action-menu-trigger disabled>Document</button>
      </div>
      <div data-order-table-shell>
        <input
          type="checkbox"
          value="order-4"
          data-order-row-checkbox
          data-order-row-type="customer"
        />
      </div>
    `;
    oldSection.replaceWith(replacement);

    initAdminOrderBulkPdf();

    const rowCheckbox = document.querySelector<HTMLInputElement>('[value="order-4"]')!;
    rowCheckbox.checked = true;
    rowCheckbox.dispatchEvent(new Event("change", { bubbles: true }));

    expect(getDocumentTrigger()?.disabled).toBe(false);
  });
});

describe("syncOrderRowSelectionFromSelectAll", () => {
  it("mirrors the header checkbox state onto enabled row checkboxes", () => {
    document.body.innerHTML = `
      <section>
        <input type="checkbox" data-order-select-all checked />
        <input type="checkbox" data-order-row-checkbox value="one" />
        <input type="checkbox" data-order-row-checkbox value="two" disabled checked />
      </section>
    `;

    const section = document.querySelector("section")!;
    const selectAll = section.querySelector<HTMLInputElement>("[data-order-select-all]")!;

    syncOrderRowSelectionFromSelectAll(section, selectAll);

    const enabledRow = section.querySelector<HTMLInputElement>(
      '[data-order-row-checkbox]:not(:disabled)',
    );
    const disabledRow = section.querySelector<HTMLInputElement>(
      "[data-order-row-checkbox]:disabled",
    );

    expect(enabledRow?.checked).toBe(true);
    expect(disabledRow?.checked).toBe(true);
  });
});
