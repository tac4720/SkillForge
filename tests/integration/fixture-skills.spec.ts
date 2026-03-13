import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { assertValidInputs } from "../../src/core/input-validator.js";
import { OpenClawExporter } from "../../src/exporters/openclaw/index.js";
import { ReplayEngine, type ReplaySkill } from "../../src/replay/replay-engine.js";
import { RunLogger } from "../../src/replay/run-logger.js";
import { TestClock, assertFileExists, fixtureSkillPath, loadFixtureInputs, loadFixtureSkill } from "../helpers/fixtures.js";
import { FakeApprovalGate } from "../fakes/fake-approval-gate.js";
import { FakeBrowserDriver } from "../fakes/fake-browser-driver.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";
import { FakeShellRunner } from "../fakes/fake-shell-runner.js";

function createEngine() {
  const browser = new FakeBrowserDriver();
  const shell = new FakeShellRunner();
  const fileSystem = new InMemoryFileSystem();
  const clock = new TestClock();
  const engine = new ReplayEngine({
    browserDriver: browser,
    shellRunner: shell,
    fileSystem,
    approvalGate: new FakeApprovalGate(),
    logger: new RunLogger({ fileSystem, baseDir: "/runs" }),
    createRunId: () => "run-fixture-001",
    now: () => clock.now()
  });

  return { engine, shell, clock };
}

describe("fixture skills integration", () => {
  it("FXT-001 loads invoice-download fixture inputs and exports the fixture skill", async () => {
    const skill = await loadFixtureSkill<ReplaySkill>("invoice-download");
    const inputs = await loadFixtureInputs("invoice-download");
    const exporter = new OpenClawExporter();

    expect(assertValidInputs(skill.inputsSchema, inputs)).toEqual(inputs);

    const result = await exporter.export(
      {
        name: skill.name,
        inputSchema: skill.inputsSchema,
        permissions: skill.permissions as Record<string, unknown>,
        steps: skill.steps
      },
      {
        skillPath: fixtureSkillPath("invoice-download", "skill.ir.json")
      }
    );

    expect(result.artifacts.map((artifact) => artifact.path)).toEqual(
      expect.arrayContaining(["SKILL.md", "skillforge.openclaw.json", "run.sh", "skill.ir.json"])
    );
  });

  it("FXT-002 replays the 42-preflight fixture skill using the sample inputs", async () => {
    const { engine, shell, clock } = createEngine();
    const skill = await loadFixtureSkill<ReplaySkill>("42-preflight");
    const inputs = await loadFixtureInputs("42-preflight");

    shell.setResult("make", [], {
      exitCode: 0,
      stdout: "build ok",
      stderr: ""
    });

    const result = await engine.run(skill, { mode: "autopilot", inputs });

    expect(result.status).toBe("passed");
    expect(clock.tick(1000).toISOString()).toBe("2026-03-13T00:00:01.000Z");
  });

  it("FXT-003 replays the website-change-watcher fixture skill successfully", async () => {
    const { engine } = createEngine();
    const skill = await loadFixtureSkill<ReplaySkill>("website-change-watcher");
    const inputs = await loadFixtureInputs("website-change-watcher");

    const result = await engine.run(skill, { mode: "autopilot", inputs });

    expect(result.status).toBe("passed");
  });

  it("FXT-004 keeps the 42 fixture repo variants and sample report on disk", async () => {
    const requiredPaths = [
      path.join("tests", "fixtures", "repos", "42-preflight-repo", "cases", "pass", "Makefile"),
      path.join("tests", "fixtures", "repos", "42-preflight-repo", "cases", "fail", "Makefile"),
      path.join("tests", "fixtures", "repos", "42-preflight-repo", "cases", "forbidden", "main.c"),
      path.join("tests", "fixtures", "repos", "42-preflight-repo", "reports", "sample.txt")
    ];

    await Promise.all(requiredPaths.map((entryPath) => assertFileExists(entryPath)));

    await expect(fs.readFile(requiredPaths[2], "utf8")).resolves.toContain("gets(");
    await expect(fs.readFile(requiredPaths[3], "utf8")).resolves.toContain("make:build ok");
  });
});
