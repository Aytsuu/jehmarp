import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { initAdminProductSelection } from "./admin-product-selection";
import { initDashboardAlertDialogs } from "./dashboard-alert-dialog";

function renderProductsPage() {
  document.body.innerHTML = `
    <section data-admin-products-page>
      <button
        type="button"
        class="product-selection-delete"
        data-product-delete-selected
        data-open-alert-dialog="delete-products-dialog"
        data-alert-dialog-form="delete-products-form"
        hidden
      >
        Delete selected product(s)
      </button>
      <form id="delete-products-form" hidden>
        <input type="hidden" name="action" value="delete-products" />
        <div data-product-delete-id-fields></div>
        <button type="submit" hidden>Delete</button>
      </form>
      <div id="delete-products-dialog" data-alert-dialog="delete-products-dialog" data-alert-dialog-variant="danger">
        <div data-alert-dialog-panel tabindex="-1"></div>
        <p class="alert-dialog__description">Delete the selected products? This cannot be undone.</p>
        <button type="button" data-alert-dialog-cancel>Cancel</button>
        <button type="button" data-alert-dialog-confirm>Delete</button>
      </div>
      <div data-product-table-shell>
        <input type="checkbox" data-product-select-all />
        <input
          type="checkbox"
          value="4f65578f-3f1f-4216-9fc2-013ef06661d1"
          data-product-row-checkbox
          data-product-name="Pork Belly"
        />
        <input
          type="checkbox"
          value="9ad456ad-1d2e-41b2-b297-8ddf6304ece0"
          data-product-row-checkbox
          data-product-name="Chicken"
          data-product-referenced="true"
        />
      </div>
    </section>
  `;
}

function page() {
  const section = document.querySelector<HTMLElement>("[data-admin-products-page]");
  if (!section) {
    throw new Error("Products page was not rendered.");
  }

  return section;
}

function rows() {
  return Array.from(page().querySelectorAll<HTMLInputElement>("[data-product-row-checkbox]"));
}

function selectAll() {
  const checkbox = page().querySelector<HTMLInputElement>("[data-product-select-all]");
  if (!checkbox) {
    throw new Error("Select-all checkbox was not rendered.");
  }

  return checkbox;
}

function deleteButton() {
  const button = page().querySelector<HTMLButtonElement>("[data-product-delete-selected]");
  if (!button) {
    throw new Error("Delete button was not rendered.");
  }

  return button;
}

function description() {
  return document.querySelector(".alert-dialog__description");
}

function confirmButton() {
  return document.querySelector<HTMLButtonElement>("[data-alert-dialog-confirm]");
}

function change(checkbox: HTMLInputElement, checked: boolean) {
  checkbox.checked = checked;
  checkbox.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("admin product selection", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    renderProductsPage();
    initDashboardAlertDialogs();
    initAdminProductSelection();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("selects every product on the page and shows the delete control", () => {
    expect(deleteButton().hidden).toBe(true);

    change(selectAll(), true);

    expect(rows().every((checkbox) => checkbox.checked)).toBe(true);
    expect(deleteButton().hidden).toBe(false);
  });

  it("marks the header checkbox as partial and hides delete when the page is cleared", () => {
    change(selectAll(), true);
    change(rows()[0]!, false);

    expect(selectAll().checked).toBe(false);
    expect(selectAll().indeterminate).toBe(true);
    expect(deleteButton().hidden).toBe(false);

    change(rows()[1]!, false);

    expect(selectAll().indeterminate).toBe(false);
    expect(deleteButton().hidden).toBe(true);
  });

  it("asks for confirmation and keeps products that are already on an order", () => {
    change(selectAll(), true);
    deleteButton().click();

    expect(document.getElementById("delete-products-dialog")?.classList.contains("alert-dialog--open")).toBe(true);
    expect(description()?.textContent).toContain("Chicken");
    expect(description()?.textContent).toContain("will be kept");
    expect(confirmButton()?.disabled).toBe(false);
    expect(
      Array.from(document.querySelectorAll<HTMLInputElement>("[data-product-delete-id-fields] input")).map((input) => input.value),
    ).toEqual(["4f65578f-3f1f-4216-9fc2-013ef06661d1"]);
  });

  it("blocks confirmation when every selected product is on an order", () => {
    change(rows()[1]!, true);
    deleteButton().click();

    expect(description()?.textContent).toContain("cannot be deleted");
    expect(confirmButton()?.disabled).toBe(true);
    expect(document.querySelectorAll("[data-product-delete-id-fields] input")).toHaveLength(0);
  });

  it("hides the delete control when the product table is replaced", async () => {
    change(rows()[0]!, true);
    expect(deleteButton().hidden).toBe(false);

    const shell = page().querySelector("[data-product-table-shell]");
    if (!shell) {
      throw new Error("Product table shell was not rendered.");
    }

    shell.innerHTML = `<input type="checkbox" data-product-select-all /><input type="checkbox" data-product-row-checkbox value="new-product" data-product-name="Beef" />`;

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(deleteButton().hidden).toBe(true);
    expect(selectAll().checked).toBe(false);
  });
});
