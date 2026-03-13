import fs from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { saveSkillPackageToDir } from "../../src/package/load-skill-package.js";
import type { SkillPackage } from "../../src/package/skill-package-schema.js";
import { makeTempDir, startFixtureServer } from "../helpers/fixtures.js";
import { listFilesRecursive, runCliProcess, runProcess } from "../helpers/process.js";

async function createInvoicePackage(rootDir: string, baseUrl: string): Promise<string> {
  const packageDir = path.join(rootDir, "invoice-download-package");
  const skillPackage: SkillPackage = {
    apiVersion: "skillforge.io/v1alpha1",
    kind: "SkillPackage",
    metadata: {
      name: "invoice-download-real-browser",
      version: "0.1.0",
      description: "Real browser invoice download fixture"
    },
    inputs: {
      invoice_month: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}$"
      },
      email: {
        type: "string"
      },
      password: {
        type: "secret"
      },
      download_dir: {
        type: "path"
      }
    },
    permissions: {
      browser: {
        domains: {
          allow: [baseUrl]
        }
      },
      files: {
        write: [rootDir]
      }
    },
    steps: [
      {
        id: "step-nav-login",
        type: "browser.navigate",
        with: {
          url: `${baseUrl}/login`
        }
      },
      {
        id: "step-email",
        type: "browser.input",
        target: {
          locatorCandidates: ["#email"]
        },
        with: {
          value: "{{inputs.email}}"
        }
      },
      {
        id: "step-password",
        type: "browser.input",
        target: {
          locatorCandidates: ["#password"]
        },
        with: {
          value: "{{inputs.password}}"
        },
        secret: true
      },
      {
        id: "step-sign-in",
        type: "browser.click",
        target: {
          locatorCandidates: ["#sign-in"]
        }
      },
      {
        id: "step-nav-invoices",
        type: "browser.navigate",
        with: {
          url: `${baseUrl}/invoices?month={{inputs.invoice_month}}`
        }
      },
      {
        id: "step-ready",
        type: "browser.waitFor",
        target: {
          locatorCandidates: ["#delayed-status"]
        },
        with: {
          timeoutMs: 1500
        }
      },
      {
        id: "step-download",
        type: "browser.download",
        target: {
          locatorCandidates: ["#download"]
        },
        with: {
          saveAs: "{{inputs.download_dir}}/{{inputs.invoice_month}}.pdf"
        }
      }
    ],
    assertions: [
      {
        type: "fileExists",
        path: "{{inputs.download_dir}}/{{inputs.invoice_month}}.pdf"
      }
    ],
    export: {
      targets: ["openclaw"]
    }
  };

  await saveSkillPackageToDir(skillPackage, packageDir);
  return packageDir;
}

function replayInputs(rootDir: string): string[] {
  return [
    "--input",
    "invoice_month=2026-03",
    "--input",
    "email=user@example.com",
    "--input",
    "password=hunter2",
    "--input",
    `download_dir=${path.join(rootDir, "downloads")}`
  ];
}

test.describe("invoice-download real-browser e2e", () => {
  test("RBDE2E-001 CLI replay succeeds with production browser driver", async () => {
    const server = await startFixtureServer();
    const rootDir = await makeTempDir("skillforge-real-browser-cli-");
    const packageDir = await createInvoicePackage(rootDir, server.baseUrl);

    try {
      const result = await runCliProcess(["replay", packageDir, ...replayInputs(rootDir)], {
        cwd: rootDir,
        env: {
          SKILLFORGE_HEADLESS: "1",
          SKILLFORGE_DOWNLOADS_DIR: path.join(rootDir, "downloads")
        }
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("passed:");
    } finally {
      await server.stop();
    }
  });

  test("RBDE2E-002 OpenClaw wrapper succeeds with production browser driver", async () => {
    const server = await startFixtureServer();
    const rootDir = await makeTempDir("skillforge-real-browser-wrapper-");
    const packageDir = await createInvoicePackage(rootDir, server.baseUrl);
    const exportDir = path.join(rootDir, "openclaw");

    try {
      const exportResult = await runCliProcess(["export", packageDir, "--target", "openclaw", "--out-dir", exportDir], {
        cwd: rootDir
      });
      expect(exportResult.exitCode).toBe(0);

      const result = await runProcess(
        "sh",
        [
          path.join(exportDir, "run.sh"),
          ...replayInputs(rootDir)
        ],
        {
          cwd: rootDir,
          env: {
            PATH: `${path.resolve("bin")}:${process.env.PATH ?? ""}`,
            SKILLFORGE_HEADLESS: "1",
            SKILLFORGE_DOWNLOADS_DIR: path.join(rootDir, "downloads")
          }
        }
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("passed:");
    } finally {
      await server.stop();
    }
  });

  test("RBDE2E-003 downloaded PDF exists", async () => {
    const server = await startFixtureServer();
    const rootDir = await makeTempDir("skillforge-real-browser-download-");
    const packageDir = await createInvoicePackage(rootDir, server.baseUrl);
    const pdfPath = path.join(rootDir, "downloads", "2026-03.pdf");

    try {
      const result = await runCliProcess(["replay", packageDir, ...replayInputs(rootDir)], {
        cwd: rootDir,
        env: {
          SKILLFORGE_HEADLESS: "1",
          SKILLFORGE_DOWNLOADS_DIR: path.join(rootDir, "downloads")
        }
      });

      expect(result.exitCode).toBe(0);
      await expect(fs.stat(pdfPath)).resolves.toBeTruthy();
    } finally {
      await server.stop();
    }
  });

  test("RBDE2E-004 no secret leaks to stdout/stderr/artifacts", async () => {
    const server = await startFixtureServer();
    const rootDir = await makeTempDir("skillforge-real-browser-redaction-");
    const packageDir = await createInvoicePackage(rootDir, server.baseUrl);

    try {
      const result = await runCliProcess(["replay", packageDir, ...replayInputs(rootDir)], {
        cwd: rootDir,
        env: {
          SKILLFORGE_HEADLESS: "1",
          SKILLFORGE_DOWNLOADS_DIR: path.join(rootDir, "downloads")
        }
      });

      const runFiles = await listFilesRecursive(path.join(rootDir, ".skillforge", "runs"));
      const artifactContents = await Promise.all(runFiles.map(async (filePath) => fs.readFile(filePath, "utf8")));

      expect(result.exitCode).toBe(0);
      expect(result.stdout).not.toContain("hunter2");
      expect(result.stderr).not.toContain("hunter2");
      expect(artifactContents.join("\n")).not.toContain("hunter2");
    } finally {
      await server.stop();
    }
  });
});
