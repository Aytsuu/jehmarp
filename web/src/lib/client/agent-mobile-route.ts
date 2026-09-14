import { isAgentMobilePrimaryRoute, isAgentNavActive } from "@/lib/dashboard/agent-navigation";

const AGENT_MOBILE_QUERY = "(max-width: 47.99rem)";
const INTERACTIVE_TABLE_VIEWPORT_QUERY = "(max-width: 63.99rem)";
const APP_VIEWPORT_HEIGHT_VAR = "--app-viewport-height";

export function hasInteractiveTableLayout() {
  return Boolean(document.querySelector("[data-interactive-table]"));
}

export function shouldUseVisualViewportHeight() {
  return (
    hasInteractiveTableLayout() &&
    window.matchMedia(INTERACTIVE_TABLE_VIEWPORT_QUERY).matches
  );
}

export function syncAppViewportHeight(
  viewportHeight = window.visualViewport?.height ?? window.innerHeight,
) {
  document.documentElement.style.setProperty(
    APP_VIEWPORT_HEIGHT_VAR,
    `${Math.round(viewportHeight)}px`,
  );
}

export function resetAppViewportHeightForTests() {
  document.documentElement.style.removeProperty(APP_VIEWPORT_HEIGHT_VAR);
}

export function isAgentRoute(pathname = window.location.pathname) {
  return pathname.startsWith("/agent");
}

export function isAgentMobileViewport() {
  return window.matchMedia(AGENT_MOBILE_QUERY).matches;
}

export function isAgentMobileRoute(pathname = window.location.pathname) {
  return isAgentRoute(pathname) && isAgentMobileViewport();
}

export function syncAgentBodyClass(pathname = window.location.pathname) {
  document.body.classList.toggle("dashboard-body--agent", isAgentRoute(pathname));
}

export function syncAgentMobileChrome(pathname = window.location.pathname) {
  syncAgentBodyClass(pathname);
  document.body.classList.toggle(
    "dashboard-body--agent-mobile-primary",
    isAgentRoute(pathname) && isAgentMobilePrimaryRoute(pathname),
  );

  document.querySelectorAll<HTMLAnchorElement>("[data-agent-nav-link]").forEach((link) => {
    const href = link.getAttribute("href") ?? "";
    const isActive = isAgentNavActive(pathname, href);
    link.classList.toggle("agent-mobile-nav__link--active", isActive);

    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function lockAgentMobileScroll() {
  document.documentElement.classList.add("agent-mobile-nav-lock");
}

function unlockAgentMobileScroll() {
  document.documentElement.classList.remove("agent-mobile-nav-lock");
}

function resetAgentMobileScroll() {
  window.scrollTo(0, 0);
  document.querySelector<HTMLElement>(".dashboard-main")?.scrollTo(0, 0);
}

function clearAppViewportHeightOverride() {
  document.documentElement.style.removeProperty(APP_VIEWPORT_HEIGHT_VAR);
}

function initAppViewportHeightSync() {
  const dashboardWindow = window as Window & {
    appViewportHeightInitialized?: boolean;
  };
  if (dashboardWindow.appViewportHeightInitialized) return;
  dashboardWindow.appViewportHeightInitialized = true;

  const agentMediaQuery = window.matchMedia(AGENT_MOBILE_QUERY);
  const interactiveTableMediaQuery = window.matchMedia(INTERACTIVE_TABLE_VIEWPORT_QUERY);
  const syncIfNeeded = () => {
    const needsSync =
      (isAgentRoute() && agentMediaQuery.matches) ||
      shouldUseVisualViewportHeight();

    if (!needsSync) {
      clearAppViewportHeightOverride();
      return;
    }

    syncAppViewportHeight();
  };

  syncIfNeeded();
  window.visualViewport?.addEventListener("resize", syncIfNeeded);
  window.visualViewport?.addEventListener("scroll", syncIfNeeded);
  window.addEventListener("resize", syncIfNeeded);
  agentMediaQuery.addEventListener("change", syncIfNeeded);
  interactiveTableMediaQuery.addEventListener("change", syncIfNeeded);
  document.addEventListener("astro:page-load", syncIfNeeded);
  document.addEventListener("astro:after-swap", syncIfNeeded);
}

export function initAgentMobileNavigation() {
  const dashboardWindow = window as Window & {
    agentMobileNavigationInitialized?: boolean;
  };
  if (dashboardWindow.agentMobileNavigationInitialized) return;
  dashboardWindow.agentMobileNavigationInitialized = true;

  initAppViewportHeightSync();

  document.addEventListener(
    "click",
    (event) => {
      if (!isAgentMobileViewport()) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>("[data-agent-nav-link]");
      if (!link) return;

      const href = link.getAttribute("href") ?? "";
      if (!href.startsWith("/agent")) return;

      document.body.classList.add("dashboard-body--agent");
      lockAgentMobileScroll();
    },
    true,
  );

  document.addEventListener("astro:before-preparation", () => {
    if (!isAgentMobileRoute()) return;
    lockAgentMobileScroll();
    document.body.classList.add("dashboard-body--agent");
  });

  document.addEventListener("astro:after-swap", () => {
    if (!isAgentRoute()) {
      unlockAgentMobileScroll();
      return;
    }

    syncAgentBodyClass();
    resetAgentMobileScroll();
    unlockAgentMobileScroll();
  });

  document.addEventListener("astro:page-load", () => {
    if (!isAgentRoute()) {
      unlockAgentMobileScroll();
      return;
    }

    syncAgentBodyClass();
    resetAgentMobileScroll();
    unlockAgentMobileScroll();
  });
}
