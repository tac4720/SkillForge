# Troubleshooting

## `pnpm lint` fails because ESLint cannot find a config

Make sure `eslint.config.mjs` exists at the repository root and rerun:

```bash
pnpm lint
```

## `pnpm test:e2e` fails to launch a browser in the sandbox

The Playwright browser tests need to launch Chromium outside the sandboxed terminal environment. If browser launch fails with sandbox or crashpad errors, rerun the E2E command with sandbox escalation enabled in your agent session.

## `pnpm test:e2e` fails because Playwright cannot find its browser

Either install the Playwright browser bundle or point Playwright at a system Chrome/Chromium binary. `playwright.config.ts` will use `PLAYWRIGHT_EXECUTABLE_PATH` when provided and otherwise falls back to `/usr/bin/google-chrome` if it exists.

## `pnpm test:coverage` fails with a missing coverage provider

Install dependencies with `pnpm install` so `@vitest/coverage-v8` is available, then rerun:

```bash
pnpm test:coverage
```

## `pnpm typecheck` reports import extension errors

Under `NodeNext` module resolution, relative imports in TypeScript source and tests must use explicit `.js` file extensions.

## Fixture tests fail intermittently

- Ensure fixture servers are local only and bind to `127.0.0.1`
- Avoid sleep-based waits
- Keep test temp directories unique per run
- Use the file-backed fixtures in `tests/fixtures/apps` rather than embedding ad hoc HTML in tests

## Recorder output contains unexpected data

Use the recorder `secret` pathway for password-like input and confirm the saved crash session uses `[REDACTED]` rather than plaintext.
