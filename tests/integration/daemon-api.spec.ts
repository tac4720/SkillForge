import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LocalDaemon } from "../../src/daemon/local-daemon.js";
import { OpenClawExporter } from "../../src/exporters/openclaw/index.js";
import { BrowserRecorder } from "../../src/recorder/browser-recorder.js";
import { ReplayEngine } from "../../src/replay/replay-engine.js";
import { RunLogger } from "../../src/replay/run-logger.js";
import { makeTempDir } from "../helpers/fixtures.js";
import { FakeApprovalGate } from "../fakes/fake-approval-gate.js";
import { FakeBrowserDriver } from "../fakes/fake-browser-driver.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";
import { FakeShellRunner } from "../fakes/fake-shell-runner.js";

function createDaemon() {
  const fileSystem = new InMemoryFileSystem();
  const browserDriver = new FakeBrowserDriver();
  browserDriver.setDownload('role=button[name="Download PDF"]', {
    fileName: "invoice.pdf",
    path: "/tmp/invoice.pdf"
  });
  const daemon = new LocalDaemon({
    recorder: new BrowserRecorder({ fileSystem, baseDir: "/recordings" }),
    replayEngine: new ReplayEngine({
      browserDriver,
      shellRunner: new FakeShellRunner(),
      fileSystem,
      approvalGate: new FakeApprovalGate(),
      logger: new RunLogger({ fileSystem, baseDir: "/runs" }),
      createRunId: () => "run-001",
      now: () => new Date("2026-03-13T00:00:00.000Z")
    }),
    openClawExporter: new OpenClawExporter()
  });

  return { daemon, fileSystem };
}

async function postJson(
  daemon: LocalDaemon,
  pathname: string,
  body: Record<string, unknown> = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${daemon.baseUrl()}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>
  };
}

describe("daemon-api integration", () => {
  it("API-001 starts and stops the daemon", async () => {
    const { daemon } = createDaemon();

    await daemon.start();
    expect(daemon.isRunning()).toBe(true);
    expect(daemon.baseUrl()).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);

    await daemon.stop();
    expect(daemon.isRunning()).toBe(false);
  });

  it("API-002 starts and stops recording sessions", async () => {
    const { daemon } = createDaemon();
    await daemon.start();

    try {
      const start = await postJson(daemon, "/api/v1/recordings/start", { mode: "browser" });
      const stop = await postJson(daemon, "/api/v1/recordings/stop", {
        sessionId: start.body.sessionId as string
      });

      expect(start.status).toBe(200);
      expect(stop.status).toBe(200);
      expect(stop.body.events).toEqual([]);
    } finally {
      await daemon.stop();
    }
  });

  it("API-003 supports the replay api", async () => {
    const { daemon } = createDaemon();
    await daemon.start();

    try {
      const response = await postJson(daemon, "/api/v1/skills/invoice-download/replay", {
        mode: "autopilot",
        inputs: {}
      });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("passed");
      expect(response.body.runId).toBe("run-001");
    } finally {
      await daemon.stop();
    }
  });

  it("API-004 supports the export api", async () => {
    const { daemon } = createDaemon();
    const outDir = await makeTempDir("skillforge-daemon-export-");
    await daemon.start();

    try {
      const response = await postJson(daemon, "/api/v1/skills/invoice-download/export", {
        target: "openclaw",
        outDir
      });

      expect(response.status).toBe(200);
      expect(response.body.artifactPaths).toContain(path.join(outDir, "SKILL.md"));
      await expect(fs.stat(path.join(outDir, "run.sh"))).resolves.toBeTruthy();
    } finally {
      await daemon.stop();
    }
  });

  it("API-005 returns 4xx-equivalent responses on malformed requests", async () => {
    const { daemon } = createDaemon();
    await daemon.start();

    try {
      const response = await postJson(daemon, "/api/v1/skills/invoice-download/export", {
        target: "openclaw"
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("missing_out_dir");
    } finally {
      await daemon.stop();
    }
  });

  it("API-006 avoids races on parallel requests", async () => {
    const { daemon } = createDaemon();
    await daemon.start();

    try {
      const [first, second] = await Promise.all([
        postJson(daemon, "/api/v1/recordings/start", { mode: "browser" }),
        postJson(daemon, "/api/v1/recordings/start", { mode: "browser" })
      ]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(first.body.sessionId).not.toBe(second.body.sessionId);
    } finally {
      await daemon.stop();
    }
  });

  it("API-007 returns 503 while the daemon is stopped", async () => {
    const { daemon } = createDaemon();

    const response = await daemon.handleRequest("POST", "/api/v1/recordings/start", {});

    expect(response.status).toBe(503);
    expect(response.body.error).toBe("daemon_not_running");
  });

  it("API-008 rejects malformed json bodies", async () => {
    const { daemon } = createDaemon();
    await daemon.start();

    try {
      const response = await fetch(`${daemon.baseUrl()}/api/v1/recordings/start`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: "{invalid"
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: "invalid_json" });
    } finally {
      await daemon.stop();
    }
  });

  it("API-009 rejects unsupported export targets", async () => {
    const { daemon } = createDaemon();
    await daemon.start();

    try {
      const response = await postJson(daemon, "/api/v1/skills/invoice-download/export", {
        target: "native",
        outDir: "/tmp/export"
      });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("unsupported_target");
    } finally {
      await daemon.stop();
    }
  });

  it("API-010 returns bad_request on unknown routes", async () => {
    const { daemon } = createDaemon();
    await daemon.start();

    try {
      const response = await postJson(daemon, "/api/v1/unknown", {});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("bad_request");
    } finally {
      await daemon.stop();
    }
  });

  it("API-011 exports fixture skill schema from disk", async () => {
    const { daemon } = createDaemon();
    const outDir = await makeTempDir("skillforge-daemon-export-fixture-");
    await daemon.start();

    try {
      const response = await postJson(daemon, "/api/v1/skills/invoice-download/export", {
        target: "openclaw",
        outDir
      });

      expect(response.status).toBe(200);
      await expect(fs.readFile(path.join(outDir, "skillforge.openclaw.json"), "utf8")).resolves.toContain("invoice_month");
    } finally {
      await daemon.stop();
    }
  });

  it("API-012 replays fixture shell skills from disk", async () => {
    const { daemon } = createDaemon();
    await daemon.start();

    try {
      const response = await postJson(daemon, "/api/v1/skills/42-preflight/replay", {
        mode: "autopilot",
        inputs: {
          repo_dir: "./tests/fixtures/repos/42-preflight-repo"
        }
      });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("passed");
    } finally {
      await daemon.stop();
    }
  });
});
