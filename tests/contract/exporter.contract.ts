import { describe, expect, it } from "vitest";

import { ExporterError, MemoryExporter } from "../../src/exporters/exporter.js";

describe("exporter contract", () => {
  it("EXP-C-001 generates the full artifact set", async () => {
    const exporter = new MemoryExporter(["browser.navigate"]);
    const result = await exporter.export({
      name: "invoice-download",
      steps: [{ type: "browser.navigate" }]
    });

    expect(result.artifacts.map((artifact) => artifact.path)).toEqual([
      "SKILL.md",
      "skill.json",
      "skill.ir.json"
    ]);
  });

  it("EXP-C-002 fails fast on unsupported steps", async () => {
    const exporter = new MemoryExporter(["browser.navigate"]);

    await expect(
      exporter.export({
        name: "invoice-download",
        steps: [{ type: "shell.exec" }]
      })
    ).rejects.toBeInstanceOf(ExporterError);
  });

  it("EXP-C-003 does not embed secret values", async () => {
    const exporter = new MemoryExporter(["browser.navigate"]);
    const result = await exporter.export({
      name: "invoice-download",
      steps: [{ type: "browser.navigate" }],
      description: "password=hunter2",
      secrets: ["hunter2"]
    });

    const contents = result.artifacts.map((artifact) => artifact.content).join("\n");
    expect(contents).not.toContain("hunter2");
    expect(contents).toContain("[REDACTED]");
  });
});
