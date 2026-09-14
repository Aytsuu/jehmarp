import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hasInteractiveTableLayout,
  resetAppViewportHeightForTests,
  shouldUseVisualViewportHeight,
  syncAppViewportHeight,
} from "./agent-mobile-route";

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

describe("syncAppViewportHeight", () => {
  afterEach(() => {
    resetAppViewportHeightForTests();
  });

  it("sets --app-viewport-height from the provided viewport height", () => {
    syncAppViewportHeight(812.4);

    expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).toBe("812px");
  });

  it("clears the inline viewport height override for tests", () => {
    syncAppViewportHeight(640);
    resetAppViewportHeightForTests();

    expect(document.documentElement.style.getPropertyValue("--app-viewport-height")).toBe("");
  });
});

describe("interactive table viewport height", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("detects interactive table layouts", () => {
    mockMatchMedia(false);
    document.body.innerHTML = `<div data-interactive-table></div>`;
    expect(hasInteractiveTableLayout()).toBe(true);
    expect(shouldUseVisualViewportHeight()).toBe(false);
  });

  it("requires a small-medium viewport for visual viewport syncing", () => {
    mockMatchMedia(true);
    document.body.innerHTML = `<div data-interactive-table></div>`;

    expect(shouldUseVisualViewportHeight()).toBe(true);
  });
});
