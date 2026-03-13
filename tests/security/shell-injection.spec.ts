import { describe, expect, it } from "vitest";

import { evaluateShellCommand } from "../../src/core/permission-policy.js";

describe("shell-injection security", () => {
  const manifest = {
    shell: {
      allow: ["grep", "sh"],
      deny: ["rm"]
    }
  };

  it("SEC-SH-001 does not chain commands from ; in input", () => {
    expect(evaluateShellCommand(manifest, "grep", ["foo; rm -rf /"]).allowed).toBe(false);
  });

  it("SEC-SH-002 does not chain commands from && in input", () => {
    expect(evaluateShellCommand(manifest, "grep", ["foo && rm -rf /"]).allowed).toBe(false);
  });

  it("SEC-SH-003 does not execute commands from backticks", () => {
    expect(evaluateShellCommand(manifest, "grep", ["`rm -rf /`"]).allowed).toBe(false);
  });

  it("SEC-SH-004 does not bypass deny rules via sh -c", () => {
    expect(evaluateShellCommand(manifest, "sh", ["-c", "rm -rf /"]).allowed).toBe(false);
  });
});
