# GSD 支払いシステム 本番リリース ロードマップ

> **作成日**: 2026-05-11
> **目標リリース日**: 2026-05-31
> **責任者**: とみぃ
> **協力**: Claude (Opus 4.7) + Claude Code

---

## 0. プロジェクトの全体像

### ゴール

GSDアカウント（楽天市場店舗向け業務効率化ツール群）に「月会費5,000円の継続課金」機能を追加し、2026年5月31日までに新規ユーザー向けに本番稼働させる。

### 採用方針

| 項目 | 決定事項 |
|---|---|
| 課金モデル | 月会費5,000円（税込）の継続課金 |
| 決済代行 | GMO PG（既存契約を流用） |
| カード保持 | 自社では保持せず、GMO PG に委託 |
| 課金対象 | 新規ユーザーのみ（既存ユーザーは当面無料継続） |
| 環境構築 | 本番環境で直接構築、GMOテストカードで動作確認 |
| インボイス | T9010001253199 で発行 |

### マイルストーン

```
Week 1 (5/11-5/17): 開発・接続完了
Week 2 (5/18-5/24): リリース準備
Week 3 (5/25-5/31): ソフトローンチ → 本番リリース
```

---

## 1. システム構成

```
┌─────────────────────────────────────────────────────────┐
│ account.ginzasugiden.com (既存・改修)                    │
│ - アカウント作成完了画面に「支払い登録」バナー追加       │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ payment.ginzasugiden.com (新規)                          │
│ - frontend/payment/                                      │
│ - カード登録、管理、解約、履歴                            │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────┐
│ GAS バックエンド (account/gas/)                           │
│ - PaymentController.gs (新規)                            │
│ - GmoPgClient.gs (新規)                                  │
│ - BillingScheduler.gs (新規・時間トリガー)               │
│ - PaymentSheets.gs (新規)                                │
│ - PaymentMailer.gs (新規)                                │
└────────────────┬─────────────────────────────────────────┘
                 │
                 ├─→ GMO PG (本番)
                 ├─→ Google Spreadsheet (支払い情報)
                 └─→ LicenseManagementAPI ←─ 各ツールが照会
                       │
                       ├─→ コンテンツページ生成ちゃん
                       ├─→ 商品名修正侍
                       ├─→ クーポン発行
                       └─→ ポイント倍率設定
```

### 重要な前提

- **各ツールは別々のGASプロジェクト** で動作
- 各ツールから `LicenseManagementAPI` に照会して、`payment_status` を確認する改修が必要
- 「未払いユーザーには機能を制限する」ロジックを各ツール側に追加

---

## 2. フェーズ別タスク詳細

### Phase A: 既存進捗（完了済み）

- [x] フロントエンド Phase 3（カード登録画面）実装
- [x] フロントエンド Phase 4（管理・解約・履歴画面 + バナー）実装
- [x] GAS_API_SPEC.md 仕様書作成
- [x] feature/payment-system ブランチで保存
- [x] GitHub にプッシュ完了

### Phase B: 残実装（Claude Code）- 5/12〜5/14

#### B-1: GAS 側支払いシステム実装

**作業者**: Claude Code（X:\git\account\gas\ ディレクトリで別セッション）
**期間**: 5/12（半日〜1日）

実装対象:
- [ ] `gas/PaymentController.gs` - doPost ルーティング
  - `/payment/issue-token`
  - `/payment/verify-token`
  - `/payment/register-card`
  - `/payment/get-info`
  - `/payment/cancel-subscription`
  - `/payment/get-history`
- [ ] `gas/GmoPgClient.gs` - GMO PG API呼び出しラッパー
- [ ] `gas/BillingScheduler.gs` - 月次自動課金（時間トリガー）
- [ ] `gas/PaymentSheets.gs` - スプレッドシートCRUD
- [ ] `gas/PaymentMailer.gs` - 通知メール
- [ ] 既存 `LicenseManagementAPI.gs` 改修（payment_status チェック追加）
- [ ] テスト関数群

#### B-2: frontend/index.html の MOCK_MODE 化

**作業者**: Claude Code（既存セッション or 新セッション）
**期間**: 5/12（30分）

- [ ] `frontend/index.html` に MOCK_MODE フラグ追加
- [ ] テスト時の橙バナー表示
- [ ] デフォルト false（本番接続）

#### B-3: Phase 5 - 最終仕上げ

**作業者**: Claude Code
**期間**: 5/14（半日）

- [ ] `frontend/payment/CNAME` 作成（`payment.ginzasugiden.com`）
- [ ] `docs/TESTING.md` - 結合テスト手順書
- [ ] `docs/DEPLOY.md` - デプロイ手順書
- [ ] 各画面の規約リンク先 URL 差し替え

### Phase C: GMO PG 連携設定 - 5/12

**作業者**: とみぃ
**期間**: 5/12（半日）

- [ ] GMO PG マイページから本番認証情報取得
  - ShopID
  - ShopPass
  - SiteID
  - SitePass
- [ ] GMO PG API の IP 制限が無効か確認（GASは固定IPなし）
- [ ] 会員管理オプション契約の動作確認
- [ ] PropertiesService に登録（GAS管理画面から）

### Phase D: スプレッドシート整備 - 5/13

**作業者**: とみぃ + Claude Code
**期間**: 5/13（半日）

- [ ] 「アカウント」シートに以下のカラム追加（GAS から自動でもOK）
  - gmo_member_id
  - payment_status (unregistered/active/suspended/cancelled)
  - card_seq
  - card_last4
  - card_brand
  - card_expire
  - next_charge_date
  - registered_at
  - cancelled_at
  - retry_count
- [ ] 「課金履歴」シート新規作成
- [ ] 「課金スケジュール」シート新規作成
- [ ] スプレッドシートIDを PropertiesService の PAYMENT_SHEET_ID に登録

### Phase E: テストカードで動作確認 - 5/14〜5/16

**作業者**: とみぃ
**期間**: 5/14〜5/16（3日）

確認シナリオ:
- [ ] アカウント作成 → バナーから支払い画面遷移
- [ ] テストカードでカード登録 → 即時5,000円課金成功確認
- [ ] manage.html で登録情報表示
- [ ] history.html で課金履歴表示
- [ ] エラーカードで失敗 → リトライスケジュール作成確認
- [ ] 月次トリガー手動実行 → 翌月課金が正しく動作するか
- [ ] 3回失敗 → suspended ステータス遷移
- [ ] 解約フロー → 月末まで利用可、翌々日機能停止
- [ ] 解約後再登録（残期間中はブロック）

### Phase F: 既存ツール改修 - 5/17〜5/22

**作業者**: Claude Code + とみぃ
**期間**: 5/17〜5/22（6日）

各ツールごとに以下を実施:

#### F-1: コンテンツページ生成ちゃん（contenchan）
- [ ] 機能実行前に LicenseManagementAPI で payment_status 確認
- [ ] unregistered → 支払い登録画面へ誘導
- [ ] suspended → エラーメッセージ + 支払い情報更新画面へ誘導
- [ ] active → 通常機能実行

#### F-2: 商品名修正侍（itemname）
- 同上

#### F-3: クーポン発行（couponissue?）
- 同上

#### F-4: ポイント倍率設定
- 同上

**注意**: 「既存ユーザーには当面無料継続」方針なので、改修は「**新規登録ユーザー = 課金対象**」だけに作用するようロジック設計。具体的には：

```javascript
if (account.registered_at < '2026-06-01') {
  // 既存ユーザーは無料継続（payment_status チェックをスキップ）
  return { allowed: true, reason: 'grandfathered' };
} else {
  // 新規ユーザーは payment_status をチェック
  if (account.payment_status !== 'active') {
    return { allowed: false, reason: 'payment_required' };
  }
  return { allowed: true };
}
```

### Phase G: 法務文書整備 - 5/12〜5/19

**作業者**: Claude（私）+ とみぃ
**期間**: 5/12〜5/19（並行作業）

- [ ] 利用規約ドラフト（Claude作成 → とみぃ確認）
- [ ] 決済規約ドラフト（Claude作成 → とみぃ確認）
- [ ] 特定商取引法に基づく表記（Claude作成 → とみぃ確認）
- [ ] プライバシーポリシー（Claude作成 → とみぃ確認）
- [ ] 各文書を frontend/legal/ 配下に HTML 化
- [ ] payment 画面の規約リンクを実URLに差し替え

**推奨**: リリース後でも構わないので、最終的には専門家（行政書士）に1回チェック依頼を入れる。

### Phase H: DNS・デプロイ - 5/20〜5/23

**作業者**: とみぃ
**期間**: 5/20〜5/23（数日）

- [ ] payment.ginzasugiden.com のDNS設定
  - お名前.com（または契約レジストラ）でCNAMEレコード追加
  - 反映確認（最大48時間）
- [ ] GitHub Pages の Custom Domain 設定
- [ ] HTTPS 強制設定
- [ ] feature/payment-system → main へPRマージ
- [ ] account.ginzasugiden.com に「支払い方法を登録する」バナーがデプロイされたか確認

### Phase I: ソフトローンチ - 5/24〜5/28

**作業者**: とみぃ
**期間**: 5/24〜5/28（5日）

- [ ] 関係者2-3名に新規アカウント作成＋支払い登録を依頼
- [ ] 24-48時間程度の利用観察
- [ ] 不具合や使いづらさをフィードバック受領
- [ ] 緊急修正がある場合は実施
- [ ] 大丈夫そうなら正式リリース告知

### Phase J: 正式リリース - 5/29〜5/31

**作業者**: とみぃ
**期間**: 5/29〜5/31

- [ ] 既存顧客に「新規受付開始」のお知らせメール送信
- [ ] サイトに「新規受付中」表示
- [ ] 初回課金が成功した最初のユーザーを丁寧にモニタリング
- [ ] 何かあれば即対応できる体制を準備

---

## 3. リスクと対策

### リスク1: GMO PG の IP 制限

**問題**: GAS の実行IPは不定。GMO 側で IP 制限が有効だとAPI呼び出しが失敗する。

**対策**:
- Phase C で必ず確認
- 制限有効なら GMO サポートに「IP制限解除」依頼（1-3日かかる可能性）

### リスク2: 月次自動課金トリガーの実行失敗

**問題**: GAS の時間トリガーは100%確実ではない。実行漏れがあるとユーザー請求が止まる。

**対策**:
- BillingScheduler に「過去N日分の未処理レコードもキャッチアップ」ロジックを実装
- 毎日0:00だけでなく、念のため6:00にも実行
- 異常時はとみぃへメール通知

### リスク3: 二重課金

**問題**: 同じ課金スケジュールが重複処理される可能性。

**対策**:
- OrderID は `account_id + YYYYMM + sequence` で完全一意化
- GAS側で LockService による排他制御
- スプレッドシートの status カラムで processing → done の状態管理

### リスク4: GitHub Pages 復旧

**問題**: Public/Private 切替時に Pages 設定が消える（実際に起きた）。

**対策**:
- 設定スクショを残す
- 切替前後で必ず account.ginzasugiden.com の動作確認
- 復旧手順を DEPLOY.md に記載

### リスク5: 既存ユーザーへの影響

**問題**: Phase F で既存ツールに支払いチェック追加 → バグると既存ユーザーが使えなくなる。

**対策**:
- registered_at による grandfathered ロジックを徹底
- 既存ユーザー保護のテストを必ず実施
- 各ツールにロールバック手順を準備

### リスク6: 法務文書の不備

**問題**: 規約に不備があると消費者契約法・特商法違反のリスク。

**対策**:
- Phase G で Claude がドラフト → リリース後でも専門家チェック
- 規約改定履歴を残せる構造にしておく
- 「規約は予告なく変更する」条項を含める

### リスク7: カード番号誤入力

**問題**: ユーザーがカード番号を間違えて入力 → 課金失敗連発

**対策**:
- Luhnアルゴリズムによるカード番号妥当性チェック（フロントエンド）
- エラー時の明確なメッセージ表示
- リトライ前にユーザー通知メール

---

## 4. 決定事項チェックリスト

### 確定済み ✅

- [x] 月会費5,000円（税込）の継続課金
- [x] 課金対象: 新規ユーザーのみ
- [x] 既存ユーザーは grandfathered（無料継続）
- [x] 解約: 月末で停止、日割り返金なし
- [x] リトライ: 3日後 × 最大3回 → suspended
- [x] サポート窓口: info@ginzasugiden.com
- [x] インボイス番号: T9010001253199
- [x] 法務文書: Claude がドラフト作成

### 未確定（後で決める）

- [ ] 利用規約・決済規約の発効日
- [ ] 既存ユーザーへの告知タイミングと内容
- [ ] 「新規ユーザー」の定義（日付の線引き = 2026年6月1日以降の登録？）
- [ ] 領収書の表示形式（PDF配信？画面表示のみ？）
- [ ] サポートの返信SLA（営業日24時間以内など）

---

## 5. 関連ドキュメント

| ドキュメント | 場所 | 用途 |
|---|---|---|
| 実装仕様書 | `docs/IMPLEMENTATION_SPEC.md` | システム設計の詳細 |
| GAS API仕様 | `docs/GAS_API_SPEC.md` | GAS側実装の契約 |
| Claude Code プロンプト集 | `docs/CLAUDE_CODE_PROMPTS.md` | AI実装指示 |
| 利用規約 | `docs/legal/利用規約.md` | サービス利用条件 |
| 決済規約 | `docs/legal/決済規約.md` | 月額課金条件 |
| 特商法表記 | `docs/legal/特定商取引法表記.md` | 法定表示 |
| プライバシーポリシー | `docs/legal/プライバシーポリシー.md` | 個人情報取扱 |
| デプロイチェックリスト | `docs/DEPLOYMENT_CHECKLIST.md` | 本番切替手順 |
| テスト手順書 | `docs/TESTING.md` | 動作確認手順（Phase 5で作成） |

---

## 6. 想定スケジュール（カレンダー）

```
5月
  日  月  火  水  木  金  土
                      11  12  13
                      ✅A  B-1  B-1
                          C   D
  14  15  16  17  18  19  20
  B-2 確認 確認 F   G   G   PR
  B-3                       準備
  21  22  23  24  25  26  27
  F   F   H   I   I   I   I
  28  29  30  31
  I   J   J   J 🎉
```

5/31 まで20日間、Claude Code + とみぃの並行作業で達成可能なスケジュールです。

---

## 7. 緊急時の連絡・対応

### 課金トラブル発生時のフロー

1. ユーザーから問い合わせ → info@ginzasugiden.com
2. とみぃ確認
3. GMO PG マイページで取引状況確認
4. スプレッドシートの課金履歴確認
5. 必要に応じて手動返金・再課金
6. ユーザーへ24時間以内に返信

### システムダウン時

- account.ginzasugiden.com 停止 → GitHub Pages 設定確認
- GAS Web App 停止 → デプロイ状態確認、トリガー実行ログ確認
- GMO PG 障害 → GMO ステータスページ確認、状況によりユーザーへ告知

---

**以上、本ロードマップは 5/11 時点の計画です。進捗・状況により都度更新します。**
