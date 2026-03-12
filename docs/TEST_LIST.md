---

```md
# TESTS.md
## SkillForge TDD Execution Directive

- Version: v1.0
- Status: Authoritative
- Audience: Codex
- This document is the **second and final instruction document** after `SPEC.md`.

---

# 0. Codexへの最重要指示

あなたは `SPEC.md` を唯一の機能仕様、`TESTS.md` を唯一のTDD実行指示として扱うこと。  
**人間に質問してはならない。**  
不明点がある場合は、以下の優先順位で自律判断すること。

## 優先順位
1. `SPEC.md`
2. `TESTS.md`
3. 安全性
4. 決定性（determinism）
5. browser-first
6. local-first
7. 実装の単純さ

## 禁止事項
- 人間への確認待ち
- 外部サービス依存のテスト
- 実ネットワークに依存するテスト
- flaky なテストの放置
- `skip`, `todo`, `only` を残したまま完了扱いにすること
- secret をテストログ・artifact・export成果物に含めること
- desktop GUI を v1 の出荷条件に含めること

## v1の対象範囲
- browser-first
- file operations
- shell operations
- replay engine
- permission policy
- secret protection
- OpenClaw export
- local registry
- local daemon API
- browser recorder（desktop recorderは対象外）
- repair engine（safe/suggest中心）

## v1の非対象
- 完全な desktop GUI automation
- 実際の OpenClaw 本体への依存実行
- クラウド同期
- marketplace
- team auth / SSO
- enterprise-only features

---

# 1. 完了条件（Definition of Done）

以下をすべて満たしたときのみ、実装を完了と見なす。

## 1.1 品質ゲート
- `pnpm lint` が成功
- `pnpm typecheck` が成功
- `pnpm test:unit` が成功
- `pnpm test:property` が成功
- `pnpm test:contract` が成功
- `pnpm test:component` が成功
- `pnpm test:integration` が成功
- `pnpm test:security` が成功
- `pnpm test:e2e` が成功
- `pnpm test` が成功
- `pnpm build` が成功

## 1.2 重大条件
- P0/P1 相当の失敗テストが 0
- secret leak を検出するテストが 0件失敗
- permission bypass を検出するテストが 0件失敗
- high-risk action without approval を検出するテストが 0件失敗
- 主要E2E 4本以上が green
- OpenClaw export contract が green

## 1.3 ドキュメント成果物
以下のファイルを作成または更新すること。
- `README.md`
- docs/`SPEC.md`
- docs/`TESTS.md`
- docs/`SECURITY.md`
- docs/`CONTRIBUTING.md`
- docs/`CHANGELOG.md`
- docs/`docs/troubleshooting.md`

---

# 2. 実装技術の固定

実装の自由度を下げ、完全自動化しやすくするため、以下を固定する。

## 2.1 言語・ツール
- Language: TypeScript
- Runtime: Node.js LTS
- Package manager: pnpm
- Unit test runner: Vitest
- Property-based testing: fast-check
- Browser automation / browser E2E: Playwright
- HTTP fixture apps: Node.js + Express or equivalent minimal local server
- Lint: ESLint
- Format: Prettier
- Type checking: TypeScript strict mode

## 2.2 実装方針
- Core logic は pure function 優先
- 外部依存は interface 化
- BrowserDriver / ShellRunner / SecretStore / FileSystem / ApprovalGate / Clock を抽象化
- テスト容易性のため DI（依存性注入）を採用
- すべてのテストはローカルで決定的に再現可能であること

---

# 3. リポジトリ構成要件

以下の構成を必須とする。多少の追加は可、削除は不可。

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
  types/

tests/
  unit/
  property/
  contract/
  component/
  integration/
  security/
  e2e/
  fixtures/
    apps/
    skills/
    repos/
  fakes/
  helpers/

docs/
```

---

# 4. TDDの進め方

必ず以下の順番で進めること。  
各 Phase は **Red → Green → Refactor** を守る。

## Phase 0: Bootstrap
作成対象:
- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `playwright.config.ts`
- `eslint` / `prettier` 設定
- 基本ディレクトリ構造
- テスト実行コマンド群

## Phase 1: Pure Core
最初に実装すべきモジュール:
1. `permission-policy`
2. `path-sanitizer`
3. `input-validator`
4. `secret-redactor`
5. `risk-classifier`
6. `event-normalizer`
7. `parameterizer`

## Phase 2: Contracts
以下の interface と contract tests を作る:
- `BrowserDriver`
- `ShellRunner`
- `SecretStore`
- `FileSystem`
- `ApprovalGate`
- `Exporter`
- `Registry`

## Phase 3: Replay Engine
- step execution
- assertion evaluation
- permission checks
- approvals
- logging
- artifacts metadata
- deterministic failure taxonomy

## Phase 4: Exporters
- native package exporter
- OpenClaw exporter
- CLI wrapper generator

## Phase 5: Browser Recorder + Fixture Apps
- browser recording flow
- local fixture apps
- replay on recorded draft
- browser-only v1 scope

## Phase 6: E2E + Release Gate
- representative skills
- OpenClaw export contract flow
- security regression suite
- docs refresh

---

# 5. テスト実装の一般ルール

## 5.1 全テスト共通
- 実ネットワーク禁止
- 実時間依存禁止
- 実環境依存禁止
- ローカル temp dir を使う
- clock は fake 化可能にする
- secret はテスト内で明示指定し、漏れていないことを検証する
- エラーコードは文字列で安定化する
- snapshot は exporter 成果物とエラー出力のみに限定する
- UI snapshot の乱用は禁止

## 5.2 flaky対策
- sleep に依存しない
- wait は状態ベース
- fixture app は deterministic
- browser E2E は local server を自前で起動
- 並列実行で衝突しない一意 temp dir を使う

## 5.3 命名規則
- テストファイル名は対象モジュール名に合わせる
- テストIDを description に含めること
- 例: `PERM-001 denies non-whitelisted domain`

---

# 6. テストスイート一覧

---

# 6A. Unit Tests

対象: pure function または pure に近い logic

## 6A-1 `tests/unit/permission-policy.spec.ts`
必須テスト:
- PERM-001 allowlist 内ドメインを許可する
- PERM-002 allowlist 外ドメインを拒否する
- PERM-003 denylist が allowlist より優先される
- PERM-004 write allowlist 外パスを拒否する
- PERM-005 read allowlist 外パスを拒否する
- PERM-006 shell allowlist 外コマンドを拒否する
- PERM-007 `rm` を拒否する
- PERM-008 `sudo` を拒否する
- PERM-009 `sh -c` 経由の deny bypass を拒否する
- PERM-010 redirect 先ドメインも判定対象にする
- PERM-011 symlink 解決後の実パスで判定する
- PERM-012 high-risk action を high と分類する

## 6A-2 `tests/unit/path-sanitizer.spec.ts`
必須テスト:
- PATH-001 base dir 内の相対パスを正しく解決する
- PATH-002 `../` を含む path traversal を拒否する
- PATH-003 絶対パス escape を拒否する
- PATH-004 symlink escape を拒否する
- PATH-005 Unicode パスを壊さない
- PATH-006 space 含みパスを壊さない

## 6A-3 `tests/unit/input-validator.spec.ts`
必須テスト:
- INP-001 required parameter がない場合失敗
- INP-002 regex validation が効く
- INP-003 enum validation が効く
- INP-004 date-like pattern が効く
- INP-005 path type validation が効く
- INP-006 url type validation が効く
- INP-007 email type validation が効く
- INP-008 invalid input で replay 前に失敗する

## 6A-4 `tests/unit/redact.spec.ts`
必須テスト:
- RED-001 secret value を `[REDACTED]` に置換する
- RED-002 複数 secret をすべて置換する
- RED-003 長文ログ中の secret を消す
- RED-004 exporter 出力候補文字列から secret を除去する
- RED-005 crash report 文字列から secret を除去する

## 6A-5 `tests/unit/risk-classifier.spec.ts`
必須テスト:
- RISK-001 read-only action を low と分類する
- RISK-002 form input を medium と分類する
- RISK-003 send/delete/update/payment を high と分類する
- RISK-004 shell write系を high と分類する

## 6A-6 `tests/unit/normalizer.spec.ts`
必須テスト:
- NORM-001 contiguous keypress を1つの input に圧縮する
- NORM-002 不要 hover を除去する
- NORM-003 click 後の必要 wait を挿入する
- NORM-004 selector candidates を複数保持する
- NORM-005 dynamic id より role/text を優先する
- NORM-006 同一要素への冗長 click を圧縮する
- NORM-007 URL変化なしの state change を表現できる
- NORM-008 unsupported event を silent drop しない

## 6A-7 `tests/unit/parameterizer.spec.ts`
必須テスト:
- PAR-001 YYYY-MM を parameter 候補に抽出する
- PAR-002 path を parameter 候補に抽出する
- PAR-003 repeated literal を parameter 候補に抽出する
- PAR-004 fixed / parameter / secret / derived を分類できる
- PAR-005 default value を保持できる
- PAR-006 required/optional を保持できる
- PAR-007 invalid candidate を parameter 化しない

## 6A-8 `tests/unit/assertion-evaluator.spec.ts`
必須テスト:
- ASSERT-001 urlMatches が通る
- ASSERT-002 textContains が通る
- ASSERT-003 fileExists が通る
- ASSERT-004 exitCode が通る
- ASSERT-005 stdoutRegex が通る
- ASSERT-006 assertion failure 時に失敗理由を返す
- ASSERT-007 複数 assertion を AND で評価する

---

# 6B. Property-Based Tests

対象: 境界条件・入力空間が広い pure logic

## 6B-1 `tests/property/path-sanitizer.property.spec.ts`
必須テスト:
- PROP-PATH-001 任意文字列入力でも base dir 外へ出ない
- PROP-PATH-002 任意文字列入力でも例外か安全パスに正規化される

## 6B-2 `tests/property/permission-policy.property.spec.ts`
必須テスト:
- PROP-PERM-001 denylist コマンドは任意引数でも通らない
- PROP-PERM-002 allowlist 外 URL は任意 path/query でも通らない

## 6B-3 `tests/property/input-validator.property.spec.ts`
必須テスト:
- PROP-INP-001 schema 不一致入力は常に invalid
- PROP-INP-002 enum 外文字列は常に invalid

---

# 6C. Contract Tests

目的: 実装差し替え可能性を保証

## 6C-1 `tests/contract/browser-driver.contract.ts`
必須テスト:
- BDRV-001 navigate 後 currentUrl が変わる
- BDRV-002 locator not found で `locator_not_found` を返す
- BDRV-003 click が deterministic error を返す
- BDRV-004 input が deterministic error を返す
- BDRV-005 waitFor timeout が `navigation_timeout` または適切なコードになる
- BDRV-006 download 成功時に metadata を返す

## 6C-2 `tests/contract/shell-runner.contract.ts`
必須テスト:
- SH-001 command/args を分離して実行できる
- SH-002 exitCode/stdout/stderr を返す
- SH-003 non-zero exit を返せる
- SH-004 timeout を返せる

## 6C-3 `tests/contract/secret-store.contract.ts`
必須テスト:
- SECSTORE-001 secret ref から値取得できる
- SECSTORE-002 missing secret で deterministic error を返す

## 6C-4 `tests/contract/filesystem.contract.ts`
必須テスト:
- FS-001 write/read roundtrip
- FS-002 exists が正しい
- FS-003 move が動く
- FS-004 realpath が取得できる

## 6C-5 `tests/contract/approval-gate.contract.ts`
必須テスト:
- APPR-001 approved を返せる
- APPR-002 rejected を返せる
- APPR-003 timeout / expiration を返せる

## 6C-6 `tests/contract/exporter.contract.ts`
必須テスト:
- EXP-C-001 成果物一式を生成する
- EXP-C-002 unsupported step で fail fast
- EXP-C-003 secret 値を埋め込まない

---

# 6D. Component Tests

目的: DI済み実モジュールの協調動作

## 6D-1 `tests/component/replay-engine.spec.ts`
必須テスト:
- REP-001 step を順番どおり実行する
- REP-002 navigate permission が無い場合 `permission_denied`
- REP-003 input validation failure で開始前に停止
- REP-004 assertion failure で failed になる
- REP-005 timeout で failed になる
- REP-006 retry policy が動く
- REP-007 dry-run で high-risk action を実行しない
- REP-008 assist で approval request を出す
- REP-009 reject で停止する
- REP-010 approve で続行する
- REP-011 runId を生成する
- REP-012 failedStepId を記録する
- REP-013 denied action を記録する
- REP-014 secret を log に残さない
- REP-015 idempotency key により重複実行を防ぐ
- REP-016 file operation が allowlist 外で止まる
- REP-017 shell deny command で止まる
- REP-018 browser.download + fileExists assertion が成功する

## 6D-2 `tests/component/logging.spec.ts`
必須テスト:
- LOG-001 run metadata を保存する
- LOG-002 step logs を保存する
- LOG-003 error taxonomy を保存する
- LOG-004 actor / skill version / input hash を保存する
- LOG-005 redact 後の文字列だけが保存される

## 6D-3 `tests/component/repair-engine.spec.ts`
必須テスト:
- RPR-001 locator_not_found で候補を返す
- RPR-002 DOM fingerprint 類似候補を返す
- RPR-003 high-risk step には auto repair を提案しない
- RPR-004 approved repair のみ適用する
- RPR-005 repair diff を保存する

## 6D-4 `tests/component/registry.spec.ts`
必須テスト:
- REG-001 install/list/remove
- REG-002 enable/disable
- REG-003 version pinning
- REG-004 rollback
- REG-005 corrupted package detection
- REG-006 permission diff 表示データ生成

---

# 6E. Integration Tests

目的: 実ファイル・実プロセス・実CLIを使った統合確認

## 6E-1 `tests/integration/cli.spec.ts`
必須テスト:
- CLI-001 `skillforge init` が成功する
- CLI-002 `skillforge replay` が成功する
- CLI-003 `skillforge export --target openclaw` が成功する
- CLI-004 `skillforge test` が成功する
- CLI-005 `skillforge doctor` が成功する
- CLI-006 不正引数で非0 exit
- CLI-007 `--help` が表示される

## 6E-2 `tests/integration/daemon-api.spec.ts`
必須テスト:
- API-001 daemon 起動/停止
- API-002 recording start/stop
- API-003 replay API
- API-004 export API
- API-005 malformed request で 4xx 相当
- API-006 parallel requests で race しない

## 6E-3 `tests/integration/export-openclaw.spec.ts`
必須テスト:
- OCL-001 `SKILL.md` 生成
- OCL-002 `skillforge.openclaw.json` 生成
- OCL-003 wrapper script 生成
- OCL-004 wrapper が `skillforge replay` を起動する
- OCL-005 input schema が wrapper に反映される
- OCL-006 unsupported step で export failure
- OCL-007 secret が成果物に含まれない
- OCL-008 Unicode path / space path で wrapper が壊れない

## 6E-4 `tests/integration/native-package.spec.ts`
必須テスト:
- NPKG-001 native package export/import roundtrip
- NPKG-002 metadata/version/license 保持
- NPKG-003 tests 同梱
- NPKG-004 元IR同梱

---

# 6F. Security Tests

目的: 明示的な回帰防止

## 6F-1 `tests/security/path-traversal.spec.ts`
必須テスト:
- SEC-PATH-001 write path traversal を拒否する
- SEC-PATH-002 read path traversal を拒否する
- SEC-PATH-003 output path traversal を拒否する

## 6F-2 `tests/security/symlink-escape.spec.ts`
必須テスト:
- SEC-SYM-001 symlink 経由 write escape を拒否する
- SEC-SYM-002 symlink 経由 read escape を拒否する

## 6F-3 `tests/security/shell-injection.spec.ts`
必須テスト:
- SEC-SH-001 `;` 含み入力で command chaining しない
- SEC-SH-002 `&&` 含み入力で command chaining しない
- SEC-SH-003 backticks で command execution しない
- SEC-SH-004 `sh -c` で deny bypass しない

## 6F-4 `tests/security/redirect-bypass.spec.ts`
必須テスト:
- SEC-REDIR-001 allowlist 内URLから外部 redirect で停止する
- SEC-REDIR-002 iframe 外部ドメインで停止する

## 6F-5 `tests/security/secret-leak.spec.ts`
必須テスト:
- SEC-LEAK-001 replay logs に secret が出ない
- SEC-LEAK-002 exporter 成果物に secret が出ない
- SEC-LEAK-003 run metadata に secret が出ない
- SEC-LEAK-004 crash artifacts に secret が出ない
- SEC-LEAK-005 daemon API response に secret が出ない

## 6F-6 `tests/security/high-risk-approval.spec.ts`
必須テスト:
- SEC-HR-001 high-risk step は dry-run で拒否
- SEC-HR-002 assist で approval 必須
- SEC-HR-003 approval reject で stop
- SEC-HR-004 approval accept で continue

---

# 6G. Browser Recorder Tests

目的: browser-first v1 recorder の自動確認

## 6G-1 `tests/integration/recorder.spec.ts`
必須テスト:
- REC-001 recording start/stop
- REC-002 navigate event capture
- REC-003 click event capture
- REC-004 input event capture
- REC-005 select/checkbox capture
- REC-006 download event capture
- REC-007 pause/resume
- REC-008 password input は secret 扱い
- REC-009 recorder crash 時に partial session 保存
- REC-010 event loss を silent fail しない

### 注記
Recorder 実装は browser extension でも CDP bridge でもよい。  
ただしテスト可能で決定的であること。  
**実装手段は問わないが、上記 recorder contract を満たすこと。**

---

# 6H. End-to-End Tests

目的: 代表ユースケースを最後まで保証

## 6H-1 `tests/e2e/invoice-download.e2e.spec.ts`
必須テスト:
- E2E-INV-001 fixture portal へ login
- E2E-INV-002 invoice_month parameter で対象請求書へ移動
- E2E-INV-003 PDF を download
- E2E-INV-004 fileExists assertion pass
- E2E-INV-005 OpenClaw export wrapper 経由でも成功
- E2E-INV-006 secret が出力されない

## 6H-2 `tests/e2e/forty-two-preflight.e2e.spec.ts`
必須テスト:
- E2E-42-001 fixture repo に対して make 実行
- E2E-42-002 norm 相当チェック実行
- E2E-42-003 forbidden function grep 実行
- E2E-42-004 exitCode / stdout parsing
- E2E-42-005 report 生成
- E2E-42-006 OpenClaw wrapper 経由で report を返す

## 6H-3 `tests/e2e/website-change-watcher.e2e.spec.ts`
必須テスト:
- E2E-WEB-001 初回取得
- E2E-WEB-002 変更なし判定
- E2E-WEB-003 変更あり判定
- E2E-WEB-004 必要情報だけ通知 payload に含める

## 6H-4 `tests/e2e/repair-flow.e2e.spec.ts`
必須テスト:
- E2E-RPR-001 初回 replay 成功
- E2E-RPR-002 fixture のボタン文言変更で失敗
- E2E-RPR-003 repair suggestion 取得
- E2E-RPR-004 approved repair 適用
- E2E-RPR-005 再 replay 成功

---

# 7. Fixture Assetsの必須要件

すべてローカル fixture として実装すること。  
外部SaaS・外部Webサイト禁止。

## 7.1 `tests/fixtures/apps/invoice-portal`
必須ページ:
- `/login`
- `/dashboard`
- `/invoices?month=YYYY-MM`
- Download PDF endpoint
- 遅延表示UIを含む
- dynamic locator を1箇所含む

## 7.2 `tests/fixtures/apps/redirect-trap`
- allowlist 内から外部 redirect を試す UI

## 7.3 `tests/fixtures/apps/dynamic-id`
- DOM id が毎回変化する UI
- role/text locator でのみ安定動作する UI

## 7.4 `tests/fixtures/apps/delayed-modal`
- unexpected modal が一定条件で出る UI

## 7.5 `tests/fixtures/apps/change-watcher`
- テキスト内容をテスト内から切り替えられる UI

## 7.6 `tests/fixtures/repos/42-preflight-repo`
- make 通るケース
- make 失敗するケース
- forbidden function を含むケース
- shell report parsing を検証できる fixture

---

# 8. テスト用Fakes / Helpers必須

以下を実装すること。

## 8.1 `tests/fakes/fake-browser-driver.ts`
- 呼び出し履歴を保持
- deterministic error を返せる
- currentUrl を返せる

## 8.2 `tests/fakes/fake-shell-runner.ts`
- exitCode/stdout/stderr を任意設定可能

## 8.3 `tests/fakes/in-memory-filesystem.ts`
- read/write/move/exists/realpath の最小実装
- symlink 相当検証が必要なら temp FS を使う

## 8.4 `tests/fakes/fake-secret-store.ts`
- ref → secret value
- missing secret error

## 8.5 `tests/fakes/fake-approval-gate.ts`
- approved/rejected/expired を返せる

## 8.6 `tests/helpers/fixtures.ts`
- temp dir 作成
- local fixture app 起動停止
- test clock
- helper assertions

---

# 9. 実装順序の固定

Codex は以下の順にのみ進めること。  
前段のテストが green になるまで次へ進んではならない。

## Step 1
- Bootstrap
- lint/typecheck/test 基盤構築

## Step 2
- `permission-policy.spec.ts`
- `path-sanitizer.spec.ts`
- `input-validator.spec.ts`
- `redact.spec.ts`
- `risk-classifier.spec.ts`

## Step 3
- `normalizer.spec.ts`
- `parameterizer.spec.ts`
- `assertion-evaluator.spec.ts`

## Step 4
- contract tests 一式
- fakes 実装

## Step 5
- `replay-engine.spec.ts`
- `logging.spec.ts`

## Step 6
- native exporter
- OpenClaw exporter
- CLI integration

## Step 7
- fixture apps 実装
- recorder integration tests
- invoice-download E2E

## Step 8
- 42-preflight E2E
- website-change-watcher E2E
- repair-flow E2E

## Step 9
- security regressions 完了
- docs 更新
- release gate 実行

---

# 10. OpenClaw連携テストの扱い

v1では **OpenClaw 本体の実インストールを必須にしない**。  
代わりに以下をもって OpenClaw 連携成功とみなす。

## 必須条件
- `SKILL.md` が生成される
- `skillforge.openclaw.json` が生成される
- wrapper script が生成される
- wrapper script が `skillforge replay` を正しい引数で起動する
- wrapper script 経由で local replay が成功する
- schema mismatch で wrapper が fail fast する
- secret が wrapper や manifest に埋め込まれない

---

# 11. CI構成要件

以下の scripts を `package.json` に定義すること。

```json
{
  "scripts": {
    "lint": "eslint .",
    "format": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test:unit": "vitest run tests/unit",
    "test:property": "vitest run tests/property",
    "test:contract": "vitest run tests/contract",
    "test:component": "vitest run tests/component",
    "test:integration": "vitest run tests/integration",
    "test:security": "vitest run tests/security",
    "test:e2e": "playwright test",
    "test": "pnpm test:unit && pnpm test:property && pnpm test:contract && pnpm test:component && pnpm test:integration && pnpm test:security && pnpm test:e2e",
    "build": "tsc -p tsconfig.json"
  }
}
```

## CIゲート
以下がすべて green であること。
- lint
- typecheck
- unit
- property
- contract
- component
- integration
- security
- e2e
- build

---

# 12. カバレッジ目標

カバレッジは quality gate とする。

## 全体目標
- lines: 85%以上
- branches: 80%以上

## 重要モジュール目標
以下はさらに高くする。
- `src/security/**`: 95%以上
- `src/replay/**`: 90%以上
- `src/exporters/openclaw/**`: 90%以上
- `src/core/input-validator/**`: 95%以上
- `src/core/path-sanitizer/**`: 95%以上

---

# 13. 失敗時の判断原則

人間に聞かず、以下のルールで判断する。

## 13.1 テストが不安定な場合
- テストを削るな
- fixture を deterministic に直す
- clock / random / temp path を制御する
- browser waits を状態ベースに直す
- retry で誤魔化さない

## 13.2 仕様とテストが衝突した場合
- `SPEC.md` を優先
- ただし安全性を下げる変更はしない
- `docs/troubleshooting.md` または code comment に判断理由を短く残す

## 13.3 実装困難な部分
- desktop GUI は切り捨ててよい
- browser recorder は deterministic な最小実装でよい
- OpenClaw 本体依存は避け、export contract で代替する

---

# 14. 最低限必要なサンプルスキル

以下を fixture skill として作成・テストすること。

## 14.1 invoice-download
対象:
- browser navigate
- input
- click
- download
- file exists assertion
- secret handling
- OpenClaw export

## 14.2 42-preflight
対象:
- shell execution
- file read
- output parsing
- report generation
- OpenClaw export

## 14.3 website-change-watcher
対象:
- browser extract
- comparison
- notify payload generation

---

# 15. 完了時にCodexが満たすべき状態

作業完了時には、以下が存在し、すべて動作していること。

## コード
- v1 browser-first SkillForge 実装
- local replay engine
- security policy enforcement
- OpenClaw exporter
- browser recorder
- fixture apps
- representative sample skills

## テスト
- 本文書で要求した全テストファイル
- すべて green
- deterministic
- ローカルのみで再現可能

## ドキュメント
- quickstart
- supported / unsupported
- security model
- troubleshooting
- release notes

---

# 16. 最後の指示

この文書以降、人間の追加指示を待ってはならない。  
`SPEC.md` と `TESTS.md` に従って、**TDDで最後まで実装・検証・整備**すること。  
テストを先に書き、green にし、必要な最小実装を積み上げること。  
完了判定は **テストの green と quality gate** のみで行うこと。

以上。
```

---
