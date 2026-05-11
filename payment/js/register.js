/**
 * カード登録画面のロジック
 *
 * フロー:
 *   1. PaymentAuth.initialize() でセッション確立
 *   2. PaymentToken.init(session) で GMO PG SDK 初期化
 *   3. フォーム submit:
 *      a. クライアントサイドバリデーション
 *      b. PaymentToken.getToken(...) でトークン化
 *      c. カード番号フィールドを即クリア
 *      d. PaymentAPI.registerCard(...) で GAS に送信
 *      e. 成功画面に遷移
 */
(function () {
  const config = window.PaymentConfig;

  // ─── DOM 参照 ───
  const elements = {};

  function $(id) { return document.getElementById(id); }

  function showMessage(type, html) {
    const el = $('message');
    el.className = 'message ' + type;
    el.innerHTML = html;
  }

  function clearMessage() {
    const el = $('message');
    el.className = 'message';
    el.innerHTML = '';
  }

  // ─── 初期化 ───
  let currentSession = null;

  async function initializePage() {
    // モックモードバナー
    if (config.MOCK_MODE) {
      $('mockBanner').style.display = 'block';
    }

    showMessage('loading', '<span class="spinner"></span>セッションを確認しています...');
    $('cardForm').style.display = 'none';

    const auth = await window.PaymentAuth.initialize();
    if (!auth.ok) {
      $('cardForm').style.display = 'none';
      $('planBox').style.display = 'none';
      showMessage('error', '❌ ' + auth.error
        + '<br><br><a href="' + config.ACCOUNT_HOME_URL + '">アカウント作成ページに戻る</a>');
      return;
    }

    currentSession = auth.session;
    $('shopNameDisplay').textContent = currentSession.shop_name || currentSession.shop;
    $('feeDisplay').textContent = '月会費 ' + currentSession.monthly_fee_jpy.toLocaleString() + '円（税込）';

    // 既にカード登録済みなら manage 画面へ誘導
    if (currentSession.payment_status === 'active') {
      $('cardForm').style.display = 'none';
      $('planBox').style.display = 'none';
      showMessage('success', '✅ このアカウントには既にカードが登録されています。'
        + '<br><br><a href="manage.html">カード管理画面へ</a>');
      return;
    }

    try {
      await window.PaymentToken.init(currentSession);
    } catch (e) {
      showMessage('error', '❌ 決済システムの初期化に失敗しました: ' + e.message);
      return;
    }

    clearMessage();
    $('cardForm').style.display = 'block';
  }

  // ─── バリデーション ───
  function validateForm(data) {
    const cardnoDigits = data.cardno.replace(/\s/g, '');
    if (!/^\d{13,19}$/.test(cardnoDigits)) {
      return 'カード番号は13〜19桁の数字で入力してください';
    }
    const m = parseInt(data.expireMonth, 10);
    if (!(m >= 1 && m <= 12)) {
      return '有効期限の月が不正です';
    }
    const y = parseInt(data.expireYear, 10);
    const currentYear = new Date().getFullYear() % 100;
    if (!(y >= currentYear && y <= currentYear + 20)) {
      return '有効期限の年が不正です';
    }
    if (!/^\d{3,4}$/.test(data.securitycode)) {
      return 'セキュリティコードは3〜4桁の数字で入力してください';
    }
    if (!data.holdername || data.holdername.length < 2) {
      return 'カード名義人を入力してください';
    }
    if (!data.agreeTerms) {
      return '利用規約と決済規約への同意が必要です';
    }
    return null;
  }

  // ─── submit ハンドラ ───
  async function handleSubmit(e) {
    e.preventDefault();
    clearMessage();

    const data = {
      cardno: $('cardno').value.trim(),
      expireMonth: $('expire_month').value.trim(),
      expireYear: $('expire_year').value.trim(),
      securitycode: $('securitycode').value.trim(),
      holdername: $('holdername').value.trim(),
      agreeTerms: $('agreeTerms').checked,
    };

    const error = validateForm(data);
    if (error) {
      showMessage('error', '❌ ' + error);
      return;
    }

    const submitBtn = $('submitBtn');
    submitBtn.disabled = true;
    submitBtn.textContent = '処理中...';
    showMessage('loading', '<span class="spinner"></span>カード情報を暗号化しています...');

    let gmoToken;
    try {
      gmoToken = await window.PaymentToken.getToken({
        cardno: data.cardno,
        expireMonth: data.expireMonth,
        expireYear: data.expireYear,
        securitycode: data.securitycode,
        holdername: data.holdername,
      });
    } catch (e) {
      showMessage('error', '❌ ' + e.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'カードを登録して開始する';
      return;
    }

    // ★ トークン化後は即座にカード情報をクリア（メモリにも残さない）
    $('cardno').value = '';
    $('securitycode').value = '';
    // holdername, expire は残しても無害だが念のためクリア
    $('expire_month').value = '';
    $('expire_year').value = '';
    $('holdername').value = '';

    showMessage('loading', '<span class="spinner"></span>カードを登録しています...');

    try {
      const result = await window.PaymentAPI.registerCard({
        sessionToken: currentSession.session_token,
        shop: currentSession.shop,
        gmoToken: gmoToken,
        cardHolderName: data.holdername,
        agreeTerms: data.agreeTerms,
      });

      if (result.status === 'success') {
        renderSuccess(result.data);
      } else {
        showMessage('error', '❌ ' + (result.message || '登録に失敗しました'));
        submitBtn.disabled = false;
        submitBtn.textContent = 'カードを登録して開始する';
      }
    } catch (e) {
      showMessage('error', '❌ 通信エラー: ' + e.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'カードを登録して開始する';
    }
  }

  // ─── 成功画面 ───
  function renderSuccess(data) {
    $('cardForm').style.display = 'none';
    $('planBox').style.display = 'none';
    clearMessage();

    const formattedDate = formatDate(data.next_charge_date);
    const amount = data.charged_amount.toLocaleString();

    $('successPanel').innerHTML = `
      <h2>✅ 登録が完了しました</h2>
      <div class="success-detail">
        <div class="row"><span class="label">カード</span><span class="value">${data.card_brand} **** ${data.card_last4}</span></div>
        <div class="row"><span class="label">本日の課金額</span><span class="value">${amount}円</span></div>
        <div class="row"><span class="label">次回課金日</span><span class="value">${formattedDate}</span></div>
      </div>
      <p class="success-note">領収書はご登録メールアドレスにお送りします。<br>
      カード変更や解約は管理画面から行えます。</p>
      <a href="manage.html" class="btn-secondary">カード管理画面へ</a>
    `;
    $('successPanel').style.display = 'block';
  }

  function formatDate(isoDate) {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  // ─── カード番号入力の自動フォーマット（4桁ごとに半角スペース） ───
  function setupCardNumberFormatting() {
    const input = $('cardno');
    input.addEventListener('input', (e) => {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 19);
      const formatted = digits.replace(/(\d{4})(?=\d)/g, '$1 ');
      e.target.value = formatted;
    });
  }

  // ─── 起動 ───
  document.addEventListener('DOMContentLoaded', async () => {
    setupCardNumberFormatting();
    $('cardForm').addEventListener('submit', handleSubmit);
    await initializePage();
  });
})();
