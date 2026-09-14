import {
  applyDashboardFilterModal,
  clearDashboardFilterModal,
  getDashboardFilterModalConfigs,
  initDashboardFilterModals,
  syncDashboardFilterModalFromForm,
  syncDashboardFilterTriggerState,
} from "@/lib/client/dashboard-filter-modal";

const productFilterModalConfig = getDashboardFilterModalConfigs().find(
  (config) => config.modalId === "product-filters-modal",
)!;

export function syncProductFilterModalFromForm() {
  syncDashboardFilterModalFromForm(productFilterModalConfig);
}

export function syncProductFilterTriggerState() {
  syncDashboardFilterTriggerState(productFilterModalConfig);
}

export function applyProductFilterModal() {
  applyDashboardFilterModal(productFilterModalConfig);
}

export function clearProductFilterModal() {
  clearDashboardFilterModal(productFilterModalConfig);
}

export function initProductFilterModal() {
  initDashboardFilterModals();
}
