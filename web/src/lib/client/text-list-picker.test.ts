import { beforeEach, describe, expect, it } from "vitest";

import { initTextListPickers } from "./text-list-picker";

function renderPicker(initialValues: string[] = []) {
  document.body.innerHTML = `
    <form data-settings-templates-form>
      <div data-text-list-picker>
        <div class="ui-picker__control">
          <div data-text-list-picker-badges>
            ${initialValues.map((value) => `
              <span class="ui-picker__badge" data-text-list-badge="${value}">
                <span class="ui-picker__badge-label">${value}</span>
                <button type="button" data-text-list-remove aria-label="Remove ${value}"></button>
              </span>
            `).join("")}
          </div>
          <input type="text" data-text-list-picker-input />
        </div>
        <input type="hidden" name="testList" data-text-list-picker-hidden value="${initialValues.join("\n")}" />
      </div>
    </form>
  `;
  initTextListPickers(document);
  return {
    picker: document.querySelector<HTMLElement>("[data-text-list-picker]")!,
    input: document.querySelector<HTMLInputElement>("[data-text-list-picker-input]")!,
    hidden: document.querySelector<HTMLInputElement>("[data-text-list-picker-hidden]")!,
  };
}

describe("initTextListPickers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("adds a badge when Enter is pressed", () => {
    const { input, hidden, picker } = renderPicker();

    input.value = "Pick-Up";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(picker.querySelectorAll("[data-text-list-badge]")).toHaveLength(1);
    expect(hidden.value).toBe("Pick-Up");
    expect(input.value).toBe("");
  });

  it("removes a badge when the remove button is clicked", () => {
    const { hidden, picker } = renderPicker(["Pick-Up", "Delivery"]);

    picker.querySelector<HTMLButtonElement>("[data-text-list-remove]")?.click();

    expect(picker.querySelectorAll("[data-text-list-badge]")).toHaveLength(1);
    expect(hidden.value).toBe("Delivery");
  });

  it("does not add duplicate values", () => {
    const { input, hidden, picker } = renderPicker(["COD"]);

    input.value = "COD";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

    expect(picker.querySelectorAll("[data-text-list-badge]")).toHaveLength(1);
    expect(hidden.value).toBe("COD");
  });
});
