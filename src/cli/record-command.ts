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

const CLICK_LISTENER_SCRIPT = `
(function() {
  if (window.__skillforge_click_installed) return;
  window.__skillforge_click_installed = true;

  function buildCandidates(clicked, semantic) {
    var candidates = [];
    var targets = semantic && semantic !== clicked ? [clicked, semantic] : [clicked];

    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      if (!el || !el.tagName) continue;

      // id
      if (el.id) {
        candidates.push('css=#' + el.id);
      }
      // data-testid
      var testId = el.getAttribute && el.getAttribute('data-testid');
      if (testId) {
        candidates.push('css=[data-testid="' + testId + '"]');
      }
      // name attribute
      var name = el.getAttribute && el.getAttribute('name');
      if (name) {
        candidates.push('css=[name="' + name + '"]');
      }
      // aria-label
      var ariaLabel = el.getAttribute && el.getAttribute('aria-label');
      if (ariaLabel) {
        var tag = el.tagName.toLowerCase();
        var role = tag === 'button' ? 'button' : (tag === 'a' ? 'link' : el.getAttribute('role'));
        if (role) {
          candidates.push('role=' + role + '[name="' + ariaLabel + '"]');
        }
      }
      // CSS class selector (prefer BEM-style or descriptive classes)
      if (el.classList && el.classList.length > 0) {
        for (var c = 0; c < el.classList.length; c++) {
          var cls = el.classList[c];
          if (cls.length > 2 && !/^(active|show|hide|open|closed|visible|hidden|disabled|enabled|selected|focused)$/i.test(cls)) {
            candidates.push('css=.' + cls);
            break;
          }
        }
      }
      // Direct text of element (not descendants) — for short labels
      var directText = '';
      for (var n = el.firstChild; n; n = n.nextSibling) {
        if (n.nodeType === 3) directText += n.textContent;
      }
      directText = directText.trim();
      if (directText.length > 0 && directText.length <= 40) {
        candidates.push('text=' + JSON.stringify(directText));
      }
    }

    // Deduplicate
    var seen = {};
    var unique = [];
    for (var j = 0; j < candidates.length; j++) {
      if (!seen[candidates[j]]) {
        seen[candidates[j]] = true;
        unique.push(candidates[j]);
      }
    }
    return unique;
  }

  document.addEventListener('click', function(e) {
    var clicked = e.target;
    // Walk up to find semantic parent (button, link, role=button)
    var semantic = clicked;
    while (semantic && semantic !== document) {
      if (semantic.tagName === 'A' || semantic.tagName === 'BUTTON' || (semantic.getAttribute && semantic.getAttribute('role') === 'button') || semantic.onclick) break;
      semantic = semantic.parentElement;
    }
    if (!semantic || semantic === document) semantic = clicked;

    var candidates = buildCandidates(clicked, semantic);
    if (candidates.length === 0) {
      var tag = (semantic.tagName || 'unknown').toLowerCase();
      candidates = [tag];
    }

    if (!window.__skillforge_click_queue) window.__skillforge_click_queue = [];
    window.__skillforge_click_queue.push(candidates);
  }, true);
})();
`;

const INPUT_LISTENER_SCRIPT = `
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
`;

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

  // Inject scripts on every new document (survives page navigations)
  await cdp.send("Page.enable");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: CLICK_LISTENER_SCRIPT + "\n" + INPUT_LISTENER_SCRIPT
  });

  // Also inject into the current page immediately
  await cdp.send("Runtime.evaluate", { expression: CLICK_LISTENER_SCRIPT + "\n" + INPUT_LISTENER_SCRIPT });

  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) {
      recorder.recordNavigate(sessionId, frame.url());
    }
  });

  page.on("download", async (download) => {
    const fileName = download.suggestedFilename();
    recorder.recordDownload(sessionId, fileName);
  });

  startClickPoller(cdp, sessionId, recorder, page);
  startInputPoller(cdp, sessionId, recorder, page);
}

function startClickPoller(
  cdp: CDPSession,
  sessionId: string,
  recorder: BrowserRecorder,
  page: Page
): void {
  const poll = async () => {
    try {
      const result = await cdp.send("Runtime.evaluate", {
        expression: `
          (function() {
            var q = window.__skillforge_click_queue || [];
            window.__skillforge_click_queue = [];
            return JSON.stringify(q);
          })();
        `,
        returnByValue: true
      });
      const raw = result.result?.value;
      if (typeof raw === "string") {
        const clicks = JSON.parse(raw) as (string | string[])[];
        for (const entry of clicks) {
          if (Array.isArray(entry)) {
            if (entry.length > 0) {
              recorder.recordClickWithCandidates(sessionId, entry);
            }
          } else if (typeof entry === "string" && entry.length > 0) {
            recorder.recordClick(sessionId, entry);
          }
        }
      }
    } catch {
      // page may have been closed
    }
  };

  const interval = setInterval(poll, 150);
  page.on("close", () => clearInterval(interval));
}

function startInputPoller(
  cdp: CDPSession,
  sessionId: string,
  recorder: BrowserRecorder,
  page: Page
): void {
  const poll = async () => {
    try {
      const result = await cdp.send("Runtime.evaluate", {
        expression: `
          (function() {
            var pending = window.__skillforge_pending_inputs || {};
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
      // page may have been closed
    }
  };

  const interval = setInterval(poll, 250);
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
