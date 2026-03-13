import { LocalDaemon } from "./local-daemon.ts";
import { createRuntimeDeps } from "../replay/create-runtime-deps.ts";

export function createDaemonServer(config: {
  cwd?: string;
  headless?: boolean;
  downloadsDir?: string;
  storageStatePath?: string;
} = {}): {
  daemon: LocalDaemon;
  close(): Promise<void>;
} {
  const runtime = createRuntimeDeps(config);

  return {
    daemon: new LocalDaemon({
      recorder: runtime.recorder,
      replayEngine: runtime.replayEngine,
      openClawExporter: runtime.openClawExporter,
      skillRoot: config.cwd ?? process.cwd()
    }),
    close: runtime.close
  };
}
