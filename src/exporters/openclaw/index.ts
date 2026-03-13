import fs from "node:fs/promises";
import path from "node:path";

import { redactSecrets } from "../../security/secret-redactor.ts";
import type { ExportArtifact } from "../exporter.ts";

export interface OpenClawSkill {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  expectedOutputs?: Record<string, unknown>;
  steps: Array<{ type: string }>;
  secrets?: string[];
}

export interface OpenClawExportOptions {
  skillPath: string;
  cliCommand?: string;
}

export interface OpenClawExportResult {
  artifacts: ExportArtifact[];
}

export interface OpenClawWriteResult {
  artifactPaths: string[];
}

export interface WrapperInvocation {
  command: string;
  args: string[];
}

const SUPPORTED_STEPS = new Set([
  "browser.navigate",
  "browser.click",
  "browser.input",
  "browser.waitFor",
  "browser.download",
  "shell.exec",
  "file.copy"
]);

export class OpenClawExportError extends Error {
  readonly code = "unsupported_step";

  constructor(stepType: string) {
    super(`Unsupported step: ${stepType}`);
    this.name = "OpenClawExportError";
  }
}

export class OpenClawExporter {
  async export(skill: OpenClawSkill, options: OpenClawExportOptions): Promise<OpenClawExportResult> {
    for (const step of skill.steps) {
      if (!SUPPORTED_STEPS.has(step.type)) {
        throw new OpenClawExportError(step.type);
      }
    }

    const secrets = skill.secrets ?? [];
    const manifest = {
      entryPoint: "run.sh",
      inputSchema: skill.inputSchema ?? {},
      permissions: skill.permissions ?? {},
      expectedOutputs: skill.expectedOutputs ?? {}
    };

    const artifacts: ExportArtifact[] = [
      {
        path: "SKILL.md",
        content: redactSecrets(
          `# ${skill.name}\n\n${skill.description ?? ""}\n\nPermissions: ${JSON.stringify(skill.permissions ?? {})}`,
          secrets
        )
      },
      {
        path: "skillforge.openclaw.json",
        content: redactSecrets(JSON.stringify(manifest, null, 2), secrets)
      },
      {
        path: "run.sh",
        content: this.buildWrapperScript(options.skillPath, skill.inputSchema ?? {}, options.cliCommand ?? "skillforge")
      },
      {
        path: "skill.ir.json",
        content: redactSecrets(JSON.stringify(skill, null, 2), secrets)
      }
    ];

    return { artifacts };
  }

  async writeToDirectory(
    skill: OpenClawSkill,
    options: OpenClawExportOptions & { outDir: string }
  ): Promise<OpenClawWriteResult> {
    const result = await this.export(skill, options);
    await fs.mkdir(options.outDir, { recursive: true });
    await Promise.all(
      result.artifacts.map((artifact) =>
        fs.writeFile(path.join(options.outDir, artifact.path), artifact.content, "utf8")
      )
    );

    return {
      artifactPaths: result.artifacts.map((artifact) => path.join(options.outDir, artifact.path))
    };
  }

  async invokeWrapper(artifacts: ExportArtifact[], inputs: Record<string, unknown>): Promise<WrapperInvocation> {
    const wrapper = requireArtifact(artifacts, "run.sh").content;
    const skillPath = extractSingleQuotedValue(wrapper, "SKILL_PATH");
    const inputSchemaRaw = extractSingleQuotedValue(wrapper, "INPUT_SCHEMA");
    const inputSchema = JSON.parse(inputSchemaRaw) as Record<string, unknown>;

    for (const requiredKey of Object.keys(inputSchema)) {
      if (!(requiredKey in inputs)) {
        throw new Error(`Missing input: ${requiredKey}`);
      }
    }

    return {
      command: "skillforge",
      args: [
        "replay",
        skillPath,
        ...Object.entries(inputs).flatMap(([key, value]) => ["--input", `${key}=${String(value)}`])
      ]
    };
  }

  private buildWrapperScript(skillPath: string, inputSchema: Record<string, unknown>, cliCommand: string): string {
    const quotedPath = singleQuote(skillPath);
    const schemaJson = singleQuote(JSON.stringify(inputSchema));
    return `#!/usr/bin/env sh
SKILL_PATH=${quotedPath}
INPUT_SCHEMA=${schemaJson}
${cliCommand} replay ${quotedPath} "$@"
`;
  }
}

function requireArtifact(artifacts: ExportArtifact[], path: string): ExportArtifact {
  const artifact = artifacts.find((candidate) => candidate.path === path);
  if (!artifact) {
    throw new Error(`Missing artifact: ${path}`);
  }
  return artifact;
}

function singleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function extractSingleQuotedValue(content: string, variableName: string): string {
  const match = content.match(new RegExp(`${variableName}='([\\s\\S]*?)'`));
  if (!match) {
    throw new Error(`Missing ${variableName} in wrapper.`);
  }
  return match[1].replace(/'\"'\"'/g, "'");
}
