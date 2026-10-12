import { beforeEach, describe, expect, it } from "vitest";

import {
  applyProductFilterPopover,
  clearProductFilterPopover,
  closeProductFilterPopover,
  initProductFilterPopover,
  openProductFilterPopover,
  syncProductFilterTriggerState,
  toggleProductFilterPopover,
} from "./product-filter-popover";

describe("product-filter-popover", () => {
  beforeEach(() => {
    (window as Window & { productFilterPopoverInitialized?: boolean }).productFilterPopoverInitialized = false;

    document.body.innerHTML = `
      <form data-product-filter-form>
        <input name="search" data-product-search-input value="" />
        <div data-product-filter-popover-container>
          <button
            type="button"
            data-product-filter-popover-trigger
            aria-expanded="false"
            aria-controls="product-filters-popover"
          >
            <span data-product-filter-badge hidden></span>
          </button>
          <div
            id="product-filters-popover"
            data-product-filter-popover
            hidden
          >
            <button type="button" data-product-filter-popover-close aria-label="Close filters">
              <svg><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <select name="stockStatus" data-product-filter-field="stockStatus">
              <option value="">All statuses</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
            </select>
            <select name="category" data-product-filter-field="category">
              <option value="">All categories</option>
              <option value="chicken">Chicken</option>
              <option value="pork">Pork</option>
            </select>
            <button type="button" data-product-filter-popover-clear>Clear</button>
          </div>
        </div>
      </form>
    `;
  });

  it("opens and closes the popover properly", () => {
    const popover = document.querySelector<HTMLElement>("[data-product-filter-popover]")!;
    const trigger = document.querySelector<HTMLElement>("[data-product-filter-popover-trigger]")!;

    expect(popover.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    openProductFilterPopover();

    expect(popover.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    closeProductFilterPopover();

    expect(popover.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles the popover open and closed", () => {
    const popover = document.querySelector<HTMLElement>("[data-product-filter-popover]")!;
    const trigger = document.querySelector<HTMLElement>("[data-product-filter-popover-trigger]")!;

    toggleProductFilterPopover();
    expect(popover.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    toggleProductFilterPopover();
    expect(popover.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("syncs trigger active state and badge based on active filter count", () => {
    const trigger = document.querySelector<HTMLElement>("[data-product-filter-popover-trigger]")!;
    const badge = document.querySelector<HTMLElement>("[data-product-filter-badge]")!;
    const stockField = document.querySelector<HTMLSelectElement>('[data-product-filter-field="stockStatus"]')!;
    const categoryField = document.querySelector<HTMLSelectElement>('[data-product-filter-field="category"]')!;

    syncProductFilterTriggerState();
    expect(trigger.classList.contains("is-active")).toBe(false);
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
    expect(badge.hidden).toBe(true);

    stockField.value = "in_stock";
    syncProductFilterTriggerState();
    expect(trigger.classList.contains("is-active")).toBe(true);
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe("1");

    categoryField.value = "pork";
    syncProductFilterTriggerState();
    expect(badge.textContent).toBe("2");
  });

  it("clears filters and dispatches change event", () => {
    const stockField = document.querySelector<HTMLSelectElement>('[data-product-filter-field="stockStatus"]')!;
    const categoryField = document.querySelector<HTMLSelectElement>('[data-product-filter-field="category"]')!;
    stockField.value = "in_stock";
    categoryField.value = "chicken";

    let changeDispatched = 0;
    stockField.addEventListener("change", () => {
      changeDispatched += 1;
    });

    clearProductFilterPopover();

    expect(stockField.value).toBe("");
    expect(categoryField.value).toBe("");
    expect(changeDispatched).toBe(1);

    const trigger = document.querySelector<HTMLElement>("[data-product-filter-popover-trigger]")!;
    expect(trigger.classList.contains("is-active")).toBe(false);
  });

  it("applies filters, dispatches change event, and closes popover", () => {
    const popover = document.querySelector<HTMLElement>("[data-product-filter-popover]")!;
    const stockField = document.querySelector<HTMLSelectElement>('[data-product-filter-field="stockStatus"]')!;
    stockField.value = "low_stock";

    openProductFilterPopover();
    expect(popover.hidden).toBe(false);

    let changeDispatched = 0;
    stockField.addEventListener("change", () => {
      changeDispatched += 1;
    });

    applyProductFilterPopover();

    expect(changeDispatched).toBe(1);
    expect(popover.hidden).toBe(true);
    const trigger = document.querySelector<HTMLElement>("[data-product-filter-popover-trigger]")!;
    expect(trigger.classList.contains("is-active")).toBe(true);
  });

  it("delegates click and escape interactions with initProductFilterPopover", () => {
    initProductFilterPopover();

    const trigger = document.querySelector<HTMLElement>("[data-product-filter-popover-trigger]")!;
    const popover = document.querySelector<HTMLElement>("[data-product-filter-popover]")!;
    const closeBtn = document.querySelector<HTMLElement>("[data-product-filter-popover-close]")!;

    // Open by clicking trigger
    trigger.click();
    expect(popover.hidden).toBe(false);

    // Close with close button
    closeBtn.click();
    expect(popover.hidden).toBe(true);

    // Close when clicking directly on nested SVG line inside close button
    trigger.click();
    expect(popover.hidden).toBe(false);
    const closeSvgLine = closeBtn.querySelector("line")!;
    closeSvgLine.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(popover.hidden).toBe(true);

    // Clicking Clear button via delegation clears fields and syncs state
    const stockField = document.querySelector<HTMLSelectElement>('[data-product-filter-field="stockStatus"]')!;
    stockField.value = "in_stock";
    syncProductFilterTriggerState();
    expect(trigger.classList.contains("is-active")).toBe(true);

    trigger.click();
    expect(popover.hidden).toBe(false);
    const clearBtn = document.querySelector<HTMLElement>("[data-product-filter-popover-clear]")!;
    clearBtn.click();
    expect(stockField.value).toBe("");
    expect(trigger.classList.contains("is-active")).toBe(false);
    expect(popover.hidden).toBe(false);

    // Close with Escape key while open
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(popover.hidden).toBe(true);

    // Open and close by clicking outside
    trigger.click();
    expect(popover.hidden).toBe(false);
    document.body.click();
    expect(popover.hidden).toBe(true);
  });
});
