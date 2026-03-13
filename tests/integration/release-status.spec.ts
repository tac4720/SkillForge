import { describe, expect, it } from "vitest";

import { loadReleaseStatus, validateReleaseStatus } from "../../src/release/status.js";

describe("release-status integration", () => {
  it("RELSTAT-001 if MCP export missing, stable is forbidden", async () => {
    const status = await loadReleaseStatus();

    const result = validateReleaseStatus("stable", {
      ...status.featureMatrix,
      mcpExport: false
    });

    expect(result.allowed).toBe(false);
  });

  it("RELSTAT-002 if recorder proper missing, stable is forbidden", async () => {
    const status = await loadReleaseStatus();

    const result = validateReleaseStatus("stable", {
      ...status.featureMatrix,
      recorderProper: false
    });

    expect(result.allowed).toBe(false);
  });

  it("RELSTAT-003 if failure artifacts missing, stable is forbidden", async () => {
    const status = await loadReleaseStatus();

    const result = validateReleaseStatus("stable", {
      ...status.featureMatrix,
      failureArtifacts: false
    });

    expect(result.allowed).toBe(false);
  });

  it("RELSTAT-004 if secure secret provider missing, stable is forbidden", async () => {
    const status = await loadReleaseStatus();

    const result = validateReleaseStatus("stable", {
      ...status.featureMatrix,
      secureSecretProvider: false
    });

    expect(result.allowed).toBe(false);
  });

  it("RELSTAT-005 status doc matches implemented feature matrix", async () => {
    const status = await loadReleaseStatus();

    expect(["alpha", "beta", "stable"]).toContain(status.tier);
    expect(status.tier).toBe(status.readmeTier);
    expect(status.tier).toBe(status.recommendedTier);
  });
});
