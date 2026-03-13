# Contributing

## Prerequisites

- Node.js LTS
- pnpm
- A local Chromium or Chrome runtime for Playwright E2E

## Setup

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

## Workflow

1. Start from the spec in `docs/SPEC.md`.
2. Treat `docs/TESTS.md` and `docs/TEST_LIST.md` as the TDD execution guide for this repository layout.
3. Add or update tests before changing runtime behavior.
4. Keep fixtures deterministic and local-only.
5. Do not add dependencies on live network services.

## Quality Gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Implementation Notes

- Prefer pure functions in `src/core`.
- Keep external effects behind interfaces in `src/drivers`, `src/security`, and `src/exporters`.
- Use stable string error codes for failure taxonomy.
- Redact secrets in logs, exports, and crash artifacts.
