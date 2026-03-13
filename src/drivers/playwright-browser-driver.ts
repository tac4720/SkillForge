import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { chromium, type Browser, type BrowserContext, type Download, type Locator, type Page, errors } from "playwright";

import type { BrowserDriver, DownloadMetadata, DriverResult, SkillTarget } from "./browser-driver.ts";

function ok<T>(value: T): DriverResult<T> {
  return { ok: true, value };
}

function fail<T>(code: string, message: string): DriverResult<T> {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

class DriverFailure extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class PlaywrightBrowserDriver implements BrowserDriver {
  private readonly headless: boolean;
  private readonly browserType: "chromium";
  private readonly storageStatePath?: string;
  private downloadsDirPromise: Promise<string>;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private currentUrlValue = "about:blank";

  constructor(config: {
    headless?: boolean;
    downloadsDir?: string;
    browserType?: "chromium";
    storageStatePath?: string;
  } = {}) {
    this.headless = config.headless ?? true;
    this.browserType = config.browserType ?? "chromium";
    this.storageStatePath = config.storageStatePath;
    this.downloadsDirPromise = config.downloadsDir
      ? Promise.resolve(config.downloadsDir)
      : fs.mkdtemp(path.join(os.tmpdir(), "skillforge-downloads-"));
  }

  currentUrl(): string {
    return this.currentUrlValue;
  }

  async navigate(url: string): Promise<DriverResult<{ url: string }>> {
    try {
      const page = await this.ensurePage();
      await page.goto(url, { waitUntil: "load", timeout: 5000 });
      this.currentUrlValue = page.url();
      return ok({ url: this.currentUrlValue });
    } catch (error) {
      return fail(this.navigationErrorCode(error), this.errorMessage(error));
    }
  }

  async click(target: string | SkillTarget): Promise<DriverResult<void>> {
    return this.runAction(target, async (locator) => {
      await locator.click({ timeout: 1000 });
      await this.waitForPotentialNavigation();
      this.currentUrlValue = (await this.ensurePage()).url();
    });
  }

  async input(target: string | SkillTarget, value: string): Promise<DriverResult<void>> {
    return this.runAction(target, async (locator) => {
      await locator.fill(value, { timeout: 1000 });
      this.currentUrlValue = (await this.ensurePage()).url();
    });
  }

  async select(target: string | SkillTarget, value: string): Promise<DriverResult<void>> {
    return this.runAction(target, async (locator) => {
      await locator.selectOption(value, { timeout: 1000 });
      this.currentUrlValue = (await this.ensurePage()).url();
    });
  }

  async waitFor(
    locatorOrCondition: string | SkillTarget | Record<string, unknown>,
    options?: { timeoutMs?: number }
  ): Promise<DriverResult<void>> {
    try {
      const page = await this.ensurePage();
      const timeout = options?.timeoutMs ?? 1000;

      if (typeof locatorOrCondition === "string" || isSkillTarget(locatorOrCondition)) {
        const locator = await this.resolveLocator(locatorOrCondition);
        await locator.waitFor({ state: "visible", timeout });
      } else if (locatorOrCondition["type"] === "textContains") {
        const locator = await this.resolveLocator(String(locatorOrCondition["locator"] ?? ""));
        const value = String(locatorOrCondition["value"] ?? "");
        await page.waitForFunction(
          ([selector, expected]) => {
            const element = document.querySelector(selector);
            return element?.textContent?.includes(expected) ?? false;
          },
          [toCssSelector(String(locatorOrCondition["locator"] ?? "")), value],
          { timeout }
        );
      } else if (locatorOrCondition["type"] === "urlMatches") {
        const pattern = new RegExp(String(locatorOrCondition["value"] ?? ""), "u");
        await page.waitForFunction((expected) => new RegExp(expected, "u").test(window.location.href), pattern.source, {
          timeout
        });
      } else {
        const locator = await this.resolveLocator(String(locatorOrCondition["locator"] ?? ""));
        await locator.waitFor({ state: "visible", timeout });
      }

      this.currentUrlValue = page.url();
      return ok(undefined);
    } catch (error) {
      return fail("navigation_timeout", this.errorMessage(error));
    }
  }

  async extract(target: string | SkillTarget): Promise<DriverResult<string>> {
    try {
      const locator = await this.resolveLocator(target);
      const tagName = await locator.first().evaluate((element) => element.tagName.toLowerCase());
      if (tagName === "input" || tagName === "textarea" || tagName === "select") {
        return ok(await locator.first().inputValue());
      }
      return ok((await locator.first().innerText()).trim());
    } catch (error) {
      return fail("locator_not_found", this.errorMessage(error));
    }
  }

  async download(target: string | SkillTarget, options?: { saveAs?: string }): Promise<DriverResult<DownloadMetadata>> {
    try {
      const page = await this.ensurePage();
      const saveAsOnly = typeof target === "string" && shouldTreatAsSavePath(target, options);
      const download = saveAsOnly
        ? await page.waitForEvent("download", { timeout: 2000 })
        : await (async () => {
            const locator = await this.resolveLocator(target);
            const [resolvedDownload] = await Promise.all([
              page.waitForEvent("download", { timeout: 2000 }),
              locator.click({ timeout: 1000 })
            ]);
            return resolvedDownload;
          })();

      const saveAs = saveAsOnly
        ? target
        : (options?.saveAs ?? path.join(await this.downloadsDirPromise, await download.suggestedFilename()));
      await fs.mkdir(path.dirname(saveAs), { recursive: true });
      await download.saveAs(saveAs);
      this.currentUrlValue = page.url();

      return ok({
        fileName: await download.suggestedFilename(),
        path: saveAs
      });
    } catch (error) {
      return fail(this.downloadErrorCode(error), this.errorMessage(error));
    }
  }

  async screenshot(filePath?: string): Promise<DriverResult<string>> {
    try {
      const page = await this.ensurePage();
      const buffer = await page.screenshot({ fullPage: true });
      if (filePath) {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, buffer);
      }
      return ok(buffer.toString("base64"));
    } catch (error) {
      return fail("screenshot_failed", this.errorMessage(error));
    }
  }

  async domSnapshot(): Promise<DriverResult<string>> {
    try {
      const page = await this.ensurePage();
      return ok(await page.content());
    } catch (error) {
      return fail("dom_snapshot_failed", this.errorMessage(error));
    }
  }

  async visibleText(locator: string): Promise<DriverResult<string>> {
    try {
      const resolved = await this.resolveLocator(locator);
      return ok(await resolved.innerText());
    } catch (error) {
      return fail("locator_not_found", this.errorMessage(error));
    }
  }

  async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.page = null;
    this.context = null;
    this.browser = null;
  }

  private async ensurePage(): Promise<Page> {
    if (this.page) {
      return this.page;
    }

    if (this.browserType !== "chromium") {
      throw new Error(`Unsupported browser type: ${this.browserType}`);
    }

    this.browser = await chromium.launch({
      headless: this.headless,
      downloadsPath: await this.downloadsDirPromise
    });
    this.context = await this.browser.newContext({
      acceptDownloads: true,
      storageState: this.storageStatePath
    });
    this.page = await this.context.newPage();
    this.currentUrlValue = this.page.url();
    return this.page;
  }

  private async runAction(target: string | SkillTarget, action: (locator: Locator) => Promise<void>): Promise<DriverResult<void>> {
    try {
      const locator = await this.resolveLocator(target);
      await action(locator);
      return ok(undefined);
    } catch (error) {
      return fail(this.actionErrorCode(error), this.errorMessage(error));
    }
  }

  private async resolveLocator(target: string | SkillTarget): Promise<Locator> {
    const page = await this.ensurePage();
    const candidates = normalizeCandidates(target);

    for (const candidate of candidates) {
      const locator = candidateToLocator(page, candidate).first();
      if (await hasMatch(locator)) {
        return locator;
      }
    }

    throw new DriverFailure("locator_not_found", `Missing locator: ${candidates[0] ?? ""}`);
  }

  private actionErrorCode(error: unknown): string {
    if (error instanceof DriverFailure) {
      return error.code;
    }
    if (error instanceof errors.TimeoutError) {
      return "locator_not_found";
    }
    if (this.errorMessage(error).includes("strict mode violation")) {
      return "locator_not_found";
    }
    return "click_failed";
  }

  private navigationErrorCode(error: unknown): string {
    return error instanceof errors.TimeoutError ? "navigation_timeout" : "navigation_failed";
  }

  private downloadErrorCode(error: unknown): string {
    if (error instanceof DriverFailure) {
      return error.code;
    }
    return error instanceof errors.TimeoutError ? "download_timeout" : "download_failed";
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private async waitForPotentialNavigation(): Promise<void> {
    const page = await this.ensurePage();
    await page.waitForLoadState("load", { timeout: 250 }).catch(() => undefined);
  }
}

function normalizeCandidates(target: string | SkillTarget): string[] {
  return typeof target === "string" ? [target] : target.locatorCandidates;
}

function isSkillTarget(value: unknown): value is SkillTarget {
  return typeof value === "object" &&
    value !== null &&
    Array.isArray((value as SkillTarget).locatorCandidates);
}

async function hasMatch(locator: Locator): Promise<boolean> {
  try {
    return (await locator.count()) > 0;
  } catch {
    return false;
  }
}

function candidateToLocator(page: Page, candidate: string): Locator {
  if (candidate.startsWith("role=")) {
    const match = candidate.match(/^role=([^[]+)(?:\[name=(?:"([^"]+)"|'([^']+)')\])?$/u);
    if (match) {
      return page.getByRole(match[1] as any, {
        name: match[2] ?? match[3]
      });
    }
  }

  if (candidate.startsWith("text=")) {
    return page.getByText(stripQuoted(candidate.slice("text=".length)), { exact: true });
  }

  if (candidate.startsWith("css=")) {
    return page.locator(candidate.slice("css=".length));
  }

  return page.locator(candidate);
}

function stripQuoted(value: string): string {
  return value.replace(/^"(.*)"$/u, "$1").replace(/^'(.*)'$/u, "$1");
}

function toCssSelector(locator: string): string {
  if (locator.startsWith("css=")) {
    return locator.slice("css=".length);
  }

  return locator;
}

function shouldTreatAsSavePath(target: string, options?: { saveAs?: string }): boolean {
  if (options?.saveAs) {
    return false;
  }

  return !target.startsWith("#") &&
    !target.startsWith(".") &&
    !target.startsWith("css=") &&
    !target.startsWith("text=") &&
    !target.startsWith("role=") &&
    (target.includes("/") || target.includes("\\"));
}
