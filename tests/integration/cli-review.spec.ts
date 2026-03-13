import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import { saveSkillPackageToDir } from "../../src/package/load-skill-package.js";
import type { SkillPackage } from "../../src/package/skill-package-schema.js";
import { makeTempDir } from "../helpers/fixtures.js";

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const cliWrapperPath = path.resolve("bin/skillforge");

function runCliProcess(args: string[]): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("sh", [cliWrapperPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
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

async function createReviewPackage(): Promise<string> {
  const skillDir = await makeTempDir("skillforge-review-");
  const skill: SkillPackage = {
    apiVersion: "skillforge.io/v1alpha1",
    kind: "SkillPackage",
    metadata: {
      name: "review-skill",
      version: "0.1.0"
    },
    inputs: {
      invoice_month: {
        type: "string",
        required: true
      }
    },
    permissions: {
      shell: {
        allow: ["rm"]
      }
    },
    steps: [
      {
        id: "step-001",
        type: "browser.navigate"
      },
      {
        id: "step-002",
        type: "shell.exec",
        with: {
          command: "rm"
        }
      },
      {
        id: "step-003",
        type: "notify.send"
      }
    ]
  };

  await saveSkillPackageToDir(skill, skillDir);
  await fs.writeFile(path.join(skillDir, "README.md"), "review", "utf8");
  return skillDir;
}

describe("cli review integration", () => {
  it("REVCLI-001 skillforge review <skillDir> exits 0", async () => {
    const skillDir = await createReviewPackage();

    const result = await runCliProcess(["review", skillDir]);

    expect(result.exitCode).toBe(0);
  });

  it("REVCLI-002 review output includes steps", async () => {
    const skillDir = await createReviewPackage();

    const result = await runCliProcess(["review", skillDir]);

    expect(result.stdout).toContain("step-001");
    expect(result.stdout).toContain("browser.navigate");
  });

  it("REVCLI-003 review output includes permissions", async () => {
    const skillDir = await createReviewPackage();

    const result = await runCliProcess(["review", skillDir]);

    expect(result.stdout).toContain('"shell"');
    expect(result.stdout).toContain('"allow"');
  });

  it("REVCLI-004 review output includes warnings", async () => {
    const skillDir = await createReviewPackage();

    const result = await runCliProcess(["review", skillDir]);

    expect(result.stdout).toContain("warnings");
    expect(result.stdout).toContain("high-risk");
    expect(result.stdout).toContain("unsupported");
  });
});
