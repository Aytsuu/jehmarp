const MAX_ITEM_LENGTH = 240;

function getBadgeValues(picker: HTMLElement) {
  return Array.from(picker.querySelectorAll<HTMLElement>("[data-text-list-badge]"))
    .map((badge) => badge.dataset.textListBadge?.trim() ?? badge.querySelector(".ui-picker__badge-label")?.textContent?.trim() ?? "")
    .filter(Boolean);
}

function syncHiddenInput(picker: HTMLElement) {
  const hiddenInput = picker.querySelector<HTMLInputElement>("[data-text-list-picker-hidden]");
  if (!hiddenInput) {
    return;
  }

  hiddenInput.value = getBadgeValues(picker).join("\n");
  hiddenInput.dispatchEvent(new Event("input", { bubbles: true }));
}

function createBadge(value: string) {
  const badge = document.createElement("span");
  badge.className = "ui-picker__badge";
  badge.dataset.textListBadge = value;

  const label = document.createElement("span");
  label.className = "ui-picker__badge-label";
  label.textContent = value;

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "ui-picker__badge-remove";
  removeButton.dataset.textListRemove = "true";
  removeButton.setAttribute("aria-label", `Remove ${value}`);
  removeButton.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18"></path>
      <path d="m6 6 12 12"></path>
    </svg>
  `;

  badge.append(label, removeButton);
  return badge;
}

function initTextListPicker(picker: HTMLElement) {
  if (picker.dataset.textListPickerInitialized === "true") {
    return;
  }

  picker.dataset.textListPickerInitialized = "true";

  const badgesContainerEl = picker.querySelector<HTMLElement>("[data-text-list-picker-badges]");
  const inputEl = picker.querySelector<HTMLInputElement>("[data-text-list-picker-input]");
  if (!badgesContainerEl || !inputEl) {
    return;
  }

  const badgesContainer: HTMLElement = badgesContainerEl;
  const input: HTMLInputElement = inputEl;

  function focusInput() {
    input.focus();
  }

  function removeBadge(badge: HTMLElement) {
    badge.remove();
    syncHiddenInput(picker);
    focusInput();
  }

  function addValue(rawValue: string) {
    const value = rawValue.trim().slice(0, MAX_ITEM_LENGTH);
    if (!value) {
      return false;
    }

    const existing = new Set(getBadgeValues(picker));
    if (existing.has(value)) {
      return false;
    }

    badgesContainer.append(createBadge(value));
    syncHiddenInput(picker);
    input.value = "";
    return true;
  }

  picker.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const removeButton = target.closest<HTMLButtonElement>("[data-text-list-remove]");
    if (!removeButton) {
      return;
    }

    event.preventDefault();
    const badge = removeButton.closest<HTMLElement>("[data-text-list-badge]");
    if (badge) {
      removeBadge(badge);
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addValue(input.value);
      return;
    }

    if (event.key === "Backspace" && input.value.length === 0) {
      const badges = badgesContainer.querySelectorAll<HTMLElement>("[data-text-list-badge]");
      const lastBadge = badges[badges.length - 1];
      if (lastBadge) {
        event.preventDefault();
        removeBadge(lastBadge);
      }
    }
  });

  picker.addEventListener("click", (event) => {
    if (event.target === input) {
      return;
    }

    const clickedBadge = event.target instanceof Element
      && event.target.closest("[data-text-list-badge]");
    if (!clickedBadge) {
      focusInput();
    }
  });
}

export function initTextListPickers(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-text-list-picker]").forEach((picker) => {
    initTextListPicker(picker);
  });
}
