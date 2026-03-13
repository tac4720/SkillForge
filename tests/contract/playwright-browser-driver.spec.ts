import fs from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PlaywrightBrowserDriver } from "../../src/drivers/playwright-browser-driver.js";
import { makeTempDir, startFixtureServer } from "../helpers/fixtures.js";

const drivers = new Set<PlaywrightBrowserDriver>();

afterEach(async () => {
  await Promise.all([...drivers].map(async (driver) => driver.close?.()));
  drivers.clear();
});

async function createDriver() {
  const downloadsDir = await makeTempDir("skillforge-pbd-downloads-");
  const driver = new PlaywrightBrowserDriver({
    headless: true,
    downloadsDir
  });
  drivers.add(driver);
  return { driver, downloadsDir };
}

describe("playwright browser-driver contract", () => {
  it("PBD-001 satisfies browser driver contract", async () => {
    const server = await startFixtureServer();
    const { driver } = await createDriver();

    try {
      const navigate = await driver.navigate(`${server.baseUrl}/login`);
      const click = await driver.click("#sign-in");

      expect(navigate.ok).toBe(true);
      expect(click.ok).toBe(true);
    } finally {
      await server.stop();
    }
  });

  it("PBD-002 navigate updates currentUrl", async () => {
    const server = await startFixtureServer();
    const { driver } = await createDriver();

    try {
      await driver.navigate(`${server.baseUrl}/login`);

      expect(driver.currentUrl()).toBe(`${server.baseUrl}/login`);
    } finally {
      await server.stop();
    }
  });

  it("PBD-003 click works on fixture app", async () => {
    const server = await startFixtureServer();
    const { driver } = await createDriver();

    try {
      await driver.navigate(`${server.baseUrl}/login`);
      const result = await driver.click("#sign-in");

      expect(result.ok).toBe(true);
      expect(driver.currentUrl()).toBe(`${server.baseUrl}/dashboard`);
    } finally {
      await server.stop();
    }
  });

  it("PBD-004 input works on fixture app", async () => {
    const server = await startFixtureServer();
    const { driver } = await createDriver();

    try {
      await driver.navigate(`${server.baseUrl}/login`);
      const inputResult = await driver.input("#email", "user@example.com");
      const extractResult = await driver.extract?.("#email");

      expect(inputResult.ok).toBe(true);
      expect(extractResult?.ok).toBe(true);
      if (extractResult?.ok) {
        expect(extractResult.value).toBe("user@example.com");
      }
    } finally {
      await server.stop();
    }
  });

  it("PBD-005 waitFor works on fixture app", async () => {
    const server = await startFixtureServer();
    const { driver } = await createDriver();

    try {
      await driver.navigate(`${server.baseUrl}/invoices?month=2026-03`);
      const result = await driver.waitFor("#delayed-status", { timeoutMs: 1000 });

      expect(result.ok).toBe(true);
    } finally {
      await server.stop();
    }
  });

  it("PBD-006 download saves file", async () => {
    const server = await startFixtureServer();
    const { driver, downloadsDir } = await createDriver();

    try {
      await driver.navigate(`${server.baseUrl}/invoices?month=2026-03`);
      const saveAs = path.join(downloadsDir, "2026-03.pdf");
      const result = await driver.download("#download", { saveAs });

      expect(result.ok).toBe(true);
      await expect(fs.stat(saveAs)).resolves.toBeTruthy();
    } finally {
      await server.stop();
    }
  });

  it("PBD-007 screenshot creates file", async () => {
    const server = await startFixtureServer();
    const { driver, downloadsDir } = await createDriver();

    try {
      await driver.navigate(`${server.baseUrl}/login`);
      const screenshotPath = path.join(downloadsDir, "page.png");
      const result = await driver.screenshot?.(screenshotPath);

      expect(result?.ok).toBe(true);
      await expect(fs.stat(screenshotPath)).resolves.toBeTruthy();
    } finally {
      await server.stop();
    }
  });

  it("PBD-008 locator_not_found returns deterministic error code", async () => {
    const server = await startFixtureServer();
    const { driver } = await createDriver();

    try {
      await driver.navigate(`${server.baseUrl}/login`);
      const result = await driver.click("#does-not-exist");

      expect(result).toEqual({
        ok: false,
        error: {
          code: "locator_not_found",
          message: expect.any(String)
        }
      });
    } finally {
      await server.stop();
    }
  });
});
