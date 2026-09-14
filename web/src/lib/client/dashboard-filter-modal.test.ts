import { beforeEach, describe, expect, it } from "vitest";

import {
  applyDashboardFilterModal,
  clearDashboardFilterModal,
  getDashboardFilterModalConfigs,
  syncDashboardFilterModalFromForm,
  syncDashboardFilterTriggerState,
} from "@/lib/client/dashboard-filter-modal";

describe("dashboard-filter-modal", () => {
  const orderConfig = getDashboardFilterModalConfigs().find(
    (config) => config.modalId === "order-filters-modal",
  )!;

  beforeEach(() => {
    document.body.innerHTML = `
      <form data-order-filter-form>
        <select name="source" data-order-filter-field="source">
          <option value="">All sources</option>
          <option value="admin">Admin</option>
        </select>
        <select name="orderStatus" data-order-filter-field="orderStatus">
          <option value="">All order statuses</option>
          <option value="pending">Pending</option>
        </select>
        <select name="paymentStatus" data-order-filter-field="paymentStatus">
          <option value="">All payment statuses</option>
          <option value="paid">Paid</option>
        </select>
      </form>
      <button type="button" data-order-filter-modal-trigger></button>
      <div id="order-filters-modal">
        <button type="button" data-dashboard-modal-close></button>
        <select data-order-filter-field="source">
          <option value="">All sources</option>
          <option value="admin">Admin</option>
        </select>
        <select data-order-filter-field="orderStatus">
          <option value="">All order statuses</option>
          <option value="pending">Pending</option>
        </select>
        <select data-order-filter-field="paymentStatus">
          <option value="">All payment statuses</option>
          <option value="paid">Paid</option>
        </select>
        <button type="button" data-order-filter-modal-apply></button>
      </div>
    `;
  });

  it("syncs order modal fields from the main filter form", () => {
    const form = document.querySelector<HTMLFormElement>("[data-order-filter-form]");
    const sourceField = form?.querySelector<HTMLSelectElement>(
      '[data-order-filter-field="source"]',
    );
    const orderStatusField = form?.querySelector<HTMLSelectElement>(
      '[data-order-filter-field="orderStatus"]',
    );
    if (sourceField) sourceField.value = "admin";
    if (orderStatusField) orderStatusField.value = "pending";

    syncDashboardFilterModalFromForm(orderConfig);

    const modal = document.getElementById("order-filters-modal");
    expect(
      modal?.querySelector<HTMLSelectElement>('[data-order-filter-field="source"]')?.value,
    ).toBe("admin");
    expect(
      modal?.querySelector<HTMLSelectElement>('[data-order-filter-field="orderStatus"]')?.value,
    ).toBe("pending");
  });

  it("applies order modal values back to the form", () => {
    const modal = document.getElementById("order-filters-modal");
    const paymentField = modal?.querySelector<HTMLSelectElement>(
      '[data-order-filter-field="paymentStatus"]',
    );
    if (paymentField) paymentField.value = "paid";

    let changeCount = 0;
    document
      .querySelector<HTMLSelectElement>('[data-order-filter-field="source"]')
      ?.addEventListener("change", () => {
        changeCount += 1;
      });

    applyDashboardFilterModal(orderConfig);

    const form = document.querySelector<HTMLFormElement>("[data-order-filter-form]");
    expect(
      form?.querySelector<HTMLSelectElement>('[data-order-filter-field="paymentStatus"]')?.value,
    ).toBe("paid");
    expect(changeCount).toBe(1);
  });

  it("marks the order filter trigger active when filters are set", () => {
    const form = document.querySelector<HTMLFormElement>("[data-order-filter-form]");
    const sourceField = form?.querySelector<HTMLSelectElement>(
      '[data-order-filter-field="source"]',
    );
    if (sourceField) sourceField.value = "admin";

    syncDashboardFilterTriggerState(orderConfig);

    const trigger = document.querySelector("[data-order-filter-modal-trigger]");
    expect(trigger?.classList.contains("is-active")).toBe(true);
    expect(trigger?.getAttribute("aria-pressed")).toBe("true");
  });

  it("clears order filters through the modal", () => {
    const form = document.querySelector<HTMLFormElement>("[data-order-filter-form]");
    const sourceField = form?.querySelector<HTMLSelectElement>(
      '[data-order-filter-field="source"]',
    );
    if (sourceField) sourceField.value = "admin";

    clearDashboardFilterModal(orderConfig);

    expect(
      form?.querySelector<HTMLSelectElement>('[data-order-filter-field="source"]')?.value,
    ).toBe("");
  });
});
