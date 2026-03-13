export interface DriverError {
  code: string;
  message: string;
}

export type DriverResult<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      error: DriverError;
    };

export interface DownloadMetadata {
  fileName: string;
  path: string;
}

export interface SkillTarget {
  locatorCandidates: string[];
}

export interface BrowserDriver {
  currentUrl(): string;
  navigate(url: string): Promise<DriverResult<{ url: string }>>;
  click(locator: string | SkillTarget): Promise<DriverResult<void>>;
  input(locator: string | SkillTarget, value: string): Promise<DriverResult<void>>;
  select?(locator: string | SkillTarget, value: string): Promise<DriverResult<void>>;
  waitFor(locator: string | SkillTarget | Record<string, unknown>, options?: { timeoutMs?: number }): Promise<DriverResult<void>>;
  extract?(locator: string | SkillTarget): Promise<DriverResult<string>>;
  download(locator: string | SkillTarget, options?: { saveAs?: string }): Promise<DriverResult<DownloadMetadata>>;
  screenshot?(filePath?: string): Promise<DriverResult<string>>;
  domSnapshot?(): Promise<DriverResult<string>>;
  visibleText?(locator: string): Promise<DriverResult<string>>;
  close?(): Promise<void>;
}
