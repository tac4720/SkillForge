import fs from "node:fs/promises";
import path from "node:path";

import { chromium, type BrowserContext, type CDPSession, type Page } from "playwright";

import { normalizeRecordedEvents } from "../core/event-normalizer.ts";
import { NodeFileSystem } from "../drivers/node-file-system.ts";
import { BrowserRecorder } from "../recorder/browser-recorder.ts";

export interface RecordOptions {
  url: string;
  name?: string;
  outDir?: string;
  cwd: string;
  headless?: boolean;
}

export interface RecordResult {
  skillPath: string;
  eventCount: number;
  stepCount: number;
  warnings: string[];
}

export async function recordCommand(options: RecordOptions): Promise<RecordResult> {
  const skillName = options.name ?? deriveSkillName(options.url);
  const outDir = options.outDir ?? path.join(options.cwd, skillName);

  const fileSystem = new NodeFileSystem();
  const recorder = new BrowserRecorder({
    fileSystem,
    baseDir: path.join(options.cwd, ".skillforge", "recordings")
  });

  const { sessionId } = await recorder.start();

  const browser = await chromium.launch({ headless: options.headless ?? false });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  await attachCdpRecorder(sessionId, recorder, page, context);

  recorder.recordNavigate(sessionId, options.url);
  await page.goto(options.url, { waitUntil: "load", timeout: 15000 });

  const closePromise = new Promise<void>((resolve) => {
    page.on("close", () => resolve());
    context.on("close", () => resolve());
    browser.on("disconnected", () => resolve());
  });

  process.stderr.write(`Recording started. Interact with the browser.\nClose the browser window or press Ctrl+C to stop.\n`);

  const abort = () => {
    browser.close().catch(() => undefined);
  };
  process.on("SIGINT", abort);
  process.on("SIGTERM", abort);

  await closePromise;

  process.removeListener("SIGINT", abort);
  process.removeListener("SIGTERM", abort);

  const session = await recorder.stop(sessionId);
  await browser.close().catch(() => undefined);

  const draft = normalizeRecordedEvents(session.events);

  const skill = {
    name: skillName,
    version: "0.1.0",
    actor: "user",
    inputs: draft.inputs,
    permissions: draft.permissions,
    steps: draft.steps,
    assertions: draft.assertions
  };

  await fs.mkdir(outDir, { recursive: true });
  const skillPath = path.join(outDir, "skill.ir.json");
  await fs.writeFile(skillPath, JSON.stringify(skill, null, 2) + "\n", "utf8");

  const inputsPath = path.join(outDir, "inputs.example.json");
  await fs.writeFile(inputsPath, JSON.stringify({}, null, 2) + "\n", "utf8");

  return {
    skillPath,
    eventCount: session.events.length,
    stepCount: draft.steps.length,
    warnings: [...session.warnings, ...draft.warnings]
  };
}

async function attachCdpRecorder(
  sessionId: string,
  recorder: BrowserRecorder,
  page: Page,
  context: BrowserContext
): Promise<void> {
  const cdp = await context.newCDPSession(page);

  await cdp.send("DOM.enable");
  await cdp.send("Runtime.enable");

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      recorder.recordNavigate(sessionId, frame.url());
    }
  });

  page.on("download", async (download) => {
    const fileName = download.suggestedFilename();
    recorder.recordDownload(sessionId, fileName);
  });

  await installClickListener(cdp, sessionId, recorder, page);
  await installInputListener(cdp, sessionId, recorder, page);
}

async function installClickListener(
  cdp: CDPSession,
  sessionId: string,
  recorder: BrowserRecorder,
  page: Page
): Promise<void> {
  await cdp.send("Runtime.evaluate", {
    expression: `
      (function() {
        if (window.__skillforge_click_installed) return;
        window.__skillforge_click_installed = true;
        document.addEventListener('click', function(e) {
          var target = e.target;
          var selector = '';
          if (target.id) {
            selector = '#' + target.id;
          } else if (target.getAttribute && target.getAttribute('name')) {
            selector = '[name="' + target.getAttribute('name') + '"]';
          } else if (target.getAttribute && target.getAttribute('data-testid')) {
            selector = '[data-testid="' + target.getAttribute('data-testid') + '"]';
          } else {
            var tag = target.tagName ? target.tagName.toLowerCase() : 'unknown';
            var text = (target.textContent || '').trim().substring(0, 40);
            if (text) {
              selector = 'text=' + JSON.stringify(text);
            } else {
              selector = tag;
            }
          }
          window.__skillforge_last_click = selector;
        }, true);
      })();
    `
  });

  const pollClicks = async () => {
    try {
      const result = await cdp.send("Runtime.evaluate", {
        expression: `
          (function() {
            var s = window.__skillforge_last_click;
            window.__skillforge_last_click = null;
            return s;
          })();
        `,
        returnByValue: true
      });
      const selector = result.result?.value;
      if (typeof selector === "string" && selector.length > 0) {
        recorder.recordClick(sessionId, selector);
      }
    } catch {
      return;
    }
  };

  const interval = setInterval(pollClicks, 200);
  page.on("close", () => clearInterval(interval));
}

async function installInputListener(
  cdp: CDPSession,
  sessionId: string,
  recorder: BrowserRecorder,
  page: Page
): Promise<void> {
  await cdp.send("Runtime.evaluate", {
    expression: `
      (function() {
        if (window.__skillforge_input_installed) return;
        window.__skillforge_input_installed = true;
        window.__skillforge_pending_inputs = {};
        document.addEventListener('input', function(e) {
          var target = e.target;
          var selector = '';
          if (target.id) {
            selector = '#' + target.id;
          } else if (target.getAttribute && target.getAttribute('name')) {
            selector = '[name="' + target.getAttribute('name') + '"]';
          } else {
            selector = (target.tagName || 'input').toLowerCase();
          }
          window.__skillforge_pending_inputs[selector] = {
            selector: selector,
            value: target.value || '',
            type: (target.type || '').toLowerCase()
          };
        }, true);

        document.addEventListener('change', function(e) {
          var target = e.target;
          var selector = '';
          if (target.id) {
            selector = '#' + target.id;
          } else if (target.getAttribute && target.getAttribute('name')) {
            selector = '[name="' + target.getAttribute('name') + '"]';
          } else {
            selector = (target.tagName || 'input').toLowerCase();
          }
          var tag = (target.tagName || '').toLowerCase();
          if (tag === 'select') {
            window.__skillforge_pending_inputs[selector] = {
              selector: selector,
              value: target.value || '',
              type: 'select'
            };
          }
        }, true);
      })();
    `
  });

  const pollInputs = async () => {
    try {
      const result = await cdp.send("Runtime.evaluate", {
        expression: `
          (function() {
            var pending = window.__skillforge_pending_inputs;
            window.__skillforge_pending_inputs = {};
            return JSON.stringify(pending);
          })();
        `,
        returnByValue: true
      });
      const raw = result.result?.value;
      if (typeof raw !== "string") return;
      const pending = JSON.parse(raw) as Record<string, { selector: string; value: string; type: string }>;
      for (const entry of Object.values(pending)) {
        if (entry.type === "select") {
          recorder.recordSelect(sessionId, entry.selector, entry.value);
        } else {
          const isSecret = /(password|otp|token|secret)/iu.test(entry.selector) || entry.type === "password";
          recorder.recordInput(sessionId, entry.selector, entry.value, { secret: isSecret });
        }
      }
    } catch {
      return;
    }
  };

  const interval = setInterval(pollInputs, 300);
  page.on("close", () => clearInterval(interval));
}

function deriveSkillName(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./u, "").replace(/\./gu, "-");
    const pathSegment = parsed.pathname
      .replace(/^\/|\/$/gu, "")
      .replace(/\//gu, "-")
      .replace(/[^a-z0-9-]/giu, "");
    return pathSegment ? `${host}-${pathSegment}` : host;
  } catch {
    return "recorded-skill";
  }
}
