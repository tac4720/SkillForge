import fs from "node:fs/promises";
import path from "node:path";

import { validateSkillPackageDocument, type SkillPackage } from "./skill-package-schema.ts";

export async function loadSkillPackageFromDir(dir: string): Promise<SkillPackage> {
  const filePath = path.join(dir, "skillforge.yaml");
  const content = await fs.readFile(filePath, "utf8");
  const document = parseStructuredDocument(content);
  const validation = validateSkillPackageDocument(document);

  if (!validation.ok) {
    const [firstError] = validation.errors;
    throw new Error(`Invalid skill package at ${firstError?.path ?? "document"}: ${firstError?.message ?? "unknown"}`);
  }

  return {
    ...(document as SkillPackage),
    rootDir: dir
  };
}

export async function saveSkillPackageToDir(skill: SkillPackage, dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const { rootDir: _rootDir, ...serializable } = skill;
  await fs.writeFile(path.join(dir, "skillforge.yaml"), JSON.stringify(serializable, null, 2), "utf8");
}

function parseStructuredDocument(content: string): unknown {
  return JSON.parse(content) as unknown;
}
