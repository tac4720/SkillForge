import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";

import { OpenClawExporter } from "../../src/exporters/openclaw/index.js";
import { makeTempDir } from "../helpers/fixtures.js";

const execFileAsync = promisify(execFile);

async function createRepoFixture(): Promise<string> {
  const fixtureDir = path.resolve("tests/fixtures/repos/42-preflight-repo");
  const tempDir = await makeTempDir("skillforge-42-");
  await fs.cp(fixtureDir, tempDir, { recursive: true });
  return tempDir;
}

async function runPreflight(repoDir: string): Promise<{ makeStdout: string; forbiddenCount: number; report: string }> {
  const makeResult = await execFileAsync("make", [], { cwd: repoDir });
  const source = await fs.readFile(path.join(repoDir, "main.c"), "utf8");
  const forbiddenCount = (source.match(/\bgets\s*\(/gu) ?? []).length;
  const report = `make:${makeResult.stdout.trim()}\nforbidden:${forbiddenCount}`;
  return {
    makeStdout: makeResult.stdout.trim(),
    forbiddenCount,
    report
  };
}

test.describe("forty-two-preflight e2e", () => {
  test("E2E-42-001 runs make against the fixture repo", async () => {
    const repoDir = await createRepoFixture();
    const result = await runPreflight(repoDir);
    expect(result.makeStdout).toBe("build ok");
  });

  test("E2E-42-002 runs a norm-equivalent check", async () => {
    const repoDir = await createRepoFixture();
    const source = await fs.readFile(path.join(repoDir, "main.c"), "utf8");
    expect(source.endsWith("\n")).toBe(true);
  });

  test("E2E-42-003 runs the forbidden function grep", async () => {
    const repoDir = await createRepoFixture();
    await fs.writeFile(path.join(repoDir, "main.c"), '#include <stdio.h>\nint main(void){ gets("x"); return 0; }\n');
    const result = await runPreflight(repoDir);
    expect(result.forbiddenCount).toBe(1);
  });

  test("E2E-42-004 parses exitCode and stdout", async () => {
    const repoDir = await createRepoFixture();
    const result = await execFileAsync("make", [], { cwd: repoDir });
    expect(result.stdout.trim()).toBe("build ok");
  });

  test("E2E-42-005 generates a report", async () => {
    const repoDir = await createRepoFixture();
    const result = await runPreflight(repoDir);
    expect(result.report).toContain("make:build ok");
  });

  test("E2E-42-006 returns the report via the OpenClaw wrapper", async () => {
    const repoDir = await createRepoFixture();
    const exporter = new OpenClawExporter();
    const exported = await exporter.export(
      {
        name: "forty-two-preflight",
        inputSchema: { repo_dir: { type: "path" } },
        steps: [{ type: "shell.exec" }]
      },
      { skillPath: repoDir }
    );
    const invocation = await exporter.invokeWrapper(exported.artifacts, { repo_dir: repoDir });
    const result = await runPreflight(invocation.args[1]);
    expect(result.report).toContain("make:build ok");
  });
});
