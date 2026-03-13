import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadSkillFile, resolveSkillFilePath } from "../../src/core/skill-loader.js";

describe("skill-loader integration", () => {
  it("SLD-001 resolves fixture skills by short name", async () => {
    const resolved = await resolveSkillFilePath("invoice-download", { cwd: process.cwd() });

    expect(resolved).toBe(path.join("tests", "fixtures", "skills", "invoice-download", "skill.ir.json"));
  });

  it("SLD-002 loads fixture skills from a directory path and example inputs", async () => {
    const loaded = await loadSkillFile("tests/fixtures/skills/42-preflight", { cwd: process.cwd() });

    expect(loaded?.filePath).toBe(path.join("tests", "fixtures", "skills", "42-preflight", "skill.ir.json"));
    expect(loaded?.skill).toMatchObject({
      name: "42-preflight",
      version: "0.1.0"
    });
    expect(loaded?.inputsExample).toMatchObject({
      repo_dir: "./tests/fixtures/repos/42-preflight-repo"
    });
  });

  it("SLD-003 returns null for unknown skill specifiers", async () => {
    await expect(loadSkillFile("does-not-exist", { cwd: process.cwd() })).resolves.toBeNull();
  });
});
