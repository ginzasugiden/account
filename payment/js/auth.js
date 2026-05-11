/**
 * 認証・セッション管理
 *
 * フロー:
 *   1. account.ginzasugiden.com から URL パラメータ token, shop を受け取る
 *   2. /payment/verify-token を叩いて session_token を取得
 *   3. sessionStorage に保存
 *   4. 以降の API 呼び出しで session_token を使う
 *
 * sessionStorage を使う理由:
 *   - タブを閉じたら消える（セキュリティ）
 *   - 同一タブ内のページ遷移で保持できる（manage.html → cancel.html 等）
 */
window.PaymentAuth = (function () {
  const config = window.PaymentConfig;

  function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      token: params.get('token') || '',
      shop: params.get('shop') || '',
    };
  }

  function saveSession(session) {
    try {
      sessionStorage.setItem(config.SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn('sessionStorage 保存失敗:', e);
    }
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(config.SESSION_STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      // 期限切れチェック
      if (session.session_expires_at && new Date(session.session_expires_at) < new Date()) {
        clearSession();
        return null;
      }
      return session;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(config.SESSION_STORAGE_KEY);
    } catch (e) {
      // noop
    }
  }

  /**
   * ページロード時の初期化処理。
   * - URLにtokenがあれば verify-token を叩く
   * - 既に session があればそれを使う
   *
   * @returns {Promise<{ok: true, session: object} | {ok: false, error: string}>}
   */
  async function initialize() {
    // 既存セッションを優先
    const existing = loadSession();
    if (existing && existing.session_token) {
      return { ok: true, session: existing };
    }

    const { token, shop } = getUrlParams();
    if (!token || !shop) {
      return {
        ok: false,
        error: 'リンクが正しくありません。アカウント作成ページから再度お試しください。',
      };
    }

    try {
      const result = await window.PaymentAPI.verifyToken(token, shop);
      if (result.status === 'success') {
        saveSession(result.data);
        // URL からトークンを消す（履歴に残さない）
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
        return { ok: true, session: result.data };
      }
      return { ok: false, error: result.message || '認証に失敗しました', code: result.code };
    } catch (e) {
      return { ok: false, error: '通信エラーが発生しました: ' + e.message };
    }
  }

  return {
    initialize,
    getSession: loadSession,
    clearSession,
  };
})();
