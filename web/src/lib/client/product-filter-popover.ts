export type ProductFilterPopoverConfig = {
  containerSelector: string;
  triggerSelector: string;
  popoverSelector: string;
  closeSelector: string;
  applySelector: string;
  clearSelector: string;
  formSelector: string;
  fieldAttribute: string;
  badgeSelector: string;
  fields: readonly string[];
};

export const defaultProductFilterPopoverConfig: ProductFilterPopoverConfig = {
  containerSelector: "[data-product-filter-popover-container]",
  triggerSelector: "[data-product-filter-popover-trigger]",
  popoverSelector: "[data-product-filter-popover]",
  closeSelector: "[data-product-filter-popover-close]",
  applySelector: "[data-product-filter-popover-apply]",
  clearSelector: "[data-product-filter-popover-clear]",
  formSelector: "[data-product-filter-form]",
  fieldAttribute: "data-product-filter-field",
  badgeSelector: "[data-product-filter-badge]",
  fields: ["stockStatus", "category"],
};

function getElements(config: ProductFilterPopoverConfig = defaultProductFilterPopoverConfig) {
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

export function syncProductFilterTriggerState(
  config: ProductFilterPopoverConfig = defaultProductFilterPopoverConfig,
) {
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

export function openProductFilterPopover(
  config: ProductFilterPopoverConfig = defaultProductFilterPopoverConfig,
) {
  const { popover, trigger } = getElements(config);
  if (!popover || !trigger) return;

  popover.hidden = false;
  popover.classList.add("is-open");
  popover.setAttribute("aria-hidden", "false");
  trigger.setAttribute("aria-expanded", "true");

  const firstInput = popover.querySelector<HTMLElement>("select, input");
  firstInput?.focus();
}

export function closeProductFilterPopover(
  config: ProductFilterPopoverConfig = defaultProductFilterPopoverConfig,
) {
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

export function toggleProductFilterPopover(
  config: ProductFilterPopoverConfig = defaultProductFilterPopoverConfig,
) {
  const { popover } = getElements(config);
  if (!popover) return;

  if (popover.hidden || !popover.classList.contains("is-open")) {
    openProductFilterPopover(config);
  } else {
    closeProductFilterPopover(config);
  }
}

export function applyProductFilterPopover(
  config: ProductFilterPopoverConfig = defaultProductFilterPopoverConfig,
) {
  const { form } = getElements(config);
  if (form) {
    const firstField = getFilterField(form, config.fieldAttribute, config.fields[0]);
    if (firstField) {
      firstField.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  }

  closeProductFilterPopover(config);
  syncProductFilterTriggerState(config);
}

export function clearProductFilterPopover(
  config: ProductFilterPopoverConfig = defaultProductFilterPopoverConfig,
) {
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

  syncProductFilterTriggerState(config);
}

export function initProductFilterPopover(
  config: ProductFilterPopoverConfig = defaultProductFilterPopoverConfig,
) {
  const globalWindow = window as Window & {
    productFilterPopoverInitialized?: boolean;
  };

  syncProductFilterTriggerState(config);

  if (globalWindow.productFilterPopoverInitialized) {
    return;
  }
  globalWindow.productFilterPopoverInitialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest(config.triggerSelector)) {
      event.preventDefault();
      toggleProductFilterPopover(config);
      return;
    }

    if (target.closest(config.closeSelector)) {
      event.preventDefault();
      event.stopPropagation();
      closeProductFilterPopover(config);
      return;
    }

    if (target.closest(config.clearSelector)) {
      event.preventDefault();
      clearProductFilterPopover(config);
      return;
    }

    if (target.closest(config.applySelector)) {
      event.preventDefault();
      applyProductFilterPopover(config);
      return;
    }

    const { popover, container } = getElements(config);
    if (
      popover &&
      !popover.hidden &&
      container &&
      !container.contains(target)
    ) {
      closeProductFilterPopover(config);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const { popover } = getElements(config);
      if (popover && !popover.hidden) {
        closeProductFilterPopover(config);
      }
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const { form } = getElements(config);
    if (form?.contains(target)) {
      syncProductFilterTriggerState(config);
    }
  });

  const resync = () => {
    syncProductFilterTriggerState(config);
  };

  document.addEventListener("astro:after-swap", resync);
  document.addEventListener("astro:page-load", resync);
  document.addEventListener("dashboard:interactive-table-updated", resync);
}
