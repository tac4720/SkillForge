import { describe, expect, it } from "vitest";

import { RunLogger } from "../../src/replay/run-logger.js";
import { ReplayEngine, type ReplaySkill } from "../../src/replay/replay-engine.js";
import { FakeApprovalGate } from "../fakes/fake-approval-gate.js";
import { FakeBrowserDriver } from "../fakes/fake-browser-driver.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";
import { FakeShellRunner } from "../fakes/fake-shell-runner.js";

function createEngine() {
  const browser = new FakeBrowserDriver();
  const shell = new FakeShellRunner();
  const fileSystem = new InMemoryFileSystem();
  const approvalGate = new FakeApprovalGate();
  const logger = new RunLogger({ fileSystem, baseDir: "/runs" });
  const engine = new ReplayEngine({
    browserDriver: browser,
    shellRunner: shell,
    fileSystem,
    approvalGate,
    logger,
    createRunId: (() => {
      let counter = 0;
      return () => `run-${++counter}`;
    })(),
    now: () => new Date("2026-03-13T00:00:00.000Z")
  });

  return { engine, browser, shell, fileSystem, approvalGate };
}

function baseSkill(overrides: Partial<ReplaySkill> = {}): ReplaySkill {
  return {
    name: "invoice-download",
    version: "0.1.0",
    actor: "codex",
    inputsSchema: {},
    permissions: {
      browser: {
        domains: {
          allow: ["https://portal.vendor.example"]
        }
      },
      files: {
        read: ["/workspace"],
        write: ["/workspace/out", "/tmp"]
      },
      shell: {
        allow: ["ls", "touch"],
        deny: ["rm", "sudo"]
      }
    },
    steps: [],
    assertions: [],
    ...overrides
  };
}

describe("replay-engine", () => {
  it("REP-001 executes steps in order", async () => {
    const { engine, browser } = createEngine();
    const result = await engine.run(
      baseSkill({
        steps: [
          { id: "step-001", type: "browser.navigate", with: { url: "https://portal.vendor.example/login" } },
          {
            id: "step-002",
            type: "browser.click",
            target: { locatorCandidates: ["role=button[name=\"Sign in\"]"] }
          }
        ]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("passed");
    expect(browser.history.map((entry: { method: string }) => entry.method)).toEqual(["navigate", "click"]);
  });

  it("REP-002 returns permission_denied when navigate permission is missing", async () => {
    const { engine } = createEngine();
    const result = await engine.run(
      baseSkill({
        permissions: {
          browser: {
            domains: {
              allow: ["https://other.example"]
            }
          }
        },
        steps: [{ id: "step-001", type: "browser.navigate", with: { url: "https://portal.vendor.example/login" } }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("permission_denied");
  });

  it("REP-003 stops before start on input validation failure", async () => {
    const { engine, browser } = createEngine();
    const result = await engine.run(
      baseSkill({
        inputsSchema: {
          invoice_month: { type: "string", required: true, pattern: "^\\d{4}-\\d{2}$" }
        },
        steps: [{ id: "step-001", type: "browser.navigate", with: { url: "https://portal.vendor.example/login" } }]
      }),
      { mode: "autopilot", inputs: { invoice_month: "March" } }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("invalid_input");
    expect(browser.history).toHaveLength(0);
  });

  it("REP-004 marks the run failed on assertion failure", async () => {
    const { engine } = createEngine();
    const result = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "browser.navigate", with: { url: "https://portal.vendor.example/login" } }],
        assertions: [{ type: "urlMatches", value: "^https://portal\\.vendor\\.example/invoices$" }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("assertion_failed");
  });

  it("REP-005 marks the run failed on timeout", async () => {
    const { engine, browser } = createEngine();
    browser.failNextWait("navigation_timeout", "Timed out.");

    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "browser.waitFor",
            target: { locatorCandidates: ["h1"] }
          }
        ]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("navigation_timeout");
  });

  it("REP-006 applies retry policy", async () => {
    const { engine, browser } = createEngine();
    browser.failNextClick("locator_not_found", "Missing locator.");

    const result = await engine.run(
      baseSkill({
        runtime: {
          retryPolicy: {
            maxRetries: 1
          }
        },
        steps: [
          {
            id: "step-001",
            type: "browser.click",
            target: { locatorCandidates: ["text=Download"] }
          }
        ]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("passed");
    expect(browser.history.filter((entry: { method: string }) => entry.method === "click")).toHaveLength(2);
  });

  it("REP-007 does not execute high-risk actions in dry-run mode", async () => {
    const { engine, shell } = createEngine();
    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "shell.exec",
            with: { command: "touch", args: ["/workspace/out/report.txt"] }
          }
        ]
      }),
      { mode: "dry-run", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("manual_intervention_required");
    expect(shell.history).toHaveLength(0);
  });

  it("REP-008 requests approval in assist mode", async () => {
    const { engine, approvalGate } = createEngine();
    approvalGate.enqueue("approved");

    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "shell.exec",
            with: { command: "touch", args: ["/workspace/out/report.txt"] }
          }
        ]
      }),
      { mode: "assist", inputs: {} }
    );

    expect(result.approvals).toEqual([{ stepId: "step-001", status: "approved" }]);
  });

  it("REP-009 stops when approval is rejected", async () => {
    const { engine, approvalGate, shell } = createEngine();
    approvalGate.enqueue("rejected");

    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "shell.exec",
            with: { command: "touch", args: ["/workspace/out/report.txt"] }
          }
        ]
      }),
      { mode: "assist", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(shell.history).toHaveLength(0);
  });

  it("REP-010 continues when approval is granted", async () => {
    const { engine, approvalGate, shell } = createEngine();
    approvalGate.enqueue("approved");

    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "shell.exec",
            with: { command: "touch", args: ["/workspace/out/report.txt"] }
          }
        ]
      }),
      { mode: "assist", inputs: {} }
    );

    expect(result.status).toBe("passed");
    expect(shell.history).toHaveLength(1);
  });

  it("REP-011 generates a runId", async () => {
    const { engine } = createEngine();
    const result = await engine.run(baseSkill(), { mode: "autopilot", inputs: {} });
    expect(result.runId).toBe("run-1");
  });

  it("REP-012 records failedStepId", async () => {
    const { engine } = createEngine();
    const result = await engine.run(
      baseSkill({
        permissions: {
          browser: {
            domains: {
              allow: ["https://other.example"]
            }
          }
        },
        steps: [{ id: "step-001", type: "browser.navigate", with: { url: "https://portal.vendor.example/login" } }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.failedStepId).toBe("step-001");
  });

  it("REP-013 records denied actions", async () => {
    const { engine } = createEngine();
    const result = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "shell.exec", with: { command: "rm", args: ["-rf", "/tmp"] } }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.deniedActions).toEqual([{ stepId: "step-001", reason: "Command is denylisted: rm" }]);
  });

  it("REP-014 does not leave secrets in logs", async () => {
    const { engine, fileSystem } = createEngine();
    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "browser.input",
            target: { locatorCandidates: ["role=textbox[name=\"Password\"]"] },
            with: { value: "hunter2" },
            secret: true
          }
        ]
      }),
      { mode: "autopilot", inputs: {}, secrets: ["hunter2"] }
    );

    expect(result.status).toBe("passed");
    const runLog = await fileSystem.readFile("/runs/run-1/run.json");
    const stepLog = await fileSystem.readFile("/runs/run-1/steps/step-001.json");
    expect(runLog).not.toContain("hunter2");
    expect(stepLog).not.toContain("hunter2");
  });

  it("REP-015 prevents duplicate execution using idempotency keys", async () => {
    const { engine, browser } = createEngine();
    const skill = baseSkill({
      idempotencyKey: "invoice-2026-03",
      steps: [{ id: "step-001", type: "browser.navigate", with: { url: "https://portal.vendor.example/login" } }]
    });

    const first = await engine.run(skill, { mode: "autopilot", inputs: {} });
    const second = await engine.run(skill, { mode: "autopilot", inputs: {} });

    expect(first.status).toBe("passed");
    expect(second.status).toBe("skipped");
    expect(browser.history.filter((entry: { method: string }) => entry.method === "navigate")).toHaveLength(1);
  });

  it("REP-016 stops file operations outside the allowlist", async () => {
    const { engine, fileSystem } = createEngine();
    await fileSystem.writeFile("/workspace/source.txt", "data");

    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "file.copy",
            with: { from: "/workspace/source.txt", to: "/workspace/private/dest.txt" }
          }
        ]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("permission_denied");
  });

  it("REP-017 stops denied shell commands", async () => {
    const { engine, shell } = createEngine();
    const result = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "shell.exec", with: { command: "rm", args: ["-rf", "/tmp"] } }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("permission_denied");
    expect(shell.history).toHaveLength(0);
  });

  it("REP-018 passes browser.download plus fileExists assertions", async () => {
    const { engine, browser } = createEngine();
    browser.setDownload("text=Download PDF", {
      fileName: "invoice.pdf",
      path: "/tmp/invoice.pdf"
    });

    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "browser.download",
            target: { locatorCandidates: ["text=Download PDF"] },
            with: { saveAs: "/tmp/invoice.pdf" }
          }
        ],
        assertions: [{ type: "fileExists", path: "/tmp/invoice.pdf" }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("passed");
  });

  it("REP-019 copies files when permissions allow it", async () => {
    const { engine, fileSystem } = createEngine();
    await fileSystem.writeFile("/workspace/source.txt", "hello");

    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "file.copy",
            with: { from: "/workspace/source.txt", to: "/workspace/out/copied.txt" }
          }
        ],
        assertions: [{ type: "fileExists", path: "/workspace/out/copied.txt" }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("passed");
    await expect(fileSystem.readFile("/workspace/out/copied.txt")).resolves.toBe("hello");
  });

  it("REP-020 fails file.copy when read permission is missing", async () => {
    const { engine } = createEngine();

    const result = await engine.run(
      baseSkill({
        permissions: {
          files: {
            read: ["/allowed"],
            write: ["/workspace/out"]
          }
        },
        steps: [
          {
            id: "step-001",
            type: "file.copy",
            with: { from: "/workspace/source.txt", to: "/workspace/out/copied.txt" }
          }
        ]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("permission_denied");
  });

  it("REP-021 fails when browser input errors", async () => {
    const { engine, browser } = createEngine();
    browser.failNextInput("input_failed", "Failed to type.");

    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "browser.input",
            target: { locatorCandidates: ["role=textbox[name=\"Search\"]"] },
            with: { value: "invoice" }
          }
        ]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("input_failed");
  });

  it("REP-022 fails when shell commands time out or exit non-zero", async () => {
    const { engine, shell } = createEngine();
    shell.setResult("ls", ["-la"], { exitCode: 0, stdout: "", stderr: "", timedOut: true });

    const timeoutResult = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "shell.exec", with: { command: "ls", args: ["-la"] } }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    shell.setResult("ls", ["-la"], { exitCode: 2, stdout: "", stderr: "bad", timedOut: false });
    const nonZeroResult = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "shell.exec", with: { command: "ls", args: ["-la"] } }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(timeoutResult.errorType).toBe("navigation_timeout");
    expect(nonZeroResult.errorType).toBe("shell_exit_nonzero");
  });

  it("REP-023 fails unsupported steps with a stable error code", async () => {
    const { engine } = createEngine();

    const result = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "browser.extract" }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("unsupported_step");
  });

  it("REP-024 fails when browser downloads do not complete", async () => {
    const { engine } = createEngine();

    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "browser.download",
            target: { locatorCandidates: ["text=Download PDF"] }
          }
        ]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("download_timeout");
  });

  it("REP-025 treats expired approvals as manual intervention required", async () => {
    const { engine, approvalGate, shell } = createEngine();
    approvalGate.enqueue("expired");

    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "shell.exec",
            with: { command: "touch", args: ["/workspace/out/report.txt"] }
          }
        ]
      }),
      { mode: "assist", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("manual_intervention_required");
    expect(shell.history).toHaveLength(0);
  });

  it("REP-026 falls back to generated runId and current time defaults", async () => {
    const browser = new FakeBrowserDriver();
    const shell = new FakeShellRunner();
    const fileSystem = new InMemoryFileSystem();
    const engine = new ReplayEngine({
      browserDriver: browser,
      shellRunner: shell,
      fileSystem,
      approvalGate: new FakeApprovalGate(),
      logger: new RunLogger({ fileSystem, baseDir: "/runs" })
    });

    const result = await engine.run(baseSkill(), { mode: "autopilot", inputs: {} });

    expect(result.status).toBe("passed");
    expect(result.runId).toMatch(/^run_\d+$/u);
  });

  it("REP-027 propagates browser navigation failures", async () => {
    const { engine, browser } = createEngine();
    browser.failNextNavigate("navigation_failed", "Navigation failed.");

    const result = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "browser.navigate", with: { url: "https://portal.vendor.example/login" } }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("navigation_failed");
  });

  it("REP-028 uses fallback values for missing locators and input payloads", async () => {
    const { engine, browser } = createEngine();

    const result = await engine.run(
      baseSkill({
        steps: [
          { id: "step-001", type: "browser.click" },
          { id: "step-002", type: "browser.input", target: { locatorCandidates: ["role=textbox[name=\"Search\"]"] } }
        ]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("passed");
    expect(browser.history[0]).toMatchObject({ method: "click", args: [""] });
    expect(browser.history[1]).toMatchObject({ method: "input", args: ["role=textbox[name=\"Search\"]", ""] });
  });

  it("REP-029 uses the driver download path when saveAs is omitted", async () => {
    const { engine, browser } = createEngine();
    browser.setDownload("text=Download PDF", {
      fileName: "invoice.pdf",
      path: "/tmp/from-driver.pdf"
    });

    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "browser.download",
            target: { locatorCandidates: ["text=Download PDF"] }
          }
        ],
        assertions: [{ type: "fileExists", path: "/tmp/from-driver.pdf" }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("passed");
  });

  it("REP-030 rejects missing file.copy paths and shell commands during preflight", async () => {
    const { engine } = createEngine();

    const fileCopyResult = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "file.copy" }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    const shellResult = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "shell.exec" }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(fileCopyResult.errorType).toBe("permission_denied");
    expect(shellResult.errorType).toBe("permission_denied");
  });

  it("REP-031 treats null shell exit codes as successful no-op exits", async () => {
    const { engine, shell } = createEngine();
    shell.setResult("ls", [], { exitCode: null, stdout: "ok", stderr: "" });

    const result = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "shell.exec", with: { command: "ls" } }],
        assertions: [{ type: "stdoutRegex", value: "ok" }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("passed");
  });

  it("REP-032 uses fallback shell error messages when stderr is empty", async () => {
    const { engine, shell } = createEngine();
    shell.setResult("ls", [], { exitCode: 0, stdout: "", stderr: "", timedOut: true });

    const timedOut = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "shell.exec", with: { command: "ls" } }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    shell.setResult("ls", [], { exitCode: 1, stdout: "", stderr: "", timedOut: false });
    const nonZero = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "shell.exec", with: { command: "ls" } }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(timedOut.errorType).toBe("navigation_timeout");
    expect(nonZero.errorType).toBe("shell_exit_nonzero");
  });

  it("REP-033 denies invalid browser URLs during preflight", async () => {
    const { engine } = createEngine();

    const result = await engine.run(
      baseSkill({
        steps: [{ id: "step-001", type: "browser.navigate" }]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("permission_denied");
  });

  it("REP-034 fails secret templates when no secret provider is configured", async () => {
    const { engine } = createEngine();

    const result = await engine.run(
      baseSkill({
        steps: [
          {
            id: "step-001",
            type: "browser.input",
            target: { locatorCandidates: ["#password"] },
            with: {
              value: "{{secrets.portal_password}}"
            }
          }
        ]
      }),
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("failed");
    expect(result.errorType).toBe("secret_unavailable");
  });

  it("REP-035 resolves inputs-prefixed templates in steps and assertions", async () => {
    const { engine, fileSystem } = createEngine();
    await fileSystem.writeFile("/workspace/source.txt", "fixture");

    const result = await engine.run(
      baseSkill({
        inputsSchema: {
          file_name: {
            type: "string"
          }
        },
        steps: [
          {
            id: "step-001",
            type: "file.copy",
            with: {
              from: "/workspace/source.txt",
              to: "/tmp/{{inputs.file_name}}.txt"
            }
          }
        ],
        assertions: [
          {
            type: "fileExists",
            path: "/tmp/{{inputs.file_name}}.txt"
          }
        ]
      }),
      {
        mode: "autopilot",
        inputs: {
          file_name: "report"
        }
      }
    );

    expect(result.status).toBe("passed");
    await expect(fileSystem.readFile("/tmp/report.txt")).resolves.toBe("fixture");
  });
});
