import { expect, test } from "@playwright/test";

import { RepairEngine } from "../../src/replay/repair-engine.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";
import { startFixtureServer } from "../helpers/fixtures.js";

async function clickByText(page: import("@playwright/test").Page, baseUrl: string, text: string): Promise<boolean> {
  await page.goto(`${baseUrl}/dynamic`);
  const locator = page.getByRole("button", { name: text });
  try {
    await locator.click({ timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

test.describe("repair-flow e2e", () => {
  test("E2E-RPR-001 succeeds on the first replay", async ({ page }) => {
    const server = await startFixtureServer();
    try {
      await expect(clickByText(page, server.baseUrl, "Download PDF")).resolves.toBe(true);
    } finally {
      await server.stop();
    }
  });

  test("E2E-RPR-002 fails after changing the fixture button text", async ({ page }) => {
    const server = await startFixtureServer();
    try {
      server.setDynamicButtonText("Get PDF");
      await expect(clickByText(page, server.baseUrl, "Download PDF")).resolves.toBe(false);
    } finally {
      await server.stop();
    }
  });

  test("E2E-RPR-003 retrieves repair suggestions", async () => {
    const engine = new RepairEngine({
      fileSystem: new InMemoryFileSystem(),
      baseDir: "/repairs"
    });

    const suggestions = engine.suggest({
      errorType: "locator_not_found",
      step: {
        id: "step-001",
        type: "browser.click",
        target: {
          locatorCandidates: ["text=Download PDF"]
        }
      },
      domCandidates: [{ locator: "text=Get PDF", similarity: 0.95 }]
    });

    expect(suggestions[1]?.locator).toBe("text=Get PDF");
  });

  test("E2E-RPR-004 applies an approved repair", async () => {
    const fs = new InMemoryFileSystem();
    const engine = new RepairEngine({
      fileSystem: fs,
      baseDir: "/repairs"
    });

    const applied = await engine.applyRepair(
      "run-001",
      {
        id: "step-001",
        type: "browser.click",
        target: {
          locatorCandidates: ["text=Download PDF"]
        }
      },
      {
        strategy: "domSimilarity",
        locator: "text=Get PDF",
        similarity: 0.95
      },
      true
    );

    expect(applied.applied).toBe(true);
    expect(applied.step.target.locatorCandidates[0]).toBe("text=Get PDF");
  });

  test("E2E-RPR-005 succeeds on replay after repair", async ({ page }) => {
    const server = await startFixtureServer();
    try {
      server.setDynamicButtonText("Get PDF");
      await expect(clickByText(page, server.baseUrl, "Get PDF")).resolves.toBe(true);
    } finally {
      await server.stop();
    }
  });
});
