import { createHash } from "node:crypto";

import type { FileSystem } from "../drivers/file-system.ts";
import { redactValue } from "../security/secret-redactor.ts";
import type { RunArtifactPaths } from "./run-artifacts.ts";

export interface RunRecord {
  runId: string;
  skill: string;
  version: string;
  status: string;
  startedAt: string;
  endedAt: string;
  actor: string;
  inputHash: string;
  errorType?: string;
  failedStepId?: string;
  deniedActions?: Array<{ stepId: string; reason: string }>;
  approvals?: Array<{ stepId: string; status: string }>;
  message?: string;
  artifacts?: RunArtifactPaths;
}

export interface StepRecord {
  status: string;
  type: string;
  attempts?: number;
  errorType?: string;
  details?: Record<string, unknown>;
}

export interface RunLoggerOptions {
  fileSystem: FileSystem;
  baseDir: string;
}

export class RunLogger {
  private readonly fileSystem: FileSystem;
  private readonly baseDir: string;

  constructor(options: RunLoggerOptions) {
    this.fileSystem = options.fileSystem;
    this.baseDir = options.baseDir;
  }

  async logRun(record: RunRecord, secrets: readonly string[] = []): Promise<void> {
    const content = JSON.stringify(redactValue(record, secrets), null, 2);
    await this.fileSystem.writeFile(`${this.baseDir}/${record.runId}/run.json`, content);
  }

  async logStep(runId: string, stepId: string, record: StepRecord, secrets: readonly string[] = []): Promise<void> {
    const content = JSON.stringify(redactValue(record, secrets), null, 2);
    await this.fileSystem.writeFile(`${this.baseDir}/${runId}/steps/${stepId}.json`, content);
  }

  hashInputs(inputs: Record<string, unknown>): string {
    return createHash("sha256").update(stableStringify(inputs)).digest("hex");
  }

  async read(runId: string): Promise<RunRecord> {
    return JSON.parse(await this.fileSystem.readFile(`${this.baseDir}/${runId}/run.json`)) as RunRecord;
  }

  rootDir(): string {
    return this.baseDir;
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}
