import type { BrowserDriver, DriverError } from "../drivers/browser-driver.ts";
import type { FileSystem } from "../drivers/file-system.ts";
import type { ShellRunner } from "../drivers/shell-runner.ts";
import { assertValidInputs, type InputSchema } from "../core/input-validator.ts";
import {
  evaluateBrowserUrl,
  evaluateFileAccess,
  evaluateShellCommand,
  type PermissionManifest
} from "../core/permission-policy.ts";
import type { ApprovalGate, ApprovalStatus } from "../security/approval-gate.ts";
import { classifyRisk } from "../security/risk-classifier.ts";
import { SecretProviderError, type SecretProvider } from "../secrets/secret-provider.ts";
import type { Assertion, AssertionContext } from "./assertion-evaluator.ts";
import { evaluateAssertions } from "./assertion-evaluator.ts";
import { createFailureArtifacts, type RunArtifactPaths } from "./run-artifacts.ts";
import { RunLogger } from "./run-logger.ts";

export interface ReplayStep {
  id: string;
  type: string;
  target?: {
    locatorCandidates: string[];
  };
  with?: Record<string, unknown>;
  action?: string;
  secret?: boolean;
}

export interface ReplaySkill {
  name: string;
  version: string;
  actor: string;
  inputsSchema: InputSchema;
  permissions: PermissionManifest;
  steps: ReplayStep[];
  assertions: Assertion[];
  runtime?: {
    retryPolicy?: {
      maxRetries: number;
    };
  };
  idempotencyKey?: string;
}

export interface ReplayRunOptions {
  mode: "dry-run" | "assist" | "autopilot";
  inputs: Record<string, unknown>;
  secrets?: string[];
}

export interface ReplayResult {
  runId: string;
  status: "passed" | "failed" | "skipped";
  errorType?: string;
  failedStepId?: string;
  deniedActions: Array<{ stepId: string; reason: string }>;
  approvals: Array<{ stepId: string; status: ApprovalStatus }>;
  artifacts?: RunArtifactPaths;
}

export interface ReplayEngineOptions {
  browserDriver: BrowserDriver;
  shellRunner: ShellRunner;
  fileSystem: FileSystem;
  approvalGate: ApprovalGate;
  logger: RunLogger;
  secretProvider?: SecretProvider;
  createRunId?: () => string;
  now?: () => Date;
}

interface ExecutionContext extends AssertionContext {
  existingFiles: Set<string>;
}

export class ReplayEngine {
  private readonly browserDriver: BrowserDriver;
  private readonly shellRunner: ShellRunner;
  private readonly fileSystem: FileSystem;
  private readonly approvalGate: ApprovalGate;
  private readonly logger: RunLogger;
  private readonly secretProvider?: SecretProvider;
  private readonly createRunId: () => string;
  private readonly now: () => Date;
  private readonly usedIdempotencyKeys = new Set<string>();

  constructor(options: ReplayEngineOptions) {
    this.browserDriver = options.browserDriver;
    this.shellRunner = options.shellRunner;
    this.fileSystem = options.fileSystem;
    this.approvalGate = options.approvalGate;
    this.logger = options.logger;
    this.secretProvider = options.secretProvider;
    this.createRunId = options.createRunId ?? (() => `run_${Date.now()}`);
    this.now = options.now ?? (() => new Date());
  }

  async run(skill: ReplaySkill, options: ReplayRunOptions): Promise<ReplayResult> {
    const runId = this.createRunId();
    const startedAt = this.now().toISOString();
    const inputHash = this.logger.hashInputs(options.inputs);
    const secretValues = new Set(options.secrets ?? []);
    const approvals: Array<{ stepId: string; status: ApprovalStatus }> = [];
    const deniedActions: Array<{ stepId: string; reason: string }> = [];
    const context: ExecutionContext = {
      currentUrl: this.browserDriver.currentUrl(),
      existingFiles: new Set<string>()
    };
    let resolvedAssertions: Assertion[] = skill.assertions;

    try {
      assertValidInputs(skill.inputsSchema, options.inputs);
    } catch (error) {
      const result: ReplayResult = {
        runId,
        status: "failed",
        errorType: "invalid_input",
        deniedActions,
        approvals
      };

      await this.logger.logRun(
        {
          runId,
          skill: skill.name,
          version: skill.version,
          status: result.status,
          errorType: result.errorType,
          startedAt,
          endedAt: this.now().toISOString(),
          actor: skill.actor,
          inputHash
        },
        [...secretValues]
      );

      return result;
    }

    if (skill.idempotencyKey && this.usedIdempotencyKeys.has(skill.idempotencyKey)) {
      const skipped: ReplayResult = {
        runId,
        status: "skipped",
        deniedActions,
        approvals
      };

      await this.logger.logRun(
        {
          runId,
          skill: skill.name,
          version: skill.version,
          status: "skipped",
          startedAt,
          endedAt: this.now().toISOString(),
          actor: skill.actor,
          inputHash
        },
        [...secretValues]
      );

      return skipped;
    }

    try {
      const resolved = await this.resolveTemplates(skill.assertions, options.inputs, secretValues);
      if (Array.isArray(resolved)) {
        resolvedAssertions = resolved as Assertion[];
      }
    } catch (error) {
      if (error instanceof SecretProviderError) {
        return this.failRun(
          runId,
          skill,
          startedAt,
          inputHash,
          error.code,
          undefined,
          deniedActions,
          approvals,
          [...secretValues]
        );
      }

      throw error;
    }

    for (const step of skill.steps) {
      let resolvedStep: ReplayStep;
      try {
        const resolved = await this.resolveStep(step, options.inputs);
        resolvedStep = resolved.step;
        resolved.secrets.forEach((secret) => secretValues.add(secret));
      } catch (error) {
        if (error instanceof SecretProviderError) {
          return this.failRun(
            runId,
            skill,
            startedAt,
            inputHash,
            error.code,
            step.id,
            deniedActions,
            approvals,
            [...secretValues]
          );
        }

        throw error;
      }

      const permissionFailure = this.preflightPermission(resolvedStep, skill.permissions, deniedActions);
      if (permissionFailure) {
        return this.failRun(
          runId,
          skill,
          startedAt,
          inputHash,
          permissionFailure.code,
          resolvedStep.id,
          deniedActions,
          approvals,
          [...secretValues]
        );
      }

      const risk = this.getRisk(resolvedStep);
      if (risk === "high") {
        if (options.mode === "dry-run") {
          deniedActions.push({ stepId: resolvedStep.id, reason: "High-risk action requires approval outside dry-run." });
          return this.failRun(
            runId,
            skill,
            startedAt,
            inputHash,
            "manual_intervention_required",
            resolvedStep.id,
            deniedActions,
            approvals,
            [...secretValues]
          );
        }

        else {
          const approval = await this.approvalGate.requestApproval({
            title: `Approve ${resolvedStep.id}`,
            summary: resolvedStep.action ?? resolvedStep.type
          });
          approvals.push({ stepId: resolvedStep.id, status: approval.status });
          if (approval.status !== "approved") {
            deniedActions.push({ stepId: resolvedStep.id, reason: `Approval ${approval.status}.` });
            return this.failRun(
              runId,
              skill,
              startedAt,
              inputHash,
              "manual_intervention_required",
              resolvedStep.id,
              deniedActions,
              approvals,
              [...secretValues]
            );
          }
        }
      }

      const maxRetries = skill.runtime?.retryPolicy?.maxRetries ?? 0;
      let attempts = 0;

      while (true) {
        attempts += 1;
        const outcome = await this.executeStep(resolvedStep, skill.permissions, context, deniedActions);

        if (outcome.ok) {
          await this.logger.logStep(
            runId,
            resolvedStep.id,
            {
              status: "passed",
              type: resolvedStep.type,
              attempts,
              details: resolvedStep.with
            },
            [...secretValues]
          );
          break;
        }

        if (attempts <= maxRetries) {
          continue;
        }

        await this.logger.logStep(
          runId,
          resolvedStep.id,
          {
            status: "failed",
            type: resolvedStep.type,
            attempts,
            errorType: outcome.error.code,
            details: resolvedStep.with
          },
          [...secretValues]
        );

        return this.failRun(
          runId,
          skill,
          startedAt,
          inputHash,
          outcome.error.code,
          resolvedStep.id,
          deniedActions,
          approvals,
          [...secretValues]
        );
      }
    }

    const assertionResult = evaluateAssertions(resolvedAssertions, context);
    if (!assertionResult.pass) {
      return this.failRun(
        runId,
        skill,
        startedAt,
        inputHash,
        "assertion_failed",
        skill.steps[skill.steps.length - 1]?.id,
        deniedActions,
        approvals,
        [...secretValues]
      );
    }

    if (skill.idempotencyKey) {
      this.usedIdempotencyKeys.add(skill.idempotencyKey);
    }

    await this.logger.logRun(
      {
        runId,
        skill: skill.name,
        version: skill.version,
        status: "passed",
        startedAt,
        endedAt: this.now().toISOString(),
        actor: skill.actor,
        inputHash,
        deniedActions,
        approvals
      },
      [...secretValues]
    );

    return {
      runId,
      status: "passed",
      deniedActions,
      approvals
    };
  }

  private async executeStep(
    step: ReplayStep,
    permissions: PermissionManifest,
    context: ExecutionContext,
    deniedActions: Array<{ stepId: string; reason: string }>
  ): Promise<{ ok: true } | { ok: false; error: DriverError }> {
    switch (step.type) {
      case "browser.navigate": {
        const url = String(step.with?.url ?? "");
        const result = await this.browserDriver.navigate(url);
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        context.currentUrl = result.value.url;
        return { ok: true };
      }
      case "browser.click": {
        const result = await this.browserDriver.click(this.browserTarget(step));
        context.currentUrl = this.browserDriver.currentUrl();
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }
      case "browser.input": {
        const result = await this.browserDriver.input(this.browserTarget(step), String(step.with?.value ?? ""));
        context.currentUrl = this.browserDriver.currentUrl();
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }
      case "browser.select": {
        const select = this.browserDriver.select;
        const result = select
          ? await select.call(this.browserDriver, this.browserTarget(step), String(step.with?.value ?? ""))
          : {
              ok: false as const,
              error: {
                code: "unsupported_step",
                message: "Unsupported step: browser.select"
              }
            };
        context.currentUrl = this.browserDriver.currentUrl();
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }
      case "browser.waitFor": {
        const result = await this.browserDriver.waitFor(this.browserTarget(step), {
          timeoutMs: typeof step.with?.timeoutMs === "number" ? step.with.timeoutMs : undefined
        });
        context.currentUrl = this.browserDriver.currentUrl();
        return result.ok ? { ok: true } : { ok: false, error: result.error };
      }
      case "browser.download": {
        const saveAs = String(step.with?.saveAs ?? "");
        const result = await this.browserDriver.download(this.browserTarget(step), {
          saveAs: saveAs || undefined
        });
        if (!result.ok) {
          return { ok: false, error: result.error };
        }
        context.currentUrl = this.browserDriver.currentUrl();
        context.existingFiles.add(result.value.path);
        return { ok: true };
      }
      case "file.copy": {
        const fromPath = String(step.with?.from ?? "");
        const toPath = String(step.with?.to ?? "");
        const contents = await this.fileSystem.readFile(fromPath);
        await this.fileSystem.writeFile(toPath, contents);
        context.existingFiles.add(toPath);
        return { ok: true };
      }
      case "shell.exec": {
        const command = String(step.with?.command ?? "");
        const args = Array.isArray(step.with?.args) ? step.with?.args.map((value) => String(value)) : [];
        const result = await this.shellRunner.run(command, args);
        context.exitCode = result.exitCode ?? undefined;
        context.stdout = result.stdout;
        if (result.timedOut) {
          return { ok: false, error: { code: "navigation_timeout", message: result.stderr || "Timed out." } };
        }
        if ((result.exitCode ?? 0) !== 0) {
          return { ok: false, error: { code: "shell_exit_nonzero", message: result.stderr || "Non-zero exit." } };
        }
        return { ok: true };
      }
      default:
        return {
          ok: false,
          error: {
            code: "unsupported_step",
            message: `Unsupported step: ${step.type}`
          }
        };
    }
  }

  private async failRun(
    runId: string,
    skill: ReplaySkill,
    startedAt: string,
    inputHash: string,
    errorType: string,
    failedStepId: string | undefined,
    deniedActions: Array<{ stepId: string; reason: string }>,
    approvals: Array<{ stepId: string; status: ApprovalStatus }>,
    secrets: readonly string[]
  ): Promise<ReplayResult> {
    const artifacts =
      failedStepId || skill.steps.some((step) => step.type.startsWith("browser."))
        ? await createFailureArtifacts({
            runId,
            stepId: failedStepId,
            browser: this.browserDriver,
            fs: this.fileSystem,
            outDir: this.logger.rootDir(),
            error: {
              type: errorType,
              message: errorType
            },
            secrets
          })
        : undefined;

    await this.logger.logRun(
      {
        runId,
        skill: skill.name,
        version: skill.version,
        status: "failed",
        errorType,
        failedStepId,
        startedAt,
        endedAt: this.now().toISOString(),
        actor: skill.actor,
        inputHash,
        deniedActions,
        approvals,
        artifacts
      },
      secrets
    );

    return {
      runId,
      status: "failed",
      errorType,
      failedStepId,
      deniedActions,
      approvals,
      artifacts
    };
  }

  private firstLocator(step: ReplayStep): string {
    return step.target?.locatorCandidates[0] ?? "";
  }

  private browserTarget(step: ReplayStep): string | { locatorCandidates: string[] } {
    return step.target && step.target.locatorCandidates.length > 0 ? step.target : this.firstLocator(step);
  }

  private preflightPermission(
    step: ReplayStep,
    permissions: PermissionManifest,
    deniedActions: Array<{ stepId: string; reason: string }>
  ): DriverError | null {
    if (step.type === "browser.navigate") {
      const decision = evaluateBrowserUrl(permissions, String(step.with?.url ?? ""));
      if (!decision.allowed) {
        deniedActions.push({ stepId: step.id, reason: decision.reason });
        return {
          code: "permission_denied",
          message: decision.reason
        };
      }
      return null;
    }

    if (step.type === "file.copy") {
      const readDecision = evaluateFileAccess(permissions, "read", String(step.with?.from ?? ""));
      if (!readDecision.allowed) {
        deniedActions.push({ stepId: step.id, reason: readDecision.reason });
        return {
          code: "permission_denied",
          message: readDecision.reason
        };
      }

      const writeDecision = evaluateFileAccess(permissions, "write", String(step.with?.to ?? ""));
      if (!writeDecision.allowed) {
        deniedActions.push({ stepId: step.id, reason: writeDecision.reason });
        return {
          code: "permission_denied",
          message: writeDecision.reason
        };
      }
      return null;
    }

    if (step.type === "shell.exec") {
      const command = String(step.with?.command ?? "");
      const args = Array.isArray(step.with?.args) ? step.with?.args.map((value) => String(value)) : [];
      const decision = evaluateShellCommand(permissions, command, args);
      if (!decision.allowed) {
        deniedActions.push({ stepId: step.id, reason: decision.reason });
        return {
          code: "permission_denied",
          message: decision.reason
        };
      }
      return null;
    }

    return null;
  }

  private getRisk(step: ReplayStep): "low" | "medium" | "high" {
    if (step.type === "shell.exec") {
      return classifyRisk({
        type: step.type,
        command: String(step.with?.command ?? "")
      });
    }

    return classifyRisk({
      type: step.type,
      action: step.action
    });
  }

  private async resolveStep(
    step: ReplayStep,
    inputs: Record<string, unknown>
  ): Promise<{ step: ReplayStep; secrets: string[] }> {
    const resolvedSecrets = new Set<string>();

    const resolvedWith = await this.resolveTemplates(step.with, inputs, resolvedSecrets);
    const resolvedAction = typeof step.action === "string"
      ? await this.resolveTemplateString(step.action, inputs, resolvedSecrets)
      : step.action;

    return {
      step: {
        ...step,
        with: isRecordValue(resolvedWith) ? resolvedWith : undefined,
        action: resolvedAction
      },
      secrets: [...resolvedSecrets]
    };
  }

  private async resolveTemplates(
    value: unknown,
    inputs: Record<string, unknown>,
    secrets: Set<string>
  ): Promise<unknown> {
    if (typeof value === "string") {
      return this.resolveTemplateString(value, inputs, secrets);
    }

    if (Array.isArray(value)) {
      return Promise.all(value.map((entry) => this.resolveTemplates(entry, inputs, secrets)));
    }

    if (value && typeof value === "object") {
      const entries = await Promise.all(
        Object.entries(value).map(async ([key, entryValue]) => [key, await this.resolveTemplates(entryValue, inputs, secrets)] as const)
      );
      return Object.fromEntries(entries);
    }

    return value;
  }

  private async resolveTemplateString(
    template: string,
    inputs: Record<string, unknown>,
    secrets: Set<string>
  ): Promise<string> {
    const matches = [...template.matchAll(/\{\{([^}]+)\}\}/gu)];
    if (matches.length === 0) {
      return template;
    }

    let resolved = template;
    for (const match of matches) {
      const key = match[1] ?? "";
      const value = await this.resolveTemplateValue(key, inputs);
      if (key.startsWith("secrets.")) {
        secrets.add(value);
      }
      resolved = resolved.replace(match[0], value);
    }

    return resolved;
  }

  private async resolveTemplateValue(key: string, inputs: Record<string, unknown>): Promise<string> {
    if (key.startsWith("secrets.")) {
      if (!this.secretProvider) {
        throw new SecretProviderError(`Missing secret provider for ${key}.`);
      }

      return this.secretProvider.get(key.slice("secrets.".length));
    }

    if (key.startsWith("inputs.")) {
      return String(inputs[key.slice("inputs.".length)] ?? "");
    }

    return String(inputs[key] ?? "");
  }
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
