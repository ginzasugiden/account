/**
 * 解約画面ロジック (cancel.html)
 *
 * フロー:
 *   1. セッション確立
 *   2. /payment/get-info で現状取得（next_charge_date, valid_until）
 *   3. 「解約手続きへ進む」ボタン → 確認モーダル表示
 *   4. モーダル内「解約を確定する」ボタン → /payment/cancel-subscription
 *   5. 成功画面表示（valid_until を強調）
 *
 * 日付の計算はしない。GAS の返却値を表示するのみ（補強2）。
 */
(function () {
  const config = window.PaymentConfig;
  let currentSession = null;
  let currentInfo = null;

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

  function formatJpDate(isoStr) {
    if (!isoStr) return '—';
    const m = String(isoStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return isoStr;
    return `${m[1]}年${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
  }

  async function initialize() {
    if (config.MOCK_MODE) $('mockBanner').style.display = 'block';

    showMessage('loading', '<span class="spinner"></span>情報を取得しています...');
    $('cancelPanel').style.display = 'none';

    const auth = await window.PaymentAuth.initialize();
    if (!auth.ok) {
      showMessage('error', '❌ ' + auth.error);
      return;
    }
    currentSession = auth.session;

    let info;
    try {
      info = await window.PaymentAPI.getPaymentInfo(currentSession.session_token, currentSession.shop);
    } catch (e) {
      showMessage('error', '❌ 通信エラー: ' + e.message);
      return;
    }

    if (info.status === 'error') {
      if (info.code === 'NOT_REGISTERED') {
        showMessage('error', '❌ カードが登録されていません。<br><a href="index.html">登録画面へ</a>');
      } else {
        showMessage('error', '❌ ' + info.message);
      }
      return;
    }

    currentInfo = info.data;

    // 既に解約済み（利用期間中）の場合
    if (currentInfo.payment_status === 'cancelled' && currentInfo.is_still_usable) {
      showMessage('warning', '⚠️ 既に解約処理が完了しています。<br>'
        + formatJpDate(currentInfo.valid_until) + ' まで利用可能です。'
        + '<br><br><a href="manage.html">管理画面に戻る</a>');
      return;
    }
    if (currentInfo.payment_status === 'expired' || (currentInfo.payment_status === 'cancelled' && !currentInfo.is_still_usable)) {
      showMessage('warning', '⚠️ 既に利用期間が終了しています。'
        + '<br><br><a href="manage.html">管理画面に戻る</a>');
      return;
    }
    if (currentInfo.payment_status !== 'active' && currentInfo.payment_status !== 'suspended') {
      showMessage('warning', '⚠️ 解約可能な状態ではありません。');
      return;
    }

    clearMessage();
    renderCancelForm(currentInfo);
  }

  function renderCancelForm(data) {
    $('currentPlan').textContent = `月会費 ${(data.monthly_fee_jpy || 5000).toLocaleString()}円（税込）`;
    $('nextChargeDate').textContent = formatJpDate(data.next_charge_date);

    // 解約後の利用可能期限 = next_charge_date - 1日（表示用文言は GAS の解約APIで確定値を返すので、ここでは next_charge_date を表示する形に止める）
    // ただし、ユーザに「いつまで使えるか」を事前に示せた方が親切なため、文言は「次回課金予定日の前日」と説明的に表現
    $('cancelPanel').style.display = 'block';
  }

  // ─── 二段階確認モーダル ───
  function openConfirmModal() {
    $('confirmModal').classList.add('active');
    document.body.style.overflow = 'hidden';
  }
  function closeConfirmModal() {
    $('confirmModal').classList.remove('active');
    document.body.style.overflow = '';
  }

  async function confirmCancel() {
    const btn = $('confirmCancelBtn');
    btn.disabled = true;
    btn.textContent = '処理中...';

    let result;
    try {
      result = await window.PaymentAPI.cancelSubscription(currentSession.session_token, currentSession.shop);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = '解約を確定する';
      showMessage('error', '❌ 通信エラー: ' + e.message);
      closeConfirmModal();
      return;
    }

    if (result.status !== 'success') {
      btn.disabled = false;
      btn.textContent = '解約を確定する';
      showMessage('error', '❌ ' + (result.message || '解約に失敗しました'));
      closeConfirmModal();
      return;
    }

    closeConfirmModal();
    renderSuccess(result.data);
  }

  function renderSuccess(data) {
    $('cancelPanel').style.display = 'none';
    clearMessage();
    $('successPanel').innerHTML = `
      <h2>✅ 解約手続きが完了しました</h2>
      <div class="detail-grid">
        <div class="row"><span class="label">解約受付日時</span><span class="value">${formatJpDate(data.cancelled_at)}</span></div>
        <div class="row"><span class="label">利用可能期限</span><span class="value">${formatJpDate(data.valid_until)}</span></div>
      </div>
      <p class="success-note">
        ${formatJpDate(data.valid_until)} まで全機能をご利用いただけます。<br>
        翌日（${formatJpDate(data.next_charge_date)}）から機能が停止します。<br>
        日割りでの返金はございません。
      </p>
      <p class="success-note" style="font-size:11px;">
        再登録は利用期間終了後に可能になります。
      </p>
      <a href="manage.html" class="btn-secondary">管理画面に戻る</a>
    `;
    $('successPanel').style.display = 'block';
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('openConfirmBtn').addEventListener('click', openConfirmModal);
    $('closeConfirmBtn').addEventListener('click', closeConfirmModal);
    $('confirmCancelBtn').addEventListener('click', confirmCancel);
    $('confirmModal').addEventListener('click', (e) => {
      if (e.target === $('confirmModal')) closeConfirmModal();
    });
    initialize();
  });
})();
