import { beforeEach, describe, expect, it } from "vitest";

import {
  clearOrderFilterPopover,
  closeOrderFilterPopover,
  initOrderFilterPopover,
  openOrderFilterPopover,
  syncOrderFilterTriggerState,
  toggleOrderFilterPopover,
} from "./order-filter-popover";

describe("order-filter-popover", () => {
  beforeEach(() => {
    (window as Window & { orderFilterPopoverInitialized?: boolean }).orderFilterPopoverInitialized = false;

    document.body.innerHTML = `
      <form data-order-filter-form>
        <input name="search" data-order-search-input value="" />
        <div data-order-filter-popover-root>
          <button
            type="button"
            data-order-filter-popover-trigger
            aria-expanded="false"
            aria-controls="order-filters-popover"
          >
            <span data-order-filter-popover-badge hidden></span>
          </button>
          <div
            id="order-filters-popover"
            data-order-filter-popover
            hidden
          >
            <button type="button" data-order-filter-popover-close aria-label="Close filters">
              <svg><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <select name="source" data-order-filter-field="source">
              <option value="">All sources</option>
              <option value="admin">Admin</option>
              <option value="agent">Agent</option>
            </select>
            <select name="orderStatus" data-order-filter-field="orderStatus">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
            </select>
            <select name="paymentStatus" data-order-filter-field="paymentStatus">
              <option value="">All payment statuses</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </select>
            <button type="button" data-order-filter-popover-clear>Clear</button>
          </div>
        </div>
      </form>
    `;
  });

  it("opens and closes the popover properly", () => {
    const popover = document.querySelector<HTMLElement>("[data-order-filter-popover]")!;
    const trigger = document.querySelector<HTMLElement>("[data-order-filter-popover-trigger]")!;

    expect(popover.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    openOrderFilterPopover();

    expect(popover.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    closeOrderFilterPopover();

    expect(popover.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("toggles the popover open and closed", () => {
    const popover = document.querySelector<HTMLElement>("[data-order-filter-popover]")!;
    const trigger = document.querySelector<HTMLElement>("[data-order-filter-popover-trigger]")!;

    toggleOrderFilterPopover();
    expect(popover.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    toggleOrderFilterPopover();
    expect(popover.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("syncs trigger active state and badge based on active filter count", () => {
    const trigger = document.querySelector<HTMLElement>("[data-order-filter-popover-trigger]")!;
    const badge = document.querySelector<HTMLElement>("[data-order-filter-popover-badge]")!;
    const sourceField = document.querySelector<HTMLSelectElement>('[data-order-filter-field="source"]')!;
    const statusField = document.querySelector<HTMLSelectElement>('[data-order-filter-field="orderStatus"]')!;
    const paymentField = document.querySelector<HTMLSelectElement>('[data-order-filter-field="paymentStatus"]')!;

    syncOrderFilterTriggerState();
    expect(trigger.classList.contains("is-active")).toBe(false);
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
    expect(badge.hidden).toBe(true);

    sourceField.value = "admin";
    syncOrderFilterTriggerState();
    expect(trigger.classList.contains("is-active")).toBe(true);
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe("1");

    statusField.value = "pending";
    paymentField.value = "unpaid";
    syncOrderFilterTriggerState();
    expect(badge.textContent).toBe("3");
  });

  it("clears all filter fields and dispatches change event", () => {
    const sourceField = document.querySelector<HTMLSelectElement>('[data-order-filter-field="source"]')!;
    const statusField = document.querySelector<HTMLSelectElement>('[data-order-filter-field="orderStatus"]')!;
    const paymentField = document.querySelector<HTMLSelectElement>('[data-order-filter-field="paymentStatus"]')!;
    const badge = document.querySelector<HTMLElement>("[data-order-filter-popover-badge]")!;

    sourceField.value = "admin";
    statusField.value = "pending";
    paymentField.value = "paid";
    syncOrderFilterTriggerState();
    expect(badge.textContent).toBe("3");

    let changeFired = false;
    sourceField.addEventListener("change", () => {
      changeFired = true;
    });

    clearOrderFilterPopover();

    expect(sourceField.value).toBe("");
    expect(statusField.value).toBe("");
    expect(paymentField.value).toBe("");
    expect(changeFired).toBe(true);
    expect(badge.hidden).toBe(true);
  });

  it("delegates click and escape interactions with initOrderFilterPopover", () => {
    initOrderFilterPopover();

    const trigger = document.querySelector<HTMLElement>("[data-order-filter-popover-trigger]")!;
    const popover = document.querySelector<HTMLElement>("[data-order-filter-popover]")!;
    const closeBtn = document.querySelector<HTMLElement>("[data-order-filter-popover-close]")!;

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
    const sourceField = document.querySelector<HTMLSelectElement>('[data-order-filter-field="source"]')!;
    sourceField.value = "admin";
    syncOrderFilterTriggerState();
    expect(trigger.classList.contains("is-active")).toBe(true);

    trigger.click();
    expect(popover.hidden).toBe(false);
    const clearBtn = document.querySelector<HTMLElement>("[data-order-filter-popover-clear]")!;
    clearBtn.click();
    expect(sourceField.value).toBe("");
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
