import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import { OpenClawExporter, OpenClawExportError } from "../../src/exporters/openclaw/index.js";
import { makeTempDir } from "../helpers/fixtures.js";

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function runProcess(
  command: string,
  args: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  } = {}
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
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

async function createFakeSkillforgeBinary(rootDir: string): Promise<{ binDir: string; logPath: string }> {
  const binDir = path.join(rootDir, "bin");
  const logPath = path.join(rootDir, "skillforge.log");
  const binaryPath = path.join(binDir, "skillforge");

  await fs.mkdir(binDir, { recursive: true });
  await fs.writeFile(
    binaryPath,
    `#!/usr/bin/env sh
set -eu
printf '%s\\n' "$@" > ${shellQuote(logPath)}
`,
    "utf8"
  );
  await fs.chmod(binaryPath, 0o755);

  return { binDir, logPath };
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/gu, `'\"'\"'`)}'`;
}

describe("openclaw export integration", () => {
  const exporter = new OpenClawExporter();
  const skill = {
    name: "invoice-download",
    description: "Download invoices with password=hunter2",
    inputSchema: {
      invoice_month: {
        type: "string",
        pattern: "^\\d{4}-\\d{2}$"
      }
    },
    permissions: {
      browser: {
        domains: {
          allow: ["https://portal.vendor.example"]
        }
      }
    },
    expectedOutputs: {
      downloaded_file: {
        type: "path"
      }
    },
    steps: [{ type: "browser.navigate" }],
    secrets: ["hunter2"]
  };

  it("OCL-001 generates SKILL.md", async () => {
    const outDir = await makeTempDir("skillforge-openclaw-skill-");

    await exporter.writeToDirectory(skill, { skillPath: "/tmp/invoice-download", outDir });

    await expect(fs.stat(path.join(outDir, "SKILL.md"))).resolves.toBeTruthy();
  });

  it("OCL-002 generates skillforge.openclaw.json", async () => {
    const outDir = await makeTempDir("skillforge-openclaw-manifest-");

    await exporter.writeToDirectory(skill, { skillPath: "/tmp/invoice-download", outDir });

    await expect(fs.stat(path.join(outDir, "skillforge.openclaw.json"))).resolves.toBeTruthy();
  });

  it("OCL-003 generates a wrapper script", async () => {
    const outDir = await makeTempDir("skillforge-openclaw-wrapper-");

    await exporter.writeToDirectory(skill, { skillPath: "/tmp/invoice-download", outDir });

    await expect(fs.readFile(path.join(outDir, "run.sh"), "utf8")).resolves.toContain("skillforge replay");
  });

  it("OCL-004 starts skillforge replay from the wrapper", async () => {
    const outDir = await makeTempDir("skillforge-openclaw-exec-");
    const shimRoot = await makeTempDir("skillforge-openclaw-shim-");
    const { binDir, logPath } = await createFakeSkillforgeBinary(shimRoot);

    await exporter.writeToDirectory(skill, { skillPath: "/tmp/invoice-download", outDir });

    const result = await runProcess("sh", [path.join(outDir, "run.sh"), "--input", "invoice_month=2026-03"], {
      env: {
        PATH: `${binDir}:${process.env.PATH ?? ""}`
      }
    });

    expect(result.exitCode).toBe(0);
    const loggedArgs = await fs.readFile(logPath, "utf8");
    expect(loggedArgs).toContain("replay");
    expect(loggedArgs).toContain("/tmp/invoice-download");
    expect(loggedArgs).toContain("invoice_month=2026-03");
  });

  it("OCL-005 reflects input schema in the wrapper", async () => {
    const outDir = await makeTempDir("skillforge-openclaw-schema-");

    await exporter.writeToDirectory(skill, { skillPath: "/tmp/invoice-download", outDir });

    const wrapper = await fs.readFile(path.join(outDir, "run.sh"), "utf8");
    expect(wrapper).toContain("INPUT_SCHEMA=");
    expect(wrapper).toContain("invoice_month");
  });

  it("OCL-006 fails export on unsupported steps", async () => {
    await expect(
      exporter.export(
        {
          ...skill,
          steps: [{ type: "desktop.click" }]
        },
        { skillPath: "/tmp/invoice-download" }
      )
    ).rejects.toBeInstanceOf(OpenClawExportError);
  });

  it("OCL-007 does not include secrets in artifacts", async () => {
    const outDir = await makeTempDir("skillforge-openclaw-redaction-");

    await exporter.writeToDirectory(skill, { skillPath: "/tmp/invoice-download", outDir });

    const artifactNames = ["SKILL.md", "skillforge.openclaw.json", "run.sh", "skill.ir.json"];
    const contents = await Promise.all(
      artifactNames.map((artifactName) => fs.readFile(path.join(outDir, artifactName), "utf8"))
    );
    expect(contents.join("\n")).not.toContain("hunter2");
  });

  it("OCL-008 keeps wrappers valid for unicode and spaced paths", async () => {
    const outDir = await makeTempDir("skillforge-openclaw-unicode-");
    const shimRoot = await makeTempDir("skillforge-openclaw-unicode-shim-");
    const { binDir, logPath } = await createFakeSkillforgeBinary(shimRoot);
    const skillPath = "/tmp/My Skills/請求書 ダウンロード";

    await exporter.writeToDirectory(skill, { skillPath, outDir });

    const result = await runProcess("sh", [path.join(outDir, "run.sh")], {
      env: {
        PATH: `${binDir}:${process.env.PATH ?? ""}`
      }
    });

    expect(result.exitCode).toBe(0);
    const loggedArgs = await fs.readFile(logPath, "utf8");
    expect(loggedArgs).toContain(skillPath);
  });

  it("OCL-009 fails fast when wrapper inputs do not satisfy the schema", async () => {
    const artifacts = (
      await exporter.export(skill, {
        skillPath: "/tmp/invoice-download"
      })
    ).artifacts;

    await expect(exporter.invokeWrapper(artifacts, {})).rejects.toThrowError("Missing input: invoice_month");
  });

  it("OCL-010 reconstructs the replay invocation from artifacts", async () => {
    const artifacts = (
      await exporter.export(skill, {
        skillPath: "/tmp/invoice-download"
      })
    ).artifacts;

    const invocation = await exporter.invokeWrapper(artifacts, { invoice_month: "2026-03" });
    expect(invocation.command).toBe("skillforge");
    expect(invocation.args).toEqual(["replay", "/tmp/invoice-download", "--input", "invoice_month=2026-03"]);
  });

  it("OCL-011 supports custom cli commands in generated wrappers", async () => {
    const result = await exporter.export(skill, {
      skillPath: "/tmp/invoice-download",
      cliCommand: "./bin/skillforge"
    });

    const wrapper = result.artifacts.find((artifact) => artifact.path === "run.sh");
    expect(wrapper?.content).toContain("./bin/skillforge replay");
  });

  it("OCL-012 rejects missing and malformed wrapper artifacts", async () => {
    await expect(exporter.invokeWrapper([], {})).rejects.toThrowError("Missing artifact: run.sh");
    await expect(
      exporter.invokeWrapper(
        [
          {
            path: "run.sh",
            content: "#!/usr/bin/env sh\nINPUT_SCHEMA='{}'\nskillforge replay '/tmp/x'\n"
          }
        ],
        {}
      )
    ).rejects.toThrowError("Missing SKILL_PATH in wrapper.");
  });
});
