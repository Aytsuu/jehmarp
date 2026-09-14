import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initDashboardAlertDialogs } from "./dashboard-alert-dialog";
import {
  closeActiveTableActionMenu,
  computeFloatingMenuPosition,
  getFloatingMenuBounds,
  initTableActionMenus,
} from "./table-action-menu";

function renderActionMenu() {
  document.body.innerHTML = `
    <div class="dashboard-main">
      <div class="table-action-menu" data-table-action-menu>
        <button type="button" data-table-action-menu-trigger aria-expanded="false">Actions</button>
        <div class="table-action-menu__content" data-table-action-menu-content hidden>
          <a href="/details" class="table-action-menu__item">Details</a>
        </div>
      </div>
    </div>
  `;
}

describe("computeFloatingMenuPosition", () => {
  const bounds = {
    left: 284,
    right: 1188,
    top: 12,
    bottom: 788,
  };

  it("aligns to the trigger end when there is room on the left", () => {
    const position = computeFloatingMenuPosition({
      triggerRect: {
        left: 900,
        right: 1000,
        top: 120,
        bottom: 152,
      },
      contentWidth: 192,
      contentHeight: 96,
      bounds,
    });

    expect(position.left).toBe(808);
    expect(position.top).toBe(160);
  });

  it("flips to align start when end alignment would collide with the left boundary", () => {
    const position = computeFloatingMenuPosition({
      triggerRect: {
        left: 300,
        right: 420,
        top: 120,
        bottom: 152,
      },
      contentWidth: 192,
      contentHeight: 96,
      bounds,
    });

    expect(position.left).toBe(300);
    expect(position.top).toBe(160);
  });

  it("opens above the trigger when there is not enough room below", () => {
    const position = computeFloatingMenuPosition({
      triggerRect: {
        left: 900,
        right: 1000,
        top: 700,
        bottom: 732,
      },
      contentWidth: 192,
      contentHeight: 96,
      bounds,
    });

    expect(position.left).toBe(808);
    expect(position.top).toBe(596);
  });
});

describe("getFloatingMenuBounds", () => {
  it("uses the dashboard main content area as the horizontal boundary", () => {
    document.body.innerHTML = `
      <div class="dashboard-sidebar-shell" style="position: fixed; left: 0; top: 0; width: 272px; height: 800px;"></div>
      <div class="dashboard-main" style="position: fixed; left: 272px; top: 0; width: 928px; height: 800px;"></div>
    `;

    const sidebar = document.querySelector<HTMLElement>(".dashboard-sidebar-shell")!;
    const main = document.querySelector<HTMLElement>(".dashboard-main")!;

    vi.spyOn(sidebar, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 272,
      top: 0,
      bottom: 800,
      width: 272,
      height: 800,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    vi.spyOn(main, "getBoundingClientRect").mockReturnValue({
      left: 272,
      right: 1200,
      top: 0,
      bottom: 800,
      width: 928,
      height: 800,
      x: 272,
      y: 0,
      toJSON: () => ({}),
    });

    expect(getFloatingMenuBounds(1200, 800, 12, document)).toEqual({
      left: 284,
      right: 1188,
      top: 12,
      bottom: 788,
    });
  });
});

describe("initTableActionMenus", () => {
  beforeEach(() => {
    renderActionMenu();
    initTableActionMenus();
  });

  afterEach(() => {
    closeActiveTableActionMenu();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("opens the menu when the trigger is clicked", () => {
    const trigger = document.querySelector<HTMLButtonElement>(
      "[data-table-action-menu-trigger]",
    )!;
    const content = document.querySelector<HTMLElement>(
      "[data-table-action-menu-content]",
    )!;

    trigger.click();

    expect(content.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the menu open when a scroll event fires right after opening", () => {
    const trigger = document.querySelector<HTMLButtonElement>(
      "[data-table-action-menu-trigger]",
    )!;
    trigger.click();

    document.dispatchEvent(new Event("scroll", { bubbles: true }));

    const content = document.querySelector<HTMLElement>(
      "[data-table-action-menu-content]",
    )!;
    expect(content.hidden).toBe(false);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("portals menu content to the body so it is not clipped by overflow containers", () => {
    document.body.innerHTML = `
      <section style="overflow: hidden; height: 200px;">
        <div class="table-action-menu" data-table-action-menu id="overflow-menu">
          <button type="button" data-table-action-menu-trigger aria-expanded="false">Actions</button>
          <div class="table-action-menu__content" data-table-action-menu-content hidden>
            <button type="button" class="table-action-menu__item">Details</button>
          </div>
        </div>
      </section>
    `;
    initTableActionMenus();

    const trigger = document.querySelector<HTMLButtonElement>(
      "[data-table-action-menu-trigger]",
    )!;
    trigger.click();

    const content = document.querySelector<HTMLElement>(
      '[data-table-action-menu-content][data-table-action-menu-owner="overflow-menu"]',
    );

    expect(content).not.toBeNull();
    expect(content?.parentElement).toBe(document.body);
    expect(content?.hidden).toBe(false);
  });

  it("positions the menu within the dashboard main content bounds", () => {
    const main = document.querySelector<HTMLElement>(".dashboard-main")!;

    vi.spyOn(main, "getBoundingClientRect").mockReturnValue({
      left: 272,
      right: 1200,
      top: 0,
      bottom: 800,
      width: 928,
      height: 800,
      x: 272,
      y: 0,
      toJSON: () => ({}),
    });

    const trigger = document.querySelector<HTMLButtonElement>(
      "[data-table-action-menu-trigger]",
    )!;

    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      left: 300,
      right: 420,
      top: 120,
      bottom: 152,
      width: 120,
      height: 32,
      x: 300,
      y: 120,
      toJSON: () => ({}),
    });

    const content = document.querySelector<HTMLElement>(
      "[data-table-action-menu-content]",
    )!;

    vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 192,
      top: 0,
      bottom: 96,
      width: 192,
      height: 96,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    trigger.click();

    expect(Number.parseFloat(content.style.left)).toBeGreaterThanOrEqual(284);
    expect(content.style.top).toBe("160px");
  });

  it("only registers listeners once per document", () => {
    const addEventListenerSpy = vi.spyOn(document, "addEventListener");

    initTableActionMenus();

    expect(
      addEventListenerSpy.mock.calls.filter(([eventName]) => eventName === "click"),
    ).toHaveLength(0);
  });

  it("opens alert dialogs from action menu items", () => {
    document.body.innerHTML = `
      <div class="table-action-menu" data-table-action-menu>
        <button type="button" data-table-action-menu-trigger aria-expanded="false">Actions</button>
        <div class="table-action-menu__content" data-table-action-menu-content hidden>
          <button
            type="button"
            class="table-action-menu__item"
            data-open-alert-dialog="convert-order-dialog"
            data-alert-dialog-form="convert-order-form"
          >
            Distribute Order
          </button>
        </div>
      </div>
      <form id="convert-order-form"></form>
      <div
        id="convert-order-dialog"
        class="alert-dialog"
        data-alert-dialog="convert-order-dialog"
        aria-hidden="true"
      >
        <div data-alert-dialog-panel>
          <button type="button" data-alert-dialog-cancel>Cancel</button>
          <button type="button" data-alert-dialog-confirm>Confirm</button>
        </div>
      </div>
    `;

    initDashboardAlertDialogs();
    initTableActionMenus();

    document.querySelector<HTMLButtonElement>("[data-table-action-menu-trigger]")?.click();
    document.querySelector<HTMLButtonElement>(".table-action-menu__item")?.click();

    const dialog = document.getElementById("convert-order-dialog");
    expect(dialog?.classList.contains("alert-dialog--open")).toBe(true);
    expect(dialog?.dataset.alertDialogPendingForm).toBe("convert-order-form");
  });
});
