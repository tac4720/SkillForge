import fs from "node:fs/promises";
import path from "node:path";

import type { ExportArtifact } from "./exporter.ts";

export interface NativeSkillPackage {
  metadata: {
    name: string;
    version: string;
    license: string;
  };
  tests: Array<{
    id: string;
    input: Record<string, unknown>;
  }>;
  ir: Record<string, unknown>;
}

export interface NativePackageExportResult {
  artifacts: ExportArtifact[];
}

export interface NativePackageWriteResult {
  artifactPaths: string[];
}

export class NativePackageExporter {
  async exportPackage(skillPackage: NativeSkillPackage): Promise<NativePackageExportResult> {
    const artifacts: ExportArtifact[] = [
      {
        path: "skillforge.yaml",
        content: JSON.stringify(skillPackage.metadata, null, 2)
      },
      {
        path: "skill.ir.json",
        content: JSON.stringify(skillPackage.ir, null, 2)
      },
      ...skillPackage.tests.map((test) => ({
        path: `tests/${test.id}.json`,
        content: JSON.stringify(test, null, 2)
      }))
    ];

    return { artifacts };
  }

  async importPackage(artifacts: ExportArtifact[]): Promise<NativeSkillPackage> {
    const metadataArtifact = requireArtifact(artifacts, "skillforge.yaml");
    const irArtifact = requireArtifact(artifacts, "skill.ir.json");
    const tests = artifacts
      .filter((artifact) => artifact.path.startsWith("tests/"))
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((artifact) => JSON.parse(artifact.content) as NativeSkillPackage["tests"][number]);

    return {
      metadata: JSON.parse(metadataArtifact.content) as NativeSkillPackage["metadata"],
      tests,
      ir: JSON.parse(irArtifact.content) as NativeSkillPackage["ir"]
    };
  }

  async writeToDirectory(skillPackage: NativeSkillPackage, outDir: string): Promise<NativePackageWriteResult> {
    const exported = await this.exportPackage(skillPackage);
    await fs.mkdir(path.join(outDir, "tests"), { recursive: true });
    await Promise.all(
      exported.artifacts.map((artifact) =>
        fs.writeFile(path.join(outDir, artifact.path), artifact.content, "utf8")
      )
    );

    return {
      artifactPaths: exported.artifacts.map((artifact) => path.join(outDir, artifact.path))
    };
  }

  async importPackageFromDirectory(outDir: string): Promise<NativeSkillPackage> {
    const entries = await listFiles(outDir);
    const artifacts = await Promise.all(
      entries.map(async (entryPath) => ({
        path: path.relative(outDir, entryPath),
        content: await fs.readFile(entryPath, "utf8")
      }))
    );

    return this.importPackage(artifacts);
  }
}

function requireArtifact(artifacts: ExportArtifact[], path: string): ExportArtifact {
  const artifact = artifacts.find((candidate) => candidate.path === path);
  if (!artifact) {
    throw new Error(`Missing artifact: ${path}`);
  }
  return artifact;
}

async function listFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(entryPath)));
      continue;
    }

    files.push(entryPath);
  }

  return files.sort((left, right) => left.localeCompare(right));
}
