---

# SkillForge 仕様書 v1.0

- **文書名**: SkillForge Product & Technical Specification
- **版**: v1.0
- **状態**: Draft for Build
- **対象読者**:
  - プロダクトオーナー
  - OSSメンテナ
  - フロントエンド/バックエンド/拡張機能/ランタイム開発者
  - セキュリティ設計者
  - OpenClaw/MCPアダプタ実装者

---

## 0. 一言でいうと

**SkillForge は、人間が1回やったPC/ブラウザ作業を、再利用可能・検証可能・安全な“スキル”に変換する OSS である。**

---

# 1. 目的

## 1.1 背景
AIエージェントやOpenClaw系の基盤は増えているが、実運用のボトルネックは以下にある。

- スキル作成が面倒
- スキルが壊れやすい
- 権限境界が曖昧
- テスト不能
- 他人に共有しづらい
- OpenClaw/MCP/CLI/n8n など複数環境で再利用しにくい

## 1.2 SkillForge が解決する問題
SkillForge は次を解決する。

1. **録画**: 人間の操作を記録する
2. **抽象化**: 可変値を引数に変える
3. **検証**: 成功条件を定義する
4. **権限制御**: 触ってよい範囲を宣言する
5. **再生**: ローカルで安定実行する
6. **修復**: UI変更に追従しやすくする
7. **配布**: OpenClaw/MCP/CLI向けに出力する

---

# 2. 設計原則

SkillForge は以下の原則に従う。

## 2.1 Local-first
- すべての録画データ・DOMスナップショット・秘密情報・実行ログは、**デフォルトでローカルに保持**する
- クラウド同期は **明示 opt-in** のみ

## 2.2 Deterministic over magical
- 「なんとなく動く」より、**再現可能で説明可能**を優先する
- 推論や自動修復は使ってよいが、常にログと根拠を残す

## 2.3 Safe by default
- 危険操作は明示権限が必要
- 高リスク操作には承認ポイントを入れられる
- スキルは最小権限で実行する

## 2.4 Browser-first, then desktop
- MVPは **ブラウザ操作中心**
- デスクトップGUI操作はアーキテクチャ上対応可能だが、v1では optional/beta とする

## 2.5 Skill IR first
- 内部表現は SkillForge 独自の **中間表現 (IR)** を持つ
- OpenClaw/MCP/CLI への出力はアダプタで行う
- 上流/下流の仕様変更を局所化する

## 2.6 OSS ecosystem first
- コアは OSS
- 外部スキル、検証器、修復器、エクスポータを拡張可能にする

---

# 3. 本仕様における用語

本仕様では以下のキーワードを用いる。

- **MUST**: 必須
- **SHOULD**: 強く推奨
- **MAY**: 任意

### 用語
- **Skill**: 実行可能な業務フロー単位の定義
- **Step**: Skillを構成する最小操作単位
- **Recorder**: 操作録画モジュール
- **Parameterizer**: 可変値抽出モジュール
- **Verifier**: 成功条件/検証条件の付与モジュール
- **Replay Engine**: Skillを再実行するランタイム
- **Repair Engine**: 壊れたStepの修復支援モジュール
- **Manifest**: 権限・入出力・実行条件を宣言するメタデータ
- **Exporter**: OpenClaw/MCP等へ変換するモジュール
- **Registry**: Skillの配布・検索・バージョン管理の仕組み

---

# 4. 対象ユーザー

## 4.1 個人開発者
- 自分の定型作業を自動化したい
- OpenClawやCLIから再利用したい

## 4.2 業務自動化担当
- 経理/採用/営業事務などの反復作業をテンプレ化したい
- 安全性と説明可能性が必要

## 4.3 OSSコミュニティ
- Skillテンプレートを公開・共有したい
- 他のエージェント基盤にも使い回したい

## 4.4 エンタープライズ導入担当
- ローカル実行、監査ログ、権限分離が欲しい
- 生成AIより“運用可能な自動化”を求める

---

# 5. 非目標

SkillForge は以下を v1 の非目標とする。

1. 完全自律エージェントの構築基盤になること
2. すべてのデスクトップUIを完全自動化すること
3. RPA製品全体を置き換えること
4. ノーコード業務SaaS全体を代替すること
5. OpenClaw固有仕様にロックインすること

---

# 6. 成功指標

## 6.1 プロダクトKPI
- 録画から再実行成功までの平均時間: **5分以内**
- 初回録画Skillの再実行成功率: **70%以上**
- 修正後の再実行成功率: **90%以上**
- READMEだけで試せるサンプル数: **10以上**
- コミュニティ作成Skill数: **100以上 / 6か月**

## 6.2 技術KPI
- Replay Engine 実行中のクラッシュ率: **1%未満**
- 録画中のイベント欠損率: **0.1%未満**
- ローカルログ保存失敗率: **0.1%未満**
- Export失敗率: **2%未満**

---

# 7. ユースケース

## 7.1 請求書ダウンロード
- 人間が取引先ポータルにログイン
- 当月のPDFをダウンロード
- 保存先を整える
- Slack/Discordに完了報告
- 以後は月だけ指定して再実行

## 7.2 GitHubレビュー補助
- PRページを開く
- 変更ファイルを読む
- 特定ルールに沿ってコメントの下書きを作る
- OpenClawスキルとして利用

## 7.3 EC管理画面巡回
- 在庫/レビュー/価格を収集
- 異常があれば通知
- 定期実行する

---

# 8. システム全体アーキテクチャ

```text
[User]
  ├─ Browser Extension (Recorder UI)
  ├─ Desktop Client UI
  └─ CLI

[SkillForge Local Daemon]
  ├─ Recording Session Manager
  ├─ Event Normalizer
  ├─ Parameterizer
  ├─ Verifier Generator
  ├─ Permission Manifest Builder
  ├─ Replay Engine
  ├─ Repair Engine
  ├─ Exporter Manager
  ├─ Secret Manager Adapter
  └─ Local Registry

[Execution Drivers]
  ├─ Browser Driver
  ├─ File Driver
  ├─ Shell Driver
  ├─ HTTP Driver
  └─ Desktop Driver (beta)

[Output Targets]
  ├─ SkillForge Native Package
  ├─ OpenClaw Skill Adapter
  ├─ MCP Adapter
  ├─ CLI Wrapper
  └─ JSON/YAML Workflow
```

---

# 9. コアモジュール仕様

---

## 9.1 Recorder

### 9.1.1 目的
人間の操作を構造化イベント列として記録する。

### 9.1.2 録画対象
Recorder は以下を MUST でサポートする。

#### ブラウザ操作
- navigate
- click
- doubleClick
- input
- select
- checkbox toggle
- keypress / hotkey
- submit
- tab switch
- new tab open
- file download detection
- clipboard read/write event marker
- DOM text extraction marker
- wait condition marker
- screenshot capture

#### ローカル操作
- ファイル選択
- ファイル保存先指定
- shell command 実行
- stdout/stderr/exit code の記録

#### 将来拡張
- desktop click
- window focus
- accessibility tree interaction
- drag and drop
- OCR/vision anchor

### 9.1.3 記録内容
各イベントは最低限以下を持つ。

```yaml
id: step-001
timestamp: 2026-03-12T10:11:12Z
type: browser.click
context:
  url: https://example.com/invoices
  tabId: 3
target:
  locatorCandidates:
    - role=button[name="Download"]
    - text="Download"
    - css=button.download
  domFingerprint:
    tag: button
    text: Download
    attributes:
      class: btn btn-primary
      aria-label: Download invoice
input: null
output: null
artifacts:
  screenshot: artifacts/step-001-before.png
risk: low
```

### 9.1.4 Recorder の要件
- 録画の開始・一時停止・再開・停止を MUST サポート
- 録画中に秘密情報をマスクする機能を MUST サポート
- 入力値は「保存する / パラメータ化する / secret化する」を選べる UI を SHOULD 提供
- recorder は event loss を検知し、欠落警告を出す SHOULD

### 9.1.5 秘密情報保護
Recorder は以下を自動判定 SHOULD とする。
- password field
- OTP
- API token らしき文字列
- email / phone / address などPII
- cookie / session storage 重要値

判定されたデータは、デフォルトで:
- 本文保存しない
- `secretRef` または `redacted` として扱う

---

## 9.2 Event Normalizer

### 目的
録画イベントを実行しやすい中立フォーマットへ正規化する。

### 役割
- 冗長イベントの圧縮
- waitの自動挿入
- 連続入力のバッファ化
- URL遷移とDOM変化の対応づけ
- セレクタ候補の優先順位付け

### 正規化ルール
- 連続keypressは `browser.input` に統合 SHOULD
- 同一要素への連続clickは `doubleClick` or retryに変換 MAY
- 暗黙waitは明示 `waitFor` step に昇格 SHOULD
- 失敗しやすいselectorのみの記録は禁止。複数候補を MUST 保持

---

## 9.3 Parameterizer

### 目的
録画された固定値を、再利用可能な入力パラメータに変換する。

### 抽出対象
- 日付
- 金額
- 顧客名
- URL
- フォルダパス
- 商品名
- キーワード
- 検索条件
- ファイル名
- 送信先
- テンプレ文面

### パラメータ型
```yaml
type:
  - string
  - integer
  - number
  - boolean
  - date
  - datetime
  - enum
  - path
  - url
  - email
  - secret
  - json
```

### 抽出方法
- 値の繰り返し利用頻度
- ラベルや周辺DOM文脈
- 正規表現
- ユーザー確認UI
- 履歴比較

### 要件
- Parameterizer は各値に対して `fixed / parameter / secret / derived` の分類を MUST 提供
- パラメータにはバリデーション規則を付与 SHOULD
- デフォルト値・必須/任意を指定可能 MUST

### 例
```yaml
inputs:
  invoice_month:
    type: string
    pattern: '^\d{4}-\d{2}$'
    required: true
    description: 対象請求月
  download_dir:
    type: path
    required: true
    default: ~/Documents/Invoices
  vendor_login:
    type: secret
    required: true
```

---

## 9.4 Verifier

### 目的
「成功したかどうか」を定義する。

### 検証種別
- DOM element visible
- text contains
- URL match
- file exists
- file checksum / size
- stdout regex
- exit code
- network response status
- screenshot snapshot diff
- semantic extraction match
- custom script assertion

### 自動生成ルール
Verifier は以下を自動提案 SHOULD とする。
- クリック後にページ遷移したら URL assertion
- ダウンロードが発生したら file exists assertion
- テーブルから値を読んだら extraction assertion
- shell実行後に exit code assertion

### 手動追加
ユーザーは任意Stepに検証を追加 MUST できる。

### 例
```yaml
assertions:
  - type: urlMatches
    value: '^https://example.com/invoices'
  - type: fileExists
    path: '{{download_dir}}/{{invoice_month}}.pdf'
  - type: textContains
    locator: 'h1'
    value: 'Invoices'
```

---

## 9.5 Permission Manifest

### 目的
スキルが何にアクセスできるかを宣言する。

### 権限カテゴリ
- browser.domains
- browser.downloads
- file.read
- file.write
- shell.allow
- shell.deny
- http.allow
- clipboard.read/write
- desktop.apps
- notifications.send
- secrets.read

### 要件
- Skillは manifest に宣言された権限の範囲外を MUST 実行できない
- 危険操作には risk level を MUST 付与する
- deny list は allow list より優先 MUST

### リスク分類
- **low**: 閲覧、抽出、スクリーンショット
- **medium**: フォーム入力、ファイル作成、下書き保存
- **high**: 送信、削除、更新、支払い確定、外部送信、shell write系

### 例
```yaml
permissions:
  browser:
    domains:
      allow:
        - https://portal.vendor.example
      downloads: true
  files:
    read:
      - ~/Downloads
    write:
      - ~/Documents/Invoices
  shell:
    allow:
      - mv
      - cp
      - ls
    deny:
      - rm
      - sudo
      - curl
  secrets:
    read:
      - vendor_portal_credential
```

---

## 9.6 Replay Engine

### 目的
SkillForge IR をローカルで再実行する。

### 実行モード
- **dry-run**: 実際の変更を行わず検証だけ
- **assist**: 危険操作前に確認
- **autopilot**: 許可範囲内を自動実行

### Stepタイプ
Replay Engine は最低限以下を MUST サポートする。

```text
browser.navigate
browser.click
browser.input
browser.select
browser.waitFor
browser.extract
browser.download
browser.screenshot
file.move
file.copy
file.rename
file.exists
shell.exec
notify.send
approve.request
flow.if
flow.loop
flow.fail
flow.return
```

### 再生要件
- 各stepに timeout MUST
- 各stepに retry policy SHOULD
- 失敗時は artifacts を保存 MUST
- 実行ごとに runId を発行 MUST
- ログは時系列とstep単位の両方で取得 MUST

### 失敗時処理
- screenshot保存
- DOM snapshot保存
- 直前5stepの context 保存
- error taxonomy 付与
- repair engineへの入力生成

### Idempotency
Skillは可能であれば idempotency key を定義 SHOULD する。

例:
- 請求書ダウンロード済みなら再ダウンロードしない
- 同じメッセージを二重送信しない

---

## 9.7 Repair Engine

### 目的
UI変更や環境差異で失敗したStepを修復支援する。

### 修復戦略
優先順位は以下。

1. 保存済み安定locatorの再試行
2. role/name/label ベース探索
3. text近傍探索
4. DOM fingerprint 類似探索
5. 視覚アンカー探索
6. ユーザー介入要求

### 修復モード
- **suggest**: 候補だけ出す
- **semi-auto**: ユーザー承認後に修正
- **auto**: safe step に限り自動適用

### 要件
- high risk step は repair auto 適用禁止 SHOULD
- 修復履歴を差分として保存 MUST
- 修復後は関連テストを再実行 SHOULD

### 修復記録
```yaml
repair:
  stepId: step-014
  cause: locator_not_found
  tried:
    - roleBased
    - textBased
  selected:
    strategy: domSimilarity
    locator: 'button[aria-label="Download PDF"]'
  approvedBy: user
  appliedAt: 2026-03-12T12:00:00Z
```

---

## 9.8 Exporter Manager

### 目的
SkillForge IR を他実行環境に変換する。

### v1 で必須の出力先
- SkillForge Native Package
- OpenClaw Adapter Package
- MCP Adapter
- CLI Wrapper

### OpenClaw Export の基本方針
OpenClaw 側の仕様変更に備え、出力は以下の2層に分ける。

1. **人間可読な SKILL.md**
2. **機械可読な adapter manifest**
3. **必要なら helper scripts**

#### OpenClaw Export の成果物例
```text
/export/openclaw/
  SKILL.md
  skillforge.openclaw.json
  run.sh
  prompts/
  tests/
```

### MCP Export の成果物例
```text
/export/mcp/
  server.py
  tool_manifest.json
  requirements.txt
  README.md
```

### 要件
- Export は不可逆変換であってはならない。元IRを必ず同梱 SHOULD
- Export 時に権限情報を保持 MUST
- unsupported step は明示エラー MUST

---

## 9.9 Local Registry

### 目的
ローカル環境のSkill管理を行う。

### 機能
- インストール
- 有効化/無効化
- バージョン管理
- タグ検索
- dependency解決
- 署名検証
- rollback

### ディレクトリ例
```text
~/.skillforge/
  registry/
  packages/
  runs/
  logs/
  cache/
  secrets/
  exporters/
```

---

# 10. SkillForge パッケージ仕様

---

## 10.1 パッケージ構成

```text
my-skill/
  skillforge.yaml
  README.md
  assets/
  scripts/
  tests/
  fixtures/
  prompts/
  exporters/
```

---

## 10.2 `skillforge.yaml` スキーマ

```yaml
apiVersion: skillforge.io/v1alpha1
kind: SkillPackage

metadata:
  name: invoice-download
  displayName: Vendor Invoice Downloader
  version: 0.1.0
  description: Download monthly invoices from vendor portal
  author: your-name
  license: Apache-2.0
  tags: [finance, browser, invoices]
  maturity: beta

runtime:
  mode: assist
  timeoutSeconds: 300
  retryPolicy:
    maxRetries: 2
    backoffSeconds: 3

inputs:
  invoice_month:
    type: string
    required: true
    pattern: '^\d{4}-\d{2}$'
  download_dir:
    type: path
    required: true
    default: ~/Documents/Invoices
  credential_ref:
    type: secret
    required: true

permissions:
  browser:
    domains:
      allow:
        - https://portal.vendor.example
    downloads: true
  files:
    read:
      - ~/Downloads
    write:
      - ~/Documents/Invoices
  shell:
    allow: [mv, cp, ls]
    deny: [rm, sudo, curl, wget]
  secrets:
    read:
      - vendor_portal_credential

steps:
  - id: open-login
    type: browser.navigate
    with:
      url: https://portal.vendor.example/login

  - id: fill-email
    type: browser.input
    target:
      locatorCandidates:
        - role=textbox[name="Email"]
        - css=input[type="email"]
    with:
      value: "{{secrets.vendor_portal_credential.username}}"

  - id: fill-password
    type: browser.input
    target:
      locatorCandidates:
        - role=textbox[name="Password"]
        - css=input[type="password"]
    with:
      value: "{{secrets.vendor_portal_credential.password}}"
    secret: true

  - id: submit-login
    type: browser.click
    target:
      locatorCandidates:
        - role=button[name="Sign in"]

  - id: assert-dashboard
    type: browser.waitFor
    with:
      condition:
        type: textContains
        locator: h1
        value: Dashboard
      timeoutSeconds: 20

  - id: open-invoices
    type: browser.navigate
    with:
      url: "https://portal.vendor.example/invoices?month={{invoice_month}}"

  - id: click-download
    type: browser.click
    target:
      locatorCandidates:
        - role=button[name="Download PDF"]
        - text="Download PDF"

  - id: wait-download
    type: browser.download
    with:
      saveAs: "{{download_dir}}/{{invoice_month}}.pdf"

assertions:
  - type: fileExists
    path: "{{download_dir}}/{{invoice_month}}.pdf"

outputs:
  downloaded_file:
    type: path
    value: "{{download_dir}}/{{invoice_month}}.pdf"

tests:
  - id: happy-path
    input:
      invoice_month: "2026-02"
      download_dir: "./fixtures/out"
    expect:
      assertionsPass: true

export:
  targets:
    - openclaw
    - mcp
    - cli
```

---

# 11. UI/UX仕様

---

## 11.1 録画UI
ユーザーは以下のUI操作を MUST 利用できる。

- Record
- Pause
- Resume
- Stop
- Mark as variable
- Mark as secret
- Insert checkpoint
- Add note
- Add assertion
- Preview generated skill

### 録画後レビュー画面
- タイムライン表示
- Step編集
- パラメータ一覧
- 権限一覧
- リスク表示
- テスト実行
- Exportボタン

---

## 11.2 リスク表示
UI は step ごとに色分け SHOULD する。

- 緑: read-only
- 黄: write/draft
- 赤: send/delete/exec/high-risk

---

## 11.3 実行画面
以下を表示 MUST する。

- 現在step
- 成功/失敗
- リトライ状況
- スクショ
- ログ
- 途中停止
- 承認待ちアクション

---

# 12. CLI仕様

---

## 12.1 コマンド一覧

```bash
skillforge init
skillforge record
skillforge review
skillforge replay <skill>
skillforge test <skill>
skillforge export <skill> --target openclaw
skillforge repair <run-id>
skillforge registry install <package>
skillforge registry list
skillforge runs list
skillforge logs tail <run-id>
skillforge doctor
```

---

## 12.2 コマンド詳細

### `skillforge init`
- ローカル環境初期化
- 必要ディレクトリ生成
- secret provider 設定

### `skillforge record`
- 録画セッション開始
- `--browser`, `--desktop`, `--shell` 指定可

### `skillforge review`
- 最新録画のレビューUIを開く

### `skillforge replay`
- Skill実行
- `--mode dry-run|assist|autopilot`
- `--input key=value`

### `skillforge test`
- tests/ を一括実行

### `skillforge export`
- OpenClaw/MCP/CLI出力

### `skillforge doctor`
- 拡張機能・ローカルdaemon・権限・driverの健全性確認

---

# 13. API仕様

ローカルdaemonは HTTP または Unix Domain Socket API を提供する。

## 13.1 エンドポイント例

### POST `/api/v1/recordings/start`
```json
{
  "mode": "browser",
  "browser": "chromium"
}
```

### POST `/api/v1/recordings/stop`
```json
{
  "sessionId": "rec_123"
}
```

### POST `/api/v1/skills/{id}/replay`
```json
{
  "mode": "assist",
  "inputs": {
    "invoice_month": "2026-02"
  }
}
```

### POST `/api/v1/skills/{id}/export`
```json
{
  "target": "openclaw"
}
```

### POST `/api/v1/runs/{runId}/repair`
```json
{
  "mode": "suggest"
}
```

---

# 14. セキュリティ仕様

---

## 14.1 Secret Management
秘密情報は平文保存してはならない。

### 対応方法
- OS keychain
- env var reference
- encrypted local vault
- external secret provider plugin

### ルール
- `secret` 型入力はログに表示禁止 MUST
- screenshotsに秘密が映る可能性がある場合はマスク SHOULD
- export成果物に秘密値を埋め込んではならない MUST

---

## 14.2 Sandbox
Replay Engine は以下を SHOULD 実装する。

- file path allowlist
- shell command allowlist
- network domain allowlist
- runtime permission check
- high-risk approval gate

---

## 14.3 Auditability
各runは以下を MUST 記録する。

- runId
- skill version
- inputs hash
- actor
- start/end time
- executed steps
- denied actions
- approvals
- artifacts path
- exit reason

---

## 14.4 Supply Chain
Registry配布パッケージは署名 SHOULD をサポートする。

- package checksum
- publisher identity
- optional signature verification
- trust policy

---

# 15. プライバシー仕様

- テレメトリは **デフォルト無効** MUST
- 録画データ外部送信は opt-in MUST
- DOM snapshot / screenshots の保持期間設定 MUST
- `--redact-all-inputs` モード SHOULD

---

# 16. 実行安全性仕様

---

## 16.1 高リスク操作
以下は `high` とする。

- delete
- send
- submit order/payment
- shell command write/delete系
- external webhook send
- record overwrite

### 高リスク操作の要件
- dry-runでは実行禁止 MUST
- assist/autopilot でも approval gate を SHOULD 要求
- audit log 必須 MUST

---

## 16.2 Approval Step
```yaml
- id: approve-send
  type: approve.request
  with:
    title: "請求書督促メールを送信しますか？"
    summary: "送信先: foo@example.com"
    expiresInSeconds: 300
```

---

# 17. テスト仕様

---

## 17.1 テストレベル
SkillForge は以下のテスト層を持つ。

1. **Unit test**
2. **Step test**
3. **Skill integration test**
4. **Replay regression test**
5. **Exporter snapshot test**
6. **Repair validation test**

---

## 17.2 Skillテスト
各Skillは最低1本の happy path test を SHOULD 持つ。

### テスト内容
- パラメータ解決
- 権限適用
- step replay
- assertion pass
- outputs generation

---

## 17.3 回帰テスト
修復やstep変更後は、既存fixtureで再実行する。

### 必須条件
- assertion pass率
- selector stability score
- runtime variance

---

# 18. エラー分類

失敗は以下に分類 MUST する。

- `locator_not_found`
- `navigation_timeout`
- `download_timeout`
- `assertion_failed`
- `permission_denied`
- `secret_unavailable`
- `shell_exit_nonzero`
- `network_denied`
- `unsupported_step`
- `environment_mismatch`
- `unexpected_modal`
- `manual_intervention_required`

---

# 19. ログ/アーティファクト仕様

各runで以下を保存する。

```text
runs/<runId>/
  run.json
  steps/
    step-001.json
    step-002.json
  screenshots/
  dom/
  downloads/
  stdout/
  stderr/
  repair/
```

### `run.json` 例
```json
{
  "runId": "run_20260312_001",
  "skill": "invoice-download",
  "version": "0.1.0",
  "status": "failed",
  "startedAt": "2026-03-12T10:00:00Z",
  "endedAt": "2026-03-12T10:02:13Z",
  "failedStepId": "click-download",
  "errorType": "locator_not_found"
}
```

---

# 20. OpenClaw連携仕様

OpenClaw 側の詳細仕様変動に備え、SkillForge は **adapter-based integration** を採用する。

## 20.1 目的
- SkillForge IR を OpenClaw の “skill” として利用可能にする
- 仕様変更時の影響を exporter に閉じ込める

## 20.2 生成物
### `SKILL.md`
- 人間向け説明
- 何をするスキルか
- 入力
- 使う権限
- 実行例
- 危険操作
- 失敗時の挙動

### `skillforge.openclaw.json`
- マシン向けマッピング
- エントリポイント
- 引数 schema
- 権限
- expected outputs

### `run.sh` or `main.py`
- OpenClaw から実行されるラッパ

## 20.3 OpenClaw Export要件
- スキルの説明は自然言語で生成 MUST
- 入出力schemaを失わない MUST
- 権限範囲を明記 MUST
- unsupported step がある場合は fail fast MUST

---

# 21. MCP連携仕様

MCP向けには、Skillを「1つまたは複数のツール」として公開する。

## 21.1 MCP Export要件
- 各Skillを callable tool として公開
- 入力schemaを JSON Schema 化
- 出力schemaを JSON Schema 化
- 実行はローカルdaemonを経由

---

# 22. Desktop Automation 仕様

v1では beta。  
ただしアーキテクチャは先に定義する。

## 22.1 Desktop Driver 抽象
```text
DesktopDriver
  - listWindows()
  - focusWindow()
  - click(target)
  - type(text)
  - readAccessibilityTree()
  - screenshot()
```

## 22.2 ターゲティング手法
優先順位:
1. accessibility identifier
2. window title + role
3. OCR text anchor
4. coordinate fallback

## 22.3 制約
- 座標クリックのみの自動化は fragile として警告 SHOULD
- accessibility tree が取得できないアプリは beta 表示 MUST

---

# 23. スキル共有・Registry仕様

---

## 23.1 Registryの目的
- Skillパッケージ配布
- バージョン公開
- 評価
- fork
- trust管理

## 23.2 メタデータ
- author
- publisher verification
- tags
- screenshots
- supported platforms
- supported exporters
- risk level
- maturity
- install count

## 23.3 セキュリティ
- install前に permission diff を表示 MUST
- 署名がないパッケージは警告 SHOULD
- high-risk skill は特別警告 MUST

---

# 24. バージョニング仕様

- SkillForge core: SemVer
- Skill package: SemVer
- Adapter schema: 独立SemVer
- `apiVersion` により後方互換管理

### 互換ルール
- patch: バグ修正
- minor: 後方互換ある新機能
- major: 破壊的変更

---

# 25. OSSライセンス・ガバナンス

## 25.1 推奨ライセンス
- **Core**: Apache-2.0
- **Docs**: CC-BY 4.0
- **Sample Skills**: Apache-2.0 または MIT

## 25.2 理由
- 商用利用を阻害しない
- OSSエコシステムが広がりやすい
- 特許条項を持てる

## 25.3 Governance
- Core maintainers
- RFC process
- Adapter/plugin contribution guide
- Security disclosure policy

---

# 26. MVP定義

---

## 26.1 MVPで必須
- Browser Recorder
- Event Normalizer
- Parameterizer
- Verifier
- Permission Manifest
- Replay Engine
- Local Registry
- OpenClaw Export
- CLI
- 3つの sample skill

## 26.2 MVPで対象外
- 完全な desktop automation
- visual self-healing
- team cloud sync
- marketplace
- fine-grained multi-user auth

---

# 27. v1.1 / v2ロードマップ

## v1.1
- Desktop driver beta
- Repair engine semi-auto
- Skill diff UI
- approval templates
- better secrets masking

## v1.2
- Registry公開版
- package signing
- community verification badges
- CI test runner

## v2
- visual anchors
- team workspace
- cron orchestration
- self-healing confidence scoring
- enterprise policy engine

---

# 28. 受け入れ基準

---

## 28.1 Recorder受け入れ基準
- ブラウザ上の click/input/navigate が記録できる
- 録画後にタイムラインが生成される
- secret入力が平文保存されない

## 28.2 Replay受け入れ基準
- sample skill 3本がローカルで再実行成功
- 失敗時に screenshot と error taxonomy が保存される
- manifest外のshell commandが拒否される

## 28.3 Export受け入れ基準
- OpenClaw向け出力が生成される
- SKILL.md が人間可読である
- adapter manifest に入力schemaが含まれる

## 28.4 Security受け入れ基準
- secret値が log / export / artifact に漏れない
- deny command が実行不能
- risk high step で approval が要求できる

---

# 29. 代表サンプルスキル

v1には最低以下を同梱 SHOULD。

1. **Invoice Downloader**
2. **GitHub PR Review Prep**
3. **Notion Daily Report Sync**
4. **Website Change Watcher**

---

---

# 31. 実装技術スタック推奨

これは仕様の一部ではないが、実装容易性の観点から推奨する。

## コア
- TypeScript または Rust + TSハイブリッド

## Browser Recorder
- Browser Extension
- Chromium first
- content scripts + background worker + native bridge

## Replay
- Playwright系 driver abstraction を推奨

## UI
- React / Next.js / Tauri / Electron のいずれか

## Local daemon
- Node.js or Rust
- local HTTP / UDS API

## Secrets
- OS keychain adapter

---

# 32. 既知の難所

## 32.1 UI変更耐性
完全自動修復は危険。  
v1は「修復候補提示 + 承認」を中核にすべき。

## 32.2 録画のノイズ
人間の操作はノイズが多い。  
Normalizer の品質がコア競争力になる。

## 32.3 Export先の仕様変動
OpenClaw等の仕様変更は exporter で吸収する。

## 32.4 デスクトップ自動化の不安定性
browser-first を守るべき。

---

# 33. README 冒頭文の確定版

> **SkillForge turns repeated browser and local workflows into tested, permission-scoped, reusable skills for OpenClaw, MCP, and CLI.**

日本語版:

> **SkillForge は、繰り返し行うブラウザ/ローカル作業を、テスト付き・権限制御付きの再利用可能なスキルへ変換するOSSです。**

---

# 34. 最終定義

## SkillForge v1 の完成条件
SkillForge v1 は、以下を満たしたとき完成と見なす。

1. ユーザーがブラウザ作業を1回録画できる
2. 可変値を引数にできる
3. 成功条件を付与できる
4. 最小権限で再実行できる
5. 失敗時に原因を追える
6. OpenClaw向けにエクスポートできる
7. 他人がそのSkillを再利用できる

---

