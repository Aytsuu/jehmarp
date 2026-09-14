import { openAlertDialogFromTrigger } from "./dashboard-alert-dialog";

let activeMenu: HTMLElement | null = null;
let activeMenuOpenedAt = 0;

const initializedDocuments = new WeakSet<Document>();

type PortaledMenuContent = {
  content: HTMLElement;
  placeholder: Comment;
};

const portaledMenuContent = new Map<HTMLElement, PortaledMenuContent>();

export type FloatingMenuBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type FloatingMenuPositionInput = {
  triggerRect: Pick<DOMRect, "left" | "right" | "top" | "bottom">;
  contentWidth: number;
  contentHeight: number;
  bounds: FloatingMenuBounds;
  gap?: number;
};

export type FloatingMenuPosition = {
  left: number;
  top: number;
};

export function getFloatingMenuBounds(
  viewportWidth = window.innerWidth,
  viewportHeight = window.innerHeight,
  gutter = 12,
  root: ParentNode = document,
): FloatingMenuBounds {
  let left = gutter;
  let right = viewportWidth - gutter;

  const main = root.querySelector<HTMLElement>(".dashboard-main");
  if (main) {
    const mainRect = main.getBoundingClientRect();
    if (mainRect.width > 0) {
      left = Math.max(left, mainRect.left + gutter);
      right = Math.min(right, mainRect.right - gutter);
    }
  }

  const sidebar = root.querySelector<HTMLElement>(".dashboard-sidebar-shell");
  if (sidebar) {
    const sidebarRect = sidebar.getBoundingClientRect();
    if (sidebarRect.width > 0 && sidebarRect.right > left) {
      left = Math.max(left, sidebarRect.right + gutter);
    }
  }

  if (right < left) {
    right = left;
  }

  return {
    left,
    right,
    top: gutter,
    bottom: viewportHeight - gutter,
  };
}

function getHorizontalOverflow(left: number, width: number, bounds: FloatingMenuBounds) {
  let overflow = 0;

  if (left < bounds.left) {
    overflow += bounds.left - left;
  }

  if (left + width > bounds.right) {
    overflow += left + width - bounds.right;
  }

  return overflow;
}

export function computeFloatingMenuPosition({
  triggerRect,
  contentWidth,
  contentHeight,
  bounds,
  gap = 8,
}: FloatingMenuPositionInput): FloatingMenuPosition {
  const horizontalCandidates = [
    triggerRect.right - contentWidth,
    triggerRect.left,
  ];

  let left = horizontalCandidates[0];
  let bestOverflow = getHorizontalOverflow(left, contentWidth, bounds);

  for (let index = 1; index < horizontalCandidates.length; index += 1) {
    const candidate = horizontalCandidates[index];
    const overflow = getHorizontalOverflow(candidate, contentWidth, bounds);

    if (overflow < bestOverflow) {
      left = candidate;
      bestOverflow = overflow;
    }
  }

  if (left < bounds.left) {
    left = bounds.left;
  }

  if (left + contentWidth > bounds.right) {
    left = Math.max(bounds.left, bounds.right - contentWidth);
  }

  let top = triggerRect.bottom + gap;

  if (top + contentHeight > bounds.bottom) {
    top = triggerRect.top - contentHeight - gap;
  }

  if (top < bounds.top) {
    top = bounds.top;
  }

  if (top + contentHeight > bounds.bottom) {
    top = Math.max(bounds.top, bounds.bottom - contentHeight);
  }

  return { left, top };
}

function getMenuContent(menu: HTMLElement) {
  const portaled = portaledMenuContent.get(menu);
  if (portaled) {
    return portaled.content;
  }

  return menu.querySelector<HTMLElement>("[data-table-action-menu-content]");
}

function portalMenuContent(menu: HTMLElement, content: HTMLElement) {
  if (portaledMenuContent.has(menu)) {
    return;
  }

  const placeholder = document.createComment("table-action-menu-content-anchor");
  content.parentElement?.insertBefore(placeholder, content);

  if (menu.id) {
    content.dataset.tableActionMenuOwner = menu.id;
  }

  document.body.appendChild(content);
  portaledMenuContent.set(menu, { content, placeholder });
}

function restoreMenuContent(menu: HTMLElement) {
  const portaled = portaledMenuContent.get(menu);
  if (!portaled) {
    return;
  }

  const { content, placeholder } = portaled;
  placeholder.parentElement?.insertBefore(content, placeholder);
  placeholder.remove();
  delete content.dataset.tableActionMenuOwner;
  portaledMenuContent.delete(menu);
}

function resolveMenuForActionTarget(target: Element) {
  const menuFromRoot = target.closest<HTMLElement>("[data-table-action-menu]");
  if (menuFromRoot) {
    return menuFromRoot;
  }

  const portaledContent = target.closest<HTMLElement>("[data-table-action-menu-content]");
  const ownerId = portaledContent?.dataset.tableActionMenuOwner;
  if (!ownerId) {
    return activeMenu;
  }

  return document.getElementById(ownerId);
}

function closeMenu(menu: HTMLElement | null) {
  if (!menu) return;

  const trigger = menu.querySelector<HTMLElement>("[data-table-action-menu-trigger]");
  const content = getMenuContent(menu);

  if (content) {
    content.hidden = true;
    content.style.left = "";
    content.style.top = "";
  }

  restoreMenuContent(menu);
  trigger?.setAttribute("aria-expanded", "false");

  if (activeMenu === menu) {
    activeMenu = null;
    activeMenuOpenedAt = 0;
  }
}

function showMenuContent(content: HTMLElement) {
  content.hidden = false;
  content.removeAttribute("hidden");
  content.style.pointerEvents = "auto";
}

function positionMenuContent(
  menu: HTMLElement,
  anchor: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
  attempt = 0,
) {
  const content = getMenuContent(menu);
  if (!content) return;

  portalMenuContent(menu, content);

  const bounds = getFloatingMenuBounds();
  const gap = 8;

  showMenuContent(content);

  const applyPosition = () => {
    const contentRect = content.getBoundingClientRect();
    if ((contentRect.width === 0 || contentRect.height === 0) && attempt < 12) {
      window.requestAnimationFrame(() => {
        positionMenuContent(menu, anchor, attempt + 1);
      });
      return;
    }

    const { left, top } = computeFloatingMenuPosition({
      triggerRect: anchor,
      contentWidth: contentRect.width > 0 ? contentRect.width : 192,
      contentHeight: contentRect.height > 0 ? contentRect.height : 96,
      bounds,
      gap,
    });

    content.style.left = `${left}px`;
    content.style.top = `${top}px`;
  };

  applyPosition();
}

function positionMenu(menu: HTMLElement) {
  const trigger = menu.querySelector<HTMLElement>("[data-table-action-menu-trigger]");
  if (!trigger) return;

  positionMenuContent(menu, trigger.getBoundingClientRect());
}

function openMenu(menu: HTMLElement) {
  if (activeMenu && activeMenu !== menu) {
    closeMenu(activeMenu);
  }

  const trigger = menu.querySelector<HTMLElement>("[data-table-action-menu-trigger]");
  trigger?.setAttribute("aria-expanded", "true");
  positionMenu(menu);
  activeMenu = menu;
  activeMenuOpenedAt = Date.now();
}

function toggleMenu(menu: HTMLElement) {
  const trigger = menu.querySelector<HTMLElement>("[data-table-action-menu-trigger]");
  if (trigger?.hasAttribute("disabled")) return;

  const content = getMenuContent(menu);
  if (!content || content.hidden) {
    openMenu(menu);
    return;
  }

  closeMenu(menu);
}

function handleDocumentClick(event: MouseEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const trigger = target.closest<HTMLElement>("[data-table-action-menu-trigger]");
  if (trigger) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const menu = trigger.closest<HTMLElement>("[data-table-action-menu]");
    if (menu) {
      toggleMenu(menu);
    }
    return;
  }

  const menuAction = target.closest<HTMLElement>(".table-action-menu__item");
  if (menuAction) {
    const menu = resolveMenuForActionTarget(menuAction);
    const openedAlertDialog = openAlertDialogFromTrigger(menuAction);

    closeMenu(menu ?? null);

    if (openedAlertDialog) {
      event.preventDefault();
      event.stopPropagation();
    }

    return;
  }

  if (activeMenu && !target.closest("[data-table-action-menu-content]")) {
    closeMenu(activeMenu);
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && activeMenu) {
    closeMenu(activeMenu);
  }
}

function handleWindowResize() {
  if (activeMenu) {
    positionMenu(activeMenu);
  }
}

function handleDocumentScroll() {
  if (!activeMenu) return;

  positionMenu(activeMenu);
}

export function initTableActionMenus(root: Document = document) {
  if (!root.body || initializedDocuments.has(root)) return;
  initializedDocuments.add(root);

  root.addEventListener("click", handleDocumentClick);
  root.addEventListener("keydown", handleDocumentKeydown);
  window.addEventListener("resize", handleWindowResize);
  root.addEventListener("scroll", handleDocumentScroll, true);

  root.addEventListener("astro:after-swap", () => {
    closeMenu(activeMenu);
  });
}

export function closeActiveTableActionMenu() {
  closeMenu(activeMenu);
}

export function openTableActionMenuFromAnchor(
  menu: HTMLElement,
  anchor: HTMLElement,
) {
  if (anchor.hasAttribute("disabled")) return;

  const trigger = menu.querySelector<HTMLElement>("[data-table-action-menu-trigger]");
  if (activeMenu && activeMenu !== menu) {
    closeMenu(activeMenu);
  }

  trigger?.setAttribute("aria-expanded", "true");
  positionMenuContent(menu, anchor.getBoundingClientRect());
  activeMenu = menu;
  activeMenuOpenedAt = Date.now();
}

export function getPortaledMenuContent(menuId: string) {
  return document.querySelector<HTMLElement>(
    `[data-table-action-menu-content][data-table-action-menu-owner="${menuId}"]`,
  );
}
