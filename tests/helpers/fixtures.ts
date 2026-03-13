import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";

export interface FixtureServer {
  baseUrl: string;
  stop(): Promise<void>;
  setWatcherContent(content: string): void;
  setDynamicButtonText(text: string): void;
}

export class TestClock {
  private currentTime: number;

  constructor(startAt = "2026-03-13T00:00:00.000Z") {
    this.currentTime = new Date(startAt).getTime();
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  tick(milliseconds: number): Date {
    this.currentTime += milliseconds;
    return this.now();
  }
}

export async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function assertFileExists(filePath: string): Promise<void> {
  await fs.stat(filePath);
}

export function fixtureAppPath(appName: string, ...segments: string[]): string {
  return path.join("tests", "fixtures", "apps", appName, ...segments);
}

export function fixtureSkillPath(skillName: string, ...segments: string[]): string {
  return path.join("tests", "fixtures", "skills", skillName, ...segments);
}

export async function loadFixtureSkill<T>(skillName: string): Promise<T> {
  return JSON.parse(await fs.readFile(fixtureSkillPath(skillName, "skill.ir.json"), "utf8")) as T;
}

export async function loadFixtureInputs(skillName: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(fixtureSkillPath(skillName, "inputs.example.json"), "utf8")) as Record<
    string,
    unknown
  >;
}

export async function startFixtureServer(): Promise<FixtureServer> {
  const state = {
    watcherContent: "Initial content",
    dynamicButtonText: "Download PDF",
    dynamicSequence: 0
  };

  const server = http.createServer((request, response) => {
    void handleFixtureRequest(request, response, state).catch((error: unknown) => {
      response.statusCode = 500;
      response.setHeader("Content-Type", "text/plain; charset=utf-8");
      response.end(error instanceof Error ? error.message : "fixture_server_error");
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to start fixture server.");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    async stop() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
    setWatcherContent(content: string) {
      state.watcherContent = content;
    },
    setDynamicButtonText(text: string) {
      state.dynamicButtonText = text;
    }
  };
}

async function handleFixtureRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  state: {
    watcherContent: string;
    dynamicButtonText: string;
    dynamicSequence: number;
  }
): Promise<void> {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (url.pathname === "/login") {
    sendHtml(response, await renderFixturePage("invoice-portal", "login.html"));
    return;
  }

  if (url.pathname === "/dashboard") {
    sendHtml(response, await renderFixturePage("invoice-portal", "dashboard.html"));
    return;
  }

  if (url.pathname === "/invoices") {
    const month = url.searchParams.get("month") ?? "unknown";
    sendHtml(
      response,
      await renderFixturePage("invoice-portal", "invoices.html", {
        month,
        dynamicButtonText: state.dynamicButtonText,
        invoiceDynamicId: nextDynamicId(state)
      })
    );
    return;
  }

  if (url.pathname === "/download") {
    const month = url.searchParams.get("month") ?? "unknown";
    response.statusCode = 200;
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${month}.pdf"`);
    response.end(`PDF for ${month}`);
    return;
  }

  if (url.pathname === "/watch") {
    sendHtml(
      response,
      await renderFixturePage("change-watcher", "index.html", {
        watcherContent: state.watcherContent
      })
    );
    return;
  }

  if (url.pathname === "/dynamic") {
    sendHtml(
      response,
      await renderFixturePage("dynamic-id", "index.html", {
        dynamicButtonId: nextDynamicId(state),
        dynamicButtonText: state.dynamicButtonText
      })
    );
    return;
  }

  if (url.pathname === "/modal") {
    sendHtml(
      response,
      await renderFixturePage("delayed-modal", "index.html", {
        modalArmed: url.searchParams.get("show") === "1" ? "true" : "false"
      })
    );
    return;
  }

  if (url.pathname === "/redirect-trap") {
    sendHtml(
      response,
      await renderFixturePage("redirect-trap", "index.html", {
        redirectTarget: "https://evil.example/phishing"
      })
    );
    return;
  }

  response.statusCode = 404;
  response.end("not found");
}

function nextDynamicId(state: { dynamicSequence: number }): string {
  state.dynamicSequence += 1;
  return `btn-${state.dynamicSequence.toString().padStart(4, "0")}`;
}

async function renderFixturePage(
  appName: string,
  fileName: string,
  variables: Record<string, string> = {}
): Promise<string> {
  const template = await fs.readFile(fixtureAppPath(appName, fileName), "utf8");
  return Object.entries(variables).reduce(
    (content, [key, value]) => content.replaceAll(`{{${key}}}`, value),
    template
  );
}

function sendHtml(response: http.ServerResponse, html: string): void {
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(html);
}
