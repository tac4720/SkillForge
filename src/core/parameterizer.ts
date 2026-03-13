export type ParameterKind = "fixed" | "parameter" | "secret" | "derived";
export type ParameterType = "string" | "path" | "secret";

export interface RawParameterCandidate {
  name: string;
  value: string;
  occurrences?: number;
  hint?: ParameterKind;
  required?: boolean;
  defaultValue?: string;
}

export interface ParameterDefinition {
  name: string;
  kind: ParameterKind;
  type: ParameterType;
  value: string;
  required: boolean;
  defaultValue?: string;
  pattern?: string;
}

function isYearMonth(value: string): boolean {
  return /^\d{4}-\d{2}$/u.test(value);
}

function isPathLike(value: string): boolean {
  return value.startsWith("/") || value.startsWith("./") || value.startsWith("~/") || value.includes("/");
}

function isValidParameterValue(value: string): boolean {
  return value.length > 0 && !value.includes("\0");
}

export function parameterizeCandidates(candidates: RawParameterCandidate[]): ParameterDefinition[] {
  return candidates.map((candidate) => {
    const required = candidate.required ?? true;
    const defaultValue = candidate.defaultValue;

    if (candidate.hint === "secret") {
      return {
        name: candidate.name,
        kind: "secret",
        type: "secret",
        value: candidate.value,
        required,
        defaultValue
      };
    }

    if (candidate.hint === "derived") {
      return {
        name: candidate.name,
        kind: "derived",
        type: "string",
        value: candidate.value,
        required,
        defaultValue
      };
    }

    if (!isValidParameterValue(candidate.value)) {
      return {
        name: candidate.name,
        kind: "fixed",
        type: "string",
        value: candidate.value,
        required,
        defaultValue
      };
    }

    if (isYearMonth(candidate.value)) {
      return {
        name: candidate.name,
        kind: "parameter",
        type: "string",
        value: candidate.value,
        required,
        defaultValue,
        pattern: "^\\d{4}-\\d{2}$"
      };
    }

    if (isPathLike(candidate.value)) {
      return {
        name: candidate.name,
        kind: "parameter",
        type: "path",
        value: candidate.value,
        required,
        defaultValue
      };
    }

    if ((candidate.occurrences ?? 1) > 1) {
      return {
        name: candidate.name,
        kind: "parameter",
        type: "string",
        value: candidate.value,
        required,
        defaultValue
      };
    }

    return {
      name: candidate.name,
      kind: "fixed",
      type: "string",
      value: candidate.value,
      required,
      defaultValue
    };
  });
}
