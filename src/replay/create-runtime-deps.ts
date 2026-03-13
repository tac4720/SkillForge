import path from "node:path";

import { NodeFileSystem } from "../drivers/node-file-system.ts";
import { PlaywrightBrowserDriver } from "../drivers/playwright-browser-driver.ts";
import { NodeShellRunner } from "../drivers/node-shell-runner.ts";
import { BrowserRecorder } from "../recorder/browser-recorder.ts";
import { NonInteractiveApprovalGate } from "../security/non-interactive-approval-gate.ts";
import { createSecretProvider } from "../secrets/create-secret-provider.ts";
import { OpenClawExporter } from "../exporters/openclaw/index.ts";
import { ReplayEngine } from "./replay-engine.ts";
import { RunLogger } from "./run-logger.ts";

export function createRuntimeDeps(config: {
  cwd?: string;
  headless?: boolean;
  downloadsDir?: string;
  browserType?: "chromium";
  storageStatePath?: string;
  secretMode?: "env" | "local-vault" | "os-keychain";
  secretRootDir?: string;
  secretPassword?: string;
} = {}) {
  const cwd = config.cwd ?? process.cwd();
  const fileSystem = new NodeFileSystem();
  const browserDriver = new PlaywrightBrowserDriver({
    headless: config.headless,
    downloadsDir: config.downloadsDir ?? path.join(cwd, ".skillforge", "downloads"),
    browserType: config.browserType,
    storageStatePath: config.storageStatePath
  });
  const shellRunner = new NodeShellRunner();
  const approvalGate = new NonInteractiveApprovalGate("expired");
  const logger = new RunLogger({
    fileSystem,
    baseDir: path.join(cwd, ".skillforge", "runs")
  });
  const secretProvider = createSecretProvider({
    mode: config.secretMode ?? "env",
    rootDir: config.secretRootDir ?? path.join(cwd, ".skillforge", "secrets"),
    password: config.secretPassword ?? process.env.SKILLFORGE_SECRET_PASSWORD
  });

  const replayEngine = new ReplayEngine({
    browserDriver,
    shellRunner,
    fileSystem,
    approvalGate,
    logger,
    secretProvider
  });

  return {
    fileSystem,
    browserDriver,
    shellRunner,
    approvalGate,
    logger,
    secretProvider,
    replayEngine,
    recorder: new BrowserRecorder({
      fileSystem,
      baseDir: path.join(cwd, ".skillforge", "recordings")
    }),
    openClawExporter: new OpenClawExporter(),
    async close(): Promise<void> {
      await browserDriver.close?.();
    }
  };
}
