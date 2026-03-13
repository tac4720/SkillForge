import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { NodeFileSystem } from "../../src/drivers/node-file-system.js";
import { PlaywrightBrowserDriver } from "../../src/drivers/playwright-browser-driver.js";
import { ReplayEngine } from "../../src/replay/replay-engine.js";
import { RunLogger } from "../../src/replay/run-logger.js";
import { FakeApprovalGate } from "../fakes/fake-approval-gate.js";
import { FakeShellRunner } from "../fakes/fake-shell-runner.js";
import { makeTempDir, startFixtureServer } from "../helpers/fixtures.js";

const drivers = new Set<PlaywrightBrowserDriver>();

afterEach(async () => {
  await Promise.all([...drivers].map(async (driver) => driver.close?.()));
  drivers.clear();
});

async function createEngine(outDir: string) {
  const driver = new PlaywrightBrowserDriver({
    headless: true,
    downloadsDir: path.join(outDir, "downloads")
  });
  drivers.add(driver);

  const fileSystem = new NodeFileSystem();
  const logger = new RunLogger({
    fileSystem,
    baseDir: path.join(outDir, "runs")
  });

  return {
    driver,
    logger,
    engine: new ReplayEngine({
      browserDriver: driver,
      shellRunner: new FakeShellRunner(),
      fileSystem,
      approvalGate: new FakeApprovalGate(),
      logger,
      createRunId: () => "run-001",
      now: () => new Date("2026-03-13T00:00:00.000Z")
    })
  };
}

describe("replay with real browser-driver integration", () => {
  it("RBD-001 ReplayEngine can execute browser.navigate with PlaywrightBrowserDriver", async () => {
    const server = await startFixtureServer();
    const outDir = await makeTempDir("skillforge-real-driver-");
    const { engine } = await createEngine(outDir);

    try {
      const result = await engine.run(
        {
          name: "navigate-only",
          version: "0.1.0",
          actor: "test",
          inputsSchema: {},
          permissions: {
            browser: {
              domains: {
                allow: [server.baseUrl]
              }
            }
          },
          steps: [
            {
              id: "step-001",
              type: "browser.navigate",
              with: {
                url: `${server.baseUrl}/login`
              }
            }
          ],
          assertions: []
        },
        { mode: "autopilot", inputs: {} }
      );

      expect(result.status).toBe("passed");
    } finally {
      await server.stop();
    }
  });

  it("RBD-002 browser.input/click flow succeeds on invoice fixture", async () => {
    const server = await startFixtureServer();
    const outDir = await makeTempDir("skillforge-real-driver-");
    const { engine } = await createEngine(outDir);

    try {
      const result = await engine.run(
        {
          name: "login-flow",
          version: "0.1.0",
          actor: "test",
          inputsSchema: {},
          permissions: {
            browser: {
              domains: {
                allow: [server.baseUrl]
              }
            }
          },
          steps: [
            {
              id: "step-nav",
              type: "browser.navigate",
              with: {
                url: `${server.baseUrl}/login`
              }
            },
            {
              id: "step-email",
              type: "browser.input",
              target: {
                locatorCandidates: ["#email"]
              },
              with: {
                value: "user@example.com"
              }
            },
            {
              id: "step-password",
              type: "browser.input",
              target: {
                locatorCandidates: ["#password"]
              },
              with: {
                value: "hunter2"
              },
              secret: true
            },
            {
              id: "step-submit",
              type: "browser.click",
              target: {
                locatorCandidates: ["#sign-in"]
              }
            },
            {
              id: "step-wait",
              type: "browser.waitFor",
              target: {
                locatorCandidates: ["h1"]
              }
            }
          ],
          assertions: []
        },
        { mode: "autopilot", inputs: {}, secrets: ["hunter2"] }
      );

      expect(result.status).toBe("passed");
    } finally {
      await server.stop();
    }
  });

  it("RBD-003 download flow succeeds with real browser backend", async () => {
    const server = await startFixtureServer();
    const outDir = await makeTempDir("skillforge-real-driver-");
    const { engine } = await createEngine(outDir);
    const destination = path.join(outDir, "downloads", "invoice.pdf");

    try {
      const result = await engine.run(
        {
          name: "download-flow",
          version: "0.1.0",
          actor: "test",
          inputsSchema: {},
          permissions: {
            browser: {
              domains: {
                allow: [server.baseUrl]
              }
            }
          },
          steps: [
            {
              id: "step-nav",
              type: "browser.navigate",
              with: {
                url: `${server.baseUrl}/invoices?month=2026-03`
              }
            },
            {
              id: "step-download",
              type: "browser.download",
              target: {
                locatorCandidates: ["#download"]
              },
              with: {
                saveAs: destination
              }
            }
          ],
          assertions: [
            {
              type: "fileExists",
              path: destination
            }
          ]
        },
        { mode: "autopilot", inputs: {} }
      );

      expect(result.status).toBe("passed");
      await expect(fs.stat(destination)).resolves.toBeTruthy();
    } finally {
      await server.stop();
    }
  });

  it("RBD-004 failure artifacts are created from real browser backend", async () => {
    const server = await startFixtureServer();
    const outDir = await makeTempDir("skillforge-real-driver-");
    const { engine, logger } = await createEngine(outDir);

    try {
      const result = await engine.run(
        {
          name: "artifact-flow",
          version: "0.1.0",
          actor: "test",
          inputsSchema: {},
          permissions: {
            browser: {
              domains: {
                allow: [server.baseUrl]
              }
            }
          },
          steps: [
            {
              id: "step-nav",
              type: "browser.navigate",
              with: {
                url: `${server.baseUrl}/login`
              }
            },
            {
              id: "step-missing",
              type: "browser.click",
              target: {
                locatorCandidates: ["#missing"]
              }
            }
          ],
          assertions: []
        },
        { mode: "autopilot", inputs: {} }
      );

      const runLog = await logger.read("run-001");
      expect(result.status).toBe("failed");
      await expect(fs.stat(runLog.artifacts!.screenshotPath!)).resolves.toBeTruthy();
      await expect(fs.stat(runLog.artifacts!.domSnapshotPath!)).resolves.toBeTruthy();
    } finally {
      await server.stop();
    }
  });

  it("RBD-005 redirect outside allowlist is blocked before unsafe continuation", async () => {
    const server = await startFixtureServer();
    const outDir = await makeTempDir("skillforge-real-driver-");
    const { engine } = await createEngine(outDir);

    try {
      const result = await engine.run(
        {
          name: "redirect-block",
          version: "0.1.0",
          actor: "test",
          inputsSchema: {},
          permissions: {
            browser: {
              domains: {
                allow: [server.baseUrl]
              }
            }
          },
          steps: [
            {
              id: "step-001",
              type: "browser.navigate",
              with: {
                url: "https://evil.example/phishing"
              }
            }
          ],
          assertions: []
        },
        { mode: "autopilot", inputs: {} }
      );

      expect(result.status).toBe("failed");
      expect(result.errorType).toBe("permission_denied");
    } finally {
      await server.stop();
    }
  });
});
