import fs from "node:fs/promises";
import path from "node:path";

import { saveSkillPackageToDir } from "../package/load-skill-package.ts";
import type { SkillPackage } from "../package/skill-package-schema.ts";

export interface ExportResult {
  files: string[];
}

const SUPPORTED_STEPS = new Set([
  "browser.navigate",
  "browser.click",
  "browser.input",
  "browser.waitFor",
  "browser.download",
  "file.copy",
  "shell.exec"
]);

export async function exportMcp(skill: SkillPackage, outDir: string): Promise<ExportResult> {
  for (const step of skill.steps) {
    if (typeof step.type !== "string" || !SUPPORTED_STEPS.has(step.type)) {
      throw new Error(`Unsupported step: ${String(step.type ?? "unknown")}`);
    }
  }

  await fs.mkdir(outDir, { recursive: true });
  await saveSkillPackageToDir(skill, outDir);

  const manifest = {
    name: skill.metadata.name,
    description: skill.metadata.description ?? "",
    inputSchema: skill.inputs ?? {},
    outputSchema: skill.outputs ?? {},
    permissions: skill.permissions ?? {}
  };

  const serverPath = path.join(outDir, "server.js");
  const manifestPath = path.join(outDir, "tool_manifest.json");
  const readmePath = path.join(outDir, "README.md");

  await fs.writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2),
    "utf8"
  );
  await fs.writeFile(
    readmePath,
    `# ${skill.metadata.name}\n\nMCP wrapper for local SkillForge replay.\n`,
    "utf8"
  );
  await fs.writeFile(
    serverPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const input = process.argv[2] ? JSON.parse(process.argv[2]) : {};
const skillDir = ${JSON.stringify(outDir)};
const args = Object.entries(input).flatMap(([key, value]) => ["--input", \`\${key}=\${String(value)}\`]);
const line = ("skillforge replay " + skillDir + " " + args.join(" ")).trim();
if (process.env.SKILLFORGE_MCP_TEST_MODE === "1") {
  fs.writeSync(process.stdout.fd, line + "\\n");
  process.exitCode = 0;
  return;
}
fs.writeSync(process.stdout.fd, line + "\\n");
`,
    "utf8"
  );

  return {
    files: [serverPath, manifestPath, readmePath, path.join(outDir, "skillforge.yaml")]
  };
}
