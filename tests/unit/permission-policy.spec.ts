import { describe, expect, it } from "vitest";

import {
  evaluateActionRisk,
  evaluateBrowserUrl,
  evaluateFileAccess,
  evaluateShellCommand,
  type PermissionManifest
} from "../../src/core/permission-policy.js";

describe("permission-policy", () => {
  const manifest: PermissionManifest = {
    browser: {
      domains: {
        allow: ["https://portal.vendor.example", "https://blocked.vendor.example"],
        deny: ["https://blocked.vendor.example"]
      }
    },
    files: {
      read: ["/workspace/allowed"],
      write: ["/workspace/output"]
    },
    shell: {
      allow: ["ls", "cp", "sh"],
      deny: ["rm", "sudo"]
    }
  };

  it("PERM-001 allows domains in the allowlist", () => {
    expect(evaluateBrowserUrl(manifest, "https://portal.vendor.example/invoices")).toMatchObject({
      allowed: true,
      risk: "low"
    });
  });

  it("PERM-002 denies domains outside the allowlist", () => {
    expect(evaluateBrowserUrl(manifest, "https://evil.example/steal")).toMatchObject({
      allowed: false,
      code: "permission_denied"
    });
  });

  it("PERM-003 prefers denylist over allowlist", () => {
    expect(evaluateBrowserUrl(manifest, "https://blocked.vendor.example/internal")).toMatchObject({
      allowed: false,
      code: "permission_denied"
    });
  });

  it("PERM-004 denies write paths outside the allowlist", () => {
    expect(evaluateFileAccess(manifest, "write", "/workspace/private/report.pdf")).toMatchObject({
      allowed: false,
      code: "permission_denied"
    });
  });

  it("PERM-005 denies read paths outside the allowlist", () => {
    expect(evaluateFileAccess(manifest, "read", "/workspace/private/report.pdf")).toMatchObject({
      allowed: false,
      code: "permission_denied"
    });
  });

  it("PERM-006 denies shell commands outside the allowlist", () => {
    expect(evaluateShellCommand(manifest, "grep", ["TODO", "file.txt"])).toMatchObject({
      allowed: false,
      code: "permission_denied"
    });
  });

  it("PERM-007 denies rm", () => {
    expect(evaluateShellCommand(manifest, "rm", ["-rf", "/tmp/output"])).toMatchObject({
      allowed: false,
      code: "permission_denied",
      risk: "high"
    });
  });

  it("PERM-008 denies sudo", () => {
    expect(evaluateShellCommand(manifest, "sudo", ["ls"])).toMatchObject({
      allowed: false,
      code: "permission_denied"
    });
  });

  it("PERM-009 denies sh -c based deny bypass", () => {
    expect(evaluateShellCommand(manifest, "sh", ["-c", "rm -rf /"])).toMatchObject({
      allowed: false,
      code: "permission_denied"
    });
  });

  it("PERM-010 checks redirect destination domains too", () => {
    expect(
      evaluateBrowserUrl(manifest, "https://portal.vendor.example/start", ["https://evil.example/payload"])
    ).toMatchObject({
      allowed: false,
      code: "permission_denied"
    });
  });

  it("PERM-011 checks resolved realpaths after symlink resolution", () => {
    expect(
      evaluateFileAccess(
        manifest,
        "read",
        "/workspace/allowed/link.txt",
        () => "/workspace/private/secret.txt"
      )
    ).toMatchObject({
      allowed: false,
      code: "permission_denied"
    });
  });

  it("PERM-012 classifies high-risk actions as high risk", () => {
    expect(evaluateActionRisk({ type: "browser.click", action: "send email" })).toBe("high");
  });

  it("PERM-013 denies invalid browser urls instead of throwing", () => {
    const decision = evaluateBrowserUrl(manifest, "");

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Invalid URL");
  });
});
