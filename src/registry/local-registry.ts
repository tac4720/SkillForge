import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

import { loadSkillFile } from "../core/skill-loader.ts";

export interface RegistryPackage {
  name: string;
  version: string;
  permissions: Record<string, unknown>;
  content: string;
  checksum?: string;
}

export interface RegistryListItem {
  name: string;
  version: string;
  enabled: boolean;
}

interface RegistryState {
  versions: Map<string, RegistryPackage>;
  currentVersion?: string;
  enabled: boolean;
  history: string[];
}

function flattenPermissions(value: unknown, prefix = ""): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => `${prefix} +${String(item)}`);
  }

  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, child]) => flattenPermissions(child, prefix ? `${prefix}.${key}` : key));
  }

  return [];
}

export class LocalRegistry {
  private readonly packages = new Map<string, RegistryState>();

  async installFromSkillFile(filePath: string): Promise<RegistryPackage> {
    const loaded = await loadSkillFile<Record<string, unknown>>(filePath, { cwd: process.cwd() });
    if (!loaded) {
      throw new Error(`Missing skill file: ${filePath}`);
    }

    const rawContent = await fs.readFile(loaded.filePath, "utf8");
    const pkg: RegistryPackage = {
      name: String(loaded.skill.name ?? path.basename(loaded.directoryPath)),
      version: String(loaded.skill.version ?? "0.1.0"),
      permissions: (loaded.skill.permissions as Record<string, unknown>) ?? {},
      content: rawContent,
      checksum: computeChecksum(rawContent)
    };

    this.install(pkg);
    return pkg;
  }

  install(pkg: RegistryPackage): void {
    const state = this.packages.get(pkg.name) ?? {
      versions: new Map<string, RegistryPackage>(),
      enabled: false,
      history: []
    };

    state.versions.set(pkg.version, pkg);
    if (!state.currentVersion) {
      state.currentVersion = pkg.version;
    }

    this.packages.set(pkg.name, state);
  }

  list(): RegistryListItem[] {
    return [...this.packages.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([name, state]) => {
        const version = state.currentVersion;
        return version
          ? [
              {
                name,
                version,
                enabled: state.enabled
              }
            ]
          : [];
      });
  }

  get(name: string): RegistryListItem | undefined {
    return this.list().find((item) => item.name === name);
  }

  remove(name: string): void {
    this.packages.delete(name);
  }

  enable(name: string, version?: string): void {
    const state = this.requireState(name);
    if (version) {
      this.requirePackage(name, version);
      state.currentVersion = version;
    }
    state.enabled = true;
  }

  disable(name: string): void {
    this.requireState(name).enabled = false;
  }

  pinVersion(name: string, version: string): void {
    const state = this.requireState(name);
    this.requirePackage(name, version);
    if (state.currentVersion && state.currentVersion !== version) {
      state.history.push(state.currentVersion);
    }
    state.currentVersion = version;
  }

  rollback(name: string): void {
    const state = this.requireState(name);
    const previous = state.history.pop();
    if (previous) {
      state.currentVersion = previous;
    }
  }

  verify(name: string, version: string): boolean {
    const pkg = this.requirePackage(name, version);
    if (!pkg.checksum) {
      return true;
    }

    return computeChecksum(pkg.content) === pkg.checksum;
  }

  diffPermissions(
    previousPermissions: Record<string, unknown>,
    nextPermissions: Record<string, unknown>
  ): string[] {
    const previous = new Set(flattenPermissions(previousPermissions));
    return flattenPermissions(nextPermissions).filter((entry) => !previous.has(entry));
  }

  private requireState(name: string): RegistryState {
    const state = this.packages.get(name);
    if (!state) {
      throw new Error(`Missing package: ${name}`);
    }
    return state;
  }

  private requirePackage(name: string, version: string): RegistryPackage {
    const state = this.requireState(name);
    const pkg = state.versions.get(version);
    if (!pkg) {
      throw new Error(`Missing package version: ${name}@${version}`);
    }
    return pkg;
  }
}

function computeChecksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}
