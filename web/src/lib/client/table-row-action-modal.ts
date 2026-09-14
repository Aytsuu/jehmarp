function getModalTitle(modal: HTMLElement) {
  const titleId = modal.getAttribute("aria-labelledby");
  if (!titleId) {
    return null;
  }

  return document.getElementById(titleId);
}

function setLinkVisibility(link: HTMLAnchorElement | null, visible: boolean) {
  if (!link) {
    return;
  }

  link.hidden = !visible;
}

export function populateTableRowActionsModal(trigger: HTMLElement) {
  const modalId = trigger.dataset.openDashboardModal;
  if (!modalId) {
    return;
  }

  const modal = document.getElementById(modalId);
  if (!(modal instanceof HTMLElement)) {
    return;
  }

  const pdfHref = trigger.dataset.rowActionPdfHref ?? "";
  const detailsHref = trigger.dataset.rowActionDetailsHref ?? "";
  const detailsLabel = trigger.dataset.rowActionDetailsLabel ?? "Order Details";
  const menuLabel = trigger.dataset.rowActionMenuLabel ?? trigger.getAttribute("aria-label") ?? "Actions";

  const pdfLink = modal.querySelector<HTMLAnchorElement>("[data-table-row-action-pdf]");
  const detailsLink = modal.querySelector<HTMLAnchorElement>("[data-table-row-action-details]");
  const detailsLabelElement = modal.querySelector<HTMLElement>(
    "[data-table-row-action-details-label]",
  );
  const titleElement = getModalTitle(modal);

  if (pdfLink) {
    if (pdfHref) {
      pdfLink.href = pdfHref;
      setLinkVisibility(pdfLink, true);
    } else {
      pdfLink.removeAttribute("href");
      setLinkVisibility(pdfLink, false);
    }
  }

  if (detailsLink) {
    if (detailsHref) {
      detailsLink.href = detailsHref;
      setLinkVisibility(detailsLink, true);
    } else {
      detailsLink.removeAttribute("href");
      setLinkVisibility(detailsLink, false);
    }
  }

  if (detailsLabelElement) {
    detailsLabelElement.textContent = detailsLabel;
  }

  if (titleElement) {
    titleElement.textContent = menuLabel;
  }
}

export function initTableRowActionModals() {
  const dashboardWindow = window as Window & {
    tableRowActionModalsInitialized?: boolean;
  };
  if (dashboardWindow.tableRowActionModalsInitialized) {
    return;
  }
  dashboardWindow.tableRowActionModalsInitialized = true;

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const trigger = target.closest<HTMLElement>("[data-table-row-action-trigger]");
      if (!trigger) {
        return;
      }

      populateTableRowActionsModal(trigger);
    },
    true,
  );
}
