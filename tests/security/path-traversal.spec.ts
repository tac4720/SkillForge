import { describe, expect, it } from "vitest";

import { PathSanitizationError, sanitizePath } from "../../src/core/path-sanitizer.js";

describe("path-traversal security", () => {
  it("SEC-PATH-001 denies write path traversal", () => {
    expect(() => sanitizePath({ baseDir: "/workspace/out", inputPath: "../secret.txt" })).toThrowError(
      PathSanitizationError
    );
  });

  it("SEC-PATH-002 denies read path traversal", () => {
    expect(() => sanitizePath({ baseDir: "/workspace/in", inputPath: "../../secret.txt" })).toThrowError(
      PathSanitizationError
    );
  });

  it("SEC-PATH-003 denies output path traversal", () => {
    expect(() => sanitizePath({ baseDir: "/workspace/export", inputPath: "/etc/passwd" })).toThrowError(
      PathSanitizationError
    );
  });
});
