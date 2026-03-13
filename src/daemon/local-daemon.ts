import http from "node:http";

import {
  loadSkillFile,
  toOpenClawSkillDocument,
  toReplaySkillDocument
} from "../core/skill-loader.ts";
import type { OpenClawExporter } from "../exporters/openclaw/index.ts";
import type { BrowserRecorder } from "../recorder/browser-recorder.ts";
import type { ReplayEngine } from "../replay/replay-engine.ts";

export interface DaemonResponse {
  status: number;
  body: Record<string, unknown>;
}

export interface LocalDaemonOptions {
  recorder: BrowserRecorder;
  replayEngine: ReplayEngine;
  openClawExporter: OpenClawExporter;
  skillRoot?: string;
}

export class LocalDaemon {
  private readonly recorder: BrowserRecorder;
  private readonly replayEngine: ReplayEngine;
  private readonly openClawExporter: OpenClawExporter;
  private readonly skillRoot: string;
  private running = false;
  private server: http.Server | null = null;
  private baseUrlValue: string | null = null;

  constructor(options: LocalDaemonOptions) {
    this.recorder = options.recorder;
    this.replayEngine = options.replayEngine;
    this.openClawExporter = options.openClawExporter;
    this.skillRoot = options.skillRoot ?? process.cwd();
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.server = http.createServer(async (request, response) => {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const body = await readJsonBody(request);
      if (body instanceof Error) {
        response.statusCode = 400;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ error: "invalid_json" }));
        return;
      }

      const result = await this.handleRequest(method, url.pathname, body);
      response.statusCode = result.status;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(result.body));
    });

    await new Promise<void>((resolve) => {
      this.server?.listen(0, "127.0.0.1", () => resolve());
    });

    const address = this.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to bind daemon server.");
    }

    this.baseUrlValue = `http://127.0.0.1:${address.port}`;
    this.running = true;
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve, reject) => {
        this.server?.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
    this.server = null;
    this.baseUrlValue = null;
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  baseUrl(): string {
    if (!this.baseUrlValue) {
      throw new Error("Daemon server is not running.");
    }
    return this.baseUrlValue;
  }

  async handleRequest(method: string, path: string, body: Record<string, unknown>): Promise<DaemonResponse> {
    if (!this.running) {
      return {
        status: 503,
        body: { error: "daemon_not_running" }
      };
    }

    if (method === "POST" && path === "/api/v1/recordings/start") {
      const { sessionId } = await this.recorder.start();
      return { status: 200, body: { sessionId } };
    }

    if (method === "POST" && path === "/api/v1/recordings/stop") {
      const sessionId = typeof body.sessionId === "string" ? body.sessionId : null;
      if (!sessionId) {
        return { status: 400, body: { error: "missing_session_id" } };
      }
      const session = await this.recorder.stop(sessionId);
      return { status: 200, body: session as unknown as Record<string, unknown> };
    }

    const replayMatch = path.match(/^\/api\/v1\/skills\/([^/]+)\/replay$/u);
    if (method === "POST" && replayMatch) {
      const skillName = replayMatch[1] ?? "skill";
      const loaded = await loadSkillFile<Record<string, unknown>>(skillName, { cwd: this.skillRoot });
      const result = await this.replayEngine.run(
        loaded
          ? toReplaySkillDocument(loaded.skill, skillName, "daemon")
          : {
              name: skillName,
              version: "0.1.0",
              actor: "daemon",
              inputsSchema: {},
              permissions: {},
              steps: [],
              assertions: []
            },
        {
          mode: String(body.mode ?? "autopilot") as "dry-run" | "assist" | "autopilot",
          inputs: (body.inputs as Record<string, unknown>) ?? {}
        }
      );
      return { status: 200, body: result as unknown as Record<string, unknown> };
    }

    const exportMatch = path.match(/^\/api\/v1\/skills\/([^/]+)\/export$/u);
    if (method === "POST" && exportMatch) {
      if (body.target !== "openclaw") {
        return { status: 400, body: { error: "unsupported_target" } };
      }

      const skillName = exportMatch[1] ?? "skill";
      const loaded = await loadSkillFile<Record<string, unknown>>(skillName, { cwd: this.skillRoot });
      const outDir = typeof body.outDir === "string" ? body.outDir : undefined;
      if (!outDir) {
        return { status: 400, body: { error: "missing_out_dir" } };
      }

      const result = await this.openClawExporter.writeToDirectory(
        loaded ? toOpenClawSkillDocument(loaded.skill, skillName) : { name: skillName, steps: [] },
        {
          skillPath: loaded?.filePath ?? `/skills/${skillName}`,
          outDir
        }
      );
      return {
        status: 200,
        body: {
          artifactPaths: result.artifactPaths
        }
      };
    }

    return {
      status: 400,
      body: { error: "bad_request" }
    };
  }
}

async function readJsonBody(request: http.IncomingMessage): Promise<Record<string, unknown> | Error> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch (error) {
    return error instanceof Error ? error : new Error("Invalid JSON");
  }
}
