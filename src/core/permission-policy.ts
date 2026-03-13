import path from "node:path";

import { classifyRisk, type RiskLevel, type RiskSubject } from "../security/risk-classifier.ts";
import { isPathWithinBase } from "./path-sanitizer.ts";

export interface PermissionManifest {
  browser?: {
    domains?: {
      allow?: string[];
      deny?: string[];
    };
  };
  files?: {
    read?: string[];
    write?: string[];
  };
  shell?: {
    allow?: string[];
    deny?: string[];
  };
}

export type PermissionDecision =
  | {
      allowed: true;
      code?: undefined;
      reason?: undefined;
      risk: RiskLevel;
    }
  | {
      allowed: false;
      code: "permission_denied";
      reason: string;
      risk: RiskLevel;
    };

function toOrigin(entry: string): string {
  try {
    return new URL(entry).origin;
  } catch {
    return entry;
  }
}

function deny(reason: string, risk: RiskLevel): PermissionDecision {
  return {
    allowed: false,
    code: "permission_denied",
    reason,
    risk
  };
}

export function evaluateBrowserUrl(
  manifest: PermissionManifest,
  url: string,
  redirectChain: string[] = []
): PermissionDecision {
  const allow = manifest.browser?.domains?.allow?.map(toOrigin) ?? [];
  const denyList = manifest.browser?.domains?.deny?.map(toOrigin) ?? [];
  const urlsToCheck = [url, ...redirectChain];

  for (const entry of urlsToCheck) {
    let origin: string;
    try {
      origin = new URL(entry).origin;
    } catch {
      return deny(`Invalid URL: ${entry}`, "low");
    }

    if (denyList.includes(origin)) {
      return deny(`Domain is denylisted: ${origin}`, "low");
    }

    if (allow.length > 0 && !allow.includes(origin)) {
      return deny(`Domain is not allowlisted: ${origin}`, "low");
    }
  }

  return {
    allowed: true,
    risk: "low"
  };
}

export function evaluateFileAccess(
  manifest: PermissionManifest,
  accessType: "read" | "write",
  requestedPath: string,
  realpath?: (candidatePath: string) => string
): PermissionDecision {
  const allowedRoots = (accessType === "read" ? manifest.files?.read : manifest.files?.write) ?? [];
  const resolvedPath = path.resolve(realpath ? realpath(requestedPath) : requestedPath);
  const risk = accessType === "write" ? "medium" : "low";

  if (allowedRoots.length === 0) {
    return deny(`No ${accessType} roots configured.`, risk);
  }

  const matches = allowedRoots.some((root) => isPathWithinBase(path.resolve(root), resolvedPath));
  if (!matches) {
    return deny(`Path is not in ${accessType} allowlist: ${resolvedPath}`, risk);
  }

  return {
    allowed: true,
    risk
  };
}

function isShellEvalBypass(command: string, args: string[]): boolean {
  const baseCommand = path.basename(command);
  return ["sh", "bash", "zsh", "fish"].includes(baseCommand) && args.includes("-c");
}

function hasCommandChaining(args: string[]): boolean {
  return args.some((arg) => arg.includes(";") || arg.includes("&&") || arg.includes("`"));
}

export function evaluateShellCommand(
  manifest: PermissionManifest,
  command: string,
  args: string[] = []
): PermissionDecision {
  const allow = manifest.shell?.allow ?? [];
  const denyList = manifest.shell?.deny ?? [];
  const baseCommand = path.basename(command);
  const risk = classifyRisk({ type: "shell.exec", command: baseCommand });

  if (isShellEvalBypass(baseCommand, args)) {
    return deny("Shell eval bypass is denied.", risk);
  }

  if (hasCommandChaining(args)) {
    return deny("Shell command chaining is denied.", risk);
  }

  if (denyList.includes(baseCommand)) {
    return deny(`Command is denylisted: ${baseCommand}`, risk);
  }

  if (allow.length > 0 && !allow.includes(baseCommand)) {
    return deny(`Command is not allowlisted: ${baseCommand}`, risk);
  }

  return {
    allowed: true,
    risk
  };
}

export function evaluateActionRisk(subject: RiskSubject): RiskLevel {
  return classifyRisk(subject);
}
