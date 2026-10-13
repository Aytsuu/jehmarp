import {
  isAdminOrderSortColumn,
  nextAdminOrderSort,
} from "@/lib/admin-dashboard/order-sort";
import { applyDashboardFragmentFormFilters } from "./dashboard-fragment-table";

function applyOrderSort(button: HTMLButtonElement) {
  const column = button.dataset.orderSort;
  if (!isAdminOrderSortColumn(column)) {
    return;
  }

  const page = button.closest("[data-admin-orders-page]");
  if (!(page instanceof HTMLElement)) {
    return;
  }

  const form = page.querySelector<HTMLFormElement>("[data-order-filter-form]");
  const sortInput = form?.querySelector<HTMLInputElement>("[data-order-sort-input]");
  const directionInput = form?.querySelector<HTMLInputElement>("[data-order-direction-input]");
  if (!form || !sortInput || !directionInput) {
    return;
  }

  const nextSort = nextAdminOrderSort(sortInput.value, directionInput.value, column);
  sortInput.value = nextSort.sort;
  directionInput.value = nextSort.direction;
  applyDashboardFragmentFormFilters(form);
}

let sortDelegationBound = false;

export function initAdminOrderSort() {
  if (sortDelegationBound) {
    return;
  }

  sortDelegationBound = true;
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("[data-order-sort]");
    if (!button) {
      return;
    }

    event.preventDefault();
    applyOrderSort(button);
  });
}
