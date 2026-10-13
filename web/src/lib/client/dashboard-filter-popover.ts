export type DashboardFilterPopoverConfig = {
  containerSelector: string;
  triggerSelector: string;
  popoverSelector: string;
  closeSelector: string;
  clearSelector: string;
  formSelector: string;
  fieldAttribute: string;
  badgeSelector: string;
  fields: readonly string[];
};

export const salesFilterPopoverConfig: DashboardFilterPopoverConfig = {
  containerSelector: "[data-sales-filter-popover-root]",
  triggerSelector: "[data-sales-filter-popover-trigger]",
  popoverSelector: "[data-sales-filter-popover]",
  closeSelector: "[data-sales-filter-popover-close]",
  clearSelector: "[data-sales-filter-popover-clear]",
  formSelector: "[data-sales-filter-form]",
  fieldAttribute: "data-sales-filter-field",
  badgeSelector: "[data-sales-filter-popover-badge]",
  fields: ["source"],
};

export const invoiceFilterPopoverConfig: DashboardFilterPopoverConfig = {
  containerSelector: "[data-invoice-filter-popover-root]",
  triggerSelector: "[data-invoice-filter-popover-trigger]",
  popoverSelector: "[data-invoice-filter-popover]",
  closeSelector: "[data-invoice-filter-popover-close]",
  clearSelector: "[data-invoice-filter-popover-clear]",
  formSelector: "[data-invoice-filter-form]",
  fieldAttribute: "data-invoice-filter-field",
  badgeSelector: "[data-invoice-filter-popover-badge]",
  fields: ["balanceStatus"],
};

export const customerFilterPopoverConfig: DashboardFilterPopoverConfig = {
  containerSelector: "[data-customer-filter-popover-root]",
  triggerSelector: "[data-customer-filter-popover-trigger]",
  popoverSelector: "[data-customer-filter-popover]",
  closeSelector: "[data-customer-filter-popover-close]",
  clearSelector: "[data-customer-filter-popover-clear]",
  formSelector: "[data-customer-filter-form]",
  fieldAttribute: "data-customer-filter-field",
  badgeSelector: "[data-customer-filter-popover-badge]",
  fields: ["customerType"],
};

export const agentFilterPopoverConfig: DashboardFilterPopoverConfig = {
  containerSelector: "[data-agent-filter-popover-root]",
  triggerSelector: "[data-agent-filter-popover-trigger]",
  popoverSelector: "[data-agent-filter-popover]",
  closeSelector: "[data-agent-filter-popover-close]",
  clearSelector: "[data-agent-filter-popover-clear]",
  formSelector: "[data-agent-filter-form]",
  fieldAttribute: "data-agent-filter-field",
  badgeSelector: "[data-agent-filter-popover-badge]",
  fields: ["status"],
};

export const resellerFilterPopoverConfig: DashboardFilterPopoverConfig = {
  containerSelector: "[data-reseller-filter-popover-root]",
  triggerSelector: "[data-reseller-filter-popover-trigger]",
  popoverSelector: "[data-reseller-filter-popover]",
  closeSelector: "[data-reseller-filter-popover-close]",
  clearSelector: "[data-reseller-filter-popover-clear]",
  formSelector: "[data-reseller-filter-form]",
  fieldAttribute: "data-reseller-filter-field",
  badgeSelector: "[data-reseller-filter-popover-badge]",
  fields: ["status"],
};

export const inquiryFilterPopoverConfig: DashboardFilterPopoverConfig = {
  containerSelector: "[data-inquiry-filter-popover-root]",
  triggerSelector: "[data-inquiry-filter-popover-trigger]",
  popoverSelector: "[data-inquiry-filter-popover]",
  closeSelector: "[data-inquiry-filter-popover-close]",
  clearSelector: "[data-inquiry-filter-popover-clear]",
  formSelector: "[data-inquiry-filter-form]",
  fieldAttribute: "data-inquiry-filter-field",
  badgeSelector: "[data-inquiry-filter-popover-badge]",
  fields: ["status"],
};

export const defaultDashboardFilterPopoverConfigs: readonly DashboardFilterPopoverConfig[] = [
  salesFilterPopoverConfig,
  invoiceFilterPopoverConfig,
  customerFilterPopoverConfig,
  agentFilterPopoverConfig,
  resellerFilterPopoverConfig,
  inquiryFilterPopoverConfig,
];

function getElements(config: DashboardFilterPopoverConfig) {
  const container = document.querySelector<HTMLElement>(config.containerSelector);
  const trigger = document.querySelector<HTMLElement>(config.triggerSelector);
  const popover = document.querySelector<HTMLElement>(config.popoverSelector);
  const form = document.querySelector<HTMLFormElement>(config.formSelector);
  const badge = document.querySelector<HTMLElement>(config.badgeSelector);

  return { container, trigger, popover, form, badge };
}

function getFilterField(
  root: ParentNode,
  fieldAttribute: string,
  name: string,
): HTMLSelectElement | null {
  return root.querySelector<HTMLSelectElement>(`select[${fieldAttribute}="${name}"]`);
}

export function syncDashboardFilterPopoverTriggerState(config: DashboardFilterPopoverConfig) {
  const { trigger, form, badge } = getElements(config);
  if (!trigger || !form) {
    return;
  }

  let activeCount = 0;
  config.fields.forEach((name) => {
    const field = getFilterField(form, config.fieldAttribute, name);
    if (field && field.value.trim().length > 0) {
      activeCount += 1;
    }
  });

  const hasActive = activeCount > 0;
  trigger.classList.toggle("is-active", hasActive);
  trigger.setAttribute("aria-pressed", hasActive ? "true" : "false");

  if (badge) {
    if (hasActive) {
      badge.textContent = String(activeCount);
      badge.hidden = false;
    } else {
      badge.textContent = "";
      badge.hidden = true;
    }
  }
}

export function openDashboardFilterPopover(config: DashboardFilterPopoverConfig) {
  const { popover, trigger } = getElements(config);
  if (!popover || !trigger) return;

  popover.hidden = false;
  popover.classList.add("is-open");
  popover.setAttribute("aria-hidden", "false");
  trigger.setAttribute("aria-expanded", "true");

  const firstInput = popover.querySelector<HTMLElement>("select, input");
  firstInput?.focus();
}

export function closeDashboardFilterPopover(config: DashboardFilterPopoverConfig) {
  const { popover, trigger } = getElements(config);
  if (!popover || !trigger) return;

  const hadFocus = popover.contains(document.activeElement);

  popover.hidden = true;
  popover.classList.remove("is-open");
  popover.setAttribute("aria-hidden", "true");
  trigger.setAttribute("aria-expanded", "false");

  if (hadFocus) {
    trigger.focus();
  }
}

export function toggleDashboardFilterPopover(config: DashboardFilterPopoverConfig) {
  const { popover } = getElements(config);
  if (!popover) return;

  if (popover.hidden || !popover.classList.contains("is-open")) {
    openDashboardFilterPopover(config);
  } else {
    closeDashboardFilterPopover(config);
  }
}

export function clearDashboardFilterPopover(config: DashboardFilterPopoverConfig) {
  const { form } = getElements(config);
  if (!form) return;

  config.fields.forEach((name) => {
    const field = getFilterField(form, config.fieldAttribute, name);
    if (field) {
      field.value = "";
    }
  });

  const firstField = getFilterField(form, config.fieldAttribute, config.fields[0]);
  firstField?.dispatchEvent(new Event("change", { bubbles: true }));

  syncDashboardFilterPopoverTriggerState(config);
}

export function initDashboardFilterPopovers(
  configs: readonly DashboardFilterPopoverConfig[] = defaultDashboardFilterPopoverConfigs,
) {
  const globalWindow = window as Window & {
    dashboardFilterPopoversInitialized?: boolean;
  };

  configs.forEach(syncDashboardFilterPopoverTriggerState);

  if (globalWindow.dashboardFilterPopoversInitialized) {
    return;
  }
  globalWindow.dashboardFilterPopoversInitialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    for (const config of configs) {
      if (target.closest(config.triggerSelector)) {
        event.preventDefault();
        toggleDashboardFilterPopover(config);
        return;
      }

      if (target.closest(config.closeSelector)) {
        event.preventDefault();
        event.stopPropagation();
        closeDashboardFilterPopover(config);
        return;
      }

      if (target.closest(config.clearSelector)) {
        event.preventDefault();
        clearDashboardFilterPopover(config);
        return;
      }

      const { popover, container } = getElements(config);
      if (
        popover &&
        !popover.hidden &&
        container &&
        !container.contains(target)
      ) {
        closeDashboardFilterPopover(config);
      }
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      configs.forEach((config) => {
        const { popover } = getElements(config);
        if (popover && !popover.hidden) {
          closeDashboardFilterPopover(config);
        }
      });
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    configs.forEach((config) => {
      const { form } = getElements(config);
      if (form?.contains(target)) {
        syncDashboardFilterPopoverTriggerState(config);
      }
    });
  });

  const resyncAll = () => {
    configs.forEach(syncDashboardFilterPopoverTriggerState);
  };

  document.addEventListener("astro:after-swap", resyncAll);
  document.addEventListener("astro:page-load", resyncAll);
  document.addEventListener("dashboard:interactive-table-updated", resyncAll);
}
