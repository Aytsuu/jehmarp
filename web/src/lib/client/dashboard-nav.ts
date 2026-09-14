import { syncAdminMobileSidebarToggleIcon } from "@/lib/client/dashboard-admin-mobile-sidebar";

export function isDashboardNavItemActive(pathname: string, href: string) {
  if (pathname === href) {
    return true;
  }

  if (href === "/admin" || href === "/agent") {
    return false;
  }

  return pathname.startsWith(href);
}

export function syncDashboardNavActiveState(pathname = window.location.pathname) {
  document
    .querySelectorAll<HTMLAnchorElement>("[data-dashboard-nav-link]")
    .forEach((link) => {
      const href = new URL(link.href, window.location.href).pathname;
      const isActive = isDashboardNavItemActive(pathname, href);
      link.classList.toggle("active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

  syncAdminMobileSidebarToggleIcon();
}

export function setOptimisticDashboardNavActive(link: HTMLAnchorElement) {
  const href = new URL(link.href, window.location.href).pathname;
  if (href.startsWith("/agent")) {
    document.body.classList.add("dashboard-body--agent");
  }

  document
    .querySelectorAll<HTMLAnchorElement>("[data-dashboard-nav-link]")
    .forEach((navLink) => {
      navLink.classList.remove("active");
      navLink.removeAttribute("aria-current");
    });

  if (link.dataset.agentNavLink !== undefined) {
    document
      .querySelectorAll<HTMLAnchorElement>("[data-agent-nav-link]")
      .forEach((navLink) => {
        navLink.classList.remove("agent-mobile-nav__link--active");
        navLink.removeAttribute("aria-current");
      });
    link.classList.add("agent-mobile-nav__link--active");
    link.setAttribute("aria-current", "page");
    return;
  }

  link.classList.add("active");
  link.setAttribute("aria-current", "page");
}

function isPrimaryNavigationClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

export function shouldHandleDashboardNavClick(link: HTMLAnchorElement) {
  if (link.target && link.target !== "_self") return false;

  const nextUrl = new URL(link.href, window.location.href);
  if (nextUrl.origin !== window.location.origin) return false;

  return !(
    nextUrl.pathname === window.location.pathname &&
    nextUrl.search === window.location.search
  );
}

export function initDashboardNavNavigation() {
  const dashboardWindow = window as Window & {
    dashboardNavNavigationInitialized?: boolean;
  };
  if (dashboardWindow.dashboardNavNavigationInitialized) {
    syncDashboardNavActiveState();
    return;
  }
  dashboardWindow.dashboardNavNavigationInitialized = true;

  syncDashboardNavActiveState();

  document.addEventListener("click", (event) => {
    if (!isPrimaryNavigationClick(event)) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const link = target.closest<HTMLAnchorElement>("[data-dashboard-nav-link]");
    if (!link || !shouldHandleDashboardNavClick(link)) return;

    setOptimisticDashboardNavActive(link);
  });

  document.addEventListener("astro:after-swap", () => {
    syncDashboardNavActiveState();
  });
  document.addEventListener("astro:page-load", () => {
    syncDashboardNavActiveState();
  });
  window.addEventListener("popstate", () => {
    syncDashboardNavActiveState();
  });
}
