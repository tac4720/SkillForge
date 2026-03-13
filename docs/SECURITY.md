# Security Model

## Principles

- Local-first by default
- Deterministic and auditable execution
- Least privilege for browser, filesystem, shell, and secrets
- High-risk actions require explicit approval outside `dry-run`

## Enforced Controls

- Browser domain allowlist and denylist checks
- Redirect destination validation
- Filesystem allowlist checks for read and write
- Path traversal and symlink escape rejection
- Shell command allowlist and denylist checks
- Shell chaining rejection for `;`, `&&`, backticks, and `sh -c` style bypasses
- Secret redaction for run logs, step logs, exporter artifacts, and recorder crash snapshots

## Risk Levels

- `low`: read-only browser navigation, extraction, screenshots, file existence checks
- `medium`: browser input and safe file writes such as copy or move
- `high`: send/delete/update/payment style actions and write-capable shell execution

## Audit Artifacts

- `runs/<runId>/run.json`
- `runs/<runId>/steps/<stepId>.json`
- `recordings/<sessionId>.json` for partial recorder crash persistence
- `repair/<runId>/<stepId>.json` style repair diffs when a repair is approved

## Current Limits

- Secrets are redacted from stored strings and structured artifacts, but screenshot masking is not yet implemented
- The current daemon API is local and in-process; it does not yet expose a hardened HTTP server surface
- Supply-chain signing and trust policy are not implemented in this repository snapshot
