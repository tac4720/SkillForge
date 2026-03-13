import { test } from "vitest";

export type RedCase = {
  id: string;
  title: string;
  notes?: string[];
};

function buildMessage(suiteName: string, modulePath: string, redCase: RedCase): string {
  const lines = [
    `RED: ${suiteName} is specified but not implemented yet.`,
    `Case: ${redCase.id} ${redCase.title}`,
    `Target module or asset: ${modulePath}`
  ];

  if (redCase.notes && redCase.notes.length > 0) {
    lines.push("Expected behavior:");
    for (const note of redCase.notes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join("\n");
}

export function defineRedCases(suiteName: string, modulePath: string, redCases: RedCase[]): void {
  for (const redCase of redCases) {
    test(`${redCase.id} ${redCase.title}`, () => {
      throw new Error(buildMessage(suiteName, modulePath, redCase));
    });
  }
}
