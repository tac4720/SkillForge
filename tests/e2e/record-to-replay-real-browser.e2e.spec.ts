import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { normalizeRecordedEvents } from "../../src/core/event-normalizer.js";
import { saveSkillPackageToDir } from "../../src/package/load-skill-package.js";
import type { SkillPackage } from "../../src/package/skill-package-schema.js";
import { BrowserRecorder } from "../../src/recorder/browser-recorder.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";
import { makeTempDir, startFixtureServer } from "../helpers/fixtures.js";
import { runCliProcess } from "../helpers/process.js";

async function recordInvoiceWorkflow(page: import("@playwright/test").Page, baseUrl: string) {
  const recorder = new BrowserRecorder({
    fileSystem: new InMemoryFileSystem(),
    baseDir: "/recordings",
    now: () => new Date("2026-03-13T00:00:00.000Z")
  });
  const { sessionId } = await recorder.start();
  await recorder.attachPage(sessionId, page as unknown as Parameters<BrowserRecorder["attachPage"]>[1]);

  await page.goto(`${baseUrl}/login`);
  await page.fill("#email", "user@example.com");
  await page.fill("#password", "hunter2");
  await page.click("#sign-in");
  await page.goto(`${baseUrl}/invoices?month=2026-03`);
  await Promise.all([page.waitForEvent("download"), page.click("#download")]);

  return recorder.stop(sessionId);
}

async function saveRecordedPackage(rootDir: string, session: Awaited<ReturnType<typeof recordInvoiceWorkflow>>): Promise<string> {
  const draft = normalizeRecordedEvents(session.events);
  const packageDir = path.join(rootDir, "recorded-package");
  const skillPackage: SkillPackage = {
    apiVersion: "skillforge.io/v1alpha1",
    kind: "SkillPackage",
    metadata: {
      name: "recorded-invoice-download-real-browser",
      version: "0.1.0",
      description: "Recorded real-browser fixture"
    },
    permissions: draft.permissions as SkillPackage["permissions"],
    steps: draft.steps,
    assertions: draft.assertions,
    export: {
      targets: ["openclaw"]
    }
  };
  await saveSkillPackageToDir(skillPackage, packageDir);
  return packageDir;
}

test.describe("record-to-replay real-browser e2e", () => {
  test("RBDE2E-005 record workflow", async ({ page }) => {
    const server = await startFixtureServer();

    try {
      const session = await recordInvoiceWorkflow(page, server.baseUrl);

      expect(session.events.some((event) => event.type === "navigate")).toBe(true);
      expect(session.events.some((event) => event.type === "input")).toBe(true);
      expect(session.events.some((event) => event.type === "download")).toBe(true);
    } finally {
      await server.stop();
    }
  });

  test("RBDE2E-006 normalize and save package", async ({ page }) => {
    const server = await startFixtureServer();
    const rootDir = await makeTempDir("skillforge-record-real-browser-");

    try {
      const session = await recordInvoiceWorkflow(page, server.baseUrl);
      const packageDir = await saveRecordedPackage(rootDir, session);

      const document = await fs.readFile(path.join(packageDir, "skillforge.yaml"), "utf8");
      expect(document).toContain("recorded-invoice-download-real-browser");
      expect(document).toContain("browser.download");
    } finally {
      await server.stop();
    }
  });

  test("RBDE2E-007 replay succeeds with production browser driver", async ({ page }) => {
    const server = await startFixtureServer();
    const rootDir = await makeTempDir("skillforge-record-real-browser-replay-");

    try {
      const session = await recordInvoiceWorkflow(page, server.baseUrl);
      const packageDir = await saveRecordedPackage(rootDir, session);

      const result = await runCliProcess(["replay", packageDir], {
        cwd: rootDir,
        env: {
          SKILLFORGE_HEADLESS: "1",
          SKILLFORGE_DOWNLOADS_DIR: path.join(rootDir, "downloads")
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("passed:");
    } finally {
      await server.stop();
    }
  });

  test("RBDE2E-008 export openclaw succeeds from recorded package", async ({ page }) => {
    const server = await startFixtureServer();
    const rootDir = await makeTempDir("skillforge-record-real-browser-export-");

    try {
      const session = await recordInvoiceWorkflow(page, server.baseUrl);
      const packageDir = await saveRecordedPackage(rootDir, session);
      const outDir = path.join(rootDir, "openclaw");

      const result = await runCliProcess(["export", packageDir, "--target", "openclaw", "--out-dir", outDir], {
        cwd: rootDir
      });

      expect(result.exitCode).toBe(0);
      await expect(fs.readFile(path.join(outDir, "skillforge.openclaw.json"), "utf8")).resolves.toContain("entryPoint");
    } finally {
      await server.stop();
    }
  });
});
