import { redactSecrets, redactValue } from "../security/secret-redactor.ts";
import type { BrowserDriver } from "../drivers/browser-driver.ts";
import type { FileSystem } from "../drivers/file-system.ts";

export interface RunArtifactPaths {
  runDir: string;
  screenshotPath?: string;
  domSnapshotPath?: string;
  errorJsonPath: string;
}

export async function createFailureArtifacts(input: {
  runId: string;
  stepId?: string;
  browser: BrowserDriver;
  fs: FileSystem;
  outDir: string;
  domHtml?: string;
  error: { type: string; message: string };
  secrets?: readonly string[];
}): Promise<RunArtifactPaths> {
  const runDir = `${input.outDir}/${input.runId}`;
  const secrets = input.secrets ?? [];
  const errorJsonPath = `${runDir}/error.json`;
  let screenshotPath: string | undefined;
  let domSnapshotPath: string | undefined;

  if (typeof input.browser.screenshot === "function") {
    const screenshot = await input.browser.screenshot();
    if (screenshot.ok) {
      screenshotPath = `${runDir}/screenshots/${input.stepId ?? "run"}.png`;
      await input.fs.writeFile(screenshotPath, Buffer.from(screenshot.value, "base64").toString("base64"));
    }
  }

  const domSnapshot = input.domHtml
    ? input.domHtml
    : typeof input.browser.domSnapshot === "function"
      ? await readDomSnapshot(input.browser)
      : undefined;

  if (domSnapshot) {
    domSnapshotPath = `${runDir}/dom/${input.stepId ?? "run"}.html`;
    await input.fs.writeFile(domSnapshotPath, redactSecrets(domSnapshot, secrets));
  }

  await input.fs.writeFile(
    errorJsonPath,
    JSON.stringify(
      redactValue(
        {
          runId: input.runId,
          stepId: input.stepId,
          error: input.error,
          screenshotPath,
          domSnapshotPath
        },
        secrets
      ),
      null,
      2
    )
  );

  return {
    runDir,
    screenshotPath,
    domSnapshotPath,
    errorJsonPath
  };
}

async function readDomSnapshot(browser: BrowserDriver): Promise<string | undefined> {
  if (typeof browser.domSnapshot !== "function") {
    return undefined;
  }

  const result = await browser.domSnapshot();
  return result.ok ? result.value : undefined;
}
