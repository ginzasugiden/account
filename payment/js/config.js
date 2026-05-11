/**
 * 支払い登録システム設定
 *
 * ⚠️ MOCK_MODE について
 * ============================================================
 * MOCK_MODE = true  → GAS未実装でも画面確認可（擬似レスポンス）
 * MOCK_MODE = false → 本物の GAS Web App を呼び出す
 *
 * GAS実装完了後は必ず MOCK_MODE = false にしてから push すること！
 * MOCK_MODE = true の状態で push すると、本番ユーザにモックが表示されます。
 * ============================================================
 */
window.PaymentConfig = {
  // ★★ 本番デプロイ前に false に変更 ★★
  MOCK_MODE: true,

  // 既存システムと同じ GAS Web App URL を共用
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxuR0q6FseR6zyvPygFVU2NX4Rm9BX-T9QOjLFZV1f7UPzDhIFjhaIJTuYsmEqLu8R-/exec',

  // reCAPTCHA v3 (既存と同一サイトキー)
  RECAPTCHA_SITE_KEY: '6LfpP14sAAAAAPFL0gSo_Ze_h8C91VsEC247xkDD',

  // 月会費（税込）。表示用。実際の課金額は GAS 側 ScriptProperties が正
  MONTHLY_FEE_JPY: 5000,

  // GMO PG token.js URL（環境に応じて verify-token のレスポンスで上書きされる）
  GMO_TOKEN_JS_URL: {
    test: 'https://stg.static.mul-pay.jp/ext/js/token.js',
    prod: 'https://static.mul-pay.jp/ext/js/token.js',
  },

  // account.ginzasugiden.com に戻る時のURL
  ACCOUNT_HOME_URL: 'https://account.ginzasugiden.com/',

  // セッション関連
  SESSION_STORAGE_KEY: 'gsd_payment_session',
};

// MOCK モード時はコンソールに警告
if (window.PaymentConfig.MOCK_MODE) {
  console.warn('%c⚠️ MOCK MODE 有効: API 呼び出しは擬似レスポンスを返します',
    'color:#fff;background:#e67e22;padding:4px 8px;border-radius:4px;font-weight:bold;');
}
