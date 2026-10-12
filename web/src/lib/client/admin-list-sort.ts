import { applyDashboardFragmentFormFilters } from "./dashboard-fragment-table";

type AdminListSortBinding<T extends string> = {
  buttonSelector: string;
  pageSelector: string;
  formSelector: string;
  sortInputSelector: string;
  directionInputSelector: string;
  readColumn: (button: HTMLButtonElement) => string | undefined;
  isColumn: (value: string | undefined) => value is T;
  nextSort: (
    currentSort: string,
    currentDirection: string,
    column: T,
  ) => { sort: string; direction: string };
};

const boundSelectors = new Set<string>();

export function initAdminListSort<T extends string>(binding: AdminListSortBinding<T>) {
  if (boundSelectors.has(binding.buttonSelector)) return;
  boundSelectors.add(binding.buttonSelector);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest<HTMLButtonElement>(binding.buttonSelector);
    if (!button) return;

    event.preventDefault();
    const column = binding.readColumn(button);
    if (!binding.isColumn(column)) return;

    const page = button.closest(binding.pageSelector);
    if (!(page instanceof HTMLElement)) return;

    const form = page.querySelector<HTMLFormElement>(binding.formSelector);
    const sortInput = form?.querySelector<HTMLInputElement>(binding.sortInputSelector);
    const directionInput = form?.querySelector<HTMLInputElement>(binding.directionInputSelector);
    if (!form || !sortInput || !directionInput) return;

    const nextSort = binding.nextSort(sortInput.value, directionInput.value, column);
    sortInput.value = nextSort.sort;
    directionInput.value = nextSort.direction;
    applyDashboardFragmentFormFilters(form);
  });
}
