import type { ShellRunOptions, ShellRunResult, ShellRunner } from "../../src/drivers/shell-runner.js";

function keyFor(command: string, args: string[]): string {
  return `${command}\u0000${args.join("\u0000")}`;
}

export class FakeShellRunner implements ShellRunner {
  readonly history: Array<{ command: string; args: string[]; options?: ShellRunOptions }> = [];
  private readonly results = new Map<string, ShellRunResult>();

  setResult(command: string, args: string[], result: ShellRunResult): void {
    this.results.set(keyFor(command, args), result);
  }

  async run(command: string, args: string[], options?: ShellRunOptions): Promise<ShellRunResult> {
    this.history.push({ command, args, options });
    return (
      this.results.get(keyFor(command, args)) ?? {
        exitCode: 0,
        stdout: "",
        stderr: ""
      }
    );
  }
}
