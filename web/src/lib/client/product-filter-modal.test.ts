import { beforeEach, describe, expect, it } from "vitest";

import {
  applyProductFilterModal,
  clearProductFilterModal,
  syncProductFilterModalFromForm,
  syncProductFilterTriggerState,
} from "@/lib/client/product-filter-modal";

describe("product-filter-modal", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <form data-product-filter-form>
        <select name="stockStatus" data-product-filter-field="stockStatus">
          <option value="">All statuses</option>
          <option value="in_stock">In Stock</option>
        </select>
        <select name="category" data-product-filter-field="category">
          <option value="">All categories</option>
          <option value="pork">Pork</option>
        </select>
      </form>
      <button type="button" data-product-filter-modal-trigger></button>
      <div id="product-filters-modal">
        <button type="button" data-dashboard-modal-close></button>
        <select data-product-filter-field="stockStatus">
          <option value="">All statuses</option>
          <option value="in_stock">In Stock</option>
        </select>
        <select data-product-filter-field="category">
          <option value="">All categories</option>
          <option value="pork">Pork</option>
        </select>
        <button type="button" data-product-filter-modal-apply></button>
      </div>
    `;
  });

  it("syncs modal fields from the main filter form", () => {
    const form = document.querySelector<HTMLFormElement>("[data-product-filter-form]");
    const stockField = form?.querySelector<HTMLSelectElement>(
      '[data-product-filter-field="stockStatus"]',
    );
    const categoryField = form?.querySelector<HTMLSelectElement>(
      '[data-product-filter-field="category"]',
    );
    if (stockField) stockField.value = "in_stock";
    if (categoryField) categoryField.value = "pork";

    syncProductFilterModalFromForm();

    const modal = document.getElementById("product-filters-modal");
    expect(
      modal?.querySelector<HTMLSelectElement>('[data-product-filter-field="stockStatus"]')?.value,
    ).toBe("in_stock");
    expect(
      modal?.querySelector<HTMLSelectElement>('[data-product-filter-field="category"]')?.value,
    ).toBe("pork");
  });

  it("applies modal values back to the form", () => {
    const modal = document.getElementById("product-filters-modal");
    const modalStockField = modal?.querySelector<HTMLSelectElement>(
      '[data-product-filter-field="stockStatus"]',
    );
    if (modalStockField) modalStockField.value = "in_stock";

    let changeCount = 0;
    document
      .querySelector<HTMLSelectElement>('[data-product-filter-field="stockStatus"]')
      ?.addEventListener("change", () => {
        changeCount += 1;
      });

    applyProductFilterModal();

    const form = document.querySelector<HTMLFormElement>("[data-product-filter-form]");
    expect(
      form?.querySelector<HTMLSelectElement>('[data-product-filter-field="stockStatus"]')?.value,
    ).toBe("in_stock");
    expect(changeCount).toBe(1);
  });

  it("marks the filter trigger active when filters are set", () => {
    const form = document.querySelector<HTMLFormElement>("[data-product-filter-form]");
    const categoryField = form?.querySelector<HTMLSelectElement>(
      '[data-product-filter-field="category"]',
    );
    if (categoryField) categoryField.value = "pork";

    syncProductFilterTriggerState();

    const trigger = document.querySelector("[data-product-filter-modal-trigger]");
    expect(trigger?.classList.contains("is-active")).toBe(true);
    expect(trigger?.getAttribute("aria-pressed")).toBe("true");
  });

  it("clears filters through the modal", () => {
    const form = document.querySelector<HTMLFormElement>("[data-product-filter-form]");
    const categoryField = form?.querySelector<HTMLSelectElement>(
      '[data-product-filter-field="category"]',
    );
    if (categoryField) categoryField.value = "pork";

    clearProductFilterModal();

    expect(
      form?.querySelector<HTMLSelectElement>('[data-product-filter-field="category"]')?.value,
    ).toBe("");
  });
});
