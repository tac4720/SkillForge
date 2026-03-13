import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { runCli } from "../../src/cli/index.js";
import { makeTempDir } from "../helpers/fixtures.js";

async function writeReplayableSkill(cwd: string): Promise<string> {
  const sourcePath = path.join(cwd, "source.txt");
  const skillPath = path.join(cwd, "copy-skill.json");
  await fs.writeFile(sourcePath, "fixture", "utf8");
  await fs.writeFile(
    skillPath,
    JSON.stringify(
      {
        name: "copy-skill",
        version: "0.1.0",
        actor: "test",
        inputsSchema: {},
        permissions: {
          files: {
            read: [cwd],
            write: [cwd]
          }
        },
        steps: [
          {
            id: "step-copy",
            type: "file.copy",
            with: {
              from: sourcePath,
              to: path.join(cwd, "copied.txt")
            }
          }
        ],
        assertions: [
          {
            type: "fileExists",
            path: path.join(cwd, "copied.txt")
          }
        ]
      },
      null,
      2
    ),
    "utf8"
  );
  return skillPath;
}

describe("cli runtime", () => {
  it("CLI-RT-001 returns help text by default", async () => {
    const result = await runCli([]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("skillforge init");
  });

  it("CLI-RT-002 initializes the skillforge home directories", async () => {
    const cwd = await makeTempDir("skillforge-cli-runtime-init-");

    const result = await runCli(["init"], {}, { cwd, env: process.env });

    expect(result.exitCode).toBe(0);
    await expect(fs.stat(path.join(cwd, ".skillforge", "registry"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(cwd, ".skillforge", "exporters"))).resolves.toBeTruthy();
  });

  it("CLI-RT-003 replays a skill with the default handler", async () => {
    const cwd = await makeTempDir("skillforge-cli-runtime-replay-");
    const skillPath = await writeReplayableSkill(cwd);
    const result = await runCli(["replay", skillPath], {}, { cwd, env: process.env });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("passed:");
  });

  it("CLI-RT-004 exports a skill to native artifacts", async () => {
    const cwd = await makeTempDir("skillforge-cli-runtime-native-");
    const outDir = path.join(cwd, "native");

    const result = await runCli(
      ["export", "invoice-download", "--target", "native", "--out-dir", outDir],
      {},
      { cwd, env: process.env }
    );

    expect(result.exitCode).toBe(0);
    await expect(fs.readFile(path.join(outDir, "skillforge.yaml"), "utf8")).resolves.toContain("invoice-download");
  });

  it("CLI-RT-005 returns argument errors for incomplete commands", async () => {
    await expect(runCli(["replay"])).resolves.toMatchObject({
      exitCode: 1,
      stderr: "Missing skill argument."
    });
    await expect(runCli(["export", "invoice-download"])).resolves.toMatchObject({
      exitCode: 1,
      stderr: "Missing export arguments."
    });
    await expect(runCli(["test"])).resolves.toMatchObject({
      exitCode: 1,
      stderr: "Missing skill argument."
    });
  });

  it("CLI-RT-006 parses input schema env when exporting openclaw", async () => {
    const cwd = await makeTempDir("skillforge-cli-runtime-openclaw-");
    const outDir = path.join(cwd, "openclaw");

    const result = await runCli(
      ["export", "invoice-download", "--target", "openclaw", "--out-dir", outDir],
      {},
      {
        cwd,
        env: {
          ...process.env,
          SKILLFORGE_INPUT_SCHEMA: JSON.stringify({
            invoice_month: {
              type: "string"
            }
          })
        }
      }
    );

    expect(result.exitCode).toBe(0);
    await expect(fs.readFile(path.join(outDir, "skillforge.openclaw.json"), "utf8")).resolves.toContain("invoice_month");
  });
});
