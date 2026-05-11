/**
 * GMO PG token.js ラッパー
 *
 * カード番号・有効期限・セキュリティコードを GMO PG にトークン化させる。
 * トークン化後、フォームのカード番号フィールドは即座にクリアし、
 * GAS に送るのはトークンと所有者名のみ。
 *
 * MOCK_MODE 時は GMO PG を呼ばずダミートークンを返す。
 */
window.PaymentToken = (function () {
  const config = window.PaymentConfig;

  let gmoScriptLoaded = false;
  let gmoInitialized = false;

  /**
   * GMO PG token.js を <script> タグで動的読み込み
   */
  function loadGmoScript(url) {
    if (gmoScriptLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.onload = () => {
        gmoScriptLoaded = true;
        resolve();
      };
      script.onerror = () => reject(new Error('GMO PG token.js の読み込みに失敗しました'));
      document.head.appendChild(script);
    });
  }

  /**
   * GMO PG の初期化。session から取得した gmo_token_js_url と gmo_shop_id を使う。
   */
  async function init(session) {
    if (config.MOCK_MODE) {
      gmoInitialized = true;
      return;
    }
    if (gmoInitialized) return;

    const url = session.gmo_token_js_url || config.GMO_TOKEN_JS_URL[session.gmo_env || 'test'];
    await loadGmoScript(url);

    if (typeof Multipayment === 'undefined') {
      throw new Error('GMO PG SDK が利用できません');
    }
    Multipayment.init(session.gmo_shop_id);
    gmoInitialized = true;
  }

  /**
   * カード情報からトークンを取得
   *
   * @param {object} cardData
   *   { cardno, expireMonth, expireYear, securitycode, holdername }
   * @returns {Promise<string>} GMO PG トークン
   */
  async function getToken(cardData) {
    if (!gmoInitialized) {
      throw new Error('GMO PG が初期化されていません');
    }

    // MOCK: 実際の GMO PG を呼ばずダミー値
    if (config.MOCK_MODE) {
      await new Promise((r) => setTimeout(r, 400));
      // 簡易バリデーション（モックでも形式は確認）
      if (!/^\d{13,19}$/.test(cardData.cardno.replace(/\s/g, ''))) {
        throw new Error('カード番号の形式が不正です');
      }
      return 'mock_gmo_token_' + Math.random().toString(36).slice(2);
    }

    return new Promise((resolve, reject) => {
      // YYMM形式（GMO仕様）
      const expire = String(cardData.expireYear).padStart(2, '0').slice(-2)
                   + String(cardData.expireMonth).padStart(2, '0');

      Multipayment.getToken({
        cardno: cardData.cardno.replace(/\s/g, ''),
        expire: expire,
        securitycode: cardData.securitycode,
        holdername: cardData.holdername,
      }, (response) => {
        if (response.resultCode === '000') {
          resolve(response.tokenObject.token);
        } else {
          reject(new Error('カード情報の検証に失敗しました（' + response.resultCode + '）'));
        }
      });
    });
  }

  return { init, getToken };
})();
