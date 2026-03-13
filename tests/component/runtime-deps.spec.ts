import path from "node:path";

import { describe, expect, it } from "vitest";

import { createRuntimeDeps } from "../../src/replay/create-runtime-deps.js";
import { makeTempDir } from "../helpers/fixtures.js";

describe("runtime deps", () => {
  it("RTDEP-001 creates runtime dependencies from default configuration", async () => {
    const previousPassword = process.env.SKILLFORGE_SECRET_PASSWORD;
    process.env.SKILLFORGE_SECRET_PASSWORD = "env-secret";
    const runtime = createRuntimeDeps();

    try {
      expect(runtime.logger.rootDir()).toBe(path.join(process.cwd(), ".skillforge", "runs"));
      expect(runtime.recorder).toBeDefined();
      expect(runtime.replayEngine).toBeDefined();
      expect(runtime.secretProvider).toBeDefined();
    } finally {
      await runtime.close();
      if (previousPassword === undefined) {
        delete process.env.SKILLFORGE_SECRET_PASSWORD;
      } else {
        process.env.SKILLFORGE_SECRET_PASSWORD = previousPassword;
      }
    }
  });

  it("RTDEP-002 creates runtime dependencies with explicit cwd paths", async () => {
    const cwd = await makeTempDir("skillforge-runtime-deps-");
    const runtime = createRuntimeDeps({ cwd });

    try {
      expect(runtime.logger.rootDir()).toBe(path.join(cwd, ".skillforge", "runs"));
      expect(runtime.recorder).toBeDefined();
      expect(runtime.replayEngine).toBeDefined();
      expect(runtime.secretProvider).toBeDefined();
    } finally {
      await runtime.close();
    }
  });

  it("RTDEP-003 accepts explicit runtime configuration", async () => {
    const cwd = await makeTempDir("skillforge-runtime-deps-explicit-");
    const downloadsDir = path.join(cwd, "downloads");
    const secretRootDir = path.join(cwd, "secrets");
    const runtime = createRuntimeDeps({
      cwd,
      headless: true,
      downloadsDir,
      browserType: "chromium",
      storageStatePath: path.join(cwd, "storage-state.json"),
      secretMode: "local-vault",
      secretRootDir,
      secretPassword: "password"
    });

    try {
      expect(runtime.browserDriver).toBeDefined();
      expect(runtime.openClawExporter).toBeDefined();
      expect(runtime.secretProvider).toBeDefined();
      expect(runtime.logger.rootDir()).toBe(path.join(cwd, ".skillforge", "runs"));
    } finally {
      await runtime.close();
    }
  });
});
