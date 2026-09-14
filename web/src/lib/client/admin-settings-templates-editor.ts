import { ADMIN_JSON_ACTION_PATH } from "@/lib/admin-dashboard/json-action-path";
import {
  captureFormSnapshot,
  formHasChanges,
} from "@/lib/client/dashboard-cell-popover-form-state";
import { initTextListPickers } from "@/lib/client/text-list-picker";

type AdminActionJsonResponse = {
  success: boolean;
  error?: string;
};

const initializedFlag = "settingsTemplatesInitialized";
const savingFlag = "settingsTemplatesSaving";

function getCardRoot(form: HTMLFormElement) {
  return form.closest<HTMLElement>("[data-admin-settings-templates]");
}

function getSaveButton(form: HTMLFormElement) {
  return getCardRoot(form)?.querySelector<HTMLButtonElement>("[data-settings-save-button]") ?? null;
}

function getStatusElement(form: HTMLFormElement) {
  return getCardRoot(form)?.querySelector<HTMLElement>("[data-settings-save-status]") ?? null;
}

function setStatus(form: HTMLFormElement, message: string, isError = false) {
  const status = getStatusElement(form);
  if (!status) {
    return;
  }

  status.textContent = message;
  if (!message) {
    status.hidden = true;
    delete status.dataset.state;
    return;
  }

  status.hidden = false;
  status.dataset.state = isError ? "error" : message === "Saved" ? "saved" : "pending";
}

function syncSaveButton(form: HTMLFormElement, snapshot: Record<string, string>) {
  const saveButton = getSaveButton(form);
  if (!saveButton) {
    return;
  }

  saveButton.disabled = !formHasChanges(form, snapshot);
}

export function initAdminSettingsTemplates(root: ParentNode = document) {
  const form = root.querySelector<HTMLFormElement>("[data-settings-templates-form]");
  if (!form || form.dataset[initializedFlag] === "true") {
    return;
  }

  form.dataset[initializedFlag] = "true";
  initTextListPickers(form);
  const snapshot = captureFormSnapshot(form);
  syncSaveButton(form, snapshot);

  form.addEventListener("input", () => {
    syncSaveButton(form, snapshot);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (form.dataset[savingFlag] === "true") {
      return;
    }

    form.dataset[savingFlag] = "true";
    setStatus(form, "Saving...");

    const payload = new FormData(form);
    payload.set("action", "save-platform-settings-templates");

    try {
      const response = await fetch(ADMIN_JSON_ACTION_PATH, {
        method: "POST",
        body: payload,
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      const result = (await response.json()) as AdminActionJsonResponse;
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "Unable to save document template settings.");
      }

      setStatus(form, "Saved");
      window.location.reload();
    } catch (error) {
      setStatus(
        form,
        error instanceof Error ? error.message : "Unable to save document template settings.",
        true,
      );
    } finally {
      delete form.dataset[savingFlag];
    }
  });
}
