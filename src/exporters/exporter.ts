import { redactSecrets } from "../security/secret-redactor.ts";

export interface ExportArtifact {
  path: string;
  content: string;
}

export interface ExportStep {
  type: string;
}

export interface ExportSkill {
  name: string;
  description?: string;
  steps: ExportStep[];
  inputSchema?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  secrets?: string[];
}

export interface ExportResult {
  artifacts: ExportArtifact[];
}

export interface Exporter {
  export(skill: ExportSkill): Promise<ExportResult>;
}

export class ExporterError extends Error {
  readonly code: "unsupported_step";

  constructor(stepType: string) {
    super(`Unsupported step: ${stepType}`);
    this.name = "ExporterError";
    this.code = "unsupported_step";
  }
}

export class MemoryExporter implements Exporter {
  private readonly supportedStepTypes: string[];

  constructor(supportedStepTypes: string[]) {
    this.supportedStepTypes = supportedStepTypes;
  }

  async export(skill: ExportSkill): Promise<ExportResult> {
    for (const step of skill.steps) {
      if (!this.supportedStepTypes.includes(step.type)) {
        throw new ExporterError(step.type);
      }
    }

    const secrets = skill.secrets ?? [];
    const artifacts: ExportArtifact[] = [
      {
        path: "SKILL.md",
        content: redactSecrets(
          `# ${skill.name}\n\n${skill.description ?? "No description"}\nPermissions: ${JSON.stringify(
            skill.permissions ?? {}
          )}`,
          secrets
        )
      },
      {
        path: "skill.json",
        content: redactSecrets(JSON.stringify({ inputSchema: skill.inputSchema ?? {}, steps: skill.steps }), secrets)
      },
      {
        path: "skill.ir.json",
        content: redactSecrets(JSON.stringify(skill), secrets)
      }
    ];

    return { artifacts };
  }
}
