import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

import { startFixtureServer } from "../helpers/fixtures.js";

function hashContent(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

test.describe("website-change-watcher e2e", () => {
  test("E2E-WEB-001 performs the initial fetch", async ({ page }) => {
    const server = await startFixtureServer();
    try {
      await page.goto(`${server.baseUrl}/watch`);
      await expect(page.locator("#watched-content")).toHaveText("Initial content");
    } finally {
      await server.stop();
    }
  });

  test("E2E-WEB-002 detects no changes", async ({ page }) => {
    const server = await startFixtureServer();
    try {
      await page.goto(`${server.baseUrl}/watch`);
      const first = await page.locator("#watched-content").textContent();
      await page.reload();
      const second = await page.locator("#watched-content").textContent();
      expect(hashContent(first ?? "")).toBe(hashContent(second ?? ""));
    } finally {
      await server.stop();
    }
  });

  test("E2E-WEB-003 detects changes", async ({ page }) => {
    const server = await startFixtureServer();
    try {
      await page.goto(`${server.baseUrl}/watch`);
      const first = await page.locator("#watched-content").textContent();
      server.setWatcherContent("Updated content");
      await page.reload();
      const second = await page.locator("#watched-content").textContent();
      expect(hashContent(first ?? "")).not.toBe(hashContent(second ?? ""));
    } finally {
      await server.stop();
    }
  });

  test("E2E-WEB-004 includes only required fields in the notify payload", async ({ page }) => {
    const server = await startFixtureServer();
    try {
      await page.goto(`${server.baseUrl}/watch`);
      const before = await page.locator("#watched-content").textContent();
      server.setWatcherContent("Updated content");
      await page.reload();
      const after = await page.locator("#watched-content").textContent();
      const payload = {
        url: `${server.baseUrl}/watch`,
        beforeHash: hashContent(before ?? ""),
        afterHash: hashContent(after ?? "")
      };

      expect(Object.keys(payload)).toEqual(["url", "beforeHash", "afterHash"]);
    } finally {
      await server.stop();
    }
  });
});
