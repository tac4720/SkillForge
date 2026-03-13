# SkillForge

SkillForge turns repeated browser and local workflows into tested, permission-scoped, reusable skills for OpenClaw, MCP, and CLI.

## Status

- Tier: beta
- Scope: browser-first v1
- Language: TypeScript
- Runtime: Node.js LTS
- Package manager: pnpm
- Test stack: Vitest, fast-check, Playwright

## Implemented

- Pure core modules for permission checks, path sanitization, input validation, secret redaction, risk classification, event normalization, parameterization, and assertion evaluation
- Deterministic contracts and fakes for browser, shell, filesystem, approvals, secrets, and exporters
- Replay engine with approval gating, permission enforcement, assertions, idempotency, and run logging
- Production Playwright `BrowserDriver` wired into CLI, replay runtime, and daemon server
- Local registry, browser recorder, local daemon API, native package export, OpenClaw export, and MCP export
- Local fixture-based integration and E2E tests for invoice download, record-to-replay, 42 preflight, website change watching, and repair flow

## Quickstart

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Scripts

```bash
pnpm lint
pnpm format
pnpm typecheck
pnpm test:coverage
pnpm test:unit
pnpm test:property
pnpm test:contract
pnpm test:component
pnpm test:integration
pnpm test:security
pnpm test:e2e
pnpm test
pnpm build
```

## Repository Layout

```text
src/
  cli/
  core/
  recorder/
  replay/
  exporters/
  registry/
  security/
  daemon/
  drivers/

tests/
  unit/
  property/
  contract/
  component/
  integration/
  security/
  e2e/
  fixtures/
  fakes/
  helpers/
```

## Notes

- All tests use local fixtures only. No external SaaS or live network access is required.
- Fixture apps live under `tests/fixtures/apps`, representative sample skills live under `tests/fixtures/skills`, and the 42 sample repository lives under `tests/fixtures/repos`.
- Coverage thresholds are enforced through `pnpm test:coverage`.
- Playwright E2E needs a browser that can launch outside the sandboxed terminal environment.
- If the production `BrowserDriver` is missing or its real-browser contract/integration/E2E suites are not present, overall tier must be treated as `alpha`.
- Desktop automation remains out of scope for this v1 build.
