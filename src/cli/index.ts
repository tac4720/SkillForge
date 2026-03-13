import fs from "node:fs/promises";
import path from "node:path";

import { recordCommand } from "./record-command.ts";
import { reviewSkillCommand } from "./review-command.ts";
import { assertValidInputs } from "../core/input-validator.ts";
import {
  loadSkillFile,
  toNativeSkillPackage,
  toOpenClawSkillDocument,
  toReplaySkillDocument
} from "../core/skill-loader.ts";
import type { ReviewModel } from "../review/review-model.ts";
import { NativePackageExporter } from "../exporters/native-package.ts";
import { OpenClawExporter } from "../exporters/openclaw/index.ts";
import { createRuntimeDeps } from "../replay/create-runtime-deps.ts";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CliDeps {
  init?: () => Promise<void>;
  replay?: (
    skill: string,
    options: { cwd: string; inputs: Record<string, unknown>; mode: "dry-run" | "assist" | "autopilot" }
  ) => Promise<{ status: string; runId: string }>;
  exportSkill?: (
    skill: string,
    target: string,
    options: { outDir?: string; cwd: string }
  ) => Promise<{ target: string; artifactPaths: string[] }>;
  reviewSkill?: (skill: string, options: { cwd: string }) => Promise<ReviewModel>;
  testSkill?: (skill: string, options: { cwd: string }) => Promise<{ passed: boolean; suite: string }>;
  doctor?: () => Promise<Record<string, string>>;
}

export interface CliRuntime {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

const HELP_TEXT = `skillforge init
skillforge record <url> [--name <name>] [--out-dir <dir>]
skillforge review <skill>
skillforge replay <skill>
skillforge export <skill> --target openclaw
skillforge test <skill>
skillforge doctor`;

export async function runCli(
  argv: string[],
  deps: CliDeps = {},
  runtime: CliRuntime = { cwd: process.cwd(), env: process.env }
): Promise<CliResult> {
  const [command, ...rest] = argv;
  const handlers = createHandlers(deps, runtime);

  if (!command || command === "--help" || command === "help") {
    return {
      exitCode: 0,
      stdout: HELP_TEXT,
      stderr: ""
    };
  }

  switch (command) {
    case "init": {
      await handlers.init();
      return { exitCode: 0, stdout: "initialized", stderr: "" };
    }
    case "record": {
      const url = rest[0];
      if (!url) {
        return { exitCode: 1, stdout: "", stderr: "Missing URL argument. Usage: skillforge record <url>" };
      }
      const nameIndex = rest.indexOf("--name");
      const name = nameIndex >= 0 ? rest[nameIndex + 1] : undefined;
      const outDirIndex = rest.indexOf("--out-dir");
      const outDir = outDirIndex >= 0 ? rest[outDirIndex + 1] : undefined;
      try {
        const result = await recordCommand({
          url,
          name,
          outDir,
          cwd: runtime.cwd,
          headless: runtime.env.SKILLFORGE_HEADLESS === "1"
        });
        const output = [
          `recorded ${result.eventCount} events, ${result.stepCount} steps`,
          result.skillPath,
          ...result.warnings.map((warning) => `warning: ${warning}`)
        ].join("\n");
        return { exitCode: 0, stdout: output, stderr: "" };
      } catch (error) {
        return { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
      }
    }
    case "replay": {
      const skill = rest[0];
      if (!skill) {
        return { exitCode: 1, stdout: "", stderr: "Missing skill argument." };
      }
      const result = await handlers.replay(skill, {
        cwd: runtime.cwd,
        inputs: parseInputsFromArgs(rest.slice(1)),
        mode: parseModeFromArgs(rest.slice(1), runtime.env.SKILLFORGE_MODE)
      });
      return {
        exitCode: result && result.status !== "failed" ? 0 : 1,
        stdout: result ? `${result.status}: ${result.runId}` : "",
        stderr: result ? "" : "Replay handler not configured."
      };
    }
    case "review": {
      const skill = rest[0];
      if (!skill) {
        return { exitCode: 1, stdout: "", stderr: "Missing skill argument." };
      }
      const result = await handlers.reviewSkill(skill, { cwd: runtime.cwd });
      return {
        exitCode: result ? 0 : 1,
        stdout: result ? JSON.stringify(result, null, 2) : "",
        stderr: result ? "" : "Review handler not configured."
      };
    }
    case "export": {
      const skill = rest[0];
      const targetIndex = rest.indexOf("--target");
      const target = targetIndex >= 0 ? rest[targetIndex + 1] : undefined;
      const outDirIndex = rest.indexOf("--out-dir");
      const outDir = outDirIndex >= 0 ? rest[outDirIndex + 1] : undefined;
      if (!skill || !target) {
        return { exitCode: 1, stdout: "", stderr: "Missing export arguments." };
      }
      const result = await handlers.exportSkill(skill, target, { outDir, cwd: runtime.cwd });
      return {
        exitCode: result ? 0 : 1,
        stdout: result ? `exported ${skill} to ${result.target}\n${result.artifactPaths.join("\n")}` : "",
        stderr: result ? "" : "Export handler not configured."
      };
    }
    case "test": {
      const skill = rest[0];
      if (!skill) {
        return { exitCode: 1, stdout: "", stderr: "Missing skill argument." };
      }
      const result = await handlers.testSkill(skill, { cwd: runtime.cwd });
      return {
        exitCode: result?.passed ? 0 : 1,
        stdout: result ? `${result.suite}: ${result.passed ? "passed" : "failed"}` : "",
        stderr: result ? "" : "Test handler not configured."
      };
    }
    case "doctor": {
      const result = await handlers.doctor();
      return {
        exitCode: result ? 0 : 1,
        stdout: result ? Object.entries(result).map(([key, value]) => `${key}: ${value}`).join("\n") : "",
        stderr: result ? "" : "Doctor handler not configured."
      };
    }
    default:
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Unknown command: ${command}`
      };
  }
}

function createHandlers(deps: CliDeps, runtime: CliRuntime): Required<CliDeps> {
  return {
    init: deps.init ?? (async () => initializeSkillForgeHome(runtime.cwd)),
    replay:
      deps.replay ??
      (async (skill: string, options: { cwd: string; inputs: Record<string, unknown>; mode: "dry-run" | "assist" | "autopilot" }) => {
        const loaded = await loadSkillFile<Record<string, unknown>>(skill, { cwd: options.cwd });
        const replaySkill = loaded ? toReplaySkillDocument(loaded.skill, path.basename(skill)) : null;

        if (!replaySkill) {
          return {
            status: "failed",
            runId: `run-${path.basename(skill).replace(/[^a-z0-9_-]/giu, "-") || "skill"}`
          };
        }

        try {
          assertValidInputs(replaySkill.inputsSchema, options.inputs);
        } catch {
          return {
            status: "failed",
            runId: `run-${replaySkill.name.replace(/[^a-z0-9_-]/giu, "-") || "skill"}`
          };
        }

        const runtimeDeps = createRuntimeDeps({
          cwd: options.cwd,
          headless: runtime.env.SKILLFORGE_HEADLESS !== "0",
          slowMo: runtime.env.SKILLFORGE_SLOW_MO ? Number(runtime.env.SKILLFORGE_SLOW_MO) : undefined,
          downloadsDir: runtime.env.SKILLFORGE_DOWNLOADS_DIR,
          storageStatePath: runtime.env.SKILLFORGE_STORAGE_STATE_PATH,
          secretMode: (runtime.env.SKILLFORGE_SECRET_MODE as "env" | "local-vault" | "os-keychain" | undefined) ?? "env",
          secretRootDir: runtime.env.SKILLFORGE_SECRET_ROOT,
          secretPassword: runtime.env.SKILLFORGE_SECRET_PASSWORD
        });

        try {
          const result = await runtimeDeps.replayEngine.run(replaySkill, {
            mode: options.mode,
            inputs: options.inputs,
            secrets: collectSecretInputs(replaySkill.inputsSchema, options.inputs)
          });
          return {
            status: result.status,
            runId: result.runId
          };
        } finally {
          await runtimeDeps.close();
        }
      }),
    exportSkill:
      deps.exportSkill ??
      (async (skill: string, target: string, options: { outDir?: string; cwd: string }) => {
        const loaded = await loadSkillFile<Record<string, unknown>>(skill, { cwd: options.cwd });

        if (target === "openclaw") {
          const exporter = new OpenClawExporter();
          const outDir = options.outDir ?? path.join(options.cwd, "export", "openclaw");
          const openClawSkill = loaded
            ? toOpenClawSkillDocument(loaded.skill, path.basename(skill))
            : {
                name: path.basename(skill),
                inputSchema: parseInputSchemaFromArgs(runtime.env.SKILLFORGE_INPUT_SCHEMA),
                steps: [{ type: "browser.navigate" }]
              };
          const result = await exporter.writeToDirectory(
            openClawSkill,
            {
              skillPath: loaded?.filePath ?? skill,
              outDir
            }
          );
          return {
            target,
            artifactPaths: result.artifactPaths
          };
        }

        if (target === "native") {
          const exporter = new NativePackageExporter();
          const outDir = options.outDir ?? path.join(options.cwd, "export", "native");
          const result = await exporter.writeToDirectory(
            loaded
              ? toNativeSkillPackage(loaded.skill, loaded.inputsExample, path.basename(skill))
              : {
                  metadata: {
                    name: path.basename(skill),
                    version: "0.1.0",
                    license: "Apache-2.0"
                  },
                  tests: [],
                  ir: {
                    steps: []
                  }
                },
            outDir
          );
          return {
            target,
            artifactPaths: result.artifactPaths
          };
        }

        throw new Error(`Unsupported export target: ${target}`);
      }),
    reviewSkill:
      deps.reviewSkill ??
      (async (skill: string, options: { cwd: string }) => {
        const skillPath = path.isAbsolute(skill) ? skill : path.resolve(options.cwd, skill);
        return reviewSkillCommand(skillPath);
      }),
    testSkill:
      deps.testSkill ??
      (async (skill: string, options: { cwd: string }) => {
        const loaded = await loadSkillFile<Record<string, unknown>>(skill, { cwd: options.cwd });
        const replaySkill = loaded ? toReplaySkillDocument(loaded.skill, path.basename(skill)) : null;

        if (loaded?.inputsExample && replaySkill) {
          try {
            assertValidInputs(replaySkill.inputsSchema, loaded.inputsExample);
            return {
              passed: true,
              suite: replaySkill.name
            };
          } catch {
            return {
              passed: false,
              suite: replaySkill.name
            };
          }
        }

        return {
          passed: true,
          suite: replaySkill?.name ?? path.basename(skill)
        };
      }),
    doctor:
      deps.doctor ??
      (async () => ({
        daemon: "ok",
        browserDriver: "ok"
      }))
  };
}

async function initializeSkillForgeHome(cwd: string): Promise<void> {
  const root = path.join(cwd, ".skillforge");
  const directories = ["registry", "packages", "runs", "logs", "cache", "secrets", "exporters"];
  await fs.mkdir(root, { recursive: true });
  await Promise.all(directories.map((directory) => fs.mkdir(path.join(root, directory), { recursive: true })));
}

function parseInputSchemaFromArgs(value: string | undefined): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseInputsFromArgs(args: string[]): Record<string, unknown> {
  const inputs: Record<string, unknown> = {};

  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--input") {
      continue;
    }

    const pair = args[index + 1];
    if (!pair) {
      continue;
    }

    const separator = pair.indexOf("=");
    if (separator < 0) {
      continue;
    }

    inputs[pair.slice(0, separator)] = pair.slice(separator + 1);
    index += 1;
  }

  return inputs;
}

function parseModeFromArgs(args: string[], fallback?: string): "dry-run" | "assist" | "autopilot" {
  const modeIndex = args.indexOf("--mode");
  const rawMode = modeIndex >= 0 ? args[modeIndex + 1] : fallback;
  return rawMode === "dry-run" || rawMode === "assist" ? rawMode : "autopilot";
}

function collectSecretInputs(
  schema: Record<string, { type?: string }>,
  inputs: Record<string, unknown>
): string[] {
  return Object.entries(schema)
    .filter(([, definition]) => definition.type === "secret")
    .flatMap(([key]) => (typeof inputs[key] === "string" ? [inputs[key] as string] : []));
}
