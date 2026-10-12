import { beforeEach, describe, expect, it } from "vitest";

import {
  clearDashboardFilterPopover,
  closeDashboardFilterPopover,
  defaultDashboardFilterPopoverConfigs,
  initDashboardFilterPopovers,
  openDashboardFilterPopover,
  salesFilterPopoverConfig,
  syncDashboardFilterPopoverTriggerState,
  toggleDashboardFilterPopover,
} from "./dashboard-filter-popover";

describe("dashboard-filter-popover", () => {
  beforeEach(() => {
    (
      window as Window & { dashboardFilterPopoversInitialized?: boolean }
    ).dashboardFilterPopoversInitialized = false;

    document.body.innerHTML = `
      <form data-sales-filter-form>
        <input name="search" data-sales-search-input value="" />
        <div data-sales-filter-popover-root>
          <button
            type="button"
            data-sales-filter-popover-trigger
            aria-expanded="false"
            aria-controls="sales-filters-popover"
          >
            <span data-sales-filter-popover-badge hidden></span>
          </button>
          <div
            id="sales-filters-popover"
            data-sales-filter-popover
            hidden
          >
            <button type="button" data-sales-filter-popover-close aria-label="Close filters">
              <svg><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <select name="source" data-sales-filter-field="source">
              <option value="">All sources</option>
              <option value="admin">Admin</option>
              <option value="agent">Agent</option>
            </select>
            <button type="button" data-sales-filter-popover-clear>Clear</button>
          </div>
        </div>
      </form>

      <form data-customer-filter-form>
        <input name="search" data-customer-search-input value="" />
        <div data-customer-filter-popover-root>
          <button
            type="button"
            data-customer-filter-popover-trigger
            aria-expanded="false"
          >
            <span data-customer-filter-popover-badge hidden></span>
          </button>
          <div data-customer-filter-popover hidden>
            <button type="button" data-customer-filter-popover-close aria-label="Close filters">X</button>
            <select name="customerType" data-customer-filter-field="customerType">
              <option value="">All types</option>
              <option value="reseller">Reseller</option>
              <option value="retail">Retail</option>
            </select>
            <button type="button" data-customer-filter-popover-clear>Clear</button>
          </div>
        </div>
      </form>
    `;
  });

  it("opens, closes, and toggles popovers properly", () => {
    const popover = document.querySelector<HTMLElement>("[data-sales-filter-popover]")!;
    const trigger = document.querySelector<HTMLElement>("[data-sales-filter-popover-trigger]")!;

    expect(popover.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    openDashboardFilterPopover(salesFilterPopoverConfig);
    expect(popover.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    closeDashboardFilterPopover(salesFilterPopoverConfig);
    expect(popover.hidden).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    toggleDashboardFilterPopover(salesFilterPopoverConfig);
    expect(popover.hidden).toBe(false);

    toggleDashboardFilterPopover(salesFilterPopoverConfig);
    expect(popover.hidden).toBe(true);
  });

  it("syncs trigger active state and badge based on active filter count", () => {
    const trigger = document.querySelector<HTMLElement>("[data-sales-filter-popover-trigger]")!;
    const badge = document.querySelector<HTMLElement>("[data-sales-filter-popover-badge]")!;
    const sourceField = document.querySelector<HTMLSelectElement>('[data-sales-filter-field="source"]')!;

    syncDashboardFilterPopoverTriggerState(salesFilterPopoverConfig);
    expect(trigger.classList.contains("is-active")).toBe(false);
    expect(trigger.getAttribute("aria-pressed")).toBe("false");
    expect(badge.hidden).toBe(true);

    sourceField.value = "admin";
    syncDashboardFilterPopoverTriggerState(salesFilterPopoverConfig);
    expect(trigger.classList.contains("is-active")).toBe(true);
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
    expect(badge.hidden).toBe(false);
    expect(badge.textContent).toBe("1");

    sourceField.value = "";
    syncDashboardFilterPopoverTriggerState(salesFilterPopoverConfig);
    expect(trigger.classList.contains("is-active")).toBe(false);
    expect(badge.hidden).toBe(true);
  });

  it("clears filter fields and dispatches change event", () => {
    const sourceField = document.querySelector<HTMLSelectElement>('[data-sales-filter-field="source"]')!;
    const badge = document.querySelector<HTMLElement>("[data-sales-filter-popover-badge]")!;

    sourceField.value = "admin";
    syncDashboardFilterPopoverTriggerState(salesFilterPopoverConfig);
    expect(badge.textContent).toBe("1");

    let changeFired = false;
    sourceField.addEventListener("change", () => {
      changeFired = true;
    });

    clearDashboardFilterPopover(salesFilterPopoverConfig);
    expect(sourceField.value).toBe("");
    expect(changeFired).toBe(true);
    expect(badge.hidden).toBe(true);
  });

  it("delegates click, clear, and escape across multiple dashboard filter popovers", () => {
    initDashboardFilterPopovers();

    const salesTrigger = document.querySelector<HTMLElement>("[data-sales-filter-popover-trigger]")!;
    const salesPopover = document.querySelector<HTMLElement>("[data-sales-filter-popover]")!;
    const salesClose = document.querySelector<HTMLElement>("[data-sales-filter-popover-close]")!;
    const salesClear = document.querySelector<HTMLElement>("[data-sales-filter-popover-clear]")!;
    const salesSource = document.querySelector<HTMLSelectElement>('[data-sales-filter-field="source"]')!;

    const customerTrigger = document.querySelector<HTMLElement>("[data-customer-filter-popover-trigger]")!;
    const customerPopover = document.querySelector<HTMLElement>("[data-customer-filter-popover]")!;
    const customerField = document.querySelector<HTMLSelectElement>('[data-customer-filter-field="customerType"]')!;

    // Open sales popover via trigger click
    salesTrigger.click();
    expect(salesPopover.hidden).toBe(false);

    // Close via close button
    salesClose.click();
    expect(salesPopover.hidden).toBe(true);

    // Open again, test nested svg click in close button
    salesTrigger.click();
    expect(salesPopover.hidden).toBe(false);
    const line = salesClose.querySelector("line")!;
    line.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(salesPopover.hidden).toBe(true);

    // Set value and clear via clear button
    salesSource.value = "admin";
    syncDashboardFilterPopoverTriggerState(salesFilterPopoverConfig);
    expect(salesTrigger.classList.contains("is-active")).toBe(true);

    salesTrigger.click();
    salesClear.click();
    expect(salesSource.value).toBe("");
    expect(salesTrigger.classList.contains("is-active")).toBe(false);

    // Test second popover (customers)
    customerTrigger.click();
    expect(customerPopover.hidden).toBe(false);

    // Escape closes customer popover
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(customerPopover.hidden).toBe(true);

    // Outside click closes customer popover
    customerTrigger.click();
    expect(customerPopover.hidden).toBe(false);
    document.body.click();
    expect(customerPopover.hidden).toBe(true);
  });

  it("exports configurations for all 6 target pages", () => {
    expect(defaultDashboardFilterPopoverConfigs).toHaveLength(6);
    const names = defaultDashboardFilterPopoverConfigs.map((c) => c.fields[0]);
    expect(names).toEqual([
      "source",
      "balanceStatus",
      "customerType",
      "status",
      "status",
      "status",
    ]);
  });
});
