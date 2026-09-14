import { describe, expect, it } from "vitest";

import {
  applySidebarTogglePosition,
  clampSidebarToggleOffset,
  getDefaultSidebarTogglePosition,
  getMaxSidebarToggleOffset,
  getNearestSidebarToggleEdge,
  getSidebarToggleOffsetForPointer,
  getSidebarTogglePositionFromPointer,
  readSidebarTogglePosition,
  writeSidebarTogglePosition,
  type SidebarToggleMetrics,
} from "./admin-mobile-sidebar-toggle-position";

const metrics: SidebarToggleMetrics = {
  viewportWidth: 400,
  viewportHeight: 800,
  buttonSize: 52,
  safeTop: 0,
  safeRight: 0,
  safeBottom: 0,
  safeLeft: 0,
};

describe("admin-mobile-sidebar-toggle-position", () => {
  it("returns the default top-right edge position", () => {
    expect(getDefaultSidebarTogglePosition()).toEqual({ edge: "right", offset: 0 });
  });

  it("reads and writes persisted positions", () => {
    const storage = new Map<string, string>();

    writeSidebarTogglePosition({ edge: "left", offset: 120 }, {
      setItem: (key, value) => storage.set(key, value),
    });

    expect(
      readSidebarTogglePosition({
        getItem: (key) => storage.get(key) ?? null,
      }),
    ).toEqual({ edge: "left", offset: 120 });
  });

  it("chooses the nearest edge from pointer coordinates", () => {
    expect(getNearestSidebarToggleEdge(10, 10, metrics)).toBe("top");
    expect(getNearestSidebarToggleEdge(390, 400, metrics)).toBe("right");
    expect(getNearestSidebarToggleEdge(200, 790, metrics)).toBe("bottom");
  });

  it("clamps offsets within the available edge length", () => {
    expect(getMaxSidebarToggleOffset("right", metrics)).toBe(748);
    expect(clampSidebarToggleOffset("right", 900, metrics)).toBe(748);
  });

  it("projects pointer coordinates onto an edge offset", () => {
    expect(getSidebarTogglePositionFromPointer(390, 200, metrics)).toEqual({
      edge: "right",
      offset: 174,
    });
  });

  it("applies edge-locked coordinates to the toggle button", () => {
    document.body.innerHTML = `<button type="button" style="width:52px;height:52px"></button>`;
    const button = document.querySelector<HTMLButtonElement>("button");
    expect(button).not.toBeNull();

    applySidebarTogglePosition(button!, { edge: "bottom", offset: 80 }, metrics);

    expect(button?.dataset.edge).toBe("bottom");
    expect(button?.style.bottom).toBe("0px");
    expect(button?.style.left).toBe("80px");
  });
});
