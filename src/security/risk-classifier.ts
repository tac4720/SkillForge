import path from "node:path";

export type RiskLevel = "low" | "medium" | "high";

export interface RiskSubject {
  type: string;
  action?: string;
  command?: string;
}

const LOW_RISK_TYPES = new Set([
  "browser.navigate",
  "browser.waitFor",
  "browser.extract",
  "browser.screenshot",
  "browser.download",
  "file.exists",
  "notify.send.readonly"
]);

const MEDIUM_RISK_TYPES = new Set([
  "browser.input",
  "browser.select",
  "browser.checkbox",
  "file.copy",
  "file.move",
  "file.rename"
]);

const HIGH_RISK_ACTION_PATTERN = /\b(send|submit|delete|remove|update|overwrite|payment|pay|webhook)\b/i;
const HIGH_RISK_SHELL_COMMANDS = new Set([
  "rm",
  "mv",
  "cp",
  "touch",
  "tee",
  "sed",
  "truncate",
  "dd",
  "install"
]);

export function classifyRisk(subject: RiskSubject): RiskLevel {
  if (subject.type === "shell.exec") {
    const command = subject.command ? path.basename(subject.command) : "";
    return HIGH_RISK_SHELL_COMMANDS.has(command) ? "high" : "low";
  }

  if (LOW_RISK_TYPES.has(subject.type)) {
    return "low";
  }

  if (MEDIUM_RISK_TYPES.has(subject.type)) {
    return "medium";
  }

  if (subject.action && HIGH_RISK_ACTION_PATTERN.test(subject.action)) {
    return "high";
  }

  return "low";
}
