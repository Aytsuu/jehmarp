import {
  applySidebarTogglePosition,
  getSidebarToggleMetrics,
  getSidebarTogglePositionFromPointer,
  readSidebarTogglePosition,
  SIDEBAR_TOGGLE_DRAG_EDGE_INSET_PX,
  SIDEBAR_TOGGLE_LONG_PRESS_MS,
  SIDEBAR_TOGGLE_MIN_HOLD_BEFORE_MOVE_DRAG_MS,
  SIDEBAR_TOGGLE_MOVE_ACTIVATE_DRAG_PX,
  writeSidebarTogglePosition,
  type SidebarTogglePosition,
} from "@/lib/client/admin-mobile-sidebar-toggle-position";

const HOLD_BLOCK_CLASS = "admin-sidebar-toggle-hold-active";
const DRAG_ACTIVE_CLASS = "admin-sidebar-toggle-drag-active";
const PENDING_OVERLAY_CLASS = "admin-sidebar-mobile-toggle-hold-overlay--pending";
const DRAG_BACKDROP_CLASS = "admin-sidebar-mobile-toggle-hold-overlay--dragging";
const SCROLL_LOCK_OPTIONS = { capture: true, passive: false } as const;

let suppressToggleClick = false;
let holdOverlay: HTMLDivElement | null = null;

export function shouldSuppressAdminMobileSidebarToggleClick() {
  return suppressToggleClick;
}

export function isAdminMobileSidebarToggleHoldActive() {
  return document.documentElement.classList.contains(HOLD_BLOCK_CLASS);
}

export function isAdminMobileSidebarToggleDragActive() {
  return document.documentElement.classList.contains(DRAG_ACTIVE_CLASS);
}

function ensureHoldOverlay() {
  if (!holdOverlay || !holdOverlay.isConnected) {
    holdOverlay = document.createElement("div");
    holdOverlay.className = "admin-sidebar-mobile-toggle-hold-overlay";
    holdOverlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(holdOverlay);
  }

  return holdOverlay;
}

function activatePendingHold() {
  document.documentElement.classList.add(HOLD_BLOCK_CLASS);
  const overlay = ensureHoldOverlay();
  overlay.hidden = false;
  overlay.classList.add(PENDING_OVERLAY_CLASS);
  window.getSelection()?.removeAllRanges();
}

function activateDragBackdrop() {
  const overlay = ensureHoldOverlay();
  overlay.hidden = false;
  overlay.classList.remove(PENDING_OVERLAY_CLASS);
  overlay.classList.add(DRAG_BACKDROP_CLASS);
  document.documentElement.classList.add(DRAG_ACTIVE_CLASS);
}

function deactivateHoldInteraction() {
  document.documentElement.classList.remove(HOLD_BLOCK_CLASS, DRAG_ACTIVE_CLASS);
  if (holdOverlay) {
    holdOverlay.hidden = true;
    holdOverlay.classList.remove(PENDING_OVERLAY_CLASS, DRAG_BACKDROP_CLASS);
  }
}

function getToggleButton() {
  return document.querySelector<HTMLButtonElement>("[data-admin-sidebar-mobile-toggle]");
}

function restoreTogglePosition(button: HTMLButtonElement) {
  const metrics = getSidebarToggleMetrics(button);
  const position = readSidebarTogglePosition();
  applySidebarTogglePosition(button, position, metrics);
}

export function initAdminMobileSidebarToggleDrag() {
  const dashboardWindow = window as Window & {
    adminMobileSidebarToggleDragInitialized?: boolean;
  };

  const toggle = getToggleButton();
  if (toggle) {
    restoreTogglePosition(toggle);
  }

  if (dashboardWindow.adminMobileSidebarToggleDragInitialized) {
    return;
  }
  dashboardWindow.adminMobileSidebarToggleDragInitialized = true;

  let longPressTimer: number | null = null;
  let dragActive = false;
  let activeToggle: HTMLButtonElement | null = null;
  let activePointerId: number | null = null;
  let holdStartedAt = 0;
  let startX = 0;
  let startY = 0;
  let currentPosition: SidebarTogglePosition | null = null;

  const clearLongPressTimer = () => {
    if (longPressTimer !== null) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  const releasePointerListeners = () => {
    window.removeEventListener("pointermove", handlePointerMove, SCROLL_LOCK_OPTIONS);
    window.removeEventListener("pointerup", handlePointerUp, SCROLL_LOCK_OPTIONS);
    window.removeEventListener("pointercancel", handlePointerCancel, SCROLL_LOCK_OPTIONS);
    window.removeEventListener("touchmove", handleTouchMove, SCROLL_LOCK_OPTIONS);
  };

  const resetInteraction = () => {
    const wasDragging = dragActive;
    const toggleToRestore = activeToggle;
    const positionToRestore = currentPosition;

    clearLongPressTimer();
    releasePointerListeners();
    deactivateHoldInteraction();
    dragActive = false;
    holdStartedAt = 0;
    currentPosition = null;

    if (activeToggle) {
      const capturedPointerId = activePointerId;
      activePointerId = null;

      if (
        capturedPointerId !== null &&
        activeToggle.hasPointerCapture?.(capturedPointerId)
      ) {
        activeToggle.releasePointerCapture(capturedPointerId);
      }

      activeToggle.classList.remove(
        "admin-sidebar-mobile-toggle--drag-pending",
        "admin-sidebar-mobile-toggle--dragging",
      );
      activeToggle.style.touchAction = "";

      if (wasDragging && toggleToRestore) {
        const metrics = getSidebarToggleMetrics(toggleToRestore);
        const position = positionToRestore ?? readSidebarTogglePosition();
        applySidebarTogglePosition(toggleToRestore, position, metrics);
      }

      activeToggle = null;
      return;
    }

    activePointerId = null;
  };

  const endDrag = (save: boolean) => {
    if (save && currentPosition) {
      writeSidebarTogglePosition(currentPosition);
    }

    suppressToggleClick = true;
    window.requestAnimationFrame(() => {
      suppressToggleClick = false;
    });

    resetInteraction();
  };

  const activateDragMode = (pointerX: number, pointerY: number) => {
    if (!activeToggle || activePointerId === null || dragActive) {
      return;
    }

    clearLongPressTimer();
    dragActive = true;
    activeToggle.classList.remove("admin-sidebar-mobile-toggle--drag-pending");
    activeToggle.classList.add("admin-sidebar-mobile-toggle--dragging");
    activateDragBackdrop();

    const metrics = getSidebarToggleMetrics(activeToggle);
    currentPosition = getSidebarTogglePositionFromPointer(pointerX, pointerY, metrics);
    applySidebarTogglePosition(activeToggle, currentPosition, metrics, {
      dragInsetPx: SIDEBAR_TOGGLE_DRAG_EDGE_INSET_PX,
    });

    if (activeToggle.setPointerCapture) {
      activeToggle.setPointerCapture(activePointerId);
    }
  };

  const shouldActivateDragFromMovement = (event: PointerEvent) => {
    const heldFor = Date.now() - holdStartedAt;
    if (heldFor < SIDEBAR_TOGGLE_MIN_HOLD_BEFORE_MOVE_DRAG_MS) {
      return false;
    }

    const deltaX = Math.abs(event.clientX - startX);
    const deltaY = Math.abs(event.clientY - startY);
    return (
      deltaX >= SIDEBAR_TOGGLE_MOVE_ACTIVATE_DRAG_PX ||
      deltaY >= SIDEBAR_TOGGLE_MOVE_ACTIVATE_DRAG_PX
    );
  };

  const blockScrollGesture = (event: Event) => {
    if (!activeToggle) {
      return;
    }

    event.preventDefault();
  };

  const handleTouchMove = (event: TouchEvent) => {
    blockScrollGesture(event);
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (!activeToggle || activePointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();

    if (!dragActive) {
      if (shouldActivateDragFromMovement(event)) {
        activateDragMode(event.clientX, event.clientY);
      } else {
        return;
      }
    }
    const metrics = getSidebarToggleMetrics(activeToggle);
    currentPosition = getSidebarTogglePositionFromPointer(
      event.clientX,
      event.clientY,
      metrics,
    );
    applySidebarTogglePosition(activeToggle, currentPosition, metrics, {
      dragInsetPx: SIDEBAR_TOGGLE_DRAG_EDGE_INSET_PX,
    });
  };

  const handlePointerUp = (event: PointerEvent) => {
    if (!activeToggle || activePointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();

    if (dragActive) {
      endDrag(true);
      return;
    }

    resetInteraction();
  };

  const handlePointerCancel = (event: PointerEvent) => {
    if (!activeToggle || activePointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();

    if (dragActive) {
      endDrag(true);
      return;
    }

    resetInteraction();
  };

  document.addEventListener(
    "selectstart",
    (event) => {
      if (!isAdminMobileSidebarToggleHoldActive()) {
        return;
      }

      event.preventDefault();
    },
    true,
  );

  document.addEventListener(
    "dragstart",
    (event) => {
      if (!isAdminMobileSidebarToggleHoldActive()) {
        return;
      }

      event.preventDefault();
    },
    true,
  );

  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !event.isPrimary) {
      return;
    }

    const toggle = target.closest<HTMLButtonElement>("[data-admin-sidebar-mobile-toggle]");
    if (!toggle || toggle.disabled) {
      return;
    }

    activeToggle = toggle;
    activePointerId = event.pointerId;
    holdStartedAt = Date.now();
    startX = event.clientX;
    startY = event.clientY;
    dragActive = false;
    toggle.classList.add("admin-sidebar-mobile-toggle--drag-pending");
    toggle.style.touchAction = "none";
    activatePendingHold();

    if (toggle.setPointerCapture) {
      toggle.setPointerCapture(event.pointerId);
    }

    clearLongPressTimer();
    longPressTimer = window.setTimeout(() => {
      activateDragMode(startX, startY);
    }, SIDEBAR_TOGGLE_LONG_PRESS_MS);

    window.addEventListener("pointermove", handlePointerMove, SCROLL_LOCK_OPTIONS);
    window.addEventListener("pointerup", handlePointerUp, SCROLL_LOCK_OPTIONS);
    window.addEventListener("pointercancel", handlePointerCancel, SCROLL_LOCK_OPTIONS);
    window.addEventListener("touchmove", handleTouchMove, SCROLL_LOCK_OPTIONS);
  });

  window.addEventListener("resize", () => {
    const button = getToggleButton();
    if (!button) {
      return;
    }
    restoreTogglePosition(button);
  });

  document.addEventListener("astro:after-swap", () => {
    const button = getToggleButton();
    if (!button) {
      return;
    }
    restoreTogglePosition(button);
  });
}
