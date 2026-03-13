import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { InputDefinition, InputSchema, InputType } from "./input-validator.ts";
import type { PermissionManifest } from "./permission-policy.ts";
import { loadSkillPackageFromDir } from "../package/load-skill-package.ts";
import type { SkillPackage } from "../package/skill-package-schema.ts";
import type { OpenClawSkill } from "../exporters/openclaw/index.ts";
import type { NativeSkillPackage } from "../exporters/native-package.ts";
import type { Assertion } from "../replay/assertion-evaluator.ts";
import type { ReplaySkill, ReplayStep } from "../replay/replay-engine.ts";

export interface SkillLoadOptions {
  cwd: string;
  repoRoot?: string;
}

export interface LoadedSkillFile<T = Record<string, unknown>> {
  filePath: string;
  directoryPath: string;
  skill: T;
  inputsExample?: Record<string, unknown>;
}

interface SkillDocument {
  name?: string;
  version?: string;
  actor?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  inputsSchema?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  expectedOutputs?: Record<string, unknown>;
  steps?: Array<{ type: string }>;
  assertions?: ReplaySkill["assertions"];
  secrets?: string[];
}

const DEFAULT_REPO_ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const INPUT_TYPES = new Set<InputType>([
  "string",
  "integer",
  "number",
  "boolean",
  "date",
  "datetime",
  "enum",
  "path",
  "url",
  "email",
  "secret",
  "json"
]);
const ASSERTION_TYPES = new Set<Assertion["type"]>([
  "urlMatches",
  "textContains",
  "fileExists",
  "exitCode",
  "stdoutRegex"
]);

export async function resolveSkillFilePath(specifier: string, options: SkillLoadOptions): Promise<string | null> {
  for (const candidate of candidatePaths(specifier, options)) {
    const filePath = await toSkillFilePath(candidate);
    if (filePath) {
      return filePath;
    }
  }

  return null;
}

export async function loadSkillFile<T = Record<string, unknown>>(
  specifier: string,
  options: SkillLoadOptions
): Promise<LoadedSkillFile<T> | null> {
  const filePath = await resolveSkillFilePath(specifier, options);
  if (!filePath) {
    return null;
  }

  const directoryPath = path.dirname(filePath);
  if (path.basename(filePath) === "skillforge.yaml") {
    const skillPackage = await loadSkillPackageFromDir(directoryPath);

    return {
      filePath,
      directoryPath,
      skill: skillPackageToDocument(skillPackage) as T,
      inputsExample: skillPackage.tests?.[0]?.input
    };
  }

  const skill = JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  const inputsExamplePath = path.join(directoryPath, "inputs.example.json");

  return {
    filePath,
    directoryPath,
    skill,
    inputsExample: (await fileExists(inputsExamplePath))
      ? (JSON.parse(await fs.readFile(inputsExamplePath, "utf8")) as Record<string, unknown>)
      : undefined
  };
}

export function toOpenClawSkillDocument(skill: Record<string, unknown>, fallbackName: string): OpenClawSkill {
  const document = normalizeSkillDocument(skill);

  return {
    name: document.name ?? fallbackName,
    description: document.description,
    inputSchema: toInputSchema(document.inputSchema ?? document.inputsSchema),
    permissions: toOpenClawPermissions(document.permissions),
    expectedOutputs: document.expectedOutputs ?? {},
    steps: toOpenClawSteps(document.steps),
    secrets: toStringArray(document.secrets)
  };
}

export function toReplaySkillDocument(skill: Record<string, unknown>, fallbackName: string, actor = "skillforge"): ReplaySkill {
  const document = normalizeSkillDocument(skill);

  return {
    name: document.name ?? fallbackName,
    version: document.version ?? "0.1.0",
    actor: document.actor ?? actor,
    inputsSchema: toInputSchema(document.inputsSchema ?? document.inputSchema),
    permissions: toPermissionManifest(document.permissions),
    steps: toReplaySteps(document.steps),
    assertions: toAssertions(document.assertions)
  };
}

export function toNativeSkillPackage(
  skill: Record<string, unknown>,
  inputsExample: Record<string, unknown> | undefined,
  fallbackName: string
): NativeSkillPackage {
  const document = normalizeSkillDocument(skill);

  return {
    metadata: {
      name: document.name ?? fallbackName,
      version: document.version ?? "0.1.0",
      license: "Apache-2.0"
    },
    tests: inputsExample
      ? [
          {
            id: "fixture-example",
            input: inputsExample
          }
        ]
      : [],
    ir: skill
  };
}

function normalizeSkillDocument(value: Record<string, unknown>): SkillDocument {
  return value as SkillDocument;
}

function toInputSchema(value: unknown): InputSchema {
  if (!isRecord(value)) {
    return {};
  }

  const schema: InputSchema = {};

  for (const [key, definition] of Object.entries(value)) {
    if (!isRecord(definition) || typeof definition.type !== "string" || !INPUT_TYPES.has(definition.type as InputType)) {
      continue;
    }

    const normalized: InputDefinition = {
      type: definition.type as InputType
    };

    if (typeof definition.required === "boolean") {
      normalized.required = definition.required;
    }
    if (typeof definition.pattern === "string") {
      normalized.pattern = definition.pattern;
    }
    if (Array.isArray(definition.enum) && definition.enum.every((entry) => typeof entry === "string")) {
      normalized.enum = definition.enum;
    }
    if ("default" in definition) {
      normalized.default = definition.default;
    }

    schema[key] = normalized;
  }

  return schema;
}

function toPermissionManifest(value: unknown): PermissionManifest {
  return isRecord(value) ? (value as PermissionManifest) : {};
}

function toOpenClawPermissions(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function toOpenClawSteps(value: unknown): OpenClawSkill["steps"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .filter((step) => typeof step.type === "string")
    .map((step) => ({ type: step.type as string }));
}

function toReplaySteps(value: unknown): ReplayStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .filter((step) => typeof step.type === "string")
    .map((step, index) => {
      const target = isRecord(step.target) && Array.isArray(step.target.locatorCandidates)
        ? {
            locatorCandidates: step.target.locatorCandidates
              .filter((candidate): candidate is string => typeof candidate === "string")
          }
        : undefined;

      return {
        id: typeof step.id === "string" && step.id.length > 0 ? step.id : `step-${index + 1}`,
        type: step.type as string,
        target,
        with: isRecord(step.with) ? step.with : undefined,
        action: typeof step.action === "string" ? step.action : undefined,
        secret: typeof step.secret === "boolean" ? step.secret : undefined
      };
    });
}

function toAssertions(value: unknown): Assertion[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .filter((assertion) => typeof assertion.type === "string" && ASSERTION_TYPES.has(assertion.type as Assertion["type"]))
    .map((assertion) => normalizeAssertion(assertion))
    .filter((assertion): assertion is Assertion => assertion !== null);
}

function normalizeAssertion(assertion: Record<string, any>): Assertion | null {
  switch (assertion.type) {
    case "urlMatches":
    case "stdoutRegex":
      return typeof assertion.value === "string" ? { type: assertion.type, value: assertion.value } : null;
    case "fileExists":
      return typeof assertion.path === "string" ? { type: "fileExists", path: assertion.path } : null;
    case "exitCode":
      return typeof assertion.value === "number" ? { type: "exitCode", value: assertion.value } : null;
    case "textContains":
      return typeof assertion.locator === "string" && typeof assertion.value === "string"
        ? { type: "textContains", locator: assertion.locator, value: assertion.value }
        : null;
    default:
      return null;
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}

function skillPackageToDocument(skill: SkillPackage): Record<string, unknown> {
  const rootDir = skill.rootDir ?? process.cwd();

  return {
    name: skill.metadata.name,
    version: skill.metadata.version,
    description: skill.metadata.description,
    actor: "package",
    inputsSchema: skill.inputs ?? {},
    permissions: resolvePermissionPaths(skill.permissions ?? {}, rootDir),
    steps: resolveStepPaths(skill.steps, rootDir),
    assertions: resolveAssertions(skill.assertions ?? [], rootDir),
    expectedOutputs: skill.outputs ?? {}
  };
}

function resolvePermissionPaths(permissions: Record<string, unknown>, rootDir: string): Record<string, unknown> {
  const resolved = structuredClone(permissions);
  const files = isRecord(resolved.files) ? resolved.files : null;

  if (files && Array.isArray(files.read)) {
    files.read = files.read.map((entry) => (typeof entry === "string" ? resolvePackagePath(entry, rootDir) : entry));
  }

  if (files && Array.isArray(files.write)) {
    files.write = files.write.map((entry) => (typeof entry === "string" ? resolvePackagePath(entry, rootDir) : entry));
  }

  return resolved;
}

function resolveStepPaths(steps: Array<Record<string, unknown>>, rootDir: string): Array<Record<string, unknown>> {
  return steps.map((step) => {
    const resolved = structuredClone(step);
    const withValue = isRecord(resolved.with) ? resolved.with : null;

    if (withValue && typeof withValue.from === "string") {
      withValue.from = resolvePackagePath(withValue.from, rootDir);
    }
    if (withValue && typeof withValue.to === "string") {
      withValue.to = resolvePackagePath(withValue.to, rootDir);
    }
    if (withValue && typeof withValue.saveAs === "string") {
      withValue.saveAs = resolvePackagePath(withValue.saveAs, rootDir);
    }

    return resolved;
  });
}

function resolveAssertions(assertions: Assertion[], rootDir: string): Assertion[] {
  return assertions.map((assertion) =>
    assertion.type === "fileExists" ? { ...assertion, path: resolvePackagePath(assertion.path, rootDir) } : assertion
  );
}

function resolvePackagePath(candidate: string, rootDir: string): string {
  if (!candidate.startsWith("./") && !candidate.startsWith("../")) {
    return candidate;
  }

  const [prefix, ...suffix] = candidate.split(/(\{\{[^}]+\}\})/u);
  return path.join(rootDir, prefix) + suffix.join("");
}

function candidatePaths(specifier: string, options: SkillLoadOptions): string[] {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const fixturePath = path.join("tests", "fixtures", "skills", specifier, "skill.ir.json");
  const directPath = specifier.endsWith(".json") || specifier.endsWith(".yaml") ? specifier : path.join(specifier, "skill.ir.json");
  const packagePath = specifier.endsWith(".yaml") ? specifier : path.join(specifier, "skillforge.yaml");
  const rawCandidates = isPathLike(specifier)
    ? [
        specifier,
        directPath,
        packagePath,
        path.join(options.cwd, specifier),
        path.join(options.cwd, directPath),
        path.join(options.cwd, packagePath),
        path.join(repoRoot, specifier),
        path.join(repoRoot, directPath),
        path.join(repoRoot, packagePath)
      ]
    : [fixturePath, path.join(options.cwd, fixturePath), path.join(repoRoot, fixturePath)];

  return [...new Set(rawCandidates)];
}

function isPathLike(specifier: string): boolean {
  return (
    specifier.includes("/") ||
    specifier.includes("\\") ||
    specifier.startsWith(".") ||
    specifier.endsWith(".json") ||
    specifier.endsWith(".yaml")
  );
}

async function toSkillFilePath(candidate: string): Promise<string | null> {
  try {
    const stat = await fs.stat(candidate);
    if (stat.isDirectory()) {
      const packageFile = path.join(candidate, "skillforge.yaml");
      if (await fileExists(packageFile)) {
        return packageFile;
      }

      const nested = path.join(candidate, "skill.ir.json");
      return (await fileExists(nested)) ? nested : null;
    }

    return stat.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

async function fileExists(candidate: string): Promise<boolean> {
  try {
    await fs.stat(candidate);
    return true;
  } catch {
    return false;
  }
}
