import { describe, expect, it } from "vitest";

import { RepairEngine } from "../../src/replay/repair-engine.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";

describe("repair-engine", () => {
  it("RPR-001 returns repair candidates on locator_not_found", () => {
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
          locatorCandidates: ["role=button[name=\"Download\"]", "text=Download"]
        }
      }
    });

    expect(suggestions[0]?.locator).toBe("role=button[name=\"Download\"]");
  });

  it("RPR-002 returns dom fingerprint similarity candidates", () => {
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
          locatorCandidates: ["role=button[name=\"Download\"]"]
        }
      },
      domCandidates: [
        { locator: "button[aria-label=\"Download PDF\"]", similarity: 0.92 },
        { locator: "button[data-test=\"download\"]", similarity: 0.71 }
      ]
    });

    expect(suggestions.some((suggestion) => suggestion.strategy === "domSimilarity")).toBe(true);
  });

  it("RPR-003 does not propose auto repair for high-risk steps", () => {
    const engine = new RepairEngine({
      fileSystem: new InMemoryFileSystem(),
      baseDir: "/repairs"
    });

    const suggestions = engine.suggest({
      errorType: "locator_not_found",
      mode: "auto",
      step: {
        id: "step-001",
        type: "browser.click",
        action: "send email",
        target: {
          locatorCandidates: ["role=button[name=\"Send\"]"]
        }
      }
    });

    expect(suggestions).toEqual([]);
  });

  it("RPR-004 applies only approved repairs", async () => {
    const engine = new RepairEngine({
      fileSystem: new InMemoryFileSystem(),
      baseDir: "/repairs"
    });

    const step = {
      id: "step-001",
      type: "browser.click",
      target: {
        locatorCandidates: ["text=Download"]
      }
    };

    const suggestion = {
      strategy: "domSimilarity",
      locator: "button[aria-label=\"Download PDF\"]",
      similarity: 0.9
    } as const;

    const rejected = await engine.applyRepair("run-001", step, suggestion, false);
    const approved = await engine.applyRepair("run-001", step, suggestion, true);

    expect(rejected.applied).toBe(false);
    expect(approved.applied).toBe(true);
    expect(approved.step.target.locatorCandidates[0]).toBe("button[aria-label=\"Download PDF\"]");
  });

  it("RPR-005 stores repair diffs", async () => {
    const fs = new InMemoryFileSystem();
    const engine = new RepairEngine({
      fileSystem: fs,
      baseDir: "/repairs"
    });

    await engine.applyRepair(
      "run-001",
      {
        id: "step-001",
        type: "browser.click",
        target: {
          locatorCandidates: ["text=Download"]
        }
      },
      {
        strategy: "domSimilarity",
        locator: "button[aria-label=\"Download PDF\"]",
        similarity: 0.9
      },
      true
    );

    const diff = JSON.parse(await fs.readFile("/repairs/run-001/step-001.json"));
    expect(diff.after.target.locatorCandidates[0]).toBe("button[aria-label=\"Download PDF\"]");
  });
});
