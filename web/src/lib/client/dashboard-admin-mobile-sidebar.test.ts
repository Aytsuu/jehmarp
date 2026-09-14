import { beforeEach, describe, expect, it, vi } from "vitest";

import { initAdminMobileSidebarToggleDrag } from "@/lib/client/admin-mobile-sidebar-toggle-drag";
import {
  initAdminMobileSidebar,
  isAdminMobileSidebarOpen,
  setAdminMobileSidebarOpen,
  syncAdminMobileSidebarToggleIcon,
} from "@/lib/client/dashboard-admin-mobile-sidebar";

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      }),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("dashboard-admin-mobile-sidebar", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button
        type="button"
        data-admin-sidebar-mobile-toggle
        aria-expanded="false"
      >
        <span data-admin-sidebar-mobile-toggle-icon></span>
      </button>
      <button type="button" data-admin-sidebar-mobile-backdrop hidden></button>
      <a href="/admin/orders" class="active" data-dashboard-nav-link>
        <span class="nav-icon-wrapper"><svg data-testid="orders-icon"></svg></span>
      </a>
    `;
    document.documentElement.classList.remove("dashboard-sidebar-mobile-open");
    (window as Window & { adminMobileSidebarInitialized?: boolean }).adminMobileSidebarInitialized =
      false;
    (window as Window & { adminMobileSidebarToggleDragInitialized?: boolean })
      .adminMobileSidebarToggleDragInitialized = false;
  });

  it("opens and closes the mobile sidebar", () => {
    mockMatchMedia(true);

    setAdminMobileSidebarOpen(true);
    expect(isAdminMobileSidebarOpen()).toBe(true);
    expect(
      document.querySelector("[data-admin-sidebar-mobile-toggle]")?.getAttribute(
        "aria-expanded",
      ),
    ).toBe("true");
    expect(
      document.querySelector("[data-admin-sidebar-mobile-backdrop]")?.hasAttribute("hidden"),
    ).toBe(false);

    setAdminMobileSidebarOpen(false);
    expect(isAdminMobileSidebarOpen()).toBe(false);
    expect(
      document.querySelector("[data-admin-sidebar-mobile-backdrop]")?.hasAttribute("hidden"),
    ).toBe(true);
  });

  it("forces the sidebar closed outside the mobile viewport", () => {
    mockMatchMedia(false);

    setAdminMobileSidebarOpen(true);
    expect(isAdminMobileSidebarOpen()).toBe(false);
  });

  it("syncs the toggle icon from the active nav link", () => {
    mockMatchMedia(true);

    syncAdminMobileSidebarToggleIcon();

    expect(
      document
        .querySelector("[data-admin-sidebar-mobile-toggle-icon]")
        ?.querySelector("[data-testid='orders-icon']"),
    ).not.toBeNull();
  });

  it("toggles open state when the floating button is clicked", () => {
    mockMatchMedia(true);
    initAdminMobileSidebar();
    initAdminMobileSidebarToggleDrag();

    document.querySelector<HTMLButtonElement>("[data-admin-sidebar-mobile-toggle]")?.click();
    expect(isAdminMobileSidebarOpen()).toBe(true);

    document.querySelector<HTMLButtonElement>("[data-admin-sidebar-mobile-toggle]")?.click();
    expect(isAdminMobileSidebarOpen()).toBe(false);
  });

  it("closes the sidebar when the header close button is clicked", () => {
    mockMatchMedia(true);
    initAdminMobileSidebar();

    setAdminMobileSidebarOpen(true);
    document.body.insertAdjacentHTML(
      "beforeend",
      `<button type="button" data-admin-sidebar-mobile-close>Close</button>`,
    );

    document.querySelector<HTMLButtonElement>("[data-admin-sidebar-mobile-close]")?.click();
    expect(isAdminMobileSidebarOpen()).toBe(false);
  });
});
