import { describe, expect, it } from "vitest";

import { drawPdfLabeledField } from "./pdf-fields";

describe("drawPdfLabeledField", () => {
  it("draws the label, value, and underline only under the value", () => {
    const commands: string[] = [];

    drawPdfLabeledField(commands, 40, 717, {
      label: "Seller",
      value: "Narcisan S. Galamiton",
    }, {
      maxUnderlineEndX: 294,
      minUnderlineWidth: 80,
    });

    const content = commands.join("\n");

    expect(content).toContain("(Seller:)");
    expect(content).toContain("(Narcisan S. Galamiton)");
    expect(content).toContain("73.12 713 m");
    expect(content).not.toMatch(/\n40 713 m /);
  });

  it("sizes the date underline to the value text width", () => {
    const commands: string[] = [];

    drawPdfLabeledField(commands, 40, 717, {
      label: "Date",
      value: "2026-07-03",
    });

    const content = commands.join("\n");

    expect(content).toContain("64.80 713 m");
    expect(content).toContain("116.40 713 l S");
    expect(content).not.toContain("144.80 713 l S");
  });

  it("uses a blank underline width when the value is empty", () => {
    const commands: string[] = [];

    drawPdfLabeledField(commands, 40, 717, {
      label: "Date",
      value: "",
    }, {
      minUnderlineWidth: 80,
    });

    expect(commands.join("\n")).toContain("64.80 713 m 144.80 713 l S");
  });

  it("can omit the underline for totals", () => {
    const commands: string[] = [];

    drawPdfLabeledField(commands, 390, 593, {
      label: "Total",
      value: "250.00",
      labelSuffix: " ",
    }, {
      size: 11,
      underline: false,
    });

    expect(commands.join("\n")).not.toContain("589 m");
    expect(commands.join("\n")).toContain("(250.00)");
  });
});
