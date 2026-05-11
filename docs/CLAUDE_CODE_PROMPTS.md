# Claude Code 向け実装プロンプト雛形

このファイルは Claude Code に実装を依頼するときに使う**プロンプト集**です。
コピペして使ってください。

---

## 🎯 最初に投げるプロンプト（プロジェクト把握）

```
GSDアカウント作成システムに「月会費5,000円の継続課金」機能を追加します。
詳細仕様は同階層の IMPLEMENTATION_SPEC.md を読んでください。

最初に以下を実施してください:
1. リポジトリ全体構造を把握（ls -la, CLAUDE.md, README.md を読む）
2. 既存の gas/ 配下のファイル一覧と主要関数を把握
3. 既存の frontend/ 配下の構造を把握
4. IMPLEMENTATION_SPEC.md を熟読
5. 実装着手前に「不明点」「仕様矛盾の可能性がある点」「既存システムとの整合性で確認したい点」をリストアップして報告

実装はまだ開始しないでください。把握と質問だけでOKです。
```

---

## 🔧 Phase 1: 基盤実装プロンプト

```
IMPLEMENTATION_SPEC.md の Phase 1（基盤）を実装してください。

具体的には:
1. gas/GmoPgClient.gs を新規作成
   - gmoEntryMember, gmoSaveCardByToken, gmoDeleteCard, gmoEntryTran, gmoExecTranByMember を実装
   - すべてテスト環境エンドポイント（pt01.mul-pay.jp）対応
   - PropertiesService から認証情報を読む（GMO_ENV で test/prod 切替）
   - エラーレスポンスの ErrCode/ErrInfo を例外として throw

2. gas/PaymentSheets.gs を新規作成
   - SPEC「4. スプレッドシート設計」に従う
   - getAccountById, updateAccountPaymentStatus, appendChargeHistory, getScheduleByDate, appendSchedule, updateScheduleStatus

3. gas/tests/ 配下にユニットテスト関数を作成
   - GMO PG への呼び出しはモック化（HTTPレスポンスを差し替え可能に）

実装後、テスト関数を実行して全てパスすることを確認してください。

⚠️ 注意:
- カード番号・有効期限・セキュリティコードは絶対に扱わない（トークン経由のみ）
- 認証情報をコードに直書きしない
- .delete 系の危険関数は管理者専用フラグで二重防御
```

---

## 💳 Phase 2: 課金ロジック実装プロンプト

```
IMPLEMENTATION_SPEC.md の Phase 2（課金ロジック）を実装してください。

具体的には:
1. gas/PaymentController.gs の doPost ルーティング実装
   - action: register_card, get_payment_info, cancel_subscription, get_history
   - 各アクションで account_id + session_token の検証を必ず実施

2. gas/BillingScheduler.gs の実装
   - dailyBillingTrigger: 毎日0時に走るメイン関数
   - executeCharge: 1件の課金実行（リトライ管理含む）
   - calculateNextChargeDate: 月末特例対応

3. テストを追加:
   - 15日登録→翌月15日
   - 31日登録→2月は28/29日になる
   - 30日登録→2月は28/29日
   - リトライ3回失敗で suspended になる
   - 解約済みアカウントは課金スキップ

実装後、テスト関数を実行して全てパスすることを確認してください。
```

---

## 🎨 Phase 3: フロントエンド実装プロンプト

```
IMPLEMENTATION_SPEC.md の Phase 3（フロントエンド）を実装してください。

具体的には:
1. frontend/payment/index.html: カード登録画面
2. frontend/payment/js/token.js: GMO PG token.js ラッパー
3. frontend/payment/js/register.js: 登録画面ロジック
4. frontend/payment/js/api.js: GAS API クライアント
5. frontend/payment/js/config.js: 環境別エンドポイント定義
6. frontend/payment/js/auth.js: account.ginzasugiden.com セッション連携
7. frontend/payment/css/payment.css: 既存 Rakuten RMS風配色に合わせたスタイル

⚠️ 重要:
- token.js でトークン化後、カード番号フィールドは即座にクリア
- GAS への送信ペイロードに絶対にカード番号を含めない
- フォーム submit 後、ボタンを無効化して二重送信防止
- HTTPS でのみ動作するよう実装（http接続時は警告表示）

実装後、ブラウザの DevTools で送信内容を確認し、カード番号が GAS への
リクエストに含まれていないことを確認してください。
```

---

## 📦 Phase 4: 周辺機能実装プロンプト

```
IMPLEMENTATION_SPEC.md の Phase 4（周辺機能）を実装してください。

具体的には:
1. frontend/payment/manage.html: 登録済みカード管理画面
2. frontend/payment/cancel.html: 解約画面
3. frontend/payment/history.html: 課金履歴画面
4. gas/PaymentMailer.gs: 通知メール送信
5. frontend/account/ のダッシュボードに「支払い方法を登録する」バナー追加

メールテンプレートは gas/templates/ 配下に HTML で配置してください。
件名・本文は丁寧な日本語で、店舗向けビジネス文書のトーン。
```

---

## ✅ Phase 5: 仕上げプロンプト

```
IMPLEMENTATION_SPEC.md の Phase 5（仕上げ）を実施してください。

1. GAS の時間トリガーを設定する手順を README にまとめる
2. 結合テストのチェックリストを TESTING.md として作成
3. ステージング→本番の切り替え手順を DEPLOY.md として作成
4. frontend/payment/CNAME を作成（中身: payment.ginzasugiden.com）

最後に、実装したファイル一覧と各ファイルの役割を README_PAYMENT.md にまとめてください。
```

---

## 🐛 トラブルシューティング用プロンプト

### GMO PG エラー対応
```
GMO PG API から ErrCode=XX, ErrInfo=YY が返ってきています。
公式エラーコード一覧（GMO PG マニュアル）を参照し、原因と対処を提案してください。
```

### 時間トリガーが動かない
```
gas/BillingScheduler.gs の dailyBillingTrigger が時間トリガーで実行されていません。
- トリガー設定方法を確認
- GAS の実行ログから失敗原因を特定
- 認証スコープ不足の可能性も確認（GmailApp, UrlFetchApp）
```

### CORS エラー
```
payment.ginzasugiden.com から GAS Web App への POST で CORS エラーが出ます。
GAS Web App の公開設定と doPost のレスポンスヘッダーを確認・修正してください。
```

---

## 📝 仕様変更時のテンプレート

```
以下の仕様変更を反映してください:

【変更前】XXXX
【変更後】YYYY
【理由】ZZZZ

影響範囲を洗い出した上で、変更箇所をリスト化してから実装してください。
IMPLEMENTATION_SPEC.md も同時に更新すること。
```
