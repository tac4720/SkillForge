import { describe, expect, it } from "vitest";

import { FakeBrowserDriver } from "../fakes/fake-browser-driver.js";

describe("browser-driver contract", () => {
  it("BDRV-001 changes currentUrl after navigate", async () => {
    const driver = new FakeBrowserDriver();
    await driver.navigate("https://portal.vendor.example/invoices");
    expect(driver.currentUrl()).toBe("https://portal.vendor.example/invoices");
  });

  it("BDRV-002 returns locator_not_found when a locator is missing", async () => {
    const driver = new FakeBrowserDriver();
    driver.setMissingLocator("missing-button");

    const result = await driver.click("missing-button");
    expect(result).toEqual({
      ok: false,
      error: {
        code: "locator_not_found",
        message: "Missing locator: missing-button"
      }
    });
  });

  it("BDRV-003 returns deterministic click errors", async () => {
    const driver = new FakeBrowserDriver();
    driver.failNextClick("click_blocked", "Click blocked.");

    const result = await driver.click("download");
    expect(result).toEqual({
      ok: false,
      error: {
        code: "click_blocked",
        message: "Click blocked."
      }
    });
  });

  it("BDRV-004 returns deterministic input errors", async () => {
    const driver = new FakeBrowserDriver();
    driver.failNextInput("input_failed", "Input failed.");

    const result = await driver.input("email", "user@example.com");
    expect(result).toEqual({
      ok: false,
      error: {
        code: "input_failed",
        message: "Input failed."
      }
    });
  });

  it("BDRV-005 returns navigation_timeout or an equivalent stable timeout code", async () => {
    const driver = new FakeBrowserDriver();
    driver.failNextWait("navigation_timeout", "Timed out.");

    const result = await driver.waitFor("dashboard");
    expect(result).toEqual({
      ok: false,
      error: {
        code: "navigation_timeout",
        message: "Timed out."
      }
    });
  });

  it("BDRV-006 returns metadata for successful downloads", async () => {
    const driver = new FakeBrowserDriver();
    driver.setDownload("download-link", {
      fileName: "invoice.pdf",
      path: "/tmp/invoice.pdf"
    });

    const result = await driver.download("download-link");
    expect(result).toEqual({
      ok: true,
      value: {
        fileName: "invoice.pdf",
        path: "/tmp/invoice.pdf"
      }
    });
  });
});
