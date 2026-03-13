import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import type { BrowserDriver, DriverResult, DownloadMetadata, SkillTarget } from "../../src/drivers/browser-driver.js";
import type { FileSystem } from "../../src/drivers/file-system.js";
import { ReplayEngine } from "../../src/replay/replay-engine.js";
import { RunLogger } from "../../src/replay/run-logger.js";
import { FakeApprovalGate } from "../fakes/fake-approval-gate.js";
import { FakeShellRunner } from "../fakes/fake-shell-runner.js";
import { makeTempDir, startFixtureServer } from "../helpers/fixtures.js";

class NodeFileSystem implements FileSystem {
  async writeFile(filePath: string, contents: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, contents, "utf8");
  }

  async readFile(filePath: string): Promise<string> {
    return fs.readFile(filePath, "utf8");
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async move(fromPath: string, toPath: string): Promise<void> {
    await fs.mkdir(path.dirname(toPath), { recursive: true });
    await fs.rename(fromPath, toPath);
  }

  async realpath(filePath: string): Promise<string> {
    return fs.realpath(filePath);
  }
}

function ok<T>(value: T): DriverResult<T> {
  return { ok: true, value };
}

function fail<T>(code: string, message: string): DriverResult<T> {
  return { ok: false, error: { code, message } };
}

class PlaywrightBrowserDriver implements BrowserDriver {
  constructor(private readonly page: import("@playwright/test").Page) {}

  currentUrl(): string {
    return this.page.url();
  }

  async navigate(url: string): Promise<DriverResult<{ url: string }>> {
    await this.page.goto(url);
    return ok({ url: this.page.url() });
  }

  async click(locator: string | SkillTarget): Promise<DriverResult<void>> {
    try {
      await this.page.locator(normalizeTarget(locator)).click({ timeout: 200 });
      return ok(undefined);
    } catch {
      return fail("locator_not_found", `Missing locator: ${normalizeTarget(locator)}`);
    }
  }

  async input(locator: string | SkillTarget, value: string): Promise<DriverResult<void>> {
    try {
      await this.page.locator(normalizeTarget(locator)).fill(value, { timeout: 200 });
      return ok(undefined);
    } catch {
      return fail("locator_not_found", `Missing locator: ${normalizeTarget(locator)}`);
    }
  }

  async waitFor(locator: string | SkillTarget | Record<string, unknown>): Promise<DriverResult<void>> {
    try {
      const selector = typeof locator === "string" || isSkillTarget(locator)
        ? normalizeTarget(locator)
        : String(locator.locator ?? "");
      await this.page.locator(selector).waitFor({ timeout: 200 });
      return ok(undefined);
    } catch {
      return fail("locator_not_found", `Missing locator`);
    }
  }

  async download(_locator: string | SkillTarget): Promise<DriverResult<DownloadMetadata>> {
    return fail("download_timeout", "Download is not configured for this test.");
  }

  async screenshot(): Promise<DriverResult<string>> {
    const buffer = await this.page.screenshot();
    return ok(buffer.toString("base64"));
  }

  async domSnapshot(): Promise<DriverResult<string>> {
    return ok(await this.page.content());
  }
}

function normalizeTarget(target: string | SkillTarget): string {
  return typeof target === "string" ? target : (target.locatorCandidates[0] ?? "");
}

function isSkillTarget(value: unknown): value is SkillTarget {
  return typeof value === "object" &&
    value !== null &&
    Array.isArray((value as SkillTarget).locatorCandidates);
}

async function runFailureScenario(page: import("@playwright/test").Page): Promise<{
  result: Awaited<ReturnType<ReplayEngine["run"]>>;
  runLog: Awaited<ReturnType<RunLogger["read"]>>;
}> {
  const server = await startFixtureServer();
  const runRoot = await makeTempDir("skillforge-artifacts-");
  const fileSystem = new NodeFileSystem();
  const logger = new RunLogger({ fileSystem, baseDir: runRoot });
  const engine = new ReplayEngine({
    browserDriver: new PlaywrightBrowserDriver(page),
    shellRunner: new FakeShellRunner(),
    fileSystem,
    approvalGate: new FakeApprovalGate(),
    logger,
    createRunId: () => "run-001",
    now: () => new Date("2026-03-13T00:00:00.000Z")
  });

  try {
    const result = await engine.run(
      {
        name: "artifact-failure",
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
              url: `${server.baseUrl}/dynamic`
            }
          },
          {
            id: "step-click",
            type: "browser.click",
            target: {
              locatorCandidates: ["text=Does Not Exist"]
            }
          }
        ],
        assertions: []
      },
      { mode: "autopilot", inputs: {} }
    );

    return {
      result,
      runLog: await logger.read("run-001")
    };
  } finally {
    await server.stop();
  }
}

test.describe("failure-artifacts e2e", () => {
  test("ART-E2E-001 locator_not_found generates screenshot", async ({ page }) => {
    const { result, runLog } = await runFailureScenario(page);

    expect(result.status).toBe("failed");
    expect(runLog.artifacts?.screenshotPath).toBeDefined();
    await expect(fs.stat(runLog.artifacts!.screenshotPath!)).resolves.toBeTruthy();
  });

  test("ART-E2E-002 locator_not_found generates DOM snapshot", async ({ page }) => {
    const { runLog } = await runFailureScenario(page);

    expect(runLog.artifacts?.domSnapshotPath).toBeDefined();
    await expect(fs.readFile(runLog.artifacts!.domSnapshotPath!, "utf8")).resolves.toContain("<html");
  });

  test("ART-E2E-003 failed run metadata references artifacts", async ({ page }) => {
    const { runLog } = await runFailureScenario(page);

    expect(runLog.status).toBe("failed");
    expect(runLog.artifacts?.errorJsonPath).toBeDefined();
    expect(runLog.artifacts?.screenshotPath).toBeDefined();
    expect(runLog.artifacts?.domSnapshotPath).toBeDefined();
  });
});
