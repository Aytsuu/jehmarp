export type SidebarToggleEdge = "top" | "right" | "bottom" | "left";

export type SidebarTogglePosition = {
  edge: SidebarToggleEdge;
  offset: number;
};

export type SidebarToggleMetrics = {
  viewportWidth: number;
  viewportHeight: number;
  buttonSize: number;
  safeTop: number;
  safeRight: number;
  safeBottom: number;
  safeLeft: number;
};

export const SIDEBAR_TOGGLE_STORAGE_KEY = "admin-sidebar-mobile-toggle-position";
export const SIDEBAR_TOGGLE_LONG_PRESS_MS = 1000;
export const SIDEBAR_TOGGLE_MIN_HOLD_BEFORE_MOVE_DRAG_MS = 400;
export const SIDEBAR_TOGGLE_MOVE_ACTIVATE_DRAG_PX = 8;
export const SIDEBAR_TOGGLE_DRAG_EDGE_INSET_PX = 18;

const VALID_EDGES = new Set<SidebarToggleEdge>(["top", "right", "bottom", "left"]);

export function getDefaultSidebarTogglePosition(): SidebarTogglePosition {
  return { edge: "right", offset: 0 };
}

export function readSidebarTogglePosition(
  storage: Pick<Storage, "getItem"> = localStorage,
): SidebarTogglePosition {
  try {
    const raw = storage.getItem(SIDEBAR_TOGGLE_STORAGE_KEY);
    if (!raw) {
      return getDefaultSidebarTogglePosition();
    }

    const parsed = JSON.parse(raw) as Partial<SidebarTogglePosition>;
    if (
      !parsed.edge ||
      !VALID_EDGES.has(parsed.edge) ||
      typeof parsed.offset !== "number" ||
      !Number.isFinite(parsed.offset) ||
      parsed.offset < 0
    ) {
      return getDefaultSidebarTogglePosition();
    }

    return {
      edge: parsed.edge,
      offset: parsed.offset,
    };
  } catch {
    return getDefaultSidebarTogglePosition();
  }
}

export function writeSidebarTogglePosition(
  position: SidebarTogglePosition,
  storage: Pick<Storage, "setItem"> = localStorage,
) {
  storage.setItem(SIDEBAR_TOGGLE_STORAGE_KEY, JSON.stringify(position));
}

function readCssPx(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getSidebarToggleMetrics(
  button: HTMLElement,
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
): SidebarToggleMetrics {
  const computed = window.getComputedStyle(button);

  return {
    viewportWidth,
    viewportHeight,
    buttonSize: button.offsetWidth || 52,
    safeTop: readCssPx(computed.getPropertyValue("--sidebar-toggle-safe-top")),
    safeRight: readCssPx(computed.getPropertyValue("--sidebar-toggle-safe-right")),
    safeBottom: readCssPx(computed.getPropertyValue("--sidebar-toggle-safe-bottom")),
    safeLeft: readCssPx(computed.getPropertyValue("--sidebar-toggle-safe-left")),
  };
}

export function getMaxSidebarToggleOffset(
  edge: SidebarToggleEdge,
  metrics: SidebarToggleMetrics,
): number {
  if (edge === "left" || edge === "right") {
    return Math.max(
      0,
      metrics.viewportHeight -
        metrics.buttonSize -
        metrics.safeTop -
        metrics.safeBottom,
    );
  }

  return Math.max(
    0,
    metrics.viewportWidth -
      metrics.buttonSize -
      metrics.safeLeft -
      metrics.safeRight,
  );
}

export function clampSidebarToggleOffset(
  edge: SidebarToggleEdge,
  offset: number,
  metrics: SidebarToggleMetrics,
): number {
  const maxOffset = getMaxSidebarToggleOffset(edge, metrics);
  return Math.min(Math.max(0, offset), maxOffset);
}

export function getNearestSidebarToggleEdge(
  x: number,
  y: number,
  metrics: SidebarToggleMetrics,
): SidebarToggleEdge {
  const distanceTop = y;
  const distanceBottom = metrics.viewportHeight - y;
  const distanceLeft = x;
  const distanceRight = metrics.viewportWidth - x;
  const minDistance = Math.min(distanceTop, distanceBottom, distanceLeft, distanceRight);

  if (minDistance === distanceTop) {
    return "top";
  }
  if (minDistance === distanceBottom) {
    return "bottom";
  }
  if (minDistance === distanceLeft) {
    return "left";
  }
  return "right";
}

export function getSidebarToggleOffsetForPointer(
  edge: SidebarToggleEdge,
  x: number,
  y: number,
  metrics: SidebarToggleMetrics,
): number {
  if (edge === "left" || edge === "right") {
    return clampSidebarToggleOffset(
      edge,
      y - metrics.buttonSize / 2 - metrics.safeTop,
      metrics,
    );
  }

  return clampSidebarToggleOffset(
    edge,
    x - metrics.buttonSize / 2 - metrics.safeLeft,
    metrics,
  );
}

export function getSidebarTogglePositionFromPointer(
  x: number,
  y: number,
  metrics: SidebarToggleMetrics,
): SidebarTogglePosition {
  const edge = getNearestSidebarToggleEdge(x, y, metrics);
  return {
    edge,
    offset: getSidebarToggleOffsetForPointer(edge, x, y, metrics),
  };
}

export function applySidebarTogglePosition(
  button: HTMLElement,
  position: SidebarTogglePosition,
  metrics: SidebarToggleMetrics,
  options?: { dragInsetPx?: number },
) {
  const clampedOffset = clampSidebarToggleOffset(position.edge, position.offset, metrics);
  const dragInsetPx = Math.max(0, options?.dragInsetPx ?? 0);

  button.dataset.edge = position.edge;
  button.style.left = "auto";
  button.style.right = "auto";
  button.style.top = "auto";
  button.style.bottom = "auto";

  switch (position.edge) {
    case "right":
      button.style.right = `${metrics.safeRight + dragInsetPx}px`;
      button.style.top = `${metrics.safeTop + clampedOffset}px`;
      break;
    case "left":
      button.style.left = `${metrics.safeLeft + dragInsetPx}px`;
      button.style.top = `${metrics.safeTop + clampedOffset}px`;
      break;
    case "top":
      button.style.top = `${metrics.safeTop + dragInsetPx}px`;
      button.style.left = `${metrics.safeLeft + clampedOffset}px`;
      break;
    case "bottom":
      button.style.bottom = `${metrics.safeBottom + dragInsetPx}px`;
      button.style.left = `${metrics.safeLeft + clampedOffset}px`;
      break;
  }
}
