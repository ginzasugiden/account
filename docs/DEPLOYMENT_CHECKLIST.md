# 本番リリース デプロイチェックリスト

> 本番リリース直前と直後に確認すべき項目を網羅します。
> 各項目を1つずつ確認し、完了したらチェックを入れてください。

---

## 🟢 リリース前（前日〜数日前）

### 開発完了確認

- [ ] feature/payment-system ブランチに全Phase の成果がコミット済み
- [ ] frontend/payment/ 配下のすべてのHTMLが動作確認済み
- [ ] frontend/index.html のバナー追加が確認済み
- [ ] gas/ 配下のPaymentController, GmoPgClient, BillingScheduler, PaymentSheets, PaymentMailer が実装完了

### 設定値の本番化

- [ ] GAS PropertiesService に以下を登録済み（本番値）
  - [ ] GMO_ENV = 'prod'
  - [ ] GMO_SHOP_ID
  - [ ] GMO_SHOP_PASS
  - [ ] GMO_SITE_ID
  - [ ] GMO_SITE_PASS
  - [ ] MONTHLY_FEE_JPY = '5000'
  - [ ] PAYMENT_SHEET_ID
  - [ ] NOTIFICATION_FROM_EMAIL = 'info@ginzasugiden.com'

- [ ] frontend/payment/js/config.js を本番値に修正
  - [ ] MOCK_MODE = false
  - [ ] GAS_URL = 本番GAS Web App URL
  - [ ] RECAPTCHA_SITE_KEY = 本番 reCAPTCHA キー

- [ ] frontend/index.html
  - [ ] MOCK_MODE = false
  - [ ] PAYMENT_MOCK_MODE = false（あれば）

### GMO PG 確認

- [ ] GMO PG マイページにログイン可能
- [ ] 会員管理オプション契約有効
- [ ] API IP 制限が無効（または GAS の IP が許可リストに含まれている）
- [ ] テストカードでの動作確認完了（フェーズE完了済み）

### スプレッドシート確認

- [ ] アカウントシートに新カラム追加済み
- [ ] 課金履歴シート作成済み
- [ ] 課金スケジュールシート作成済み
- [ ] スプレッドシート編集権限が GAS 実行アカウントに付与済み

### GAS Web App デプロイ

- [ ] GAS 管理画面で「デプロイ」→「新しいデプロイ」実行
- [ ] 種類: ウェブアプリ
- [ ] 実行ユーザー: 自分
- [ ] アクセス権: 全員
- [ ] デプロイ後の Web App URL を取得
- [ ] config.js の GAS_URL に貼り付け

### 時間トリガー設定

- [ ] BillingScheduler の dailyBillingTrigger に時間トリガー設定
  - [ ] 主トリガー: 毎日 0:00〜1:00
  - [ ] 念のため: 毎日 6:00〜7:00（リカバリ用）
- [ ] 通知設定: トリガー失敗時にメール通知

### 法務文書

- [ ] 利用規約（最終版）が frontend/legal/ に配置済み
- [ ] 決済規約（最終版）が frontend/legal/ に配置済み
- [ ] 特定商取引法表記（最終版）が frontend/legal/ に配置済み
- [ ] プライバシーポリシー（最終版）が frontend/legal/ に配置済み
- [ ] payment 各画面の規約リンクが実URLに差し替え済み
- [ ] **事業者所在地、代表者名、電話番号** 確定して反映済み

### DNS / GitHub Pages

- [ ] レジストラ（お名前.com 等）で payment.ginzasugiden.com の CNAME 設定済み
  - 設定内容: payment → ginzasugiden.github.io
- [ ] frontend/payment/CNAME ファイルに `payment.ginzasugiden.com` と記載
- [ ] DNS 反映確認（dig payment.ginzasugiden.com で名前解決される）
- [ ] GitHub Pages の Custom Domain で payment.ginzasugiden.com 設定済み（または別リポジトリで構成）
- [ ] HTTPS 強制有効

### 既存ツール改修

- [ ] コンテンツページ生成ちゃん: payment_status チェック実装
- [ ] 商品名修正侍: payment_status チェック実装
- [ ] その他ツール: payment_status チェック実装
- [ ] 既存ユーザー（registered_at < 2026-06-01）の grandfathered 動作確認

---

## 🟡 リリース当日

### 最終マージ

- [ ] feature/payment-system → main へ Pull Request 作成
- [ ] PR 内容の最終レビュー
- [ ] main へマージ
- [ ] GitHub Pages の自動デプロイ完了確認（数分待機）

### 動作確認（本番環境）

- [ ] https://account.ginzasugiden.com にアクセス、アカウント作成画面表示
- [ ] テスト用アカウントを新規作成
- [ ] アカウント作成完了画面に「支払い方法を登録する」バナー表示確認
- [ ] バナークリック → payment.ginzasugiden.com への遷移確認
- [ ] payment 画面でカード登録画面表示
- [ ] **MOCK MODE バナーが表示されていないことを確認**（本番なのでオフになっているはず）
- [ ] GMO テストカードまたはとみぃ自身のカードで実テスト
- [ ] 5,000円課金成功確認（GMO PG マイページで確認）
- [ ] manage.html でカード情報・次回課金日表示確認
- [ ] history.html で課金履歴表示確認
- [ ] 通知メールがinfo@ginzasugiden.comから届く確認

### テスト後処理

- [ ] テスト課金分の即時返金処理（GMO PG マイページ）
- [ ] テスト用アカウントの削除（または管理者フラグ付与）
- [ ] テスト課金履歴をスプレッドシートからメモ（後で参照可能に）

---

## 🔴 リリース直後（24〜72時間）

### モニタリング

- [ ] 1日目: 課金エラーログ確認
- [ ] 1日目: 通知メール正常送信確認
- [ ] 1日目: スプレッドシートに不正データ混入なし確認
- [ ] 2日目: 初日に登録した利用者からのフィードバック確認
- [ ] 3日目: 翌月課金スケジュールが正しく作成されているか確認

### 限定ユーザーでの実利用テスト

- [ ] 関係者2-3名に新規登録を依頼
- [ ] 登録〜カード登録〜利用まで一連の動作確認
- [ ] フィードバック収集
- [ ] 不具合があれば修正コミット → main マージ

---

## 🚨 緊急時対応

### サービス障害

**症状**: account.ginzasugiden.com が 404 等で表示できない

**対処**:
1. GitHub Pages の設定確認: https://github.com/ginzasugiden/account/settings/pages
2. Custom domain が account.ginzasugiden.com に設定されているか
3. DNS の状況確認
4. main ブランチに最新コミットがあるか

### GAS Web App 障害

**症状**: payment 画面で API エラーが頻発

**対処**:
1. GAS 管理画面で実行ログ確認
2. PropertiesService の値が正しいか確認
3. GMO PG のステータスページ確認
4. デプロイし直し（新しいバージョンとして再デプロイ）

### GMO PG 障害

**症状**: ExecTran 等の決済APIが失敗

**対処**:
1. GMO PG ステータスページ確認: https://status.gmopg.jp/
2. GMO サポートに連絡
3. 利用者へ「決済システムの一時的な障害」を告知
4. 復旧後、失敗した課金スケジュールを手動再実行

### 想定外の課金発生

**症状**: 利用者から「身に覚えのない課金がある」との問い合わせ

**対処**:
1. info@ginzasugiden.com で受信
2. スプレッドシートの課金履歴で該当取引を確認
3. GMO PG マイページで取引詳細確認
4. 不正であれば即時返金処理
5. 利用者へ24時間以内に状況説明と返金完了報告

---

## 📋 リリース後の定期メンテナンス

### 毎月（月初）

- [ ] 前月の課金成功率確認
- [ ] 失敗した課金のリトライ状況確認
- [ ] 解約者数の集計
- [ ] 新規登録者数の集計
- [ ] 売上集計（GMO PG からの入金確認）

### 毎四半期

- [ ] 法務文書の見直し（法令改正への追随）
- [ ] GMO PG 利用状況の確認（手数料、契約内容）
- [ ] バックアップの確認（スプレッドシート、GASコード）

### 毎年

- [ ] インボイス制度関連の対応確認
- [ ] 個人情報保護法・特定商取引法等の改正確認
- [ ] PCI DSS 関連のセキュリティ要件確認

---

## ✅ 完了確認

- [ ] すべてのチェックを完了
- [ ] 本番リリース完了
- [ ] お客様への告知メール送信
- [ ] 🎉 おめでとうございます！

**リリース完了日**: ____年__月__日
**確認者**: ____________
