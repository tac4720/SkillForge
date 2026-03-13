import { describe, expect, it } from "vitest";

import { RunLogger } from "../../src/replay/run-logger.js";
import { ReplayEngine, type ReplaySkill } from "../../src/replay/replay-engine.js";
import { FakeApprovalGate } from "../fakes/fake-approval-gate.js";
import { FakeBrowserDriver } from "../fakes/fake-browser-driver.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";
import { FakeShellRunner } from "../fakes/fake-shell-runner.js";

function createEngine() {
  const fileSystem = new InMemoryFileSystem();
  const approvalGate = new FakeApprovalGate();
  const shellRunner = new FakeShellRunner();
  const engine = new ReplayEngine({
    browserDriver: new FakeBrowserDriver(),
    shellRunner,
    fileSystem,
    approvalGate,
    logger: new RunLogger({ fileSystem, baseDir: "/runs" }),
    createRunId: () => "run-001",
    now: () => new Date("2026-03-13T00:00:00.000Z")
  });

  return { engine, approvalGate, shellRunner };
}

function skill(): ReplaySkill {
  return {
    name: "invoice-download",
    version: "0.1.0",
    actor: "codex",
    inputsSchema: {},
    permissions: {
      shell: {
        allow: ["touch"],
        deny: []
      }
    },
    steps: [
      {
        id: "step-001",
        type: "shell.exec",
        with: { command: "touch", args: ["/tmp/report.txt"] }
      }
    ],
    assertions: []
  };
}

describe("high-risk-approval security", () => {
  it("SEC-HR-001 rejects high-risk steps in dry-run", async () => {
    const { engine, shellRunner } = createEngine();
    const result = await engine.run(skill(), { mode: "dry-run", inputs: {} });

    expect(result.status).toBe("failed");
    expect(shellRunner.history).toHaveLength(0);
  });

  it("SEC-HR-002 requires approval in assist mode", async () => {
    const { engine, approvalGate } = createEngine();
    approvalGate.enqueue("approved");
    const result = await engine.run(skill(), { mode: "assist", inputs: {} });

    expect(result.approvals).toEqual([{ stepId: "step-001", status: "approved" }]);
  });

  it("SEC-HR-003 stops when approval is rejected", async () => {
    const { engine, approvalGate, shellRunner } = createEngine();
    approvalGate.enqueue("rejected");
    const result = await engine.run(skill(), { mode: "assist", inputs: {} });

    expect(result.status).toBe("failed");
    expect(shellRunner.history).toHaveLength(0);
  });

  it("SEC-HR-004 continues when approval is accepted", async () => {
    const { engine, approvalGate, shellRunner } = createEngine();
    approvalGate.enqueue("approved");
    const result = await engine.run(skill(), { mode: "assist", inputs: {} });

    expect(result.status).toBe("passed");
    expect(shellRunner.history).toHaveLength(1);
  });
});
