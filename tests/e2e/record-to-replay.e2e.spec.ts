import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { expect, test } from "@playwright/test";

import { normalizeRecordedEvents } from "../../src/core/event-normalizer.js";
import { saveSkillPackageToDir } from "../../src/package/load-skill-package.js";
import type { SkillPackage } from "../../src/package/skill-package-schema.js";
import { BrowserRecorder } from "../../src/recorder/browser-recorder.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";
import { makeTempDir, startFixtureServer } from "../helpers/fixtures.js";

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const cliWrapperPath = path.resolve("bin/skillforge");

function runCliProcess(
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", [cliWrapperPath, ...args], {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd()
      });
    });
  });
}

async function recordInvoiceWorkflow(page: import("@playwright/test").Page): Promise<{
  server: Awaited<ReturnType<typeof startFixtureServer>>;
  session: Awaited<ReturnType<BrowserRecorder["stop"]>>;
  draft: ReturnType<typeof normalizeRecordedEvents>;
  packageDir: string;
}> {
  const server = await startFixtureServer();
  const recorder = new BrowserRecorder({
    fileSystem: new InMemoryFileSystem(),
    baseDir: "/recordings",
    now: () => new Date("2026-03-13T00:00:00.000Z")
  });
  const { sessionId } = await recorder.start();
  await recorder.attachPage(sessionId, page as unknown as Parameters<BrowserRecorder["attachPage"]>[1]);

  try {
    await page.goto(`${server.baseUrl}/login`);
    await page.fill("#email", "user@example.com");
    await page.fill("#password", "hunter2");
    await page.click("#sign-in");
    await page.goto(`${server.baseUrl}/invoices?month=2026-03`);
    await Promise.all([page.waitForEvent("download"), page.click("#download")]);
    const session = await recorder.stop(sessionId);
    const draft = normalizeRecordedEvents(session.events);
    const packageDir = await makeTempDir("skillforge-recorded-package-");
    const skillPackage: SkillPackage = {
      apiVersion: "skillforge.io/v1alpha1",
      kind: "SkillPackage",
      metadata: {
        name: "recorded-invoice-download",
        version: "0.1.0",
        description: "Recorded browser workflow"
      },
      inputs: draft.inputs,
      permissions: draft.permissions as SkillPackage["permissions"],
      steps: draft.steps,
      assertions: draft.assertions,
      tests: [
        {
          id: "happy-path",
          input: {}
        }
      ],
      export: {
        targets: ["openclaw"]
      }
    };
    await saveSkillPackageToDir(skillPackage, packageDir);
    return { server, session, draft, packageDir };
  } catch (error) {
    await server.stop();
    throw error;
  }
}

test.describe("record-to-replay e2e", () => {
  test("REC2-E2E-001 record fixture workflow", async ({ page }) => {
    const { server, session } = await recordInvoiceWorkflow(page);

    try {
      expect(session.events.some((event) => event.type === "navigate")).toBe(true);
      expect(session.events.some((event) => event.type === "click")).toBe(true);
      expect(session.events.some((event) => event.type === "download")).toBe(true);
    } finally {
      await server.stop();
    }
  });

  test("REC2-E2E-002 normalize recorded session", async ({ page }) => {
    const { server, draft } = await recordInvoiceWorkflow(page);

    try {
      expect(draft.steps.length).toBeGreaterThan(0);
      expect(draft.permissions.browser?.domains?.allow?.[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/u);
    } finally {
      await server.stop();
    }
  });

  test("REC2-E2E-003 save as formal package", async ({ page }) => {
    const { server, packageDir } = await recordInvoiceWorkflow(page);

    try {
      const document = await fs.readFile(path.join(packageDir, "skillforge.yaml"), "utf8");
      expect(document).toContain("recorded-invoice-download");
    } finally {
      await server.stop();
    }
  });

  test("REC2-E2E-004 replay succeeds", async ({ page }) => {
    const { server, packageDir } = await recordInvoiceWorkflow(page);

    try {
      const result = await runCliProcess(["replay", packageDir], {
        cwd: process.cwd(),
        env: {
          SKILLFORGE_HEADLESS: "1"
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("passed:");
    } finally {
      await server.stop();
    }
  });

  test("REC2-E2E-005 export openclaw succeeds from recorded package", async ({ page }) => {
    const { server, packageDir } = await recordInvoiceWorkflow(page);
    const outDir = await makeTempDir("skillforge-recorded-openclaw-");

    try {
      const result = await runCliProcess(["export", packageDir, "--target", "openclaw", "--out-dir", outDir], {
        cwd: process.cwd()
      });

      expect(result.exitCode).toBe(0);
      await expect(fs.readFile(path.join(outDir, "skillforge.openclaw.json"), "utf8")).resolves.toContain("entryPoint");
    } finally {
      await server.stop();
    }
  });
});
