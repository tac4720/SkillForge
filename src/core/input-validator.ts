export type InputType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "enum"
  | "path"
  | "url"
  | "email"
  | "secret"
  | "json";

export interface InputDefinition {
  type: InputType;
  required?: boolean;
  pattern?: string;
  enum?: string[];
  default?: unknown;
}

export type InputSchema = Record<string, InputDefinition>;

export interface ValidationIssue {
  key: string;
  code: "required" | "pattern" | "enum" | "type";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  values: Record<string, unknown>;
  issues: ValidationIssue[];
}

export class InputValidationError extends Error {
  readonly code = "invalid_input";
  readonly issues: ValidationIssue[];

  constructor(issues: ValidationIssue[]) {
    super(issues.map((issue) => `${issue.key}:${issue.code}`).join(", "));
    this.name = "InputValidationError";
    this.issues = issues;
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }

  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function isValidDateTime(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidPath(value: string): boolean {
  return value.length > 0 && !value.includes("\0");
}

function isTypeValid(definition: InputDefinition, value: unknown): boolean {
  switch (definition.type) {
    case "string":
    case "secret":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && isValidDate(value);
    case "datetime":
      return typeof value === "string" && isValidDateTime(value);
    case "enum":
      return typeof value === "string";
    case "path":
      return typeof value === "string" && isValidPath(value);
    case "url":
      return typeof value === "string" && isValidUrl(value);
    case "email":
      return typeof value === "string" && isValidEmail(value);
    case "json":
      return typeof value === "object" && value !== null;
    default:
      return false;
  }
}

export function validateInputs(schema: InputSchema, inputs: Record<string, unknown>): ValidationResult {
  const issues: ValidationIssue[] = [];
  const values: Record<string, unknown> = {};

  for (const [key, definition] of Object.entries(schema)) {
    const rawValue = Object.prototype.hasOwnProperty.call(inputs, key) ? inputs[key] : definition.default;

    if (rawValue === undefined) {
      if (definition.required) {
        issues.push({
          key,
          code: "required",
          message: `${key} is required.`
        });
      }
      continue;
    }

    if (!isTypeValid(definition, rawValue)) {
      issues.push({
        key,
        code: "type",
        message: `${key} does not match type ${definition.type}.`
      });
      continue;
    }

    if (definition.type === "enum" && definition.enum && !definition.enum.includes(rawValue as string)) {
      issues.push({
        key,
        code: "enum",
        message: `${key} must be one of ${definition.enum.join(", ")}.`
      });
      continue;
    }

    if (definition.pattern && typeof rawValue === "string" && !new RegExp(definition.pattern, "u").test(rawValue)) {
      issues.push({
        key,
        code: "pattern",
        message: `${key} does not match ${definition.pattern}.`
      });
      continue;
    }

    values[key] = rawValue;
  }

  return {
    valid: issues.length === 0,
    values,
    issues
  };
}

export function assertValidInputs(schema: InputSchema, inputs: Record<string, unknown>): Record<string, unknown> {
  const result = validateInputs(schema, inputs);
  if (!result.valid) {
    throw new InputValidationError(result.issues);
  }

  return result.values;
}
