import {
  isAdminProductSortColumn,
  nextAdminProductSort,
} from "@/lib/admin-dashboard/product-sort";
import { applyDashboardFragmentFormFilters } from "./dashboard-fragment-table";

function applyProductSort(button: HTMLButtonElement) {
  const column = button.dataset.productSort;
  if (!isAdminProductSortColumn(column)) {
    return;
  }

  const page = button.closest("[data-admin-products-page]");
  if (!(page instanceof HTMLElement)) {
    return;
  }

  const form = page.querySelector<HTMLFormElement>("[data-product-filter-form]");
  const sortInput = form?.querySelector<HTMLInputElement>("[data-product-sort-input]");
  const directionInput = form?.querySelector<HTMLInputElement>("[data-product-direction-input]");
  if (!form || !sortInput || !directionInput) {
    return;
  }

  const nextSort = nextAdminProductSort(sortInput.value, directionInput.value, column);
  sortInput.value = nextSort.sort;
  directionInput.value = nextSort.direction;
  applyDashboardFragmentFormFilters(form);
}

let sortDelegationBound = false;

export function initAdminProductSort() {
  if (sortDelegationBound) {
    return;
  }

  sortDelegationBound = true;
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("[data-product-sort]");
    if (!button) {
      return;
    }

    event.preventDefault();
    applyProductSort(button);
  });
}
