import type { InputSchema } from "../core/input-validator.ts";
import type { PermissionManifest } from "../core/permission-policy.ts";
import type { Assertion } from "../replay/assertion-evaluator.ts";

export interface SkillPackageMetadata {
  name: string;
  displayName?: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  tags?: string[];
  maturity?: string;
}

export interface SkillPackageRuntime {
  mode?: "dry-run" | "assist" | "autopilot";
  timeoutSeconds?: number;
  retryPolicy?: {
    maxRetries: number;
    backoffSeconds?: number;
  };
}

export interface SkillPackageTest {
  id: string;
  input: Record<string, unknown>;
  expect?: Record<string, unknown>;
}

export interface SkillPackage {
  apiVersion: string;
  kind: "SkillPackage";
  metadata: SkillPackageMetadata;
  runtime?: SkillPackageRuntime;
  inputs?: InputSchema;
  permissions?: PermissionManifest & Record<string, unknown>;
  steps: Array<Record<string, unknown>>;
  assertions?: Assertion[];
  outputs?: Record<string, Record<string, unknown>>;
  tests?: SkillPackageTest[];
  export?: {
    targets?: string[];
  };
  rootDir?: string;
}

interface ValidationError {
  path: string;
  message: string;
}

const ALLOWED_TOP_LEVEL_KEYS = new Set([
  "apiVersion",
  "kind",
  "metadata",
  "runtime",
  "inputs",
  "permissions",
  "steps",
  "assertions",
  "outputs",
  "tests",
  "export"
]);

export function validateSkillPackageDocument(input: unknown): {
  ok: boolean;
  errors: ValidationError[];
} {
  const errors: ValidationError[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [{ path: "", message: "Document must be an object." }]
    };
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_TOP_LEVEL_KEYS.has(key)) {
      errors.push({
        path: key,
        message: "Unknown top-level key."
      });
    }
  }

  if (typeof input.apiVersion !== "string" || input.apiVersion.length === 0) {
    errors.push({ path: "apiVersion", message: "apiVersion must be a non-empty string." });
  }

  if (input.kind !== "SkillPackage") {
    errors.push({ path: "kind", message: "kind must be SkillPackage." });
  }

  if (!isRecord(input.metadata)) {
    errors.push({ path: "metadata", message: "metadata must be an object." });
  } else {
    if (typeof input.metadata.name !== "string" || input.metadata.name.length === 0) {
      errors.push({ path: "metadata.name", message: "metadata.name must be a non-empty string." });
    }
    if (typeof input.metadata.version !== "string" || input.metadata.version.length === 0) {
      errors.push({ path: "metadata.version", message: "metadata.version must be a non-empty string." });
    }
  }

  if (!Array.isArray(input.steps)) {
    errors.push({ path: "steps", message: "steps must be an array." });
  }

  if ("inputs" in input && input.inputs !== undefined && !isRecord(input.inputs)) {
    errors.push({ path: "inputs", message: "inputs must be an object." });
  }

  if ("permissions" in input && input.permissions !== undefined && !isRecord(input.permissions)) {
    errors.push({ path: "permissions", message: "permissions must be an object." });
  }

  if ("assertions" in input && input.assertions !== undefined && !Array.isArray(input.assertions)) {
    errors.push({ path: "assertions", message: "assertions must be an array." });
  }

  if ("outputs" in input && input.outputs !== undefined && !isRecord(input.outputs)) {
    errors.push({ path: "outputs", message: "outputs must be an object." });
  }

  if ("tests" in input && input.tests !== undefined && !Array.isArray(input.tests)) {
    errors.push({ path: "tests", message: "tests must be an array." });
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
