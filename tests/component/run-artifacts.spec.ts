import { describe, expect, it } from "vitest";

import { createFailureArtifacts } from "../../src/replay/run-artifacts.js";
import { ReplayEngine } from "../../src/replay/replay-engine.js";
import { RunLogger } from "../../src/replay/run-logger.js";
import { FakeApprovalGate } from "../fakes/fake-approval-gate.js";
import { FakeBrowserDriver } from "../fakes/fake-browser-driver.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";
import { FakeShellRunner } from "../fakes/fake-shell-runner.js";

describe("run-artifacts", () => {
  it("ART-001 failure creates run directory", async () => {
    const fileSystem = new InMemoryFileSystem();
    const browser = new FakeBrowserDriver();

    const artifacts = await createFailureArtifacts({
      runId: "run-001",
      stepId: "step-001",
      browser,
      fs: fileSystem,
      outDir: "/runs",
      error: {
        type: "locator_not_found",
        message: "locator_not_found"
      }
    });

    expect(artifacts.runDir).toBe("/runs/run-001");
    await expect(fileSystem.exists("/runs/run-001/error.json")).resolves.toBe(true);
  });

  it("ART-002 failure writes error json", async () => {
    const fileSystem = new InMemoryFileSystem();

    await createFailureArtifacts({
      runId: "run-001",
      browser: new FakeBrowserDriver(),
      fs: fileSystem,
      outDir: "/runs",
      error: {
        type: "locator_not_found",
        message: "locator_not_found"
      }
    });

    await expect(fileSystem.readFile("/runs/run-001/error.json")).resolves.toContain("locator_not_found");
  });

  it("ART-003 failure requests screenshot from browser driver", async () => {
    const fileSystem = new InMemoryFileSystem();
    const browser = new FakeBrowserDriver();

    await createFailureArtifacts({
      runId: "run-001",
      stepId: "step-001",
      browser,
      fs: fileSystem,
      outDir: "/runs",
      error: {
        type: "locator_not_found",
        message: "locator_not_found"
      }
    });

    expect(browser.history.some((entry) => entry.method === "screenshot")).toBe(true);
    await expect(fileSystem.exists("/runs/run-001/screenshots/step-001.png")).resolves.toBe(true);
  });

  it("ART-004 failure writes DOM snapshot when available", async () => {
    const fileSystem = new InMemoryFileSystem();
    const browser = new FakeBrowserDriver();
    browser.setDomSnapshot("<html><body>fixture</body></html>");

    await createFailureArtifacts({
      runId: "run-001",
      stepId: "step-001",
      browser,
      fs: fileSystem,
      outDir: "/runs",
      error: {
        type: "locator_not_found",
        message: "locator_not_found"
      }
    });

    await expect(fileSystem.readFile("/runs/run-001/dom/step-001.html")).resolves.toContain("fixture");
  });

  it("ART-005 artifact paths are attached to run metadata", async () => {
    const fileSystem = new InMemoryFileSystem();
    const browserDriver = new FakeBrowserDriver();
    browserDriver.setMissingLocator("text=Missing");
    const logger = new RunLogger({ fileSystem, baseDir: "/runs" });
    const engine = new ReplayEngine({
      browserDriver,
      shellRunner: new FakeShellRunner(),
      fileSystem,
      approvalGate: new FakeApprovalGate(),
      logger,
      createRunId: () => "run-001",
      now: () => new Date("2026-03-13T00:00:00.000Z")
    });

    const result = await engine.run(
      {
        name: "artifact-fail",
        version: "0.1.0",
        actor: "test",
        inputsSchema: {},
        permissions: {},
        steps: [
          {
            id: "step-001",
            type: "browser.click",
            target: {
              locatorCandidates: ["text=Missing"]
            }
          }
        ],
        assertions: []
      },
      { mode: "autopilot", inputs: {} }
    );

    const runLog = await logger.read(result.runId);

    expect(result.status).toBe("failed");
    expect(runLog.artifacts?.screenshotPath).toBeDefined();
    await expect(fileSystem.exists(runLog.artifacts!.screenshotPath!)).resolves.toBe(true);
  });

  it("ART-006 secrets do not leak into error json or dom snapshot after redaction", async () => {
    const fileSystem = new InMemoryFileSystem();
    const browser = new FakeBrowserDriver();

    await createFailureArtifacts({
      runId: "run-001",
      stepId: "step-001",
      browser,
      fs: fileSystem,
      outDir: "/runs",
      domHtml: "<html>token=hunter2</html>",
      error: {
        type: "locator_not_found",
        message: "token=hunter2"
      },
      secrets: ["hunter2"]
    });

    await expect(fileSystem.readFile("/runs/run-001/error.json")).resolves.not.toContain("hunter2");
    await expect(fileSystem.readFile("/runs/run-001/dom/step-001.html")).resolves.not.toContain("hunter2");
  });

  it("ART-007 skips optional browser artifacts when the driver does not expose them", async () => {
    const fileSystem = new InMemoryFileSystem();
    const browser = {
      currentUrl() {
        return "about:blank";
      },
      async navigate() {
        return { ok: true as const, value: { url: "about:blank" } };
      },
      async click() {
        return { ok: true as const, value: undefined };
      },
      async input() {
        return { ok: true as const, value: undefined };
      },
      async waitFor() {
        return { ok: true as const, value: undefined };
      },
      async download() {
        return { ok: false as const, error: { code: "download_timeout", message: "download_timeout" } };
      }
    };

    const artifacts = await createFailureArtifacts({
      runId: "run-001",
      browser: browser as never,
      fs: fileSystem,
      outDir: "/runs",
      error: {
        type: "locator_not_found",
        message: "locator_not_found"
      }
    });

    expect(artifacts.screenshotPath).toBeUndefined();
    expect(artifacts.domSnapshotPath).toBeUndefined();
  });
});
