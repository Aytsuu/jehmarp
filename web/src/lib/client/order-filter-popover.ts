export type OrderFilterPopoverConfig = {
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

export const defaultOrderFilterPopoverConfig: OrderFilterPopoverConfig = {
  containerSelector: "[data-order-filter-popover-root]",
  triggerSelector: "[data-order-filter-popover-trigger]",
  popoverSelector: "[data-order-filter-popover]",
  closeSelector: "[data-order-filter-popover-close]",
  clearSelector: "[data-order-filter-popover-clear]",
  formSelector: "[data-order-filter-form]",
  fieldAttribute: "data-order-filter-field",
  badgeSelector: "[data-order-filter-popover-badge]",
  fields: ["source", "orderStatus", "paymentStatus"],
};

function getElements(config: OrderFilterPopoverConfig = defaultOrderFilterPopoverConfig) {
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

export function syncOrderFilterTriggerState(
  config: OrderFilterPopoverConfig = defaultOrderFilterPopoverConfig,
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

export function openOrderFilterPopover(
  config: OrderFilterPopoverConfig = defaultOrderFilterPopoverConfig,
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

export function closeOrderFilterPopover(
  config: OrderFilterPopoverConfig = defaultOrderFilterPopoverConfig,
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

export function toggleOrderFilterPopover(
  config: OrderFilterPopoverConfig = defaultOrderFilterPopoverConfig,
) {
  const { popover } = getElements(config);
  if (!popover) return;

  if (popover.hidden || !popover.classList.contains("is-open")) {
    openOrderFilterPopover(config);
  } else {
    closeOrderFilterPopover(config);
  }
}

export function clearOrderFilterPopover(
  config: OrderFilterPopoverConfig = defaultOrderFilterPopoverConfig,
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

  syncOrderFilterTriggerState(config);
}

export function initOrderFilterPopover(
  config: OrderFilterPopoverConfig = defaultOrderFilterPopoverConfig,
) {
  const globalWindow = window as Window & {
    orderFilterPopoverInitialized?: boolean;
  };

  syncOrderFilterTriggerState(config);

  if (globalWindow.orderFilterPopoverInitialized) {
    return;
  }
  globalWindow.orderFilterPopoverInitialized = true;

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest(config.triggerSelector)) {
      event.preventDefault();
      toggleOrderFilterPopover(config);
      return;
    }

    if (target.closest(config.closeSelector)) {
      event.preventDefault();
      event.stopPropagation();
      closeOrderFilterPopover(config);
      return;
    }

    if (target.closest(config.clearSelector)) {
      event.preventDefault();
      clearOrderFilterPopover(config);
      return;
    }

    const { popover, container } = getElements(config);
    if (
      popover &&
      !popover.hidden &&
      container &&
      !container.contains(target)
    ) {
      closeOrderFilterPopover(config);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const { popover } = getElements(config);
      if (popover && !popover.hidden) {
        closeOrderFilterPopover(config);
      }
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const { form } = getElements(config);
    if (form?.contains(target)) {
      syncOrderFilterTriggerState(config);
    }
  });

  const resync = () => {
    syncOrderFilterTriggerState(config);
  };

  document.addEventListener("astro:after-swap", resync);
  document.addEventListener("astro:page-load", resync);
  document.addEventListener("dashboard:interactive-table-updated", resync);
}
