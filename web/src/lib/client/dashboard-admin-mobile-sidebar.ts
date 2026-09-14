import {
  initAdminMobileSidebarToggleDrag,
  shouldSuppressAdminMobileSidebarToggleClick,
} from "@/lib/client/admin-mobile-sidebar-toggle-drag";

const MOBILE_SIDEBAR_MEDIA_QUERY = "(max-width: 47.99rem)";
const OPEN_CLASS = "dashboard-sidebar-mobile-open";

function isAdminMobileSidebarViewport() {
  return window.matchMedia(MOBILE_SIDEBAR_MEDIA_QUERY).matches;
}

function getToggleButton() {
  return document.querySelector<HTMLButtonElement>("[data-admin-sidebar-mobile-toggle]");
}

function getBackdrop() {
  return document.querySelector<HTMLButtonElement>("[data-admin-sidebar-mobile-backdrop]");
}

function getSidebarPanel() {
  return document.getElementById("dashboard-sidebar-mobile-panel");
}

function syncSidebarPanelInert(open: boolean) {
  const panel = getSidebarPanel();
  if (!(panel instanceof HTMLElement)) {
    return;
  }

  if (!isAdminMobileSidebarViewport()) {
    panel.removeAttribute("inert");
    return;
  }

  if (open) {
    panel.removeAttribute("inert");
    return;
  }

  panel.setAttribute("inert", "");
}

export function syncAdminMobileSidebarToggleIcon() {
  if (!isAdminMobileSidebarViewport()) {
    return;
  }

  const iconHost = document.querySelector<HTMLElement>(
    "[data-admin-sidebar-mobile-toggle-icon]",
  );
  const activeLink = document.querySelector<HTMLAnchorElement>(
    "[data-dashboard-nav-link].active",
  );

  if (!iconHost) {
    return;
  }

  const activeIcon = activeLink?.querySelector(".nav-icon-wrapper");
  if (!activeIcon) {
    return;
  }

  iconHost.innerHTML = activeIcon.innerHTML;
}

export function isAdminMobileSidebarOpen() {
  return document.documentElement.classList.contains(OPEN_CLASS);
}

export function setAdminMobileSidebarOpen(open: boolean) {
  if (!isAdminMobileSidebarViewport()) {
    document.documentElement.classList.remove(OPEN_CLASS);
    getBackdrop()?.setAttribute("hidden", "");
    getToggleButton()?.setAttribute("aria-expanded", "false");
    syncSidebarPanelInert(false);
    return;
  }

  document.documentElement.classList.toggle(OPEN_CLASS, open);
  syncSidebarPanelInert(open);

  const toggle = getToggleButton();
  const backdrop = getBackdrop();

  if (toggle) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  if (backdrop) {
    if (open) {
      backdrop.removeAttribute("hidden");
      backdrop.setAttribute("aria-hidden", "false");
    } else {
      backdrop.setAttribute("hidden", "");
      backdrop.setAttribute("aria-hidden", "true");
    }
  }
}

export function initAdminMobileSidebar() {
  const dashboardWindow = window as Window & {
    adminMobileSidebarInitialized?: boolean;
  };
  if (dashboardWindow.adminMobileSidebarInitialized) {
    syncAdminMobileSidebarToggleIcon();
    initAdminMobileSidebarToggleDrag();
    return;
  }
  dashboardWindow.adminMobileSidebarInitialized = true;

  initAdminMobileSidebarToggleDrag();

  const mediaQuery = window.matchMedia(MOBILE_SIDEBAR_MEDIA_QUERY);

  const handleViewportChange = () => {
    if (!mediaQuery.matches) {
      setAdminMobileSidebarOpen(false);
    }
  };

  mediaQuery.addEventListener("change", handleViewportChange);
  window.addEventListener("resize", handleViewportChange);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest("[data-admin-sidebar-mobile-toggle]")) {
      if (shouldSuppressAdminMobileSidebarToggleClick()) {
        return;
      }

      event.preventDefault();
      setAdminMobileSidebarOpen(!isAdminMobileSidebarOpen());
      return;
    }

    if (target.closest("[data-admin-sidebar-mobile-backdrop]")) {
      event.preventDefault();
      setAdminMobileSidebarOpen(false);
      return;
    }

    if (target.closest("[data-admin-sidebar-mobile-close]")) {
      event.preventDefault();
      setAdminMobileSidebarOpen(false);
      return;
    }

    const navLink = target.closest<HTMLAnchorElement>("[data-dashboard-nav-link]");
    if (navLink && isAdminMobileSidebarOpen()) {
      setAdminMobileSidebarOpen(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isAdminMobileSidebarOpen()) {
      event.preventDefault();
      setAdminMobileSidebarOpen(false);
    }
  });

  document.addEventListener("astro:after-swap", () => {
    syncAdminMobileSidebarToggleIcon();
    if (!isAdminMobileSidebarViewport()) {
      setAdminMobileSidebarOpen(false);
    }
  });

  document.addEventListener("astro:page-load", syncAdminMobileSidebarToggleIcon);
  syncAdminMobileSidebarToggleIcon();
  syncSidebarPanelInert(false);
}
