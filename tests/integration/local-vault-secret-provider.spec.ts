import fs from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createSecretProvider } from "../../src/secrets/create-secret-provider.js";
import { OpenClawExporter } from "../../src/exporters/openclaw/index.js";
import { ReplayEngine } from "../../src/replay/replay-engine.js";
import { RunLogger } from "../../src/replay/run-logger.js";
import { SecretProviderError } from "../../src/secrets/secret-provider.js";
import { FakeApprovalGate } from "../fakes/fake-approval-gate.js";
import { FakeBrowserDriver } from "../fakes/fake-browser-driver.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";
import { FakeShellRunner } from "../fakes/fake-shell-runner.js";
import { makeTempDir } from "../helpers/fixtures.js";

describe("local-vault secret-provider integration", () => {
  it("VAULT-001 set/get roundtrip", async () => {
    const rootDir = await makeTempDir("skillforge-vault-");
    const provider = createSecretProvider({ mode: "local-vault", rootDir, password: "test-pass" });

    await provider.set!("vendor_login", "super-secret");

    expect(await provider.get("vendor_login")).toBe("super-secret");
  });

  it("VAULT-002 raw vault file does not contain plain secret", async () => {
    const rootDir = await makeTempDir("skillforge-vault-");
    const provider = createSecretProvider({ mode: "local-vault", rootDir, password: "test-pass" });

    await provider.set!("vendor_login", "super-secret");

    const raw = await fs.readFile(path.join(rootDir, "local-vault.json"), "utf8");
    expect(raw).not.toContain("super-secret");
  });

  it("VAULT-003 wrong password or wrong key fails deterministically", async () => {
    const rootDir = await makeTempDir("skillforge-vault-");
    const writer = createSecretProvider({ mode: "local-vault", rootDir, password: "right-pass" });
    const reader = createSecretProvider({ mode: "local-vault", rootDir, password: "wrong-pass" });

    await writer.set!("vendor_login", "super-secret");

    await expect(reader.get("vendor_login")).rejects.toBeInstanceOf(SecretProviderError);
  });

  it("VAULT-004 replay engine can resolve secret ref via provider", async () => {
    const rootDir = await makeTempDir("skillforge-vault-");
    const provider = createSecretProvider({ mode: "local-vault", rootDir, password: "test-pass" });
    await provider.set!("vendor_login", "super-secret");

    const shellRunner = new FakeShellRunner();
    const engine = new ReplayEngine({
      browserDriver: new FakeBrowserDriver(),
      shellRunner,
      fileSystem: new InMemoryFileSystem(),
      approvalGate: new FakeApprovalGate(),
      logger: new RunLogger({ fileSystem: new InMemoryFileSystem(), baseDir: "/runs" }),
      secretProvider: provider,
      createRunId: () => "run-001",
      now: () => new Date("2026-03-13T00:00:00.000Z")
    });

    const result = await engine.run(
      {
        name: "secret-replay",
        version: "0.1.0",
        actor: "test",
        inputsSchema: {},
        permissions: {
          shell: {
            allow: ["echo"]
          }
        },
        steps: [
          {
            id: "step-001",
            type: "shell.exec",
            with: {
              command: "echo",
              args: ["{{secrets.vendor_login}}"]
            }
          }
        ],
        assertions: []
      },
      { mode: "autopilot", inputs: {} }
    );

    expect(result.status).toBe("passed");
    expect(shellRunner.history[0]?.args).toEqual(["super-secret"]);
  });

  it("VAULT-005 exported artifacts never embed resolved secret value", async () => {
    const rootDir = await makeTempDir("skillforge-vault-");
    const provider = createSecretProvider({ mode: "local-vault", rootDir, password: "test-pass" });
    await provider.set!("vendor_login", "super-secret");
    const exporter = new OpenClawExporter();

    const result = await exporter.export(
      {
        name: "secret-export",
        description: "Uses {{secrets.vendor_login}}",
        steps: [{ type: "browser.navigate" }],
        secrets: ["super-secret"]
      },
      { skillPath: "/tmp/secret-export" }
    );

    const contents = result.artifacts.map((artifact) => artifact.content).join("\n");
    expect(contents).not.toContain("super-secret");
  });
});
