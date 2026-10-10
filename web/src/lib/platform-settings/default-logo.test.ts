import { describe, expect, it } from "vitest";

import {
  DEFAULT_WEB_LOGO_URL,
  hasCustomBrandLogo,
  resolveBrandLogoUrl,
} from "./default-logo";

describe("default-logo", () => {
  it("falls back to the bundled public logo when no upload exists", () => {
    expect(resolveBrandLogoUrl(null)).toBe(DEFAULT_WEB_LOGO_URL);
    expect(resolveBrandLogoUrl("")).toBe(DEFAULT_WEB_LOGO_URL);
    expect(hasCustomBrandLogo(null)).toBe(false);
  });

  it("uses the uploaded logo when configured", () => {
    expect(resolveBrandLogoUrl("platform/logo-test.png")).toContain("platform/logo-test.png");
    expect(hasCustomBrandLogo("platform/logo-test.png")).toBe(true);
  });
});
