import { spawn } from "node:child_process";

import type { ShellRunOptions, ShellRunResult, ShellRunner } from "./shell-runner.ts";

export class NodeShellRunner implements ShellRunner {
  async run(command: string, args: string[], options?: ShellRunOptions): Promise<ShellRunResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"]
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = options?.timeoutMs
        ? setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, options.timeoutMs)
        : null;

      child.stdout.on("data", (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      child.on("close", (code) => {
        if (timer) {
          clearTimeout(timer);
        }

        resolve({
          exitCode: code,
          stdout,
          stderr,
          timedOut
        });
      });

      child.on("error", (error) => {
        if (timer) {
          clearTimeout(timer);
        }

        resolve({
          exitCode: 1,
          stdout,
          stderr: error.message,
          timedOut
        });
      });
    });
  }
}
