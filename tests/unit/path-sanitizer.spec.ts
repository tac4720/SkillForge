import path from "node:path";

import { describe, expect, it } from "vitest";

import { PathSanitizationError, sanitizePath } from "../../src/core/path-sanitizer.js";

describe("path-sanitizer", () => {
  const baseDir = "/workspace/base";

  it("PATH-001 resolves relative paths within the base directory", () => {
    expect(sanitizePath({ baseDir, inputPath: "reports/2026-03.pdf" })).toBe(
      path.resolve("/workspace/base/reports/2026-03.pdf")
    );
  });

  it("PATH-002 rejects path traversal with ../ segments", () => {
    expect(() => sanitizePath({ baseDir, inputPath: "../secret.txt" })).toThrowError(PathSanitizationError);
    expect(() => sanitizePath({ baseDir, inputPath: "../secret.txt" })).toThrowError(/Path escapes base directory/);
  });

  it("PATH-003 rejects absolute path escapes", () => {
    expect(() => sanitizePath({ baseDir, inputPath: "/etc/passwd" })).toThrowError(PathSanitizationError);
  });

  it("PATH-004 rejects symlink escapes", () => {
    expect(() =>
      sanitizePath({
        baseDir,
        inputPath: "reports/link.pdf",
        realpath: () => "/etc/passwd"
      })
    ).toThrowError(PathSanitizationError);
  });

  it("PATH-005 preserves unicode paths", () => {
    expect(sanitizePath({ baseDir, inputPath: "請求書/2026年03月.pdf" })).toBe(
      path.resolve("/workspace/base/請求書/2026年03月.pdf")
    );
  });

  it("PATH-006 preserves paths containing spaces", () => {
    expect(sanitizePath({ baseDir, inputPath: "invoice exports/March report.pdf" })).toBe(
      path.resolve("/workspace/base/invoice exports/March report.pdf")
    );
  });
});
