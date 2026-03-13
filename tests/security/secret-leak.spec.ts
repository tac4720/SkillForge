import { describe, expect, it } from "vitest";

import { LocalDaemon } from "../../src/daemon/local-daemon.js";
import { OpenClawExporter } from "../../src/exporters/openclaw/index.js";
import { BrowserRecorder } from "../../src/recorder/browser-recorder.js";
import { RunLogger } from "../../src/replay/run-logger.js";
import { ReplayEngine } from "../../src/replay/replay-engine.js";
import { FakeApprovalGate } from "../fakes/fake-approval-gate.js";
import { FakeBrowserDriver } from "../fakes/fake-browser-driver.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";
import { FakeShellRunner } from "../fakes/fake-shell-runner.js";

function createReplay(fileSystem: InMemoryFileSystem) {
  return new ReplayEngine({
    browserDriver: new FakeBrowserDriver(),
    shellRunner: new FakeShellRunner(),
    fileSystem,
    approvalGate: new FakeApprovalGate(),
    logger: new RunLogger({ fileSystem, baseDir: "/runs" }),
    createRunId: () => "run-001",
    now: () => new Date("2026-03-13T00:00:00.000Z")
  });
}

describe("secret-leak security", () => {
  it("SEC-LEAK-001 does not expose secrets in replay logs", async () => {
    const fileSystem = new InMemoryFileSystem();
    const engine = createReplay(fileSystem);

    await engine.run(
      {
        name: "invoice-download",
        version: "0.1.0",
        actor: "codex",
        inputsSchema: {},
        permissions: {},
        steps: [
          {
            id: "step-001",
            type: "browser.input",
            target: { locatorCandidates: ["role=textbox[name=\"Password\"]"] },
            with: { value: "hunter2" },
            secret: true
          }
        ],
        assertions: []
      },
      { mode: "autopilot", inputs: {}, secrets: ["hunter2"] }
    );

    expect(await fileSystem.readFile("/runs/run-001/run.json")).not.toContain("hunter2");
    expect(await fileSystem.readFile("/runs/run-001/steps/step-001.json")).not.toContain("hunter2");
  });

  it("SEC-LEAK-002 does not expose secrets in exporter artifacts", async () => {
    const exporter = new OpenClawExporter();
    const result = await exporter.export(
      {
        name: "invoice-download",
        description: "password=hunter2",
        steps: [{ type: "browser.navigate" }],
        secrets: ["hunter2"]
      },
      { skillPath: "/tmp/invoice-download" }
    );

    const contents = result.artifacts.map((artifact) => artifact.content).join("\n");
    expect(contents).not.toContain("hunter2");
  });

  it("SEC-LEAK-003 does not expose secrets in run metadata", async () => {
    const fileSystem = new InMemoryFileSystem();
    const logger = new RunLogger({ fileSystem, baseDir: "/runs" });
    await logger.logRun(
      {
        runId: "run-001",
        skill: "invoice-download",
        version: "0.1.0",
        status: "failed",
        startedAt: "2026-03-13T00:00:00.000Z",
        endedAt: "2026-03-13T00:00:01.000Z",
        actor: "codex",
        inputHash: "hash-123",
        message: "token=hunter2"
      },
      ["hunter2"]
    );

    expect(await fileSystem.readFile("/runs/run-001/run.json")).not.toContain("hunter2");
  });

  it("SEC-LEAK-004 does not expose secrets in crash artifacts", async () => {
    const fileSystem = new InMemoryFileSystem();
    const recorder = new BrowserRecorder({ fileSystem, baseDir: "/recordings" });
    const { sessionId } = await recorder.start();
    recorder.recordInput(sessionId, "role=textbox[name=\"Password\"]", "hunter2", { secret: true });
    await recorder.crash(sessionId);

    expect(await fileSystem.readFile(`/recordings/${sessionId}.json`)).not.toContain("hunter2");
  });

  it("SEC-LEAK-005 does not expose secrets in daemon api responses", async () => {
    const fileSystem = new InMemoryFileSystem();
    const daemon = new LocalDaemon({
      recorder: new BrowserRecorder({ fileSystem, baseDir: "/recordings" }),
      replayEngine: createReplay(fileSystem),
      openClawExporter: new OpenClawExporter()
    });

    await daemon.start();
    const response = await daemon.handleRequest("POST", "/api/v1/skills/invoice-download/export", {
      target: "openclaw",
      secret: "hunter2"
    });

    expect(JSON.stringify(response.body)).not.toContain("hunter2");
  });
});
