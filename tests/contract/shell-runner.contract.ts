import { describe, expect, it } from "vitest";

import { FakeShellRunner } from "../fakes/fake-shell-runner.js";

describe("shell-runner contract", () => {
  it("SH-001 executes command and args separately", async () => {
    const runner = new FakeShellRunner();
    await runner.run("grep", ["TODO", "file.txt"]);
    expect(runner.history[0]).toEqual({
      command: "grep",
      args: ["TODO", "file.txt"],
      options: undefined
    });
  });

  it("SH-002 returns exitCode stdout and stderr", async () => {
    const runner = new FakeShellRunner();
    runner.setResult("ls", ["-la"], {
      exitCode: 0,
      stdout: "file.txt",
      stderr: ""
    });

    await expect(runner.run("ls", ["-la"])).resolves.toEqual({
      exitCode: 0,
      stdout: "file.txt",
      stderr: ""
    });
  });

  it("SH-003 returns non-zero exits", async () => {
    const runner = new FakeShellRunner();
    runner.setResult("make", [], {
      exitCode: 2,
      stdout: "",
      stderr: "build failed"
    });

    const result = await runner.run("make", []);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("build failed");
  });

  it("SH-004 returns timeouts", async () => {
    const runner = new FakeShellRunner();
    runner.setResult("sleep", ["10"], {
      exitCode: null,
      stdout: "",
      stderr: "timed out",
      timedOut: true
    });

    const result = await runner.run("sleep", ["10"], { timeoutMs: 1000 });
    expect(result).toEqual({
      exitCode: null,
      stdout: "",
      stderr: "timed out",
      timedOut: true
    });
  });
});
