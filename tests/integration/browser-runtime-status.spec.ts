import { describe, expect, it } from "vitest";

import { loadReleaseStatus, validateReleaseStatus } from "../../src/release/status.js";

describe("browser runtime status integration", () => {
  it("BSTAT-001 missing production BrowserDriver forbids beta", async () => {
    const status = await loadReleaseStatus();

    const result = validateReleaseStatus("beta", {
      ...status.featureMatrix,
      productionBrowserDriver: false
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toContain("Production BrowserDriver missing.");
  });

  it("BSTAT-002 implemented production BrowserDriver permits beta if other beta gates pass", async () => {
    const status = await loadReleaseStatus();

    const result = validateReleaseStatus("beta", {
      ...status.featureMatrix,
      productionBrowserDriver: true
    });

    expect(result.allowed).toBe(true);
  });
});
