import { test } from "@playwright/test";

export type PlaywrightRedCase = {
  id: string;
  title: string;
  notes?: string[];
};

function buildMessage(specName: string, target: string, redCase: PlaywrightRedCase): string {
  const lines = [
    `RED: ${specName} is specified but not implemented yet.`,
    `Case: ${redCase.id} ${redCase.title}`,
    `Target flow or fixture: ${target}`
  ];

  if (redCase.notes && redCase.notes.length > 0) {
    lines.push("Expected behavior:");
    for (const note of redCase.notes) {
      lines.push(`- ${note}`);
    }
  }

  return lines.join("\n");
}

export function definePlaywrightRedCases(
  specName: string,
  target: string,
  redCases: PlaywrightRedCase[]
): void {
  for (const redCase of redCases) {
    test(`${redCase.id} ${redCase.title}`, async () => {
      throw new Error(buildMessage(specName, target, redCase));
    });
  }
}
