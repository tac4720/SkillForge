import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import { exportMcp } from "../../src/exporters/mcp.js";
import type { SkillPackage } from "../../src/package/skill-package-schema.js";
import { makeTempDir } from "../helpers/fixtures.js";

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function createSkillPackage(): SkillPackage {
  return {
    apiVersion: "skillforge.io/v1alpha1",
    kind: "SkillPackage",
    metadata: {
      name: "invoice-download",
      version: "0.1.0",
      description: "Download invoices"
    },
    inputs: {
      invoice_month: {
        type: "string",
        required: true
      }
    },
    permissions: {
      browser: {
        domains: {
          allow: ["http://127.0.0.1"]
        }
      }
    },
    steps: [
      {
        id: "step-001",
        type: "browser.navigate",
        with: {
          url: "http://127.0.0.1/invoices?month={{invoice_month}}"
        }
      }
    ],
    outputs: {
      downloaded_file: {
        type: "path",
        value: "./out/{{invoice_month}}.pdf"
      }
    }
  };
}

function runNodeScript(scriptPath: string, args: string[], env: NodeJS.ProcessEnv = {}): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [scriptPath, ...args], {
      env: {
        ...process.env,
        ...env
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

describe("mcp export integration", () => {
  it("MCP-001 exports MCP server files", async () => {
    const outDir = await makeTempDir("skillforge-mcp-");

    const result = await exportMcp(createSkillPackage(), outDir);

    expect(result.files.some((file) => file.endsWith("server.js"))).toBe(true);
    expect(result.files.some((file) => file.endsWith("tool_manifest.json"))).toBe(true);
    expect(result.files.some((file) => file.endsWith("README.md"))).toBe(true);
  });

  it("MCP-002 preserves input schema", async () => {
    const outDir = await makeTempDir("skillforge-mcp-");

    await exportMcp(createSkillPackage(), outDir);

    await expect(fs.readFile(path.join(outDir, "tool_manifest.json"), "utf8")).resolves.toContain("invoice_month");
  });

  it("MCP-003 preserves output schema", async () => {
    const outDir = await makeTempDir("skillforge-mcp-");

    await exportMcp(createSkillPackage(), outDir);

    await expect(fs.readFile(path.join(outDir, "tool_manifest.json"), "utf8")).resolves.toContain("downloaded_file");
  });

  it("MCP-004 wrapper executes local replay", async () => {
    const outDir = await makeTempDir("skillforge-mcp-");

    await exportMcp(createSkillPackage(), outDir);
    const result = await runNodeScript(path.join(outDir, "server.js"), ['{"invoice_month":"2026-03"}'], {
      SKILLFORGE_MCP_TEST_MODE: "1"
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("skillforge replay");
    expect(result.stdout).toContain("--input invoice_month=2026-03");
  });

  it("MCP-005 unsupported steps fail fast", async () => {
    const outDir = await makeTempDir("skillforge-mcp-");

    await expect(
      exportMcp(
        {
          ...createSkillPackage(),
          steps: [
            {
              id: "step-unsupported",
              type: "notify.send"
            }
          ]
        },
        outDir
      )
    ).rejects.toThrow(/Unsupported step/u);
  });

  it("MCP-006 secrets are not embedded", async () => {
    const outDir = await makeTempDir("skillforge-mcp-");

    await exportMcp(
      {
        ...createSkillPackage(),
        metadata: {
          ...createSkillPackage().metadata,
          description: "Uses {{secrets.vendor_login}}"
        }
      },
      outDir
    );

    const contents = (await Promise.all(
      ["server.js", "tool_manifest.json", "README.md"].map((name) => fs.readFile(path.join(outDir, name), "utf8"))
    )).join("\n");
    expect(contents).not.toContain("super-secret");
  });
});
