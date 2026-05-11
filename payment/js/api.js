/**
 * GAS API クライアント
 *
 * MOCK_MODE = true の時は擬似レスポンスを返し、
 * MOCK_MODE = false の時は実際の GAS Web App を呼び出す。
 *
 * レスポンス形式は docs/GAS_API_SPEC.md に準拠。
 * すべての /payment/* リクエストに recaptchaToken を必須付与（補強1）。
 * 日時はすべて JST (Asia/Tokyo) で扱う（補強3）。
 */
window.PaymentAPI = (function () {
  const config = window.PaymentConfig;

  // ─────────────────────────────────────────────
  // 内部: 実 GAS への POST（全エンドポイント共通）
  // ─────────────────────────────────────────────
  async function postToGAS(endpoint, data, recaptchaAction) {
    let recaptchaToken = '';
    try {
      if (typeof grecaptcha !== 'undefined' && recaptchaAction) {
        recaptchaToken = await grecaptcha.execute(config.RECAPTCHA_SITE_KEY, { action: recaptchaAction });
      }
    } catch (e) {
      console.warn('reCAPTCHA token 取得失敗（続行）:', e);
    }

    const response = await fetch(config.GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ endpoint, data, recaptchaToken }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  // ─────────────────────────────────────────────
  // 内部: MOCK レスポンス
  // ─────────────────────────────────────────────
  function mockDelay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms || 600));
  }

  // URL パラメータ ?mock_status=xxx で MOCK 時の状態を切り替え可能
  // (active / cancelled_usable / cancelled_expired / unregistered / suspended)
  function getMockStatus() {
    return new URLSearchParams(window.location.search).get('mock_status') || 'active';
  }

  function jstIsoNow(offsetDays) {
    const d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    // JST 固定の ISO 表記
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day}T${hh}:${mm}:${ss}+09:00`;
  }

  function jstDateOnly(offsetDays) {
    const d = new Date();
    if (offsetDays) d.setDate(d.getDate() + offsetDays);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ?mock_status の値を verify-token / get-info のレスポンスに変換
  function mockStatusToPaymentStatus(s) {
    if (s === 'cancelled_usable') return 'cancelled';
    if (s === 'cancelled_expired') return 'expired';
    if (s === 'suspended') return 'suspended';
    if (s === 'unregistered') return 'unregistered';
    return 'active';
  }

  async function mockVerifyToken(data) {
    await mockDelay();
    if (!data.token || !data.shop) {
      return { status: 'error', code: 'TOKEN_INVALID', message: '無効なリンクです' };
    }
    return {
      status: 'success',
      data: {
        session_token: 'mock_session_' + Math.random().toString(36).slice(2),
        session_expires_at: jstIsoNow(0).replace(/T.*/, 'T23:59:59+09:00'),
        shop: data.shop,
        shop_name: '【MOCK】テスト店舗',
        payment_status: mockStatusToPaymentStatus(getMockStatus()),
        monthly_fee_jpy: config.MONTHLY_FEE_JPY,
        gmo_env: 'test',
        gmo_shop_id: 'tshop00000000',
        gmo_token_js_url: config.GMO_TOKEN_JS_URL.test,
      },
    };
  }

  async function mockRegisterCard(data) {
    await mockDelay(1200);
    if (!data.session_token || !data.session_token.startsWith('mock_session_')) {
      return { status: 'error', code: 'SESSION_INVALID', message: 'セッションが無効です' };
    }
    if (!data.agree_terms) {
      return { status: 'error', code: 'TERMS_NOT_AGREED', message: '利用規約への同意が必要です' };
    }
    if (!data.gmo_token) {
      return { status: 'error', code: 'GMO_TOKEN_INVALID', message: 'カード情報の検証に失敗しました' };
    }
    return {
      status: 'success',
      message: '【MOCK】カードを登録しました',
      data: {
        card_last4: '1234',
        card_brand: 'VISA',
        card_expire: '2812',
        // フロントは GAS の返却値をそのまま表示（補強2）
        next_charge_date: jstDateOnly(30),
        charged_amount: config.MONTHLY_FEE_JPY,
        charge_id: 'mock_chg_' + Math.random().toString(36).slice(2),
      },
    };
  }

  async function mockGetPaymentInfo() {
    await mockDelay();
    const status = getMockStatus();
    const baseCard = {
      card_last4: '1234',
      card_brand: 'VISA',
      card_expire: '2812',
      monthly_fee_jpy: config.MONTHLY_FEE_JPY,
      registered_at: jstIsoNow(-30),
    };
    if (status === 'unregistered') {
      return { status: 'error', code: 'NOT_REGISTERED', message: 'カードが登録されていません' };
    }
    if (status === 'suspended') {
      return {
        status: 'success',
        data: Object.assign({}, baseCard, {
          payment_status: 'suspended',
          next_charge_date: jstDateOnly(-2),
          cancelled_at: null,
          valid_until: null,
          is_still_usable: false,
        }),
      };
    }
    if (status === 'cancelled_usable') {
      return {
        status: 'success',
        data: Object.assign({}, baseCard, {
          payment_status: 'cancelled',
          next_charge_date: jstDateOnly(20),
          cancelled_at: jstIsoNow(-3),
          valid_until: jstDateOnly(19),
          is_still_usable: true,
        }),
      };
    }
    if (status === 'cancelled_expired') {
      return {
        status: 'success',
        data: Object.assign({}, baseCard, {
          payment_status: 'expired',
          next_charge_date: null,
          cancelled_at: jstIsoNow(-40),
          valid_until: jstDateOnly(-10),
          is_still_usable: false,
        }),
      };
    }
    // active
    return {
      status: 'success',
      data: Object.assign({}, baseCard, {
        payment_status: 'active',
        next_charge_date: jstDateOnly(20),
        cancelled_at: null,
        valid_until: null,
        is_still_usable: true,
      }),
    };
  }

  async function mockCancel() {
    await mockDelay(900);
    return {
      status: 'success',
      message: '【MOCK】解約を受け付けました',
      data: {
        cancelled_at: jstIsoNow(0),
        valid_until: jstDateOnly(19),
        next_charge_date: jstDateOnly(20),
      },
    };
  }

  async function mockGetHistory() {
    await mockDelay();
    // 過去14ヶ月分のサンプル（過去12ヶ月＋それより古いものを含めて「もっと見る」検証可）
    const history = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, Math.min(11, 28));
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      let result = 'success';
      let purpose = i === 13 ? '初回登録' : '月次自動課金';
      let retry_attempt = 1;
      // i=3 で失敗→リトライ→成功 のシナリオ
      if (i === 3) { result = 'success'; retry_attempt = 2; purpose = 'リトライ'; }
      if (i === 4) { result = 'failed'; }
      history.push({
        charged_at: `${y}-${m}-${day}T00:15:00+09:00`,
        amount: 5000,
        purpose,
        result,
        retry_attempt,
        error_message: result === 'failed' ? 'カード会社からの応答がありませんでした' : null,
      });
    }
    return { status: 'success', data: { history } };
  }

  // ─────────────────────────────────────────────
  // 外部API
  // ─────────────────────────────────────────────

  async function verifyToken(token, shop) {
    const data = { token, shop };
    if (config.MOCK_MODE) return mockVerifyToken(data);
    return postToGAS('/payment/verify-token', data, 'payment_verify_token');
  }

  async function registerCard({ sessionToken, shop, gmoToken, cardHolderName, agreeTerms }) {
    const data = {
      session_token: sessionToken,
      shop,
      gmo_token: gmoToken,
      card_holder_name: cardHolderName,
      agree_terms: agreeTerms,
    };
    if (config.MOCK_MODE) return mockRegisterCard(data);
    return postToGAS('/payment/register-card', data, 'payment_register');
  }

  async function getPaymentInfo(sessionToken, shop) {
    const data = { session_token: sessionToken, shop };
    if (config.MOCK_MODE) return mockGetPaymentInfo();
    return postToGAS('/payment/get-info', data, 'payment_get_info');
  }

  async function cancelSubscription(sessionToken, shop) {
    const data = { session_token: sessionToken, shop, confirm: true };
    if (config.MOCK_MODE) return mockCancel();
    return postToGAS('/payment/cancel-subscription', data, 'payment_cancel');
  }

  async function getHistory(sessionToken, shop, limit) {
    const data = { session_token: sessionToken, shop, limit: limit || 200 };
    if (config.MOCK_MODE) return mockGetHistory();
    return postToGAS('/payment/get-history', data, 'payment_get_history');
  }

  /** issue-token は account.ginzasugiden.com 側からも呼ばれる */
  async function issueToken(shop, licenseKey) {
    const data = { shop, licenseKey };
    if (config.MOCK_MODE) {
      await mockDelay();
      return {
        status: 'success',
        data: {
          token: 'mock_ot_' + Math.random().toString(36).slice(2),
          expires_at: jstIsoNow(0),
          redirect_url: `/payment/index.html?token=mock_ot&shop=${encodeURIComponent(shop)}`,
        },
      };
    }
    return postToGAS('/payment/issue-token', data, 'payment_issue_token');
  }

  return { verifyToken, registerCard, getPaymentInfo, cancelSubscription, getHistory, issueToken };
})();
