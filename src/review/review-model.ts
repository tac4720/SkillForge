import { classifyRisk } from "../security/risk-classifier.ts";
import type { PermissionManifest } from "../core/permission-policy.ts";
import type { SkillPackage } from "../package/skill-package-schema.ts";

export interface ReviewModel {
  steps: Array<{ id: string; type: string; risk: string }>;
  parameters: Array<{ name: string; kind: string }>;
  permissions: PermissionManifest;
  warnings: string[];
}

const SUPPORTED_STEPS = new Set([
  "browser.navigate",
  "browser.click",
  "browser.input",
  "browser.select",
  "browser.waitFor",
  "browser.download",
  "file.copy",
  "shell.exec"
]);

export function buildReviewModel(skill: SkillPackage): ReviewModel {
  const steps = skill.steps.map((step, index) => {
    const command = isRecord(step.with) && typeof step.with.command === "string" ? step.with.command : undefined;
    return {
      id: typeof step.id === "string" ? step.id : `step-${index + 1}`,
      type: String(step.type),
      risk: classifyRisk({
        type: String(step.type),
        action: typeof step.action === "string" ? step.action : undefined,
        command
      })
    };
  });

  const warnings = [
    ...steps
      .filter((step) => step.risk === "high")
      .map((step) => `high-risk: ${step.id} ${step.type}`),
    ...steps
      .filter((step) => !SUPPORTED_STEPS.has(step.type))
      .map((step) => `unsupported: ${step.id} ${step.type}`)
  ];

  return {
    steps,
    parameters: Object.entries(skill.inputs ?? {}).map(([name, definition]) => ({
      name,
      kind: definition.type
    })),
    permissions: skill.permissions ?? {},
    warnings
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
