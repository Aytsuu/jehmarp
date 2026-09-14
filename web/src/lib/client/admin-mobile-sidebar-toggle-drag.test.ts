import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  initAdminMobileSidebarToggleDrag,
  isAdminMobileSidebarToggleDragActive,
  isAdminMobileSidebarToggleHoldActive,
} from "./admin-mobile-sidebar-toggle-drag";
import { SIDEBAR_TOGGLE_STORAGE_KEY } from "./admin-mobile-sidebar-toggle-position";
import { isAdminMobileSidebarOpen, initAdminMobileSidebar } from "./dashboard-admin-mobile-sidebar";

function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("admin-mobile-sidebar-toggle-drag", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove(
      "admin-sidebar-toggle-hold-active",
      "admin-sidebar-toggle-drag-active",
    );
    document.body.innerHTML = `
      <button
        type="button"
        class="admin-sidebar-mobile-toggle"
        data-admin-sidebar-mobile-toggle
        aria-expanded="false"
        style="width:52px;height:52px"
      >
        <span class="admin-sidebar-mobile-toggle__drag-surface" aria-hidden="true">
          <svg class="admin-sidebar-mobile-toggle__drag-surface-svg" viewBox="0 0 72 104">
            <path d="M 8,16 H 43 Q 52,16 52,24 V 41 C 57,43 66,47 72,52 C 66,57 57,61 52,63 V 80 Q 52,88 43,88 H 8 Q 0,88 0,80 V 24 Q 0,16 8,16 Z"></path>
          </svg>
        </span>
        Menu
      </button>
      <button type="button" data-admin-sidebar-mobile-backdrop hidden></button>
    `;
    (window as Window & { adminMobileSidebarToggleDragInitialized?: boolean })
      .adminMobileSidebarToggleDragInitialized = false;
    (window as Window & { adminMobileSidebarInitialized?: boolean }).adminMobileSidebarInitialized =
      false;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("restores a saved edge position on init", () => {
    localStorage.setItem(
      SIDEBAR_TOGGLE_STORAGE_KEY,
      JSON.stringify({ edge: "left", offset: 96 }),
    );

    initAdminMobileSidebarToggleDrag();

    const toggle = document.querySelector<HTMLButtonElement>(
      "[data-admin-sidebar-mobile-toggle]",
    );
    expect(toggle?.dataset.edge).toBe("left");
    expect(toggle?.style.left).toBe("0px");
    expect(toggle?.style.top).toBe("96px");
  });

  it("activates drag when sliding after the minimum hold duration", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });

    initAdminMobileSidebarToggleDrag();

    const toggle = document.querySelector<HTMLButtonElement>(
      "[data-admin-sidebar-mobile-toggle]",
    )!;

    toggle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 390,
        clientY: 200,
        pointerId: 1,
        isPrimary: true,
      }),
    );

    vi.advanceTimersByTime(400);

    window.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 390,
        clientY: 260,
        pointerId: 1,
        isPrimary: true,
      }),
    );

    expect(isAdminMobileSidebarToggleDragActive()).toBe(true);
    expect(toggle.classList.contains("admin-sidebar-mobile-toggle--drag-pending")).toBe(false);

    window.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 390,
        clientY: 260,
        pointerId: 1,
        isPrimary: true,
      }),
    );

    expect(toggle.dataset.edge).toBe("right");
  });

  it("enters drag mode after a long press and saves the snapped edge position", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 400 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });

    initAdminMobileSidebarToggleDrag();

    const toggle = document.querySelector<HTMLButtonElement>(
      "[data-admin-sidebar-mobile-toggle]",
    )!;

    toggle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 390,
        clientY: 200,
        pointerId: 1,
        isPrimary: true,
      }),
    );
    vi.advanceTimersByTime(1000);
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 390,
        clientY: 260,
        pointerId: 1,
        isPrimary: true,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 390,
        clientY: 260,
        pointerId: 1,
        isPrimary: true,
      }),
    );

    expect(toggle.dataset.edge).toBe("right");
    expect(localStorage.getItem(SIDEBAR_TOGGLE_STORAGE_KEY)).toContain('"edge":"right"');
  });

  it("blocks text selection while holding without showing the drag backdrop", () => {
    initAdminMobileSidebarToggleDrag();

    const toggle = document.querySelector<HTMLButtonElement>(
      "[data-admin-sidebar-mobile-toggle]",
    )!;

    toggle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 390,
        clientY: 200,
        pointerId: 1,
        isPrimary: true,
      }),
    );

    expect(isAdminMobileSidebarToggleHoldActive()).toBe(true);
    expect(isAdminMobileSidebarToggleDragActive()).toBe(false);
    expect(
      document
        .querySelector(".admin-sidebar-mobile-toggle-hold-overlay")
        ?.classList.contains("admin-sidebar-mobile-toggle-hold-overlay--pending"),
    ).toBe(true);

    const selectEvent = new Event("selectstart", { bubbles: true, cancelable: true });
    document.dispatchEvent(selectEvent);
    expect(selectEvent.defaultPrevented).toBe(true);

    window.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 390,
        clientY: 200,
        pointerId: 1,
        isPrimary: true,
      }),
    );

    expect(isAdminMobileSidebarToggleHoldActive()).toBe(false);
  });

  it("shows a drag backdrop after the long press activates", () => {
    initAdminMobileSidebarToggleDrag();

    const toggle = document.querySelector<HTMLButtonElement>(
      "[data-admin-sidebar-mobile-toggle]",
    )!;

    toggle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 390,
        clientY: 200,
        pointerId: 1,
        isPrimary: true,
      }),
    );
    vi.advanceTimersByTime(1000);

    expect(isAdminMobileSidebarToggleDragActive()).toBe(true);
    expect(
      document
        .querySelector(".admin-sidebar-mobile-toggle-hold-overlay")
        ?.classList.contains("admin-sidebar-mobile-toggle-hold-overlay--dragging"),
    ).toBe(true);
    expect(
      toggle.classList.contains("admin-sidebar-mobile-toggle--dragging"),
    ).toBe(true);
    expect(
      toggle.querySelector(".admin-sidebar-mobile-toggle__drag-surface"),
    ).not.toBeNull();

    window.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 390,
        clientY: 260,
        pointerId: 1,
        isPrimary: true,
      }),
    );

    expect(isAdminMobileSidebarToggleDragActive()).toBe(false);
    expect(
      toggle.classList.contains("admin-sidebar-mobile-toggle--dragging"),
    ).toBe(false);
    expect(toggle.style.right).toBe("0px");
  });

  it("does not open the sidebar after completing a drag", () => {
    mockMatchMedia(true);
    initAdminMobileSidebar();
    initAdminMobileSidebarToggleDrag();

    const toggle = document.querySelector<HTMLButtonElement>(
      "[data-admin-sidebar-mobile-toggle]",
    )!;

    toggle.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 360,
        clientY: 500,
        pointerId: 1,
        isPrimary: true,
      }),
    );
    vi.advanceTimersByTime(1000);
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        clientX: 360,
        clientY: 520,
        pointerId: 1,
        isPrimary: true,
      }),
    );

    expect(isAdminMobileSidebarOpen()).toBe(false);
  });
});
