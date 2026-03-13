import { describe, expect, it } from "vitest";

import { RunLogger } from "../../src/replay/run-logger.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";

describe("logging", () => {
  it("LOG-001 stores run metadata", async () => {
    const fs = new InMemoryFileSystem();
    const logger = new RunLogger({ fileSystem: fs, baseDir: "/runs" });

    await logger.logRun({
      runId: "run-001",
      skill: "invoice-download",
      version: "0.1.0",
      status: "passed",
      startedAt: "2026-03-13T00:00:00.000Z",
      endedAt: "2026-03-13T00:00:01.000Z",
      actor: "tester",
      inputHash: "hash-123"
    });

    const stored = JSON.parse(await fs.readFile("/runs/run-001/run.json"));
    expect(stored.skill).toBe("invoice-download");
    expect(stored.status).toBe("passed");
  });

  it("LOG-002 stores step logs", async () => {
    const fs = new InMemoryFileSystem();
    const logger = new RunLogger({ fileSystem: fs, baseDir: "/runs" });

    await logger.logStep("run-001", "step-001", {
      status: "passed",
      type: "browser.navigate"
    });

    const stored = JSON.parse(await fs.readFile("/runs/run-001/steps/step-001.json"));
    expect(stored.status).toBe("passed");
    expect(stored.type).toBe("browser.navigate");
  });

  it("LOG-003 stores error taxonomy", async () => {
    const fs = new InMemoryFileSystem();
    const logger = new RunLogger({ fileSystem: fs, baseDir: "/runs" });

    await logger.logRun({
      runId: "run-001",
      skill: "invoice-download",
      version: "0.1.0",
      status: "failed",
      errorType: "locator_not_found",
      startedAt: "2026-03-13T00:00:00.000Z",
      endedAt: "2026-03-13T00:00:01.000Z",
      actor: "tester",
      inputHash: "hash-123"
    });

    const stored = JSON.parse(await fs.readFile("/runs/run-001/run.json"));
    expect(stored.errorType).toBe("locator_not_found");
  });

  it("LOG-004 stores actor skill version and input hash", async () => {
    const fs = new InMemoryFileSystem();
    const logger = new RunLogger({ fileSystem: fs, baseDir: "/runs" });

    await logger.logRun({
      runId: "run-001",
      skill: "invoice-download",
      version: "0.1.0",
      status: "passed",
      startedAt: "2026-03-13T00:00:00.000Z",
      endedAt: "2026-03-13T00:00:01.000Z",
      actor: "codex",
      inputHash: "hash-123"
    });

    const stored = JSON.parse(await fs.readFile("/runs/run-001/run.json"));
    expect(stored.actor).toBe("codex");
    expect(stored.version).toBe("0.1.0");
    expect(stored.inputHash).toBe("hash-123");
  });

  it("LOG-005 stores only redacted strings", async () => {
    const fs = new InMemoryFileSystem();
    const logger = new RunLogger({ fileSystem: fs, baseDir: "/runs" });

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
        message: "password=hunter2"
      },
      ["hunter2"]
    );

    const stored = await fs.readFile("/runs/run-001/run.json");
    expect(stored).not.toContain("hunter2");
    expect(stored).toContain("[REDACTED]");
  });
});
