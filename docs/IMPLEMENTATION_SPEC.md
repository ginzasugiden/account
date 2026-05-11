# GSD 支払い登録システム実装指示書

> **対象**: Claude Code
> **作成者**: とみぃ + Claude (Opus 4.7)
> **作成日**: 2026-05-11
> **ベースリポジトリ**: https://github.com/ginzasugiden/account.git

---

## 0. このドキュメントの読み方

このドキュメントは Claude Code に対する**実装指示書**です。
セクション順に実装を進めてください。各セクションには「やること」「成果物」「検証方法」が記載されています。

**重要なルール:**
- 既存の `gas/` `frontend/` ディレクトリ構造を尊重すること
- 既存の `CLAUDE.md` の指示があれば優先すること
- カード番号・有効期限・セキュリティコードは**絶対に**GAS側で受け取らない・保存しない
- API認証情報（ショップID、ショップパスワード等）はソースコードに直書きしない
- 危険な `.delete` 系の関数は実装しない、もしくは管理者専用のフラグで二重防御
- テストは必ず GMO PG の **テスト環境**（pt01.mul-pay.jp）で行う

---

## 1. システム全体像

### 1.1 アーキテクチャ

```
┌──────────────────────────────────────────────────────┐
│ account.ginzasugiden.com                             │
│ - 既存。アカウント作成（無料）                       │
│ - ダッシュボードに「支払い方法を登録」ボタン追加     │
└────────────────┬─────────────────────────────────────┘
                 │ アカウントID + 認証トークンを引き継ぎ
                 ▼
┌──────────────────────────────────────────────────────┐
│ payment.ginzasugiden.com                             │
│ - frontend/payment/ に新規作成                       │
│ - GMO PG token.js でカード情報をトークン化           │
│ - 登録済みカード一覧、変更、解約画面                 │
└────────────────┬─────────────────────────────────────┘
                 │ token, accountId
                 ▼
┌──────────────────────────────────────────────────────┐
│ GAS バックエンド (gas/)                              │
│ - PaymentController.gs (新規)                        │
│ - GmoPgClient.gs (新規) GMO PG API 呼び出し責務分離  │
│ - 既存 LicenseManagementAPI 連携と整合性を保つ       │
└────────────────┬─────────────────────────────────────┘
                 ▼
┌──────────────────────────────────────────────────────┐
│ Google Spreadsheet                                   │
│ - 既存「アカウント」シートに列追加                   │
│ - 新規「課金履歴」シート                             │
│ - 新規「課金スケジュール」シート                     │
└──────────────────────────────────────────────────────┘
```

### 1.2 業務要件サマリー

| 項目 | 仕様 |
|---|---|
| 課金モデル | 月会費5,000円の継続課金（自動課金） |
| カード情報保持 | GMO PGに委託。自社は MemberID + CardSeq のみ保持 |
| 決済方式 | GMO PG トークン決済（JavaScript型） |
| 初回課金タイミング | カード登録時に即5,000円課金 |
| 月次課金日 | 登録日と同日（例：3/15登録→毎月15日） |
| 月末特例 | 31日登録は当該月の末日（2月は28/29日） |
| 課金失敗時 | 3日後にリトライ、最大3回。失敗確定で機能停止＋メール通知 |
| 解約 | 月末で停止、日割り返金なし。次回課金日の前日まで利用可能 |
| 通貨 | JPY |
| 税込/税抜 | 税込5,000円（消費税の扱いは要確認） |

---

## 2. 事前準備

### 2.1 GMO PG 必要情報（とみぃが事前に用意）

| 項目 | 用途 | 取得場所 |
|---|---|---|
| ShopID | ショップ認証 | GMOマイページ |
| ShopPass | ショップ認証 | GMOマイページ |
| SiteID | 会員管理オプション認証 | GMOマイページ |
| SitePass | 会員管理オプション認証 | GMOマイページ |
| TshopID | テスト環境のShopID | GMOテスト環境 |
| TshopPass | テスト環境のShopPass | GMOテスト環境 |
| TsiteID | テスト環境のSiteID | GMOテスト環境 |
| TsitePass | テスト環境のSitePass | GMOテスト環境 |

### 2.2 GMO PG エンドポイント

| 環境 | エンドポイント |
|---|---|
| テスト | https://pt01.mul-pay.jp/payment/ |
| 本番 | https://p01.mul-pay.jp/payment/ |

### 2.3 GMO PG IP制限の確認

GAS の実行 IP は固定できないため、GMO PG 側の API IP 制限を**無効**にしておく必要があります。
有効になっている場合、とみぃに依頼して GMO 側の設定を解除してもらう。

---

## 3. ディレクトリ構成

```
account/  (リポジトリルート)
├── CLAUDE.md
├── README.md
├── gas/
│   ├── (既存ファイル群)
│   ├── PaymentController.gs        ← 新規
│   ├── GmoPgClient.gs              ← 新規
│   ├── BillingScheduler.gs         ← 新規（時間トリガー）
│   ├── PaymentSheets.gs            ← 新規（スプレッドシート操作）
│   └── PaymentMailer.gs            ← 新規（通知メール）
└── frontend/
    ├── (既存 account/ など)
    └── payment/                     ← 新規
        ├── index.html               ← カード登録画面
        ├── manage.html              ← 登録済みカード管理画面
        ├── history.html             ← 課金履歴画面
        ├── cancel.html              ← 解約画面
        ├── css/
        │   └── payment.css
        ├── js/
        │   ├── config.js            ← APIエンドポイント定義（環境変数）
        │   ├── auth.js              ← account.ginzasugiden.com とのセッション連携
        │   ├── token.js             ← GMO PG token.js 呼び出しラッパー
        │   ├── register.js          ← 登録画面ロジック
        │   ├── manage.js            ← 管理画面ロジック
        │   └── api.js               ← GAS API クライアント
        └── CNAME                    ← payment.ginzasugiden.com
```

---

## 4. スプレッドシート設計

### 4.1 既存「アカウント」シートに追加する列

| 列名 | 型 | 説明 | 例 |
|---|---|---|---|
| gmo_member_id | string | GMO PG の会員ID。アカウントIDと同じ値を使用 | acc_a1b2c3 |
| payment_status | enum | 支払い登録状態 | unregistered / active / suspended / cancelled |
| card_seq | int | GMO PG の CardSeq（カード連番） | 0 |
| card_last4 | string | カード番号下4桁（表示用のみ） | 1234 |
| card_brand | string | カードブランド（表示用） | VISA |
| card_expire | string | YYMM形式（表示用、SaveCard応答から） | 2812 |
| next_charge_date | date | 次回課金予定日 | 2026-06-15 |
| registered_at | datetime | カード登録日時 | 2026-05-11 14:30:00 |
| cancelled_at | datetime | 解約日時（NULL=未解約） |  |
| retry_count | int | 直近の失敗リトライ回数（0でリセット） | 0 |

### 4.2 新規「課金履歴」シート

| 列名 | 型 | 説明 |
|---|---|---|
| charge_id | string | 内部ID（UUID） |
| account_id | string | アカウントID |
| charged_at | datetime | 課金実行日時 |
| amount | int | 金額（JPY） |
| purpose | string | 用途（"初回登録" / "月次自動課金" / "リトライ"） |
| gmo_access_id | string | GMO PG AccessID |
| gmo_access_pass | string | GMO PG AccessPass |
| gmo_order_id | string | GMO PG OrderID（一意） |
| gmo_tran_id | string | GMO PG TranID |
| result | enum | success / failed |
| error_code | string | 失敗時のエラーコード |
| error_message | string | 失敗時のエラーメッセージ |
| retry_attempt | int | 何回目の試行か（1=初回） |

### 4.3 新規「課金スケジュール」シート

毎日 0:00 にトリガーが走り、ここから「本日課金対象」を抽出する。

| 列名 | 型 | 説明 |
|---|---|---|
| account_id | string | アカウントID |
| scheduled_date | date | 課金予定日 |
| amount | int | 金額 |
| status | enum | pending / processing / done / failed / cancelled |
| created_at | datetime | レコード作成日時 |
| processed_at | datetime | 処理完了日時 |
| charge_id | string | 課金履歴の charge_id（成功時のみ） |

---

## 5. GAS バックエンド実装

### 5.1 PropertiesService に保存する設定

```javascript
// スクリプトプロパティ（管理者のみアクセス可）
PropertiesService.getScriptProperties().setProperties({
  GMO_ENV: 'test',                           // 'test' or 'prod'
  GMO_TEST_SHOP_ID: '...',
  GMO_TEST_SHOP_PASS: '...',
  GMO_TEST_SITE_ID: '...',
  GMO_TEST_SITE_PASS: '...',
  GMO_PROD_SHOP_ID: '...',
  GMO_PROD_SHOP_PASS: '...',
  GMO_PROD_SITE_ID: '...',
  GMO_PROD_SITE_PASS: '...',
  MONTHLY_FEE_JPY: '5000',
  PAYMENT_SHEET_ID: '...',
  NOTIFICATION_FROM_EMAIL: 'noreply@ginzasugiden.com',
});
```

### 5.2 GmoPgClient.gs（責務：GMO PG API 呼び出しのみ）

実装すべき関数:

```javascript
// 会員登録
function gmoEntryMember(memberId)
  → { MemberID: string }
  // EntryMember.idPass を叩く。既存ならエラー101を握りつぶしてOK扱い

// カード登録（トークン使用）
function gmoSaveCardByToken(memberId, token)
  → { CardSeq: int, CardNo: '************1234', Forward: 'VISA', Expire: '2812' }
  // SaveCard.idPass にトークンを渡す

// カード削除
function gmoDeleteCard(memberId, cardSeq)
  → { CardSeq: int }
  // DeleteCard.idPass を叩く

// 取引登録
function gmoEntryTran(orderId, amount)
  → { AccessID: string, AccessPass: string }
  // EntryTran.idPass を叩く

// 決済実行（会員のカードで）
function gmoExecTranByMember(accessId, accessPass, orderId, memberId, cardSeq)
  → { Status: 'CAPTURE', TranID: string, ... }
  // ExecTran.idPass に MemberID + CardSeq + Method=1 を渡す
```

**注意:**
- すべて `application/x-www-form-urlencoded` で POST
- レスポンスはクエリ文字列形式（key=value&key=value）で返ってくるのでパース必須
- エラー時は `ErrCode` `ErrInfo` がレスポンスに含まれる
- レスポンス例: `MemberID=acc_a1b2c3&CardSeq=0&CardNo=************1234&Forward=VISA&Expire=2812`

### 5.3 PaymentController.gs（責務：フロントからの doPost ルーティング）

`doPost(e)` 内で `e.parameter.action` を見て分岐:

| action | 処理 | レスポンス |
|---|---|---|
| `register_card` | トークン受け取り→ EntryMember + SaveCard + 初回課金 + スケジュール作成 | `{ok: true, card_last4, next_charge_date}` |
| `get_payment_info` | 登録済みカード情報を返す | `{status, card_last4, card_brand, next_charge_date}` |
| `cancel_subscription` | 解約処理（月末で停止） | `{ok: true, valid_until}` |
| `get_history` | 課金履歴を返す | `{history: [...]}` |

**認証:** account.ginzasugiden.com の既存セッション機構に合わせる。リクエストには `account_id` と `session_token` を含め、検証してから処理する。

### 5.4 BillingScheduler.gs（責務：時間トリガーによる定期課金）

```javascript
// 毎日 0:00 に実行されるトリガー関数
function dailyBillingTrigger() {
  // 1. 「課金スケジュール」シートから本日付の pending を全件取得
  // 2. 各レコードに対して executeCharge() を呼ぶ
  // 3. 同時実行防止のため LockService を使用
}

// 1件の課金を実行
function executeCharge(scheduleRow) {
  // 1. status を pending → processing に更新
  // 2. account_id からカード情報を取得
  // 3. gmoEntryTran → gmoExecTranByMember を実行
  // 4. 成功: 課金履歴に記録、次月のスケジュールを作成、status → done
  // 5. 失敗: 課金履歴に記録、retry_count++、3日後にリトライスケジュール作成
  //         retry_count >= 3 なら payment_status を suspended に変更し通知メール送信
}

// 月次課金日の計算（月末特例対応）
function calculateNextChargeDate(registrationDate, fromDate)
  // 登録日が15日 → 翌月15日
  // 登録日が31日 → 翌月の末日（2月は28/29日）
  // 登録日が30日 → 翌月の末日 or 30日
}
```

**トリガー設定:** GAS のプロジェクト設定から `dailyBillingTrigger` を時間主導型で毎日 0:00〜1:00 に設定。

### 5.5 PaymentMailer.gs（責務：通知メール）

| 関数 | 用途 |
|---|---|
| `mailChargeSuccess(accountId, amount)` | 課金成功通知 |
| `mailChargeFailed(accountId, attempt)` | 課金失敗通知（リトライ予定を案内） |
| `mailSubscriptionSuspended(accountId)` | 機能停止通知 |
| `mailSubscriptionCancelled(accountId, validUntil)` | 解約受付通知 |

`GmailApp.sendEmail()` を使用。HTMLテンプレートは `gas/templates/` 配下に配置。

### 5.6 PaymentSheets.gs（責務：スプレッドシート CRUD）

各シートへの読み書きを集約。Controller/Scheduler から直接 SpreadsheetApp を触らない。

```javascript
function getAccountById(accountId)
function updateAccountPaymentStatus(accountId, fields)
function appendChargeHistory(record)
function getScheduleByDate(date)
function appendSchedule(record)
function updateScheduleStatus(rowIndex, status, processedAt, chargeId)
```

---

## 6. フロントエンド実装

### 6.1 frontend/payment/index.html（カード登録画面）

**画面構成:**

```
┌──────────────────────────────────────┐
│  GSD 支払い登録                       │
├──────────────────────────────────────┤
│  ご利用プラン                         │
│  ┌────────────────────────────────┐  │
│  │ 月会費 5,000円（税込）         │  │
│  │ 自動更新・いつでも解約可能     │  │
│  └────────────────────────────────┘  │
│                                      │
│  カード番号: [____________________]  │
│  有効期限:   [MM] / [YY]             │
│  セキュリティコード: [____]          │
│                                      │
│  [☐] 利用規約と決済規約に同意する   │
│                                      │
│  [    カードを登録して開始する    ]  │
│                                      │
│  ご登録後、即時5,000円が課金されます。│
│  次回課金日: 2026年6月11日           │
└──────────────────────────────────────┘
```

**重要な実装ルール:**

- カード入力フィールドの `name` 属性は GMO PG token.js が読み取る決まった値を使う:
  - `cardno`, `expire_month`, `expire_year`, `securitycode`, `holdername`
- フォーム submit 時に GMO PG token.js の `Multipayment.getToken()` を呼び、コールバックでトークンを取得
- **トークン取得後**、カード番号フィールドを `value=""` でクリアしてから GAS に送信
- GAS には**トークンと account_id だけ**を送る
- HTTPS 必須（GitHub Pages のデフォルトでOK）

### 6.2 token.js のラッパー実装イメージ

```javascript
// frontend/payment/js/token.js
async function getCardToken() {
  return new Promise((resolve, reject) => {
    Multipayment.init(GMO_SHOP_ID);  // テスト時は TshopID
    Multipayment.getToken({
      cardno: document.getElementById('cardno').value,
      expire: document.getElementById('expire_year').value
             + document.getElementById('expire_month').value,  // YYMM
      securitycode: document.getElementById('securitycode').value,
      holdername: document.getElementById('holdername').value,
    }, (response) => {
      if (response.resultCode === '000') {
        resolve(response.tokenObject.token);
      } else {
        reject(new Error('Token取得失敗: ' + response.resultCode));
      }
    });
  });
}
```

### 6.3 frontend/payment/manage.html（管理画面）

- 登録済みカードの下4桁とブランド表示
- 次回課金日表示
- 「カードを変更する」ボタン → index.html へ
- 「解約する」ボタン → cancel.html へ
- 「課金履歴を見る」リンク → history.html へ

### 6.4 frontend/payment/cancel.html（解約画面）

```
解約のご確認

現在の状態: 有効
次回課金予定日: 2026年6月11日

解約すると、次回課金は行われません。
2026年6月10日まで全機能をご利用いただけます。
日割りでの返金はございません。

[キャンセル] [解約を確定する]
```

「解約を確定する」を押したら GAS の `cancel_subscription` を叩く。

### 6.5 account.ginzasugiden.com 側の改修

ダッシュボード（またはアカウント作成完了画面）に以下を追加:

```html
<div class="payment-banner">
  <p>すべての機能をご利用いただくには支払い方法の登録が必要です。</p>
  <a href="https://payment.ginzasugiden.com/?account_id=XXX&token=YYY"
     class="btn-primary">支払い方法を登録する</a>
</div>
```

URL パラメータの `account_id` と `token` は payment 側の `auth.js` で受け取り、検証する。

---

## 7. 解約処理の詳細仕様

「月末で停止」を厳密に定義:

- 解約ボタン押下時、`cancelled_at` に現在時刻を記録、`payment_status` を `cancelled` に変更
- ただし機能利用は `next_charge_date - 1日` まで許可
- `dailyBillingTrigger` 内で `payment_status = cancelled` の場合は課金スキップ
- 解約後の再登録は新規扱い（新しい `registered_at` で再スタート）

LicenseManagementAPI 側のライセンス検証で `payment_status = active` または `(cancelled AND today < next_charge_date)` の場合のみ機能利用可とする。

---

## 8. リトライ仕様の詳細

| 試行 | タイミング | 動作 |
|---|---|---|
| 1回目 | 課金予定日 | 通常課金実行 |
| 2回目 | 1回目失敗の3日後 | リトライ実行 |
| 3回目 | 2回目失敗の3日後 | リトライ実行 |
| 4回目 | （実行しない） | `payment_status` を `suspended` に。利用者にメール送信 |

リトライ間隔は将来変更可能性があるので、定数化:
```javascript
const RETRY_INTERVAL_DAYS = 3;
const MAX_RETRY_COUNT = 3;
```

---

## 9. セキュリティ要件

### 9.1 必須事項

- カード番号、有効期限、セキュリティコードは GAS に**絶対に送信しない**（token.js で完結）
- GAS の Web App 公開設定は「全員」ではなく「リンクを知っている全員」+ アプリ側で account_id + session_token 検証
- ScriptProperties の値はリポジトリにコミットしない
- カード番号下4桁以外の情報は表示・ログ出力しない
- エラーログにトークン文字列を残さない

### 9.2 防御的実装

- 既存システムの `.delete` 系関数の無効化方針を継承
- カード削除 API（DeleteCard）は管理者専用とし、エンドユーザー画面からは呼ばない（カード変更時は新カード登録 → 旧 CardSeq は履歴として残す）
- 課金履歴シートは追記のみ。削除しない
- 二重課金防止: `OrderID` は `account_id + 'YYYYMM' + sequence` で必ず一意になる構造

### 9.3 ログとモニタリング

- 失敗が連続した場合（例：1日に10件以上の失敗）に管理者へアラートメール
- 月次サマリーレポートを毎月1日に管理者へ送信（課金件数、成功率、解約数）

---

## 10. テスト計画

### 10.1 単体テスト（GAS）

`gas/tests/` 配下にテスト関数を配置:

- `test_gmoEntryMember_新規作成成功()`
- `test_gmoEntryMember_既存会員エラーハンドリング()`
- `test_gmoSaveCardByToken_成功()`
- `test_gmoEntryTran_ExecTran_成功()`
- `test_calculateNextChargeDate_15日登録()`
- `test_calculateNextChargeDate_31日登録の月末特例()`
- `test_executeCharge_成功フロー()`
- `test_executeCharge_失敗→リトライスケジュール作成()`
- `test_executeCharge_3回失敗→suspended()`

### 10.2 結合テスト（GMO PG テスト環境）

1. テスト用カード番号でカード登録 → 即時5,000円課金成功確認
2. テストカード（4111111111111111 など、GMOのテストカード一覧参照）
3. エラーカード番号で失敗→リトライスケジュール作成確認
4. 解約フロー実行確認
5. 翌月課金日のスケジュールが正しく作成されているか確認

### 10.3 E2Eテスト

1. account.ginzasugiden.com でアカウント作成
2. ダッシュボードの「支払い方法を登録する」をクリック
3. payment.ginzasugiden.com に遷移
4. カード情報入力→登録成功
5. account 側に戻って機能利用可能か確認
6. payment.ginzasugiden.com/manage で次回課金日表示確認
7. 解約→翌日まで機能利用可、翌々日からNGの確認

---

## 11. 実装順序（推奨）

Claude Code に指示する際は、以下の順序で進めてください:

### Phase 1: 基盤（バックエンド）
1. スプレッドシートに必要な列・シートを追加（手動 or GAS で）
2. PropertiesService に GMO PG テスト環境の認証情報を設定
3. `GmoPgClient.gs` 実装＋単体テスト
4. `PaymentSheets.gs` 実装＋単体テスト

### Phase 2: 課金ロジック
5. `PaymentController.gs` の `register_card` アクション実装
6. `BillingScheduler.gs` の `executeCharge` 実装
7. `calculateNextChargeDate` の月末特例を含む実装＋テスト

### Phase 3: フロントエンド
8. `frontend/payment/index.html` カード登録画面
9. `js/token.js` `js/register.js` `js/api.js`
10. payment.css でスタイリング（既存のRakuten RMS風配色）

### Phase 4: 周辺機能
11. `manage.html` `cancel.html` `history.html`
12. `PaymentMailer.gs` 通知メール
13. account.ginzasugiden.com 側にバナー追加

### Phase 5: 仕上げ
14. 時間トリガー設定
15. テスト環境で結合テスト
16. ステージング→本番切り替え（GMO_ENV を prod に）
17. CNAME 設定で payment.ginzasugiden.com を有効化

---

## 12. 実装後の運用に向けて

### 12.1 とみぃが運用開始までに準備すること

- [ ] GMO PG マイページで会員管理オプションが契約されているか確認
- [ ] GMO PG API IP制限が無効になっているか確認
- [ ] テスト環境の認証情報を取得し ScriptProperties に投入
- [ ] 利用規約・決済規約・特定商取引法表記の準備
- [ ] payment.ginzasugiden.com の DNS 設定（GitHub Pages のIPに向ける）
- [ ] reCAPTCHA を payment 画面にも導入（既存と同様）

### 12.2 法務・コンプライアンス

- 特定商取引法に基づく表記の整備
- 利用規約に「自動更新」「解約条件」「日割り返金なし」を明記
- 個人情報保護方針にクレジットカード情報の取扱いを記載

---

## 付録A: 既存システムの推測される構造

実装前に Claude Code は以下を確認すること:

```bash
# リポジトリ全体構造
ls -la
cat CLAUDE.md
cat README.md

# 既存 GAS コード確認
ls gas/
cat gas/LicenseManagementAPI.gs   # ライセンス検証ロジックの理解

# 既存フロントエンド確認
ls frontend/
cat frontend/account/index.html

# スプレッドシート構造の確認
# → とみぃに Spreadsheet ID とシート構造のサンプルを聞く
```

## 付録B: GMO PG API リクエスト・レスポンス例

### EntryMember
```
POST https://pt01.mul-pay.jp/payment/EntryMember.idPass
Content-Type: application/x-www-form-urlencoded

SiteID=tsite00000000&SitePass=ssr3pasf&MemberID=acc_a1b2c3
```
レスポンス成功例: `MemberID=acc_a1b2c3`
レスポンス失敗例（重複登録）: `ErrCode=E01&ErrInfo=E01390002`

### SaveCard
```
POST https://pt01.mul-pay.jp/payment/SaveCard.idPass
Content-Type: application/x-www-form-urlencoded

SiteID=...&SitePass=...&MemberID=acc_a1b2c3&Token=xxxxxxxxxxxx
```
レスポンス成功例: `CardSeq=0&CardNo=************1234&Forward=VISA&Expire=2812&HolderName=...&DeleteFlag=0`

### EntryTran
```
POST https://pt01.mul-pay.jp/payment/EntryTran.idPass
Content-Type: application/x-www-form-urlencoded

ShopID=...&ShopPass=...&OrderID=acc_a1b2c3_202605_001&JobCd=CAPTURE&Amount=5000
```
レスポンス成功例: `AccessID=xxx&AccessPass=yyy`

### ExecTran
```
POST https://pt01.mul-pay.jp/payment/ExecTran.idPass
Content-Type: application/x-www-form-urlencoded

AccessID=xxx&AccessPass=yyy&OrderID=acc_a1b2c3_202605_001
&Method=1&SiteID=...&SitePass=...&MemberID=acc_a1b2c3&SeqMode=0&CardSeq=0
```
レスポンス成功例: `ACS=0&OrderID=...&Forward=...&Method=1&PayTimes=&Approve=...&TranID=...&TranDate=...&CheckString=...&ClientField1=&ClientField2=&ClientField3=`

---

## 付録C: テスト用カード番号（GMO PG テスト環境）

| 番号 | ブランド | 結果 |
|---|---|---|
| 4111111111111111 | VISA | 成功 |
| 5555555555554444 | MasterCard | 成功 |
| 4242424242424241 | VISA | 失敗（CVV不一致など） |

最新のテストカード一覧はGMO PG管理画面で確認すること。

---

**以上**

実装中に判明した不明点・仕様の矛盾は、実装を止めて確認すること。
特に既存システムとの整合性について不安があれば、必ずとみぃに質問してから進めること。
