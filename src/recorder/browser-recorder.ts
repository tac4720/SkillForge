import type { FileSystem } from "../drivers/file-system.ts";

export interface RecorderEvent {
  id: string;
  timestamp: string;
  type: string;
  locator?: string;
  selectorCandidates?: string[];
  url?: string;
  value?: string;
  checked?: boolean;
  fileName?: string;
  secret?: boolean;
  originalType?: string;
}

export interface RecordingSession {
  id: string;
  events: RecorderEvent[];
  warnings: string[];
  paused: boolean;
  startedAt: string;
  endedAt?: string;
  interrupted: boolean;
}

export interface BrowserRecorderOptions {
  fileSystem: FileSystem;
  baseDir: string;
  now?: () => Date;
}

interface BrowserPageLike {
  goto(url: string, ...args: any[]): Promise<any>;
  click(selector: string, ...args: any[]): Promise<any>;
  fill(selector: string, value: string, ...args: any[]): Promise<any>;
  selectOption?(selector: string, value: unknown, ...args: any[]): Promise<any>;
  check?(selector: string, ...args: any[]): Promise<any>;
  uncheck?(selector: string, ...args: any[]): Promise<any>;
  hover?(selector: string, ...args: any[]): Promise<any>;
  on?(eventName: string, listener: (...args: any[]) => unknown): unknown;
  off?(eventName: string, listener: (...args: any[]) => unknown): unknown;
}

interface RecorderBinding {
  page: BrowserPageLike;
  restore: () => void;
}

interface MutableSession extends RecordingSession {
  eventSequence: number;
}

export class BrowserRecorder {
  private readonly fileSystem: FileSystem;
  private readonly baseDir: string;
  private readonly now: () => Date;
  private readonly sessions = new Map<string, MutableSession>();
  private readonly bindings = new Map<string, RecorderBinding>();
  private sequence = 0;

  constructor(options: BrowserRecorderOptions) {
    this.fileSystem = options.fileSystem;
    this.baseDir = options.baseDir;
    this.now = options.now ?? (() => new Date());
  }

  async start(): Promise<{ sessionId: string }> {
    const sessionId = `rec-${++this.sequence}`;
    this.sessions.set(sessionId, {
      id: sessionId,
      events: [],
      warnings: [],
      paused: false,
      startedAt: this.now().toISOString(),
      interrupted: false,
      eventSequence: 0
    });
    return { sessionId };
  }

  async pause(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    session.paused = true;
    this.pushEvent(sessionId, { type: "pause" }, true);
  }

  async resume(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    session.paused = false;
    this.pushEvent(sessionId, { type: "resume" }, true);
  }

  async stop(sessionId: string): Promise<RecordingSession> {
    const session = this.requireSession(sessionId);
    session.endedAt = this.now().toISOString();
    this.restoreBinding(sessionId);
    this.sessions.delete(sessionId);
    return this.cloneSession(session);
  }

  async crash(sessionId: string): Promise<void> {
    const session = this.requireSession(sessionId);
    session.interrupted = true;
    session.endedAt = this.now().toISOString();
    await this.fileSystem.writeFile(`${this.baseDir}/${sessionId}.json`, JSON.stringify(this.cloneSession(session), null, 2));
  }

  async attachPage(sessionId: string, page: BrowserPageLike): Promise<void> {
    this.requireSession(sessionId);
    this.restoreBinding(sessionId);

    const originalGoto = page.goto.bind(page);
    const originalClick = page.click.bind(page);
    const originalFill = page.fill.bind(page);
    const originalSelect = page.selectOption?.bind(page);
    const originalCheck = page.check?.bind(page);
    const originalUncheck = page.uncheck?.bind(page);
    const originalHover = page.hover?.bind(page);
    const downloadListener = async (download: { suggestedFilename?: () => Promise<string> | string }) => {
      const suggested = typeof download.suggestedFilename === "function" ? await download.suggestedFilename() : "download.bin";
      this.recordDownload(sessionId, suggested);
    };

    page.goto = async (url: string, ...args: any[]) => {
      const result = await originalGoto(url, ...args);
      this.recordNavigate(sessionId, url);
      return result;
    };
    page.click = async (selector: string, ...args: any[]) => {
      const result = await originalClick(selector, ...args);
      this.recordClick(sessionId, selector);
      return result;
    };
    page.fill = async (selector: string, value: string, ...args: any[]) => {
      const result = await originalFill(selector, value, ...args);
      this.recordInput(sessionId, selector, value);
      return result;
    };

    if (originalSelect) {
      page.selectOption = async (selector: string, value: unknown, ...args: any[]) => {
        const result = await originalSelect(selector, value, ...args);
        this.recordSelect(sessionId, selector, String(value));
        return result;
      };
    }

    if (originalCheck) {
      page.check = async (selector: string, ...args: any[]) => {
        const result = await originalCheck(selector, ...args);
        this.recordCheckbox(sessionId, selector, true);
        return result;
      };
    }

    if (originalUncheck) {
      page.uncheck = async (selector: string, ...args: any[]) => {
        const result = await originalUncheck(selector, ...args);
        this.recordCheckbox(sessionId, selector, false);
        return result;
      };
    }

    if (originalHover) {
      page.hover = async (selector: string, ...args: any[]) => {
        const result = await originalHover(selector, ...args);
        this.recordUnsupported(sessionId, "hover", selector);
        return result;
      };
    }

    page.on?.("download", downloadListener);

    this.bindings.set(sessionId, {
      page,
      restore: () => {
        page.goto = originalGoto;
        page.click = originalClick;
        page.fill = originalFill;
        if (originalSelect) {
          page.selectOption = originalSelect;
        }
        if (originalCheck) {
          page.check = originalCheck;
        }
        if (originalUncheck) {
          page.uncheck = originalUncheck;
        }
        if (originalHover) {
          page.hover = originalHover;
        }
        page.off?.("download", downloadListener);
      }
    });
  }

  reportEventLoss(sessionId: string, count: number): void {
    this.requireSession(sessionId).warnings.push(`event_loss:${count}`);
  }

  recordNavigate(sessionId: string, url: string): void {
    this.pushEvent(sessionId, { type: "navigate", url });
  }

  recordClick(sessionId: string, locator: string): void {
    this.pushEvent(sessionId, { type: "click", locator, selectorCandidates: [locator] });
  }

  recordInput(sessionId: string, locator: string, value: string, options?: { secret?: boolean }): void {
    const secret = options?.secret ?? isSensitiveLocator(locator);
    this.pushEvent(sessionId, {
      type: "input",
      locator,
      selectorCandidates: [locator],
      value: secret ? "[REDACTED]" : value,
      secret
    });
  }

  recordSelect(sessionId: string, locator: string, value: string): void {
    this.pushEvent(sessionId, { type: "select", locator, selectorCandidates: [locator], value });
  }

  recordCheckbox(sessionId: string, locator: string, checked: boolean): void {
    this.pushEvent(sessionId, { type: "checkbox", locator, selectorCandidates: [locator], checked });
  }

  recordDownload(sessionId: string, fileName: string): void {
    this.pushEvent(sessionId, { type: "download", fileName });
  }

  recordUnsupported(sessionId: string, originalType: string, locator?: string): void {
    this.pushEvent(sessionId, {
      type: "unsupported",
      originalType,
      locator,
      selectorCandidates: locator ? [locator] : undefined
    });
  }

  private pushEvent(sessionId: string, event: Omit<RecorderEvent, "id" | "timestamp">, force = false): void {
    const session = this.requireSession(sessionId);
    if (session.paused && !force) {
      return;
    }

    session.eventSequence += 1;
    session.events.push({
      id: `evt-${session.eventSequence.toString().padStart(4, "0")}`,
      timestamp: this.now().toISOString(),
      ...event
    });
  }

  private requireSession(sessionId: string): MutableSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Missing session: ${sessionId}`);
    }
    return session;
  }

  private restoreBinding(sessionId: string): void {
    const binding = this.bindings.get(sessionId);
    if (!binding) {
      return;
    }

    binding.restore();
    this.bindings.delete(sessionId);
  }

  private cloneSession(session: MutableSession): RecordingSession {
    const { eventSequence: _eventSequence, ...cloned } = structuredClone(session);
    return cloned;
  }
}

function isSensitiveLocator(locator: string): boolean {
  return /(password|otp|token|secret)/iu.test(locator);
}
