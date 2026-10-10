import { ADMIN_JSON_ACTION_PATH } from "@/lib/admin-dashboard/json-action-path";
import {
  captureFormSnapshot,
  formHasChanges,
} from "@/lib/client/dashboard-cell-popover-form-state";
import {
  DEFAULT_WEB_LOGO_URL,
  hasCustomBrandLogo,
} from "@/lib/platform-settings/default-logo";
import { resolvePublicStorageUrl } from "@/lib/supabase/storage";

type AdminActionJsonResponse = {
  success: boolean;
  error?: string;
  sectionContent?: {
    logoPath?: string | null;
    logoUrl?: string | null;
    primaryEmail?: string;
    secondaryEmail?: string;
    customerCreditLimit?: number;
  };
};

const initializedFlag = "settingsGeneralInitialized";
const savingFlag = "settingsGeneralSaving";

function getCardRoot(form: HTMLFormElement) {
  return form.closest<HTMLElement>("[data-admin-settings-general]");
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

function syncLogoEmptyState(form: HTMLFormElement, hasLogo: boolean) {
  form.querySelector<HTMLElement>("[data-settings-logo-editable]")?.classList.toggle("is-empty", !hasLogo);
}

function syncLogoPreview(form: HTMLFormElement, logoUrl: string | null, logoPath: string | null) {
  const logoInput = form.querySelector<HTMLInputElement>('input[name="logoPath"]');
  if (logoInput) {
    logoInput.value = logoPath ?? "";
  }

  const preview = form.querySelector<HTMLImageElement>("[data-settings-logo-preview]");
  const placeholder = form.querySelector<HTMLElement>("[data-settings-logo-placeholder]");
  const hasCustomLogo = hasCustomBrandLogo(logoPath);
  const displayLogoUrl = logoUrl ?? DEFAULT_WEB_LOGO_URL;

  if (preview) {
    preview.src = displayLogoUrl;
    preview.hidden = false;
  }

  if (hasCustomLogo) {
    placeholder?.setAttribute("hidden", "true");
    syncLogoEmptyState(form, true);
    return;
  }

  placeholder?.setAttribute("hidden", "true");
  syncLogoEmptyState(form, false);
}

function buildGeneralSettingsFormData(form: HTMLFormElement) {
  const formData = new FormData();
  formData.set("action", "save-platform-settings-general");
  formData.set("tradeName", form.querySelector<HTMLInputElement>('input[name="tradeName"]')?.value.trim() ?? "");
  formData.set("phone", form.querySelector<HTMLInputElement>('input[name="phone"]')?.value.trim() ?? "");
  formData.set("primaryEmail", form.querySelector<HTMLInputElement>('input[name="primaryEmail"]')?.value.trim() ?? "");
  formData.set("secondaryEmail", form.querySelector<HTMLInputElement>('input[name="secondaryEmail"]')?.value.trim() ?? "");
  formData.set(
    "customerCreditLimit",
    form.querySelector<HTMLInputElement>('input[name="customerCreditLimit"]')?.value.trim() ?? "",
  );
  formData.set("logoPath", form.querySelector<HTMLInputElement>('input[name="logoPath"]')?.value ?? "");

  const logoFile = form.querySelector<HTMLInputElement>('input[name="logoFile"]')?.files?.[0];
  if (logoFile && logoFile.size > 0) {
    formData.set("logoFile", logoFile);
  }

  return formData;
}

function syncSaveButtonState(form: HTMLFormElement, snapshot: Record<string, string>) {
  const saveButton = getSaveButton(form);
  if (!saveButton) {
    return;
  }

  const isSaving = form.dataset[savingFlag] === "true";
  saveButton.disabled = isSaving || !formHasChanges(form, snapshot);
}

async function submitGeneralSettings(
  form: HTMLFormElement,
  getSnapshot: () => Record<string, string>,
  commitSnapshot: (nextSnapshot: Record<string, string>) => void,
) {
  const snapshot = getSnapshot();
  if (form.dataset[savingFlag] === "true" || !formHasChanges(form, snapshot)) {
    return;
  }

  form.dataset[savingFlag] = "true";
  syncSaveButtonState(form, snapshot);
  setStatus(form, "Saving...");

  try {
    const response = await fetch(ADMIN_JSON_ACTION_PATH, {
      method: "POST",
      body: buildGeneralSettingsFormData(form),
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    const result = (await response.json()) as AdminActionJsonResponse;
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Unable to save settings.");
    }

    const content = result.sectionContent;
    if (content) {
      syncLogoPreview(
        form,
        content.logoUrl ?? resolvePublicStorageUrl(content.logoPath ?? null),
        content.logoPath ?? null,
      );

      const logoFileInput = form.querySelector<HTMLInputElement>('input[name="logoFile"]');
      if (logoFileInput) {
        logoFileInput.value = "";
      }
    }

    commitSnapshot(captureFormSnapshot(form));
    setStatus(form, "Saved");
  } catch (error) {
    setStatus(form, error instanceof Error ? error.message : "Unable to save settings.", true);
  } finally {
    delete form.dataset[savingFlag];
    syncSaveButtonState(form, getSnapshot());
  }
}

function bindLogoControls(form: HTMLFormElement, onDirtyStateChange: () => void) {
  const logoTrigger = form.querySelector<HTMLButtonElement>("[data-settings-logo-trigger]");
  const logoFileInput = form.querySelector<HTMLInputElement>('input[name="logoFile"]');

  logoTrigger?.addEventListener("click", () => {
    logoFileInput?.click();
  });

  logoFileInput?.addEventListener("change", () => {
    const file = logoFileInput.files?.[0];
    if (!file) {
      return;
    }

    const preview = form.querySelector<HTMLImageElement>("[data-settings-logo-preview]");
    const placeholder = form.querySelector<HTMLElement>("[data-settings-logo-placeholder]");

    if (preview) {
      const objectUrl = URL.createObjectURL(file);
      preview.src = objectUrl;
      preview.hidden = false;
      placeholder?.setAttribute("hidden", "true");
      syncLogoEmptyState(form, true);
    }

    onDirtyStateChange();
  });
}

export function initAdminSettingsGeneral(root: ParentNode = document) {
  const form = root.querySelector<HTMLFormElement>("[data-settings-general-form]");
  if (!form || form.dataset[initializedFlag] === "true") {
    return;
  }

  form.dataset[initializedFlag] = "true";
  let snapshot = captureFormSnapshot(form);

  const sync = () => {
    syncSaveButtonState(form, snapshot);
  };

  bindLogoControls(form, sync);

  form.addEventListener("input", sync);
  form.addEventListener("change", sync);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitGeneralSettings(
      form,
      () => snapshot,
      (nextSnapshot) => {
        snapshot = nextSnapshot;
        sync();
      },
    );
  });

  sync();
  setStatus(form, "");
}
