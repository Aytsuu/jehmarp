import {
  consumeDashboardFragmentRefreshNeeded,
  readDashboardFragmentCache,
  writeDashboardFragmentCache,
} from "./dashboard-fragment-cache";

type DashboardFragmentTableConfig = {
  cacheKey: string;
  fragmentPath: string;
  pagePath: string;
  formSelector: string;
  tableShellSelector: string;
  skeletonTemplateSelector: string;
  filterKeys: readonly string[];
  searchInputSelector?: string;
  historyStateKey: string;
  updatedEvents?: readonly string[];
};

const pageSizes = [10, 50, 100];
const fragmentTableConfigs = new Map<string, DashboardFragmentTableConfig>();
const activeFetches = new Map<string, AbortController>();
const searchTimers = new Map<string, number>();
const submitTimers = new Map<string, number>();

let delegationBound = false;

function getForm(config: DashboardFragmentTableConfig) {
  return document.querySelector<HTMLFormElement>(config.formSelector);
}

function getTableShell(config: DashboardFragmentTableConfig) {
  return document.querySelector<HTMLElement>(config.tableShellSelector);
}

function getContainer(config: DashboardFragmentTableConfig) {
  return getTableShell(config)?.closest<HTMLElement>("[data-interactive-table]") ?? null;
}

function getSkeletonTemplate(config: DashboardFragmentTableConfig) {
  return document.querySelector<HTMLTemplateElement>(config.skeletonTemplateSelector);
}

function readTableBoardScroll(tableShell: HTMLElement) {
  const board = tableShell.querySelector<HTMLElement>(".dashboard-table-board");

  return {
    left: board?.scrollLeft ?? 0,
    top: board?.scrollTop ?? 0,
  };
}

function restoreTableBoardScroll(
  tableShell: HTMLElement,
  scroll: { left: number; top: number },
) {
  const board = tableShell.querySelector<HTMLElement>(".dashboard-table-board");
  if (!board || (scroll.left === 0 && scroll.top === 0)) return;

  const apply = () => {
    if (!board.isConnected) return;
    board.scrollLeft = scroll.left;
    board.scrollTop = scroll.top;
  };

  apply();
  requestAnimationFrame(apply);
}

function resolveConfigForElement(element: Element) {
  for (const config of fragmentTableConfigs.values()) {
    const container = getContainer(config);
    const form = getForm(config);

    if (container?.contains(element) || form?.contains(element)) {
      return config;
    }
  }

  return null;
}

function applyPaginationParams(
  params: URLSearchParams,
  page: number,
  pageSize: number,
) {
  if (page > 1) {
    params.set("page", String(page));
  } else {
    params.delete("page");
  }

  if (pageSize !== 10) {
    params.set("pageSize", String(pageSize));
  } else {
    params.delete("pageSize");
  }
}

function normalizeParams(config: DashboardFragmentTableConfig, params: URLSearchParams) {
  const normalized = new URLSearchParams();

  config.filterKeys.forEach((key) => {
    const value = params.get(key)?.trim();
    if (value) normalized.set(key, value);
  });

  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "10");
  applyPaginationParams(
    normalized,
    Number.isInteger(page) && page > 0 ? page : 1,
    pageSizes.includes(pageSize) ? pageSize : 10,
  );

  return normalized.toString();
}

function currentPageSize(config: DashboardFragmentTableConfig) {
  const value = Number(
    getContainer(config)?.querySelector<HTMLSelectElement>("[data-limit-select]")?.value ?? "10",
  );

  return pageSizes.includes(value) ? value : 10;
}

function currentTotalPages(config: DashboardFragmentTableConfig) {
  const footer = getContainer(config)?.querySelector<HTMLElement>("[data-server-pagination-footer]");
  const totalPages = Number(footer?.dataset.totalPages ?? "1");

  return Number.isInteger(totalPages) && totalPages > 0 ? totalPages : 1;
}

function normalizeFormQuery(
  config: DashboardFragmentTableConfig,
  options: { page?: number; pageSize?: number } = {},
) {
  const form = getForm(config);
  const params = new URLSearchParams();

  if (form) {
    const formData = new FormData(form);
    config.filterKeys.forEach((key) => {
      const value = formData.get(key);
      if (typeof value === "string" && value.trim()) {
        params.set(key, value.trim());
      }
    });
  }

  applyPaginationParams(
    params,
    options.page ?? 1,
    options.pageSize ?? currentPageSize(config),
  );

  return params.toString();
}

function buildUrl(path: string, targetQuery: string) {
  return targetQuery ? `${path}?${targetQuery}` : path;
}

function copyDataset(source: HTMLElement, target: HTMLElement) {
  Object.keys(target.dataset).forEach((key) => {
    delete target.dataset[key];
  });
  Object.entries(source.dataset).forEach(([key, value]) => {
    target.dataset[key] = value;
  });
}

function showSkeletonForQuery(config: DashboardFragmentTableConfig, targetQuery: string) {
  const tableShell = getTableShell(config);
  const skeletonTemplate = getSkeletonTemplate(config);
  if (!tableShell || !skeletonTemplate) return;

  const currentQuery = normalizeParams(config, new URLSearchParams(window.location.search));
  const cachedFragment = readDashboardFragmentCache(config.cacheKey, targetQuery);

  if (targetQuery === currentQuery || cachedFragment) return;

  const skeleton = skeletonTemplate.content.firstElementChild?.cloneNode(true);
  if (!skeleton) return;

  const scroll = readTableBoardScroll(tableShell);
  tableShell.replaceChildren(skeleton);
  restoreTableBoardScroll(tableShell, scroll);
}

function replaceFragment(config: DashboardFragmentTableConfig, fragmentHtml: string) {
  const tableShell = getTableShell(config);
  const container = getContainer(config);
  if (!tableShell || !container) {
    throw new Error("Dashboard fragment did not include the expected table.");
  }

  const parsed = new DOMParser().parseFromString(fragmentHtml, "text/html");
  const nextTableShell = parsed.querySelector<HTMLElement>(config.tableShellSelector);
  const nextFooter = parsed.querySelector<HTMLElement>("[data-server-pagination-footer]");
  const currentFooter = container.querySelector<HTMLElement>("[data-server-pagination-footer]");

  if (!nextTableShell) {
    throw new Error("Dashboard fragment did not include the expected table.");
  }

  const scroll = readTableBoardScroll(tableShell);
  tableShell.innerHTML = nextTableShell.innerHTML;
  if (nextFooter && currentFooter) {
    currentFooter.innerHTML = nextFooter.innerHTML;
    copyDataset(nextFooter, currentFooter);
  }

  document.dispatchEvent(new Event("dashboard:interactive-table-updated"));
  restoreTableBoardScroll(tableShell, scroll);
  config.updatedEvents?.forEach((eventName) => {
    document.dispatchEvent(new Event(eventName));
  });
}

async function applyQuery(
  config: DashboardFragmentTableConfig,
  targetQuery: string,
  options: { force?: boolean } = {},
) {
  const form = getForm(config);
  if (!form) return;

  const currentQuery = normalizeParams(config, new URLSearchParams(window.location.search));

  if (!options.force && targetQuery === currentQuery) return;

  if (!options.force) {
    const cachedFragment = readDashboardFragmentCache(config.cacheKey, targetQuery);
    if (cachedFragment) {
      window.history.replaceState(
        { [config.historyStateKey]: targetQuery },
        "",
        buildUrl(config.pagePath, targetQuery),
      );
      replaceFragment(config, cachedFragment);
      form.dataset.currentFilterQuery = targetQuery;
      return;
    }
  }

  showSkeletonForQuery(config, targetQuery);
  activeFetches.get(config.formSelector)?.abort();

  const fetchController = new AbortController();
  activeFetches.set(config.formSelector, fetchController);

  try {
    const response = await fetch(buildUrl(config.fragmentPath, targetQuery), {
      cache: "no-store",
      headers: {
        "X-Requested-With": "fetch",
      },
      signal: fetchController.signal,
    });

    const fragmentHtml = await window.readDashboardFragmentResponse(response);
    window.history.replaceState(
      { [config.historyStateKey]: targetQuery },
      "",
      buildUrl(config.pagePath, targetQuery),
    );
    replaceFragment(config, fragmentHtml);
    form.dataset.currentFilterQuery = targetQuery;
    writeDashboardFragmentCache(config.cacheKey, targetQuery, fragmentHtml);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;

    window.location.href = buildUrl(config.pagePath, targetQuery);
  } finally {
    if (activeFetches.get(config.formSelector) === fetchController) {
      activeFetches.delete(config.formSelector);
    }
  }
}

function navigateToPage(config: DashboardFragmentTableConfig, page: number) {
  const totalPages = currentTotalPages(config);
  const nextPage = Math.min(Math.max(page, 1), totalPages);

  void applyQuery(config, normalizeFormQuery(config, {
    page: nextPage,
    pageSize: currentPageSize(config),
  }));
}

function submitFilters(config: DashboardFragmentTableConfig) {
  window.clearTimeout(submitTimers.get(config.formSelector));
  const timer = window.setTimeout(() => {
    void applyQuery(config, normalizeFormQuery(config, { page: 1 }));
  }, 120);
  submitTimers.set(config.formSelector, timer);
}

function scheduleSearchFilters(config: DashboardFragmentTableConfig) {
  window.clearTimeout(searchTimers.get(config.formSelector));
  const timer = window.setTimeout(() => {
    submitFilters(config);
  }, 450);
  searchTimers.set(config.formSelector, timer);
}

function bootstrapFragmentTable(config: DashboardFragmentTableConfig) {
  const form = getForm(config);
  const tableShell = getTableShell(config);
  const skeletonTemplate = getSkeletonTemplate(config);
  const container = getContainer(config);

  if (!form || !tableShell || !skeletonTemplate || !container) return;
  if (form.dataset.fragmentTableBootstrapped === "true") return;

  form.dataset.fragmentTableBootstrapped = "true";

  const initialQuery = normalizeParams(config, new URLSearchParams(window.location.search));

  if (consumeDashboardFragmentRefreshNeeded()) {
    void applyQuery(config, initialQuery, { force: true });
  } else {
    writeDashboardFragmentCache(
      config.cacheKey,
      initialQuery,
      container.outerHTML,
    );
  }
}

const paginationControlSelector =
  "[data-pagination-prev], [data-pagination-next], [data-pagination-page-input], [data-limit-select]";

function isPaginationControl(element: Element) {
  return element.matches(paginationControlSelector)
    || Boolean(element.closest("[data-server-pagination-footer]"));
}

function bindFragmentTableDelegation() {
  if (delegationBound) return;
  delegationBound = true;

  const delegationOptions = { capture: true } as const;

  document.addEventListener("submit", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement)) return;

    for (const config of fragmentTableConfigs.values()) {
      if (!target.matches(config.formSelector)) continue;

      event.preventDefault();
      void applyQuery(config, normalizeFormQuery(config, { page: 1 }));
      return;
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;

    for (const config of fragmentTableConfigs.values()) {
      if (!config.searchInputSelector || !target.matches(config.searchInputSelector)) continue;
      if (!getForm(config)?.contains(target)) continue;

      scheduleSearchFilters(config);
      return;
    }
  });

  document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!isPaginationControl(target)) {
      const formConfig = fragmentTableConfigs.values().find((config) => {
        const form = getForm(config);
        return form?.contains(target) && target instanceof HTMLSelectElement;
      });

      if (formConfig) {
        submitFilters(formConfig);
      }

      return;
    }

    const config = resolveConfigForElement(target);
    if (!config) return;

    if (target instanceof HTMLSelectElement && target.matches("[data-limit-select]")) {
      event.preventDefault();
      const pageSize = Number(target.value);
      void applyQuery(config, normalizeFormQuery(config, {
        page: 1,
        pageSize: pageSizes.includes(pageSize) ? pageSize : 10,
      }));
      return;
    }

    if (target instanceof HTMLInputElement && target.matches("[data-pagination-page-input]")) {
      event.preventDefault();
      const page = Number(target.value);
      navigateToPage(config, Number.isInteger(page) && page > 0 ? page : 1);
    }
  }, delegationOptions);

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.matches("[data-pagination-page-input]")) {
      return;
    }

    if (event.key !== "Enter") return;

    const config = resolveConfigForElement(target);
    if (!config) return;

    event.preventDefault();
    const page = Number(target.value);
    navigateToPage(config, Number.isInteger(page) && page > 0 ? page : 1);
  }, delegationOptions);

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const button = target.closest<HTMLButtonElement>("[data-page]");
    if (!button || button.disabled) return;
    if (!isPaginationControl(button)) return;

    const config = resolveConfigForElement(button);
    if (!config) return;

    event.preventDefault();
    const page = Number(button.dataset.page ?? "1");
    navigateToPage(config, Number.isInteger(page) && page > 0 ? page : 1);
  }, delegationOptions);
}

export function applyDashboardFragmentFormFilters(form: HTMLFormElement) {
  for (const config of fragmentTableConfigs.values()) {
    if (!form.matches(config.formSelector)) continue;

    void applyQuery(config, normalizeFormQuery(config, { page: 1 }));
    return;
  }
}

export function initDashboardFragmentTable(config: DashboardFragmentTableConfig) {
  const form = getForm(config);
  const tableShell = getTableShell(config);
  const skeletonTemplate = getSkeletonTemplate(config);
  const container = getContainer(config);

  if (!form || !tableShell || !skeletonTemplate || !container) return;

  fragmentTableConfigs.set(config.formSelector, config);
  bindFragmentTableDelegation();
  bootstrapFragmentTable(config);
}
