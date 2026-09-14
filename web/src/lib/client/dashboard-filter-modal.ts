type DashboardFilterModalConfig = {
  formSelector: string;
  modalId: string;
  triggerSelector: string;
  applySelector: string;
  clearSelector: string;
  fieldAttribute: string;
  fields: readonly string[];
};

const filterModalConfigs: DashboardFilterModalConfig[] = [
  {
    formSelector: "[data-product-filter-form]",
    modalId: "product-filters-modal",
    triggerSelector: "[data-product-filter-modal-trigger]",
    applySelector: "[data-product-filter-modal-apply]",
    clearSelector: "[data-product-filter-modal-clear]",
    fieldAttribute: "data-product-filter-field",
    fields: ["stockStatus", "category"],
  },
  {
    formSelector: "[data-order-filter-form]",
    modalId: "order-filters-modal",
    triggerSelector: "[data-order-filter-modal-trigger]",
    applySelector: "[data-order-filter-modal-apply]",
    clearSelector: "[data-order-filter-modal-clear]",
    fieldAttribute: "data-order-filter-field",
    fields: ["source", "orderStatus", "paymentStatus"],
  },
  {
    formSelector: "[data-sales-filter-form]",
    modalId: "sales-filters-modal",
    triggerSelector: "[data-sales-filter-modal-trigger]",
    applySelector: "[data-sales-filter-modal-apply]",
    clearSelector: "[data-sales-filter-modal-clear]",
    fieldAttribute: "data-sales-filter-field",
    fields: ["source"],
  },
  {
    formSelector: "[data-invoice-filter-form]",
    modalId: "invoice-filters-modal",
    triggerSelector: "[data-invoice-filter-modal-trigger]",
    applySelector: "[data-invoice-filter-modal-apply]",
    clearSelector: "[data-invoice-filter-modal-clear]",
    fieldAttribute: "data-invoice-filter-field",
    fields: ["balanceStatus"],
  },
  {
    formSelector: "[data-customer-filter-form]",
    modalId: "customer-filters-modal",
    triggerSelector: "[data-customer-filter-modal-trigger]",
    applySelector: "[data-customer-filter-modal-apply]",
    clearSelector: "[data-customer-filter-modal-clear]",
    fieldAttribute: "data-customer-filter-field",
    fields: ["customerType"],
  },
  {
    formSelector: "[data-agent-filter-form]",
    modalId: "agent-filters-modal",
    triggerSelector: "[data-agent-filter-modal-trigger]",
    applySelector: "[data-agent-filter-modal-apply]",
    clearSelector: "[data-agent-filter-modal-clear]",
    fieldAttribute: "data-agent-filter-field",
    fields: ["status"],
  },
  {
    formSelector: "[data-reseller-filter-form]",
    modalId: "reseller-filters-modal",
    triggerSelector: "[data-reseller-filter-modal-trigger]",
    applySelector: "[data-reseller-filter-modal-apply]",
    clearSelector: "[data-reseller-filter-modal-clear]",
    fieldAttribute: "data-reseller-filter-field",
    fields: ["status"],
  },
  {
    formSelector: "[data-inquiry-filter-form]",
    modalId: "inquiry-filters-modal",
    triggerSelector: "[data-inquiry-filter-modal-trigger]",
    applySelector: "[data-inquiry-filter-modal-apply]",
    clearSelector: "[data-inquiry-filter-modal-clear]",
    fieldAttribute: "data-inquiry-filter-field",
    fields: ["status"],
  },
];

function getConfigForElement(element: Element) {
  return filterModalConfigs.find((config) => {
    if (element.closest(config.triggerSelector)) return true;
    if (element.closest(config.applySelector)) return true;
    if (element.closest(config.clearSelector)) return true;
    return false;
  });
}

function getFilterField(
  root: ParentNode,
  fieldAttribute: string,
  name: string,
) {
  return root.querySelector<HTMLSelectElement>(`select[${fieldAttribute}="${name}"]`);
}

function closeFilterModal(config: DashboardFilterModalConfig) {
  document
    .getElementById(config.modalId)
    ?.querySelector<HTMLElement>("[data-dashboard-modal-close]")
    ?.click();
}

export function syncDashboardFilterModalFromForm(config: DashboardFilterModalConfig) {
  const form = document.querySelector<HTMLFormElement>(config.formSelector);
  const modal = document.getElementById(config.modalId);
  if (!form || !modal) {
    return;
  }

  config.fields.forEach((name) => {
    const formField = getFilterField(form, config.fieldAttribute, name);
    const modalField = getFilterField(modal, config.fieldAttribute, name);
    if (formField && modalField) {
      modalField.value = formField.value;
    }
  });
}

export function syncDashboardFilterTriggerState(config: DashboardFilterModalConfig) {
  const form = document.querySelector<HTMLFormElement>(config.formSelector);
  const trigger = document.querySelector<HTMLElement>(config.triggerSelector);
  if (!form || !trigger) {
    return;
  }

  const hasActiveFilters = config.fields.some((name) => {
    const field = getFilterField(form, config.fieldAttribute, name);
    return Boolean(field?.value);
  });

  trigger.classList.toggle("is-active", hasActiveFilters);
  trigger.setAttribute("aria-pressed", hasActiveFilters ? "true" : "false");
}

export function applyDashboardFilterModal(config: DashboardFilterModalConfig) {
  const form = document.querySelector<HTMLFormElement>(config.formSelector);
  const modal = document.getElementById(config.modalId);
  if (!form || !modal) {
    return;
  }

  let hasChanges = false;

  config.fields.forEach((name) => {
    const formField = getFilterField(form, config.fieldAttribute, name);
    const modalField = getFilterField(modal, config.fieldAttribute, name);
    if (!formField || !modalField || formField.value === modalField.value) {
      return;
    }

    formField.value = modalField.value;
    hasChanges = true;
  });

  if (hasChanges) {
    const firstField = getFilterField(form, config.fieldAttribute, config.fields[0]);
    firstField?.dispatchEvent(new Event("change", { bubbles: true }));
  }

  closeFilterModal(config);
  syncDashboardFilterTriggerState(config);
}

export function clearDashboardFilterModal(config: DashboardFilterModalConfig) {
  const modal = document.getElementById(config.modalId);
  if (!modal) {
    return;
  }

  config.fields.forEach((name) => {
    const modalField = getFilterField(modal, config.fieldAttribute, name);
    if (modalField) {
      modalField.value = "";
    }
  });

  applyDashboardFilterModal(config);
}

export function initDashboardFilterModals() {
  const dashboardWindow = window as Window & {
    dashboardFilterModalsInitialized?: boolean;
  };
  if (dashboardWindow.dashboardFilterModalsInitialized) {
    filterModalConfigs.forEach(syncDashboardFilterTriggerState);
    return;
  }
  dashboardWindow.dashboardFilterModalsInitialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const config = getConfigForElement(target);
    if (!config) {
      return;
    }

    if (target.closest(config.triggerSelector)) {
      syncDashboardFilterModalFromForm(config);
      return;
    }

    if (target.closest(config.applySelector)) {
      event.preventDefault();
      applyDashboardFilterModal(config);
      return;
    }

    if (target.closest(config.clearSelector)) {
      event.preventDefault();
      clearDashboardFilterModal(config);
    }
  });

  const syncAllTriggers = () => {
    filterModalConfigs.forEach(syncDashboardFilterTriggerState);
  };

  document.addEventListener("astro:after-swap", syncAllTriggers);
  document.addEventListener("astro:page-load", syncAllTriggers);
  syncAllTriggers();
}

export function getDashboardFilterModalConfigs() {
  return filterModalConfigs;
}
