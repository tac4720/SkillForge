import type { BrowserDriver, DownloadMetadata, DriverResult, SkillTarget } from "../../src/drivers/browser-driver.js";

function ok<T>(value: T): DriverResult<T> {
  return { ok: true, value };
}

function fail<T>(code: string, message: string): DriverResult<T> {
  return {
    ok: false,
    error: { code, message }
  };
}

export class FakeBrowserDriver implements BrowserDriver {
  private url = "about:blank";
  readonly history: Array<{ method: string; args: unknown[] }> = [];
  private missingLocators = new Set<string>();
  private nextNavigateError: { code: string; message: string } | null = null;
  private nextClickError: { code: string; message: string } | null = null;
  private nextInputError: { code: string; message: string } | null = null;
  private nextWaitError: { code: string; message: string } | null = null;
  private nextSelectError: { code: string; message: string } | null = null;
  private downloadMetadata = new Map<string, DownloadMetadata>();
  private screenshotData = Buffer.from("fake-screenshot").toString("base64");
  private domHtml = "<html><body>fake-dom</body></html>";

  setMissingLocator(locator: string): void {
    this.missingLocators.add(locator);
  }

  failNextClick(code = "click_failed", message = "Click failed."): void {
    this.nextClickError = { code, message };
  }

  failNextNavigate(code = "navigation_failed", message = "Navigation failed."): void {
    this.nextNavigateError = { code, message };
  }

  failNextInput(code = "input_failed", message = "Input failed."): void {
    this.nextInputError = { code, message };
  }

  failNextSelect(code = "select_failed", message = "Select failed."): void {
    this.nextSelectError = { code, message };
  }

  failNextWait(code = "navigation_timeout", message = "Timed out."): void {
    this.nextWaitError = { code, message };
  }

  setDownload(locator: string, metadata: DownloadMetadata): void {
    this.downloadMetadata.set(locator, metadata);
  }

  setScreenshotData(contents: string): void {
    this.screenshotData = Buffer.from(contents, "utf8").toString("base64");
  }

  setDomSnapshot(html: string): void {
    this.domHtml = html;
  }

  currentUrl(): string {
    return this.url;
  }

  async navigate(url: string): Promise<DriverResult<{ url: string }>> {
    this.history.push({ method: "navigate", args: [url] });
    if (this.nextNavigateError) {
      const error = this.nextNavigateError;
      this.nextNavigateError = null;
      return fail(error.code, error.message);
    }

    this.url = url;
    return ok({ url });
  }

  async click(locator: string | SkillTarget): Promise<DriverResult<void>> {
    const key = normalizeTarget(locator);
    this.history.push({ method: "click", args: [key] });
    if (this.missingLocators.has(key)) {
      return fail("locator_not_found", `Missing locator: ${key}`);
    }

    if (this.nextClickError) {
      const error = this.nextClickError;
      this.nextClickError = null;
      return fail(error.code, error.message);
    }

    return ok(undefined);
  }

  async input(locator: string | SkillTarget, value: string): Promise<DriverResult<void>> {
    this.history.push({ method: "input", args: [normalizeTarget(locator), value] });
    if (this.nextInputError) {
      const error = this.nextInputError;
      this.nextInputError = null;
      return fail(error.code, error.message);
    }

    return ok(undefined);
  }

  async select(locator: string | SkillTarget, value: string): Promise<DriverResult<void>> {
    this.history.push({ method: "select", args: [normalizeTarget(locator), value] });
    if (this.nextSelectError) {
      const error = this.nextSelectError;
      this.nextSelectError = null;
      return fail(error.code, error.message);
    }

    return ok(undefined);
  }

  async waitFor(locator: string | SkillTarget | Record<string, unknown>): Promise<DriverResult<void>> {
    this.history.push({
      method: "waitFor",
      args: [typeof locator === "string" || isSkillTarget(locator) ? normalizeTarget(locator) : locator]
    });
    if (this.nextWaitError) {
      const error = this.nextWaitError;
      this.nextWaitError = null;
      return fail(error.code, error.message);
    }

    return ok(undefined);
  }

  async download(locator: string | SkillTarget): Promise<DriverResult<DownloadMetadata>> {
    const key = normalizeTarget(locator);
    this.history.push({ method: "download", args: [key] });
    const metadata = this.downloadMetadata.get(key);
    if (!metadata) {
      return fail("download_timeout", `No download prepared for ${key}`);
    }

    return ok(metadata);
  }

  async screenshot(filePath?: string): Promise<DriverResult<string>> {
    this.history.push({ method: "screenshot", args: filePath ? [filePath] : [] });
    return ok(this.screenshotData);
  }

  async domSnapshot(): Promise<DriverResult<string>> {
    this.history.push({ method: "domSnapshot", args: [] });
    return ok(this.domHtml);
  }
}

function normalizeTarget(target: string | SkillTarget): string {
  return typeof target === "string" ? target : (target.locatorCandidates[0] ?? "");
}

function isSkillTarget(value: unknown): value is SkillTarget {
  return typeof value === "object" &&
    value !== null &&
    Array.isArray((value as SkillTarget).locatorCandidates);
}
