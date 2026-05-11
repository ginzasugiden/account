# GAS API 仕様書（支払い登録システム）

> **対象**: `X:\git\account\gas\` 側で実装する GAS Web App エンドポイント
> **作成日**: 2026-05-11
> **前提**: フロントエンド（`frontend/payment/`）との通信契約
> **関連**: `IMPLEMENTATION_SPEC.md`

---

## 0. 共通仕様

### 0.1 通信方式

既存（`/account/create`, `/password/reset-request`, `/password/reset`）と同じ規約を踏襲する。

| 項目 | 値 |
|---|---|
| Method | `POST` |
| URL | 単一 GAS Web App URL（既存 `GAS_URL` を共用） |
| Content-Type | `text/plain`（CORS preflight 回避のため） |
| Body | JSON 文字列 |

### 0.2 リクエスト共通フォーマット

```json
{
  "endpoint": "/payment/xxx",
  "data": { /* エンドポイントごとに異なる */ },
  "recaptchaToken": "..."
}
```

### 0.3 レスポンス共通フォーマット

**成功時:**
```json
{
  "status": "success",
  "message": "...",
  "data": { /* エンドポイントごとに異なる */ }
}
```

**失敗時:**
```json
{
  "status": "error",
  "message": "ユーザ向けエラーメッセージ（日本語）",
  "code": "ERROR_CODE_ENUM",
  "detail": "デバッグ用詳細（オプショナル、本番では返さなくてもよい）"
}
```

### 0.4 認証モデル（ワンタイムトークン方式）

```
[1] account.ginzasugiden.com
    │
    │ (a) ユーザがアカウント作成成功 → 「支払い方法を登録する」ボタン
    │     または完了メールのリンクをクリック
    │
    │ (b) フロントが /payment/issue-token を呼び出し
    │     (店舗URL + ライセンスキーで認証)
    ▼
[2] GAS: ワンタイムトークン発行
    - 15分有効
    - 1回使用で無効化
    - PropertiesService または「支払いトークン」シートで管理
    │
    │ (c) token をクエリパラメータで payment.ginzasugiden.com に渡す
    │     URL: https://payment.ginzasugiden.com/?token=xxx&shop=xxx
    ▼
[3] payment.ginzasugiden.com
    │
    │ (d) ページロード時に /payment/verify-token を呼ぶ
    │     成功すれば session_token を取得し、以降の API 呼び出しで使用
    ▼
[4] 以降の API 呼び出しは session_token + shop を必ず含める
    /payment/register-card, /payment/get-info, /payment/cancel, /payment/get-history
```

**重要:**
- `token`（ワンタイム）と `session_token`（payment 画面でのセッション）は別物
- `session_token` は payment 画面を開いている間のみ有効（推奨 60 分、サーバ側で TTL 管理）
- すべての payment 系エンドポイントで `session_token` の検証必須

### 0.5 reCAPTCHA トークン必須（補強1）

**すべての `/payment/*` エンドポイントのリクエストボディに `recaptchaToken` フィールドを必須**とする。
既存 `/account/create`, `/password/reset-request`, `/password/reset` と同じく v3 トークン運用を継承。

| endpoint | reCAPTCHA action 名（推奨） |
|---|---|
| `/payment/issue-token` | `payment_issue_token` |
| `/payment/verify-token` | `payment_verify_token` |
| `/payment/register-card` | `payment_register` |
| `/payment/get-info` | `payment_get_info` |
| `/payment/cancel-subscription` | `payment_cancel` |
| `/payment/get-history` | `payment_get_history` |

GAS 側は受け取った `recaptchaToken` を Google reCAPTCHA Verify API で検証し、スコアが閾値未満なら `RECAPTCHA_FAILED` を返す。閾値は既存運用に合わせる（推奨 0.5）。

### 0.6 「次回課金日」の責務分離（補強2）

- **GAS が唯一の真実の源（Single Source of Truth）**
- `next_charge_date` の計算（月次・月末特例・解約後の `valid_until` 含む）はすべて GAS 側 `BillingScheduler.gs` の `calculateNextChargeDate()` で行う
- **フロントは GAS のレスポンスに含まれる `next_charge_date` / `valid_until` をそのまま表示するのみ**
- フロント側で「登録日から1ヶ月後」のような日付計算ロジックを実装しない
- API レスポンスの日付フィールドは ISO 8601 形式（`YYYY-MM-DD` または `YYYY-MM-DDTHH:mm:ss+09:00`）で返す

### 0.7 タイムゾーン規約（補強3）

**日時はすべて JST (Asia/Tokyo) で統一する。**

- GAS 側で `new Date()` の文字列化を行う際は必ず `Utilities.formatDate(date, "Asia/Tokyo", "yyyy-MM-dd")` または `"yyyy-MM-dd'T'HH:mm:ssXXX"` を使用
- ISO 8601 のタイムゾーン部は `+09:00` で固定（`Z` (UTC) を返さない）
- 「月次課金日」「次回課金日」「`valid_until`」などはすべて JST の日付として計算
- 例: `2026-05-11T14:30:00+09:00` ✅ / `2026-05-11T05:30:00Z` ❌

フロント側は `new Date(isoString)` でパース→ロケール `ja-JP` で表示するため、JST 固定なら時差問題は発生しない。

---

## 1. エンドポイント一覧

| # | endpoint | 呼び出し元 | 用途 |
|---|---|---|---|
| 1 | `/payment/issue-token` | account.ginzasugiden.com | ワンタイムトークン発行 |
| 2 | `/payment/verify-token` | payment.ginzasugiden.com（ページロード時） | ワンタイムトークン検証 → セッショントークン発行 |
| 3 | `/payment/register-card` | payment.ginzasugiden.com（カード登録画面） | カード登録 + 初回課金 |
| 4 | `/payment/get-info` | payment.ginzasugiden.com（管理画面） | 登録済みカード情報・課金状態取得 |
| 5 | `/payment/cancel-subscription` | payment.ginzasugiden.com（解約画面） | 解約処理 |
| 6 | `/payment/get-history` | payment.ginzasugiden.com（履歴画面） | 課金履歴取得 |

---

## 2. エンドポイント詳細

### 2.1 `/payment/issue-token`（ワンタイムトークン発行）

**呼び出し元:** account.ginzasugiden.com（既存 `index.html` のアカウント作成成功後、あるいは完了メールから戻った時など）

**リクエスト:**
```json
{
  "endpoint": "/payment/issue-token",
  "data": {
    "shop": "tokyoflower",
    "licenseKey": "SL240364_Jj6TnbFE5Fb24SQ6"
  },
  "recaptchaToken": "..."
}
```

**成功レスポンス:**
```json
{
  "status": "success",
  "message": "トークンを発行しました",
  "data": {
    "token": "ot_a1b2c3d4e5f6...",
    "expires_at": "2026-05-11T15:25:00Z",
    "redirect_url": "https://payment.ginzasugiden.com/?token=ot_a1b2c3d4e5f6...&shop=tokyoflower"
  }
}
```

**失敗レスポンス（例）:**
```json
{ "status": "error", "code": "INVALID_LICENSE_KEY", "message": "ライセンスキーが正しくありません" }
{ "status": "error", "code": "ACCOUNT_NOT_FOUND", "message": "アカウントが見つかりません" }
{ "status": "error", "code": "RECAPTCHA_FAILED", "message": "認証に失敗しました" }
```

**サーバ側処理:**
1. reCAPTCHA 検証
2. アカウントシートから `shop` で検索、`licenseKey` と一致するか検証
3. ランダムトークン（32文字以上、暗号学的乱数）を生成
4. 「支払いトークン」シート or PropertiesService に保存:
   - `token`, `shop`, `created_at`, `expires_at`, `used_at`(初期 NULL)
5. レスポンス返却

**ポイント:**
- `expires_at` = 発行時刻 + 15分
- `redirect_url` はクライアントが直接遷移先として使えるよう完全URL形式で返す

---

### 2.2 `/payment/verify-token`（ワンタイム → セッショントークン交換）

**呼び出し元:** payment.ginzasugiden.com（ページロード時）

**リクエスト:**
```json
{
  "endpoint": "/payment/verify-token",
  "data": {
    "token": "ot_a1b2c3d4e5f6...",
    "shop": "tokyoflower"
  },
  "recaptchaToken": "..."
}
```

**成功レスポンス:**
```json
{
  "status": "success",
  "data": {
    "session_token": "ss_z9y8x7w6v5...",
    "session_expires_at": "2026-05-11T16:10:00Z",
    "shop": "tokyoflower",
    "shop_name": "東京フラワー",
    "payment_status": "unregistered",
    "monthly_fee_jpy": 5000,
    "gmo_env": "test",
    "gmo_shop_id": "tshop00000000",
    "gmo_token_js_url": "https://stg.static.mul-pay.jp/ext/js/token.js"
  }
}
```

**失敗レスポンス:**
```json
{ "status": "error", "code": "TOKEN_INVALID", "message": "無効なリンクです。もう一度お試しください" }
{ "status": "error", "code": "TOKEN_EXPIRED", "message": "リンクの有効期限が切れています" }
{ "status": "error", "code": "TOKEN_ALREADY_USED", "message": "このリンクは既に使用されています" }
```

**サーバ側処理:**
1. token を検索
2. `used_at IS NULL` を確認 → 使用済みなら `TOKEN_ALREADY_USED`
3. `expires_at > now()` を確認 → 期限切れなら `TOKEN_EXPIRED`
4. `shop` がトークンの shop と一致するか確認
5. `used_at = now()` で消費マーク
6. `session_token` を生成し、TTL 60分で保存
7. アカウント情報と GMO PG 環境情報を返却

**ポイント:**
- `gmo_shop_id` と `gmo_token_js_url` は環境（test/prod）に応じてサーバが決定
- 公開してOKな値（ShopID は GMO PG 仕様上クライアント側に渡る前提）
- ShopPass / SitePass / SiteID はクライアントに**絶対に返さない**

---

### 2.3 `/payment/register-card`（カード登録 + 初回課金）

**呼び出し元:** payment.ginzasugiden.com（カード登録フォーム submit）

**リクエスト:**
```json
{
  "endpoint": "/payment/register-card",
  "data": {
    "session_token": "ss_z9y8x7w6v5...",
    "shop": "tokyoflower",
    "gmo_token": "（GMO PG token.js から取得したトークン）",
    "card_holder_name": "TARO YAMADA",
    "agree_terms": true
  },
  "recaptchaToken": "..."
}
```

**成功レスポンス:**
```json
{
  "status": "success",
  "message": "カードを登録しました",
  "data": {
    "card_last4": "1234",
    "card_brand": "VISA",
    "card_expire": "2812",
    "next_charge_date": "2026-06-11",
    "charged_amount": 5000,
    "charge_id": "chg_xxx"
  }
}
```

**失敗レスポンス:**
```json
{ "status": "error", "code": "SESSION_INVALID", "message": "セッションが無効です。最初からやり直してください" }
{ "status": "error", "code": "TERMS_NOT_AGREED", "message": "利用規約への同意が必要です" }
{ "status": "error", "code": "GMO_TOKEN_INVALID", "message": "カード情報の検証に失敗しました" }
{ "status": "error", "code": "GMO_CARD_DECLINED", "message": "カードが利用できませんでした。別のカードをお試しください" }
{ "status": "error", "code": "GMO_API_ERROR", "message": "決済システムでエラーが発生しました。時間をおいて再度お試しください" }
{ "status": "error", "code": "ALREADY_REGISTERED", "message": "既にカードが登録されています" }
```

**サーバ側処理（順次）:**
1. `session_token` 検証
2. `agree_terms === true` 確認
3. `shop` のアカウントを取得、`payment_status === 'unregistered'` 確認
4. `gmoEntryMember(shop)` → 既存ならエラー101を握りつぶしOK扱い
5. `gmoSaveCardByToken(shop, gmo_token)` → `CardSeq`, `CardNo`, `Forward`, `Expire` を取得
6. アカウントシートに以下を保存:
   - `gmo_member_id` = shop
   - `card_seq`, `card_last4`, `card_brand`, `card_expire`
   - `registered_at` = now()
   - `payment_status` = `'active'`（初回課金成功後）
7. `gmoEntryTran(orderId, 5000)` で取引登録（`orderId` = `{shop}_{YYYYMM}_001`）
8. `gmoExecTranByMember(...)` で決済実行
9. 課金履歴シートに記録
10. 課金スケジュールシートに「翌月の同日（月末特例考慮）」のレコードを追加
11. `next_charge_date` をアカウントシートに保存
12. 課金成功メール送信（後の Phase で実装）

**部分失敗時のロールバック方針:**
- `SaveCard` 成功後に初回課金が失敗した場合
  - `payment_status` を `'unregistered'` のまま（active にしない）
  - エラーレスポンス（`GMO_CARD_DECLINED` 等）を返す
  - GMO 側のカード情報は残るが、CardSeq は次回登録時に上書き or 新規追加で対応可
- フロント側は「カードが利用できませんでした」表示でユーザに再試行を促す

---

### 2.4 `/payment/get-info`（登録済みカード情報・課金状態取得）

**呼び出し元:** payment.ginzasugiden.com（`manage.html`, `cancel.html` ロード時）

**リクエスト:**
```json
{
  "endpoint": "/payment/get-info",
  "data": {
    "session_token": "ss_z9y8x7w6v5...",
    "shop": "tokyoflower"
  },
  "recaptchaToken": "..."
}
```

**成功レスポンス:**
```json
{
  "status": "success",
  "data": {
    "payment_status": "active",
    "card_last4": "1234",
    "card_brand": "VISA",
    "card_expire": "2812",
    "next_charge_date": "2026-06-11",
    "registered_at": "2026-05-11T14:30:00Z",
    "cancelled_at": null,
    "monthly_fee_jpy": 5000,
    "valid_until": null
  }
}
```

**解約済み・利用可能期間中の場合:**
```json
{
  "status": "success",
  "data": {
    "payment_status": "cancelled",
    "card_last4": "1234",
    "card_brand": "VISA",
    "card_expire": "2812",
    "next_charge_date": "2026-07-11",
    "registered_at": "2026-05-11T14:30:00+09:00",
    "cancelled_at": "2026-06-15T10:00:00+09:00",
    "valid_until": "2026-07-10",
    "is_still_usable": true,
    "monthly_fee_jpy": 5000
  }
}
```

**解約済み・利用期間終了後の場合:**
```json
{
  "status": "success",
  "data": {
    "payment_status": "expired",
    "cancelled_at": "2026-06-15T10:00:00+09:00",
    "valid_until": "2026-07-10",
    "is_still_usable": false,
    "monthly_fee_jpy": 5000
  }
}
```

**失敗レスポンス:**
```json
{ "status": "error", "code": "SESSION_INVALID", "message": "セッションが無効です" }
{ "status": "error", "code": "NOT_REGISTERED", "message": "カードが登録されていません" }
```

**`payment_status` の値と manage.html UI 表記の対応（補強4）:**

| payment_status | is_still_usable | manage.html 表示 |
|---|---|---|
| `unregistered` | - | 「カードが登録されていません」+ 登録画面へのリンク |
| `active` | - | 通常表示。カード情報・次回課金日・各種アクションボタン |
| `cancelled` | `true` | **「解約済み」バッジ** + 「`valid_until` まで利用可能」メッセージ + 「課金履歴」のみ表示（再登録ボタンは出さない） |
| `cancelled` / `expired` | `false` | 「利用期間が終了しています」+ **「再登録する」ボタン**（新規登録扱い） |
| `suspended` | - | 「課金失敗により一時停止中」+ 「カードを変更する」ボタン |

> `is_still_usable` は GAS 側で `payment_status === 'cancelled' && today <= valid_until` を計算して返す。フロントはこのフラグを見て分岐するだけで、日付比較ロジックを持たない（補強2）。

---

### 2.5 `/payment/cancel-subscription`（解約処理）

**呼び出し元:** payment.ginzasugiden.com（`cancel.html` の「解約を確定する」ボタン）

**リクエスト:**
```json
{
  "endpoint": "/payment/cancel-subscription",
  "data": {
    "session_token": "ss_z9y8x7w6v5...",
    "shop": "tokyoflower",
    "confirm": true
  },
  "recaptchaToken": "..."
}
```

**成功レスポンス:**
```json
{
  "status": "success",
  "message": "解約を受け付けました",
  "data": {
    "cancelled_at": "2026-06-15T10:00:00Z",
    "valid_until": "2026-07-10",
    "next_charge_date": "2026-07-11"
  }
}
```

**失敗レスポンス:**
```json
{ "status": "error", "code": "SESSION_INVALID", "message": "セッションが無効です" }
{ "status": "error", "code": "NOT_REGISTERED", "message": "カードが登録されていません" }
{ "status": "error", "code": "ALREADY_CANCELLED", "message": "既に解約されています" }
```

**サーバ側処理:**
1. `session_token` 検証
2. `confirm === true` 確認
3. アカウントシートの `payment_status` を `'cancelled'`、`cancelled_at` を now() に更新
4. 課金スケジュールシートの該当アカウントの未来分（status=pending）を `cancelled` にマーク
5. 解約受付メール送信

**ポイント:**
- `valid_until` = `next_charge_date - 1日`
- LicenseManagementAPI 側のライセンス検証で `(payment_status='active') OR (payment_status='cancelled' AND today <= valid_until)` を有効と判定

---

### 2.6 `/payment/get-history`（課金履歴取得）

**呼び出し元:** payment.ginzasugiden.com（`history.html`）

**リクエスト:**
```json
{
  "endpoint": "/payment/get-history",
  "data": {
    "session_token": "ss_z9y8x7w6v5...",
    "shop": "tokyoflower",
    "limit": 200
  },
  "recaptchaToken": "..."
}
```

**成功レスポンス:**
```json
{
  "status": "success",
  "data": {
    "history": [
      {
        "charged_at": "2026-05-11T14:30:00Z",
        "amount": 5000,
        "purpose": "初回登録",
        "result": "success",
        "retry_attempt": 1
      },
      {
        "charged_at": "2026-06-11T00:15:00Z",
        "amount": 5000,
        "purpose": "月次自動課金",
        "result": "success",
        "retry_attempt": 1
      }
    ]
  }
}
```

**ポイント:**
- 内部 `charge_id`, `gmo_access_id`, `gmo_tran_id` などは**フロントに返さない**
- 失敗した課金履歴も含める（`result: "failed"`, `error_message: "（ユーザ向け文言）"`）
- 直近 `limit` 件、`charged_at` 降順

---

## 3. エラーコード一覧

| code | HTTP相当 | 説明 |
|---|---|---|
| `RECAPTCHA_FAILED` | 400 | reCAPTCHA 検証失敗 |
| `INVALID_REQUEST` | 400 | リクエスト形式が不正 |
| `INVALID_LICENSE_KEY` | 401 | ライセンスキー不一致 |
| `ACCOUNT_NOT_FOUND` | 404 | アカウントが見つからない |
| `TOKEN_INVALID` | 401 | ワンタイムトークン無効 |
| `TOKEN_EXPIRED` | 401 | ワンタイムトークン期限切れ |
| `TOKEN_ALREADY_USED` | 401 | ワンタイムトークン使用済み |
| `SESSION_INVALID` | 401 | セッショントークン無効・期限切れ |
| `TERMS_NOT_AGREED` | 400 | 利用規約未同意 |
| `GMO_TOKEN_INVALID` | 400 | GMO PG トークン無効 |
| `GMO_CARD_DECLINED` | 402 | カード拒否（残高不足・利用限度等） |
| `GMO_API_ERROR` | 502 | GMO PG API その他のエラー |
| `ALREADY_REGISTERED` | 409 | 既にカード登録済み |
| `NOT_REGISTERED` | 404 | カード未登録 |
| `ALREADY_CANCELLED` | 409 | 既に解約済み |
| `INTERNAL_ERROR` | 500 | 想定外のサーバエラー |

---

## 4. セキュリティ要件（再掲）

- **カード番号・有効期限・セキュリティコードは GAS に絶対に届かない**（フロントで GMO token.js が token に変換）
- `session_token` は推測困難な乱数（32文字以上、暗号学的乱数）
- `ShopPass`, `SitePass`, `SiteID` は ScriptProperties から読み、レスポンスに含めない
- 同一 IP から大量にワンタイムトークン発行された場合のレート制限を検討（将来）
- すべてのエンドポイントで CORS 対応（既存 doPost と同様）

---

## 5. テスト用ダミーデータ

GAS 実装後、以下のテストで動作確認：

| シナリオ | 期待動作 |
|---|---|
| 正常フロー: issue-token → verify-token → register-card | カード登録成功、5000円課金、`next_charge_date` が翌月の同日 |
| ワンタイムトークン使い回し | 2回目は `TOKEN_ALREADY_USED` |
| 15分経過後の verify-token | `TOKEN_EXPIRED` |
| GMO テスト失敗カード（4242...） | `GMO_CARD_DECLINED`、payment_status は unregistered のまま |
| 解約後の re-cancel | `ALREADY_CANCELLED` |
| 解約後の get-info | `valid_until` が翌月-1日になっている |

---

## 6. フロントエンド MOCK_MODE との対応

フロントエンドの `frontend/payment/js/config.js` には `MOCK_MODE` フラグがあり、`true` の時はこの GAS API を呼ばずに擬似レスポンスを返す。GAS 実装完了後、`MOCK_MODE = false` に切り替えて結合する。

擬似レスポンスは本仕様書の「成功レスポンス例」と同じ JSON 形を返すため、GAS 実装も同じ形を遵守すること。

---

**以上**
