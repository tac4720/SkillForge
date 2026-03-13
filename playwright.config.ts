import { existsSync } from "node:fs";

import { defineConfig } from "@playwright/test";

const defaultExecutablePath = existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: "list",
  use: {
    headless: true,
    acceptDownloads: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? defaultExecutablePath
    }
  }
});
