import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import { makeTempDir } from "../helpers/fixtures.js";

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const cliWrapperPath = path.resolve("bin/skillforge");

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

async function writeValidatedSkill(cwd: string): Promise<string> {
  const sourcePath = path.join(cwd, "input-source.txt");
  const skillPath = path.join(cwd, "validated-skill.json");
  await fs.writeFile(sourcePath, "fixture", "utf8");
  await fs.writeFile(
    skillPath,
    JSON.stringify(
      {
        name: "validated-skill",
        version: "0.1.0",
        actor: "test",
        inputsSchema: {
          copy_name: {
            type: "string",
            pattern: "^ok$"
          }
        },
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
              to: path.join(cwd, "{{inputs.copy_name}}.txt")
            }
          }
        ],
        assertions: [
          {
            type: "fileExists",
            path: path.join(cwd, "{{inputs.copy_name}}.txt")
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

function runCliProcess(
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", [cliWrapperPath, ...args], {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trimEnd(),
        stderr: stderr.trimEnd()
      });
    });
  });
}

describe("cli integration", () => {
  it("CLI-001 runs skillforge init successfully", async () => {
    const cwd = await makeTempDir("skillforge-cli-init-");

    const result = await runCliProcess(["init"], { cwd });

    expect(result.exitCode).toBe(0);
    await expect(fs.stat(path.join(cwd, ".skillforge", "registry"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(cwd, ".skillforge", "runs"))).resolves.toBeTruthy();
  });

  it("CLI-002 runs skillforge replay successfully", async () => {
    const cwd = await makeTempDir("skillforge-cli-replay-");
    const skillPath = await writeReplayableSkill(cwd);

    const result = await runCliProcess(["replay", skillPath], { cwd });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("passed:");
  });

  it("CLI-003 runs skillforge export --target openclaw successfully", async () => {
    const cwd = await makeTempDir("skillforge-cli-export-");
    const outDir = path.join(cwd, "openclaw-export");

    const result = await runCliProcess(
      ["export", "invoice-download", "--target", "openclaw", "--out-dir", outDir],
      {
        cwd,
        env: {
          SKILLFORGE_INPUT_SCHEMA: JSON.stringify({
            invoice_month: {
              type: "string"
            }
          })
        }
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("exported invoice-download to openclaw");
    await expect(fs.readFile(path.join(outDir, "run.sh"), "utf8")).resolves.toContain("skillforge replay");
    await expect(fs.readFile(path.join(outDir, "skillforge.openclaw.json"), "utf8")).resolves.toContain("invoice_month");
    await expect(fs.stat(path.join(outDir, "skill.ir.json"))).resolves.toBeTruthy();
  });

  it("CLI-004 runs skillforge test successfully", async () => {
    const cwd = await makeTempDir("skillforge-cli-test-");

    const result = await runCliProcess(["test", "invoice-download"], { cwd });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("invoice-download: passed");
  });

  it("CLI-005 runs skillforge doctor successfully", async () => {
    const cwd = await makeTempDir("skillforge-cli-doctor-");

    const result = await runCliProcess(["doctor"], { cwd });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("daemon: ok");
    expect(result.stdout).toContain("browserDriver: ok");
  });

  it("CLI-006 exits non-zero on invalid arguments", async () => {
    const cwd = await makeTempDir("skillforge-cli-invalid-");

    const result = await runCliProcess(["unknown"], { cwd });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Unknown command");
  });

  it("CLI-007 shows help output", async () => {
    const cwd = await makeTempDir("skillforge-cli-help-");

    const result = await runCliProcess(["--help"], { cwd });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("skillforge init");
  });

  it("CLI-008 exports fixture skills by name using on-disk schema", async () => {
    const cwd = await makeTempDir("skillforge-cli-fixture-export-");
    const outDir = path.join(cwd, "openclaw-export");

    const result = await runCliProcess(["export", "invoice-download", "--target", "openclaw", "--out-dir", outDir], {
      cwd
    });

    expect(result.exitCode).toBe(0);
    await expect(fs.readFile(path.join(outDir, "skillforge.openclaw.json"), "utf8")).resolves.toContain("invoice_month");
  });

  it("CLI-009 validates explicit fixture skill paths with --input values", async () => {
    const cwd = await makeTempDir("skillforge-cli-fixture-replay-");
    const skillPath = await writeValidatedSkill(cwd);

    const passed = await runCliProcess(["replay", skillPath, "--input", "copy_name=ok"], { cwd });
    const failed = await runCliProcess(["replay", skillPath, "--input", "copy_name=bad"], { cwd });

    expect(passed.exitCode).toBe(0);
    expect(failed.exitCode).toBe(1);
    expect(failed.stdout).toContain("failed:");
  });
});
