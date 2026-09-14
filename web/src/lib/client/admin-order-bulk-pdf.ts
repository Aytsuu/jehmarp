import {
  closeActiveTableActionMenu,
  getPortaledMenuContent,
} from "@/lib/client/table-action-menu";

type BulkOrderPdfKind = "sales-invoice" | "order-slip";

const bulkPdfEndpoints: Record<BulkOrderPdfKind, string> = {
  "sales-invoice": "/admin/orders/bulk-sales-invoice.pdf",
  "order-slip": "/admin/orders/bulk-order-slip.pdf",
};

const bulkPdfActionMap: Record<string, BulkOrderPdfKind> = {
  "bulk-sales-invoice-pdf": "sales-invoice",
  "bulk-order-slip-pdf": "order-slip",
};

export const ORDER_SELECTION_CHANGED_EVENT = "dashboard:order-selection-changed";

type OrderBulkPdfSession = {
  abort: AbortController;
  refresh: () => void;
};

const orderBulkPdfSessions = new Map<string, OrderBulkPdfSession>();
let bulkPdfDelegationBound = false;

export type OrderBulkPdfInitOptions = {
  sectionSelector: string;
  menuTriggerSelector: string;
  mobileDocumentTriggerSelector?: string;
  checkboxRootSelector?: string;
  menuRootSelector?: string;
  mobileDocumentModalSelector?: string;
};

type RegisteredBulkPdfOptions = OrderBulkPdfInitOptions;

const registeredBulkPdfOptions = new Map<string, RegisteredBulkPdfOptions>();

export function syncOrderRowSelectionFromSelectAll(
  section: ParentNode,
  selectAll: HTMLInputElement,
) {
  const shouldSelectAll = selectAll.checked;

  section.querySelectorAll<HTMLInputElement>("[data-order-row-checkbox]:not(:disabled)").forEach(
    (checkbox) => {
      checkbox.checked = shouldSelectAll;
    },
  );

  selectAll.indeterminate = false;
}

function notifyOrderSelectionChanged(section: HTMLElement) {
  section.dispatchEvent(
    new CustomEvent(ORDER_SELECTION_CHANGED_EVENT, { bubbles: true }),
  );
}

function getSection(options: RegisteredBulkPdfOptions) {
  return document.querySelector<HTMLElement>(options.sectionSelector);
}

function getCheckboxRoot(options: RegisteredBulkPdfOptions) {
  if (options.checkboxRootSelector) {
    return document.querySelector<HTMLElement>(options.checkboxRootSelector)
      ?? getSection(options);
  }

  return getSection(options);
}

function getRowCheckboxes(options: RegisteredBulkPdfOptions) {
  const root = getCheckboxRoot(options);
  if (!root) return [];

  return Array.from(
    root.querySelectorAll<HTMLInputElement>("[data-order-row-checkbox]:not(:disabled)"),
  );
}

function getSelectAllCheckbox(options: RegisteredBulkPdfOptions) {
  return getCheckboxRoot(options)?.querySelector<HTMLInputElement>("[data-order-select-all]") ?? null;
}

function menuRootContainsTarget(menuRoot: HTMLElement, target: Element) {
  if (menuRoot.contains(target)) {
    return true;
  }

  if (!menuRoot.id) {
    return false;
  }

  const portaledContent = getPortaledMenuContent(menuRoot.id);
  return portaledContent?.contains(target) ?? false;
}

function getActionRoots(options: RegisteredBulkPdfOptions) {
  const roots: HTMLElement[] = [];

  if (options.menuRootSelector) {
    const menuRoot = document.querySelector<HTMLElement>(options.menuRootSelector);
    if (menuRoot) roots.push(menuRoot);
  }

  if (options.mobileDocumentModalSelector) {
    const modalRoot = document.querySelector<HTMLElement>(options.mobileDocumentModalSelector);
    if (modalRoot) roots.push(modalRoot);
  }

  if (roots.length === 0) {
    const fallback = document
      .querySelector<HTMLButtonElement>(options.menuTriggerSelector)
      ?.closest<HTMLElement>("[data-table-action-menu]");
    if (fallback) roots.push(fallback);
  }

  return roots;
}

function getDocumentActionTriggers(options: RegisteredBulkPdfOptions) {
  const triggers = getActionRoots(options)
    .map((root) => root.querySelector<HTMLButtonElement>("[data-table-action-menu-trigger]"))
    .filter((trigger): trigger is HTMLButtonElement => Boolean(trigger));

  const desktopTrigger = document.querySelector<HTMLButtonElement>(options.menuTriggerSelector);
  if (desktopTrigger && !triggers.includes(desktopTrigger)) {
    triggers.push(desktopTrigger);
  }

  if (options.mobileDocumentTriggerSelector) {
    const mobileTrigger = document.querySelector<HTMLButtonElement>(
      options.mobileDocumentTriggerSelector,
    );
    if (mobileTrigger && !triggers.includes(mobileTrigger)) {
      triggers.push(mobileTrigger);
    }
  }

  return triggers;
}

function getSelectedSelections(options: RegisteredBulkPdfOptions) {
  return getRowCheckboxes(options)
    .filter((checkbox) => checkbox.checked)
    .map((checkbox) => `${checkbox.dataset.orderRowType}:${checkbox.value}`);
}

function updateDocumentMenuState(options: RegisteredBulkPdfOptions) {
  const hasSelection = getSelectedSelections(options).length > 0;

  getDocumentActionTriggers(options).forEach((trigger) => {
    trigger.disabled = !hasSelection;
  });
}

function updateSelectAllState(options: RegisteredBulkPdfOptions) {
  const selectAllCheckbox = getSelectAllCheckbox(options);
  if (!selectAllCheckbox) return;

  const rowCheckboxes = getRowCheckboxes(options);
  const checkedCount = rowCheckboxes.filter((checkbox) => checkbox.checked).length;

  selectAllCheckbox.checked = rowCheckboxes.length > 0 && checkedCount === rowCheckboxes.length;
  selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < rowCheckboxes.length;
}

function refreshSelectionUi(options: RegisteredBulkPdfOptions) {
  const section = getSection(options);
  if (!section) return;

  updateDocumentMenuState(options);
  updateSelectAllState(options);
  notifyOrderSelectionChanged(section);
}

function resetSelection(options: RegisteredBulkPdfOptions) {
  const section = getSection(options);
  if (!section) return;

  getRowCheckboxes(options).forEach((checkbox) => {
    checkbox.checked = false;
  });

  const selectAllCheckbox = getSelectAllCheckbox(options);
  if (selectAllCheckbox) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  }

  closeActiveTableActionMenu();
  refreshSelectionUi(options);
}

function handleSelectionChange(options: RegisteredBulkPdfOptions, target: HTMLInputElement) {
  if (target.matches("[data-order-row-checkbox]")) {
    refreshSelectionUi(options);
    return;
  }

  if (target.matches("[data-order-select-all]")) {
    const checkboxRoot = getCheckboxRoot(options);
    if (checkboxRoot) {
      syncOrderRowSelectionFromSelectAll(checkboxRoot, target);
    }
    refreshSelectionUi(options);
  }
}

function openBulkPdf(options: RegisteredBulkPdfOptions, kind: BulkOrderPdfKind) {
  const selections = getSelectedSelections(options);
  if (selections.length === 0) return;

  const params = new URLSearchParams();
  selections.forEach((selection) => {
    params.append("selection", selection);
  });

  window.open(`${bulkPdfEndpoints[kind]}?${params.toString()}`, "_blank", "noopener,noreferrer");
}

function closeMobileDocumentsModal(options: RegisteredBulkPdfOptions) {
  if (!options.mobileDocumentModalSelector) return;

  const modal = document.querySelector<HTMLElement>(options.mobileDocumentModalSelector);
  modal?.querySelector<HTMLElement>("[data-dashboard-modal-close]")?.click();
}

function resolveBulkPdfOptionsForElement(element: Element) {
  for (const options of registeredBulkPdfOptions.values()) {
    const section = getSection(options);
    if (section?.contains(element)) {
      return options;
    }
  }

  return null;
}

function bindBulkPdfDelegation() {
  if (bulkPdfDelegationBound) return;
  bulkPdfDelegationBound = true;

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    const options = resolveBulkPdfOptionsForElement(target);
    if (!options) return;

    if (
      !target.matches("[data-order-row-checkbox]") &&
      !target.matches("[data-order-select-all]")
    ) {
      return;
    }

    handleSelectionChange(options, target);
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    for (const options of registeredBulkPdfOptions.values()) {
      const actionRoots = getActionRoots(options);
      const matchingRoot = actionRoots.find((root) => menuRootContainsTarget(root, target));
      if (!matchingRoot) continue;

      const menuItem = target.closest<HTMLElement>("[data-action-menu-item]");
      if (!menuItem) continue;

      const action = menuItem.dataset.action;
      const kind = action ? bulkPdfActionMap[action] : undefined;
      if (!kind) return;

      openBulkPdf(options, kind);
      closeMobileDocumentsModal(options);
      closeActiveTableActionMenu();
      return;
    }
  });

  document.addEventListener("dashboard:interactive-table-updated", () => {
    for (const options of registeredBulkPdfOptions.values()) {
      if (!getSection(options)) continue;
      resetSelection(options);
    }
  });
}

export function initOrderBulkPdf(options: OrderBulkPdfInitOptions) {
  const section = document.querySelector<HTMLElement>(options.sectionSelector);
  if (!section) return;

  registeredBulkPdfOptions.set(options.sectionSelector, options);
  bindBulkPdfDelegation();

  orderBulkPdfSessions.get(options.sectionSelector)?.abort.abort();

  const abortController = new AbortController();
  const session: OrderBulkPdfSession = {
    abort: abortController,
    refresh: () => {
      refreshSelectionUi(options);
    },
  };

  orderBulkPdfSessions.set(options.sectionSelector, session);
  refreshSelectionUi(options);
}

export function initAdminOrderBulkPdf() {
  initOrderBulkPdf({
    sectionSelector: "#admin-orders",
    checkboxRootSelector: "#admin-orders [data-order-table-shell]",
    menuTriggerSelector: "#admin-orders-document-menu [data-table-action-menu-trigger]",
    mobileDocumentTriggerSelector: "#admin-orders [data-order-document-modal-trigger]",
    menuRootSelector: "#admin-orders-document-menu",
    mobileDocumentModalSelector: "#order-documents-modal",
  });
}

export function initAgentOrderCustomerBulkPdf() {
  initOrderBulkPdf({
    sectionSelector: "#agent-order-customers",
    menuTriggerSelector:
      "#agent-order-customers-document-menu [data-table-action-menu-trigger]",
    menuRootSelector: "#agent-order-customers-document-menu",
  });
}
