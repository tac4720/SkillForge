# DELTA_TICKETS.md
## Post-Progress Gap Closure Tickets for SkillForge

This document is authoritative after the current progress report.
Current state is considered:
- core engine implemented
- replay / validation / permissions / registry / CLI / daemon / OpenClaw export implemented
- test baseline strong
- product still incomplete against SPEC.md

Codex MUST continue until all tickets in this file are green.
Do not stop at coverage or pass count.

---

# D-001 Formal package format: `skillforge.yaml`

## Goal
Replace ad-hoc or implicit IR loading with the formal on-disk package format defined in SPEC.md.

## Required production API

File: `src/package/load-skill-package.ts`

```ts
export async function loadSkillPackageFromDir(dir: string): Promise<SkillPackage>;
export async function saveSkillPackageToDir(skill: SkillPackage, dir: string): Promise<void>;
File: src/package/skill-package-schema.ts

Copyexport function validateSkillPackageDocument(input: unknown): {
  ok: boolean;
  errors: { path: string; message: string }[];
};
Required tests
File: tests/integration/skill-package-format.spec.ts
PKG-001 loads valid skillforge.yaml
PKG-002 rejects invalid skillforge.yaml
PKG-003 preserves metadata/inputs/permissions/steps/assertions
PKG-004 roundtrip save -> load is semantically equal
PKG-005 replay can run directly from a package directory containing skillforge.yaml
PKG-006 export commands accept package directory as input
PKG-007 relative asset paths resolve from package root
PKG-008 unknown top-level keys fail deterministically or warn deterministically
Concrete test API
Copyconst skill = await loadSkillPackageFromDir(skillDir);
expect(skill.metadata.name).toBe("invoice-download");

const result = validateSkillPackageDocument(invalidDoc);
expect(result.ok).toBe(false);
expect(result.errors[0].path).toContain("steps");
Acceptance
pnpm vitest run tests/integration/skill-package-format.spec.ts
D-002 Recorder v1 proper implementation
Goal
Upgrade recorder from stub/simple implementation to spec-compliant browser-first recorder.

Required production API
File: src/recorder/browser-recorder.ts

Copyexport class BrowserRecorder {
  start(): Promise<{ sessionId: string }>;
  pause(sessionId: string): Promise<void>;
  resume(sessionId: string): Promise<void>;
  stop(sessionId: string): Promise<RecordingSession>;
}
Additional output requirement:

recorder output MUST be consumable by normalizeRecordedEvents
Required tests
File: tests/integration/recorder.spec.ts
REC2-001 captures navigate
REC2-002 captures click
REC2-003 captures input
REC2-004 captures select/checkbox where supported
REC2-005 captures pause/resume boundaries
REC2-006 marks password input as secret
REC2-007 captures download event marker
REC2-008 interruption still yields partial session
REC2-009 unsupported events are surfaced, not silently dropped
REC2-010 event ordering is deterministic
File: tests/e2e/record-to-replay.e2e.spec.ts
REC2-E2E-001 record fixture workflow
REC2-E2E-002 normalize recorded session
REC2-E2E-003 save as formal package
REC2-E2E-004 replay succeeds
REC2-E2E-005 export openclaw succeeds from recorded package
Concrete test API
Copyconst { sessionId } = await recorder.start();
await page.goto(fixtureUrl);
await page.click('text=Login');
const session = await recorder.stop(sessionId);

expect(session.events.some(e => e.type === "navigate")).toBe(true);
expect(session.events.some(e => e.type === "click")).toBe(true);

const draft = normalizeRecordedEvents(session.events);
expect(draft.steps.length).toBeGreaterThan(0);
Acceptance
pnpm vitest run tests/integration/recorder.spec.ts
pnpm playwright test tests/e2e/record-to-replay.e2e.spec.ts
D-003 Failure artifacts: screenshot / DOM snapshot / run artifacts
Goal
Persist useful deterministic artifacts on failure.

Required production API
File: src/replay/run-artifacts.ts

Copyexport interface RunArtifactPaths {
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
}): Promise<RunArtifactPaths>;
ReplayEngine MUST call artifact creation on failure paths where browser context exists.

Required tests
File: tests/component/run-artifacts.spec.ts
ART-001 failure creates run directory
ART-002 failure writes error json
ART-003 failure requests screenshot from browser driver
ART-004 failure writes DOM snapshot when available
ART-005 artifact paths are attached to run metadata
ART-006 secrets do not leak into error json or dom snapshot after redaction
File: tests/e2e/failure-artifacts.e2e.spec.ts
ART-E2E-001 locator_not_found generates screenshot
ART-E2E-002 locator_not_found generates DOM snapshot
ART-E2E-003 failed run metadata references artifacts
Concrete test API
Copyconst result = await engine.run(skillThatFails, { mode: "autopilot" });
expect(result.status).toBe("failed");

const runLog = await logger.read(result.runId);
expect(runLog.artifacts?.screenshotPath).toBeDefined();
expect(await fs.exists(runLog.artifacts!.screenshotPath!)).toBe(true);
Acceptance
pnpm vitest run tests/component/run-artifacts.spec.ts
pnpm playwright test tests/e2e/failure-artifacts.e2e.spec.ts
D-004 Secret management productization
Goal
Move from simple secret handling to provider-based secure secret management.

Minimum acceptable v1
At least one of:

OS keychain adapter, or
encrypted local vault adapter
A plain-text file secret store is not acceptable.

Required production API
File: src/secrets/secret-provider.ts

Copyexport interface SecretProvider {
  get(ref: string): Promise<string>;
  set?(ref: string, value: string): Promise<void>;
  has?(ref: string): Promise<boolean>;
}
File: src/secrets/providers/env-secret-provider.ts File: src/secrets/providers/local-vault-secret-provider.ts Optional but recommended: File: src/secrets/providers/os-keychain-secret-provider.ts

File: src/secrets/create-secret-provider.ts

Copyexport function createSecretProvider(config: {
  mode: "env" | "local-vault" | "os-keychain";
  rootDir?: string;
  password?: string;
}): SecretProvider;
Required tests
File: tests/contract/secret-provider.contract.ts
SECPROV-001 get existing secret
SECPROV-002 missing secret returns deterministic error
SECPROV-003 stored value is returned exactly
SECPROV-004 provider does not expose raw storage path in error
File: tests/integration/local-vault-secret-provider.spec.ts
VAULT-001 set/get roundtrip
VAULT-002 raw vault file does not contain plain secret
VAULT-003 wrong password or wrong key fails deterministically
VAULT-004 replay engine can resolve secret ref via provider
VAULT-005 exported artifacts never embed resolved secret value
Optional if implemented:

File: tests/integration/os-keychain-secret-provider.spec.ts
KEYCHAIN-001 set/get roundtrip
KEYCHAIN-002 unavailable keychain falls back or fails deterministically
Concrete test API
Copyconst provider = createSecretProvider({ mode: "local-vault", rootDir, password: "test-pass" });
await provider.set!("vendor_login", "super-secret");
expect(await provider.get("vendor_login")).toBe("super-secret");

const raw = await fs.readFile(vaultFilePath, "utf8");
expect(raw).not.toContain("super-secret");
Acceptance
pnpm vitest run tests/contract/secret-provider.contract.ts
pnpm vitest run tests/integration/local-vault-secret-provider.spec.ts
D-005 MCP export
Goal
Close the remaining SPEC gap for MCP exporter.

Required production API
File: src/exporters/mcp.ts

Copyexport async function exportMcp(skill: SkillPackage, outDir: string): Promise<ExportResult>;
Expected output:

server.(ts|js|py) or equivalent runnable MCP wrapper
tool manifest/schema
README
input/output schema preservation
Required tests
File: tests/integration/export-mcp.spec.ts
MCP-001 exports MCP server files
MCP-002 preserves input schema
MCP-003 preserves output schema
MCP-004 wrapper executes local replay
MCP-005 unsupported steps fail fast
MCP-006 secrets are not embedded
Concrete test API
Copyconst result = await exportMcp(skill, outDir);
expect(result.files.some(f => f.includes("tool_manifest"))).toBe(true);
Acceptance
pnpm vitest run tests/integration/export-mcp.spec.ts
D-006 Review workflow minimal implementation
Goal
Provide the minimum review experience required to inspect a recorded draft before replay/export.

Important note
A fully polished GUI is not required for this delta. A minimal deterministic implementation is acceptable if it supports:

step listing
parameter listing
permission listing
risk listing
approve/reject unsupported/high-risk export
draft save
Required production API
File: src/review/review-model.ts

Copyexport interface ReviewModel {
  steps: Array<{ id: string; type: string; risk: string }>;
  parameters: Array<{ name: string; kind: string }>;
  permissions: PermissionManifest;
  warnings: string[];
}

export function buildReviewModel(skill: SkillPackage): ReviewModel;
File: src/cli/review-command.ts

Copyexport async function reviewSkillCommand(skillDir: string): Promise<ReviewModel>;
Required tests
File: tests/unit/review-model.spec.ts
REV-001 review model contains all steps
REV-002 review model contains all parameter candidates
REV-003 review model contains permissions
REV-004 high-risk steps appear in warnings
REV-005 unsupported steps appear in warnings
File: tests/integration/cli-review.spec.ts
REVCLI-001 skillforge review <skillDir> exits 0
REVCLI-002 review output includes steps
REVCLI-003 review output includes permissions
REVCLI-004 review output includes warnings
Concrete test API
Copyconst model = buildReviewModel(skill);
expect(model.steps.length).toBe(skill.steps.length);
expect(model.warnings.some(w => w.includes("high-risk"))).toBe(true);
Acceptance
pnpm vitest run tests/unit/review-model.spec.ts
pnpm vitest run tests/integration/cli-review.spec.ts
D-007 Release tier enforcement and docs truthfulness
Goal
Prevent shipping an ambiguous status. Codex must classify the current product tier truthfully.

Required documentation outputs
README.md
docs/status.md
Required states
One of:

alpha
beta
stable
Given current feature set, if D-001..D-006 are not all complete, the status MUST NOT be stable.

Required tests
File: tests/integration/release-status.spec.ts
RELSTAT-001 if MCP export missing, stable is forbidden
RELSTAT-002 if recorder proper missing, stable is forbidden
RELSTAT-003 if failure artifacts missing, stable is forbidden
RELSTAT-004 if secure secret provider missing, stable is forbidden
RELSTAT-005 status doc matches implemented feature matrix
Concrete test API
Copyconst status = await loadReleaseStatus();
expect(["alpha", "beta", "stable"]).toContain(status.tier);
Acceptance
pnpm vitest run tests/integration/release-status.spec.ts
