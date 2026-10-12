const DELETE_DIALOG_ID = "delete-products-dialog";
const DELETE_FORM_ID = "delete-products-form";

type ProductCheckbox = HTMLInputElement & {
  dataset: DOMStringMap;
};

function getProductPage(element: Element) {
  const page = element.closest("[data-admin-products-page]");
  return page instanceof HTMLElement ? page : null;
}

function getRowCheckboxes(page: ParentNode) {
  return Array.from(
    page.querySelectorAll<ProductCheckbox>("[data-product-row-checkbox]"),
  );
}

function getSelectAllCheckbox(page: ParentNode) {
  return page.querySelector<HTMLInputElement>("[data-product-select-all]");
}

function getDeleteButtons(page: ParentNode) {
  return Array.from(page.querySelectorAll<HTMLButtonElement>("[data-product-delete-selected]"));
}

function selectedCheckboxes(page: ParentNode) {
  return getRowCheckboxes(page).filter((checkbox) => checkbox.checked);
}

export function updateProductSelectionUi(page: ParentNode) {
  const selectAllCheckbox = getSelectAllCheckbox(page);
  const rowCheckboxes = getRowCheckboxes(page);
  const checkedCount = rowCheckboxes.filter((checkbox) => checkbox.checked).length;
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = rowCheckboxes.length > 0 && checkedCount === rowCheckboxes.length;
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < rowCheckboxes.length;
  }

  getDeleteButtons(page).forEach((button) => {
    button.hidden = checkedCount === 0;
  });
}

function productName(checkbox: ProductCheckbox) {
  const name = checkbox.dataset.productName?.trim();
  return name && name.length > 0 ? name : "This product";
}

function isReferenced(checkbox: ProductCheckbox) {
  return checkbox.dataset.productReferenced === "true";
}

export function prepareProductDeleteConfirmation(page: ParentNode) {
  const selected = selectedCheckboxes(page);
  const referenced = selected.filter(isReferenced);
  const deletable = selected.filter((checkbox) => !isReferenced(checkbox));
  const dialog = document.getElementById(DELETE_DIALOG_ID);
  const form = document.getElementById(DELETE_FORM_ID);
  const description = dialog?.querySelector<HTMLElement>(".alert-dialog__description");
  const confirmButton = dialog?.querySelector<HTMLButtonElement>("[data-alert-dialog-confirm]");
  const fields = form?.querySelector<HTMLElement>("[data-product-delete-id-fields]");

  if (fields) {
    fields.replaceChildren();
    deletable.forEach((checkbox) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "productId";
      input.value = checkbox.value;
      fields.append(input);
    });
  }

  if (confirmButton) {
    confirmButton.disabled = deletable.length === 0;
  }

  if (!description) {
    return;
  }

  if (selected.length > 0 && referenced.length === selected.length) {
    description.textContent = `These products are on an order and cannot be deleted: ${referenced.map(productName).join(", ")}.`;
    return;
  }

  if (referenced.length > 0) {
    description.textContent = `These products are on an order and will be kept: ${referenced.map(productName).join(", ")}. The other selected products will be deleted. This cannot be undone.`;
    return;
  }

  description.textContent = "Delete the selected products? This cannot be undone.";
}

function handleSelectionChange(target: HTMLInputElement) {
  const page = getProductPage(target);
  if (!page) {
    return;
  }

  if (target.matches("[data-product-select-all]")) {
    const checked = target.checked;
    getRowCheckboxes(page).forEach((checkbox) => {
      checkbox.checked = checked;
    });
  }

  if (target.matches("[data-product-select-all], [data-product-row-checkbox]")) {
    updateProductSelectionUi(page);
  }
}

function handleDeleteClick(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const button = target.closest<HTMLButtonElement>("[data-product-delete-selected]");
  if (!button) {
    return;
  }

  const page = getProductPage(button);
  if (!page || selectedCheckboxes(page).length === 0) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  prepareProductDeleteConfirmation(page);
}

function observeProductPage(page: HTMLElement) {
  if (page.dataset.productSelectionObserved === "true") {
    updateProductSelectionUi(page);
    return;
  }

  const shell = page.querySelector("[data-product-table-shell]");
  if (!shell) {
    return;
  }

  page.dataset.productSelectionObserved = "true";
  const observer = new MutationObserver(() => {
    updateProductSelectionUi(page);
  });
  observer.observe(shell, { childList: true });
  updateProductSelectionUi(page);
}

let selectionDelegationBound = false;

export function initAdminProductSelection() {
  if (!selectionDelegationBound) {
    selectionDelegationBound = true;
    document.addEventListener("change", (event) => {
      if (event.target instanceof HTMLInputElement) {
        handleSelectionChange(event.target);
      }
    });
    document.addEventListener("click", handleDeleteClick, true);
  }

  document.querySelectorAll<HTMLElement>("[data-admin-products-page]").forEach(observeProductPage);
}
