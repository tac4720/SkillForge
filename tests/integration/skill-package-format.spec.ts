import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import { loadSkillPackageFromDir, saveSkillPackageToDir } from "../../src/package/load-skill-package.js";
import { validateSkillPackageDocument, type SkillPackage } from "../../src/package/skill-package-schema.js";
import { loadSkillFile } from "../../src/core/skill-loader.js";
import { makeTempDir } from "../helpers/fixtures.js";

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const cliWrapperPath = path.resolve("bin/skillforge");

function createPackageDocument(): SkillPackage {
  return {
    apiVersion: "skillforge.io/v1alpha1",
    kind: "SkillPackage",
    metadata: {
      name: "invoice-download",
      displayName: "Vendor Invoice Downloader",
      version: "0.1.0",
      description: "Download monthly invoices from vendor portal",
      author: "test",
      license: "Apache-2.0",
      tags: ["finance", "browser", "invoices"],
      maturity: "beta"
    },
    runtime: {
      mode: "assist",
      timeoutSeconds: 300,
      retryPolicy: {
        maxRetries: 2,
        backoffSeconds: 3
      }
    },
    inputs: {
      invoice_month: {
        type: "string",
        required: true,
        pattern: "^\\d{4}-\\d{2}$"
      },
      download_dir: {
        type: "path",
        required: true
      },
      vendor_login: {
        type: "secret",
        required: true
      }
    },
    permissions: {
      browser: {
        domains: {
          allow: ["http://127.0.0.1"]
        }
      },
      files: {
        read: ["./assets"],
        write: ["./out"]
      }
    },
    steps: [
      {
        id: "open-login",
        type: "browser.navigate",
        with: {
          url: "http://127.0.0.1/login"
        }
      },
      {
        id: "copy-template",
        type: "file.copy",
        with: {
          from: "./assets/template.txt",
          to: "./out/template.txt"
        }
      },
      {
        id: "download-invoice",
        type: "browser.download",
        target: {
          locatorCandidates: ['role=button[name="Download PDF"]']
        },
        with: {
          saveAs: "./out/{{invoice_month}}.pdf"
        }
      }
    ],
    assertions: [
      {
        type: "fileExists",
        path: "./out/{{invoice_month}}.pdf"
      }
    ],
    outputs: {
      downloaded_file: {
        type: "path",
        value: "./out/{{invoice_month}}.pdf"
      }
    },
    tests: [
      {
        id: "happy-path",
        input: {
          invoice_month: "2026-02",
          download_dir: "./out"
        },
        expect: {
          assertionsPass: true
        }
      }
    ],
    export: {
      targets: ["openclaw", "cli"]
    }
  };
}

function createReplayablePackageDocument(rootDir: string): SkillPackage {
  return {
    apiVersion: "skillforge.io/v1alpha1",
    kind: "SkillPackage",
    metadata: {
      name: "copy-package",
      version: "0.1.0",
      description: "Replayable package fixture"
    },
    permissions: {
      files: {
        read: [path.join(rootDir, "assets")],
        write: [path.join(rootDir, "out")]
      }
    },
    steps: [
      {
        id: "copy-template",
        type: "file.copy",
        with: {
          from: path.join(rootDir, "assets", "template.txt"),
          to: path.join(rootDir, "out", "template.txt")
        }
      }
    ],
    assertions: [
      {
        type: "fileExists",
        path: path.join(rootDir, "out", "template.txt")
      }
    ]
  };
}

async function writePackageDir(document: unknown): Promise<string> {
  const dir = await makeTempDir("skillforge-package-");
  await fs.mkdir(path.join(dir, "assets"), { recursive: true });
  await fs.writeFile(path.join(dir, "assets", "template.txt"), "fixture", "utf8");
  await fs.writeFile(path.join(dir, "skillforge.yaml"), JSON.stringify(document, null, 2), "utf8");
  return dir;
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

describe("skill-package format integration", () => {
  it("PKG-001 loads valid skillforge.yaml", async () => {
    const skillDir = await writePackageDir(createPackageDocument());

    const skill = await loadSkillPackageFromDir(skillDir);

    expect(skill.metadata.name).toBe("invoice-download");
  });

  it("PKG-002 rejects invalid skillforge.yaml", () => {
    const invalidDoc = {
      apiVersion: "skillforge.io/v1alpha1",
      kind: "SkillPackage",
      metadata: {
        name: "invalid",
        version: "0.1.0"
      },
      steps: {}
    };

    const result = validateSkillPackageDocument(invalidDoc);

    expect(result.ok).toBe(false);
    expect(result.errors[0]?.path).toContain("steps");
  });

  it("PKG-003 preserves metadata/inputs/permissions/steps/assertions", async () => {
    const skillDir = await writePackageDir(createPackageDocument());

    const skill = await loadSkillPackageFromDir(skillDir);

    expect(skill.metadata).toMatchObject({
      name: "invoice-download",
      version: "0.1.0"
    });
    expect(skill.inputs?.invoice_month).toMatchObject({
      type: "string",
      pattern: "^\\d{4}-\\d{2}$"
    });
    expect(skill.permissions).toMatchObject({
      browser: {
        domains: {
          allow: ["http://127.0.0.1"]
        }
      }
    });
    expect(skill.steps).toHaveLength(3);
    expect(skill.assertions).toEqual([
      {
        type: "fileExists",
        path: "./out/{{invoice_month}}.pdf"
      }
    ]);
  });

  it("PKG-004 roundtrip save -> load is semantically equal", async () => {
    const skillDir = await makeTempDir("skillforge-package-save-");
    const input = createPackageDocument();

    await saveSkillPackageToDir(input, skillDir);
    const loaded = await loadSkillPackageFromDir(skillDir);

    expect(loaded).toEqual({
      ...input,
      rootDir: skillDir
    });
  });

  it("PKG-005 replay can run directly from a package directory containing skillforge.yaml", async () => {
    const skillDir = await makeTempDir("skillforge-package-replay-");
    await fs.mkdir(path.join(skillDir, "assets"), { recursive: true });
    await fs.writeFile(path.join(skillDir, "assets", "template.txt"), "fixture", "utf8");
    await saveSkillPackageToDir(createReplayablePackageDocument(skillDir), skillDir);

    const result = await runCliProcess(["replay", skillDir], { cwd: process.cwd() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("passed:");
  });

  it("PKG-006 export commands accept package directory as input", async () => {
    const skillDir = await writePackageDir(createPackageDocument());
    const outDir = await makeTempDir("skillforge-package-export-");

    const result = await runCliProcess(["export", skillDir, "--target", "openclaw", "--out-dir", outDir], {
      cwd: process.cwd()
    });

    expect(result.exitCode).toBe(0);
    await expect(fs.readFile(path.join(outDir, "skillforge.openclaw.json"), "utf8")).resolves.toContain("invoice_month");
  });

  it("PKG-007 relative asset paths resolve from package root", async () => {
    const skillDir = await writePackageDir(createPackageDocument());

    const loaded = await loadSkillFile<Record<string, unknown>>(skillDir, { cwd: process.cwd() });
    const copyStep = (loaded?.skill.steps as Array<Record<string, unknown>>).find((step) => step.id === "copy-template");

    expect((copyStep?.with as Record<string, unknown>).from).toBe(path.join(skillDir, "assets", "template.txt"));
  });

  it("PKG-008 unknown top-level keys fail deterministically or warn deterministically", () => {
    const result = validateSkillPackageDocument({
      ...createPackageDocument(),
      unsupportedTopLevel: true
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual({
      path: "unsupportedTopLevel",
      message: "Unknown top-level key."
    });
  });
});
