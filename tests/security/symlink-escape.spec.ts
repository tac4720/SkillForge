import { describe, expect, it } from "vitest";

import { PathSanitizationError, sanitizePath } from "../../src/core/path-sanitizer.js";

describe("symlink-escape security", () => {
  it("SEC-SYM-001 denies write escapes through symlinks", () => {
    expect(() =>
      sanitizePath({
        baseDir: "/workspace/out",
        inputPath: "link.txt",
        realpath: () => "/etc/passwd"
      })
    ).toThrowError(PathSanitizationError);
  });

  it("SEC-SYM-002 denies read escapes through symlinks", () => {
    expect(() =>
      sanitizePath({
        baseDir: "/workspace/in",
        inputPath: "link.txt",
        realpath: () => "/var/secret.txt"
      })
    ).toThrowError(PathSanitizationError);
  });
});
