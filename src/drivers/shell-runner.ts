export interface ShellRunOptions {
  timeoutMs?: number;
}

export interface ShellRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

export interface ShellRunner {
  run(command: string, args: string[], options?: ShellRunOptions): Promise<ShellRunResult>;
}
