import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { OpenClawExporter } from "../../src/exporters/openclaw/index.js";
import { assertFileExists, makeTempDir, startFixtureServer } from "../helpers/fixtures.js";

test.describe("invoice-download e2e", () => {
  test("E2E-INV-001 logs in to the fixture portal", async ({ page }) => {
    const server = await startFixtureServer();
    try {
      await page.goto(`${server.baseUrl}/login`);
      await page.fill("#email", "user@example.com");
      await page.fill("#password", "hunter2");
      await page.click("#sign-in");
      await expect(page.locator("h1")).toHaveText("Dashboard");
    } finally {
      await server.stop();
    }
  });

  test("E2E-INV-002 navigates to the requested invoice month parameter", async ({ page }) => {
    const server = await startFixtureServer();
    try {
      await page.goto(`${server.baseUrl}/invoices?month=2026-03`);
      await expect(page.locator("h1")).toHaveText("Invoices 2026-03");
    } finally {
      await server.stop();
    }
  });

  test("E2E-INV-003 downloads a pdf", async ({ page }) => {
    const server = await startFixtureServer();
    try {
      await page.goto(`${server.baseUrl}/invoices?month=2026-03`);
      const [download] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
      expect(await download.suggestedFilename()).toBe("2026-03.pdf");
    } finally {
      await server.stop();
    }
  });

  test("E2E-INV-004 passes the fileExists assertion", async ({ page }) => {
    const server = await startFixtureServer();
    const outputDir = await makeTempDir("skillforge-invoice-");
    try {
      await page.goto(`${server.baseUrl}/invoices?month=2026-03`);
      const [download] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
      const destination = path.join(outputDir, "2026-03.pdf");
      await download.saveAs(destination);
      await expect(assertFileExists(destination)).resolves.toBeUndefined();
    } finally {
      await server.stop();
    }
  });

  test("E2E-INV-005 succeeds via the OpenClaw export wrapper", async ({ page }) => {
    const server = await startFixtureServer();
    const exporter = new OpenClawExporter();
    try {
      const exported = await exporter.export(
        {
          name: "invoice-download",
          inputSchema: { invoice_month: { type: "string" } },
          steps: [{ type: "browser.navigate" }]
        },
        { skillPath: `${server.baseUrl}/invoices` }
      );

      const invocation = await exporter.invokeWrapper(exported.artifacts, { invoice_month: "2026-03" });
      const target = `${invocation.args[1]}?month=2026-03`;
      await page.goto(target);
      await expect(page.locator("h1")).toHaveText("Invoices 2026-03");
    } finally {
      await server.stop();
    }
  });

  test("E2E-INV-006 does not expose secrets in outputs", async ({ page }) => {
    const server = await startFixtureServer();
    const exporter = new OpenClawExporter();
    try {
      await page.goto(`${server.baseUrl}/login`);
      await page.fill("#password", "hunter2");

      const exported = await exporter.export(
        {
          name: "invoice-download",
          description: "password=hunter2",
          steps: [{ type: "browser.navigate" }],
          secrets: ["hunter2"]
        },
        { skillPath: `${server.baseUrl}/invoices` }
      );

      const artifacts = exported.artifacts.map((artifact) => artifact.content).join("\n");
      expect(artifacts).not.toContain("hunter2");
    } finally {
      await server.stop();
    }
  });
});
