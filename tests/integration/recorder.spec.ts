import { EventEmitter } from "node:events";

import { describe, expect, it } from "vitest";

import { normalizeRecordedEvents } from "../../src/core/event-normalizer.js";
import { BrowserRecorder } from "../../src/recorder/browser-recorder.js";
import { InMemoryFileSystem } from "../fakes/in-memory-filesystem.js";

class StubPage extends EventEmitter {
  currentUrl = "about:blank";

  async goto(url: string): Promise<void> {
    this.currentUrl = url;
  }

  async click(_selector: string): Promise<void> {
    return;
  }

  async fill(_selector: string, _value: string): Promise<void> {
    return;
  }

  async selectOption(_selector: string, _value: unknown): Promise<void> {
    return;
  }

  async check(_selector: string): Promise<void> {
    return;
  }

  async uncheck(_selector: string): Promise<void> {
    return;
  }

  async hover(_selector: string): Promise<void> {
    return;
  }

  emitDownload(fileName: string): void {
    this.emit("download", {
      suggestedFilename: async () => fileName
    });
  }
}

function createRecorder() {
  const fileSystem = new InMemoryFileSystem();
  const recorder = new BrowserRecorder({
    fileSystem,
    baseDir: "/recordings",
    now: () => new Date("2026-03-13T00:00:00.000Z")
  });

  return { recorder, fileSystem };
}

describe("recorder integration", () => {
  it("REC2-001 captures navigate", async () => {
    const { recorder } = createRecorder();
    const page = new StubPage();
    const { sessionId } = await recorder.start();
    await recorder.attachPage(sessionId, page);

    await page.goto("https://portal.vendor.example/login");
    const session = await recorder.stop(sessionId);

    expect(session.events.some((event) => event.type === "navigate")).toBe(true);
  });

  it("REC2-002 captures click", async () => {
    const { recorder } = createRecorder();
    const page = new StubPage();
    const { sessionId } = await recorder.start();
    await recorder.attachPage(sessionId, page);

    await page.click('role=button[name="Login"]');
    const session = await recorder.stop(sessionId);

    expect(session.events.some((event) => event.type === "click")).toBe(true);
  });

  it("REC2-003 captures input", async () => {
    const { recorder } = createRecorder();
    const page = new StubPage();
    const { sessionId } = await recorder.start();
    await recorder.attachPage(sessionId, page);

    await page.fill('role=textbox[name="Email"]', "user@example.com");
    const session = await recorder.stop(sessionId);

    expect(session.events.some((event) => event.type === "input" && event.value === "user@example.com")).toBe(true);
  });

  it("REC2-004 captures select/checkbox where supported", async () => {
    const { recorder } = createRecorder();
    const page = new StubPage();
    const { sessionId } = await recorder.start();
    await recorder.attachPage(sessionId, page);

    await page.selectOption('role=combobox[name="Month"]', "2026-03");
    await page.check('role=checkbox[name="Include paid"]');
    const session = await recorder.stop(sessionId);

    expect(session.events.map((event) => event.type)).toEqual(["select", "checkbox"]);
  });

  it("REC2-005 captures pause/resume boundaries", async () => {
    const { recorder } = createRecorder();
    const page = new StubPage();
    const { sessionId } = await recorder.start();
    await recorder.attachPage(sessionId, page);

    await recorder.pause(sessionId);
    await page.click("text=Ignored");
    await recorder.resume(sessionId);
    await page.click("text=Captured");
    const session = await recorder.stop(sessionId);

    expect(session.events.map((event) => event.type)).toEqual(["pause", "resume", "click"]);
  });

  it("REC2-006 marks password input as secret", async () => {
    const { recorder } = createRecorder();
    const page = new StubPage();
    const { sessionId } = await recorder.start();
    await recorder.attachPage(sessionId, page);

    await page.fill('role=textbox[name="Password"]', "hunter2");
    const session = await recorder.stop(sessionId);

    expect(session.events[0]).toMatchObject({ secret: true, value: "[REDACTED]" });
  });

  it("REC2-007 captures download event marker", async () => {
    const { recorder } = createRecorder();
    const page = new StubPage();
    const { sessionId } = await recorder.start();
    await recorder.attachPage(sessionId, page);

    page.emitDownload("invoice.pdf");
    await Promise.resolve();
    const session = await recorder.stop(sessionId);

    expect(session.events.some((event) => event.type === "download" && event.fileName === "invoice.pdf")).toBe(true);
  });

  it("REC2-008 interruption still yields partial session", async () => {
    const { recorder, fileSystem } = createRecorder();
    const { sessionId } = await recorder.start();
    recorder.recordNavigate(sessionId, "https://portal.vendor.example/login");

    await recorder.crash(sessionId);

    const saved = JSON.parse(await fileSystem.readFile(`/recordings/${sessionId}.json`)) as {
      interrupted: boolean;
      events: Array<{ type: string }>;
    };
    expect(saved.interrupted).toBe(true);
    expect(saved.events).toHaveLength(1);
  });

  it("REC2-009 unsupported events are surfaced, not silently dropped", async () => {
    const { recorder } = createRecorder();
    const page = new StubPage();
    const { sessionId } = await recorder.start();
    await recorder.attachPage(sessionId, page);

    await page.hover("#unknown");
    const session = await recorder.stop(sessionId);

    expect(session.events.some((event) => event.type === "unsupported" && event.originalType === "hover")).toBe(true);
  });

  it("REC2-010 event ordering is deterministic", async () => {
    const { recorder } = createRecorder();
    const page = new StubPage();
    const { sessionId } = await recorder.start();
    await recorder.attachPage(sessionId, page);

    await page.goto("https://portal.vendor.example/login");
    await page.fill("#email", "user@example.com");
    await page.click("#sign-in");
    const session = await recorder.stop(sessionId);
    const draft = normalizeRecordedEvents(session.events);

    expect(session.events.map((event) => event.id)).toEqual(["evt-0001", "evt-0002", "evt-0003"]);
    expect(draft.steps.length).toBeGreaterThan(0);
  });
});
