/**
 * 管理画面ロジック (manage.html)
 *
 * - セッション確立 → /payment/get-info
 * - payment_status と is_still_usable に応じて UI を分岐表示
 *   (補強4: GAS_API_SPEC.md §2.4 の対応表を参照)
 *
 * 日付計算は一切行わない。GAS が返した next_charge_date / valid_until を
 * そのまま表示する（補強2）。
 */
(function () {
  const config = window.PaymentConfig;

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

  // JST固定の日付文字列を「YYYY年M月D日」表示に
  function formatJpDate(isoStr) {
    if (!isoStr) return '—';
    // 'YYYY-MM-DD' または 'YYYY-MM-DDTHH:mm:ss+09:00' を許容
    const m = String(isoStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return isoStr;
    return `${m[1]}年${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
  }

  async function initialize() {
    if (config.MOCK_MODE) $('mockBanner').style.display = 'block';

    showMessage('loading', '<span class="spinner"></span>セッションを確認しています...');

    const auth = await window.PaymentAuth.initialize();
    if (!auth.ok) {
      showMessage('error', '❌ ' + auth.error
        + '<br><br><a href="' + config.ACCOUNT_HOME_URL + '">アカウント作成ページに戻る</a>');
      return;
    }
    const session = auth.session;
    $('shopNameDisplay').textContent = session.shop_name || session.shop;

    showMessage('loading', '<span class="spinner"></span>カード情報を取得しています...');
    let info;
    try {
      info = await window.PaymentAPI.getPaymentInfo(session.session_token, session.shop);
    } catch (e) {
      showMessage('error', '❌ 通信エラー: ' + e.message);
      return;
    }

    // NOT_REGISTERED は state.unregistered として扱う
    if (info.status === 'error' && info.code === 'NOT_REGISTERED') {
      renderUnregistered();
      return;
    }
    if (info.status !== 'success') {
      showMessage('error', '❌ ' + (info.message || '情報取得に失敗しました'));
      return;
    }

    clearMessage();
    renderByStatus(info.data);
  }

  function renderUnregistered() {
    clearMessage();
    $('panel').innerHTML = `
      <div class="status-box status-warn">
        <p class="status-title">カードが登録されていません</p>
        <p class="status-note">「コンテンツページ生成ちゃん」を利用するにはカード登録が必要です。</p>
      </div>
      <a href="index.html" class="submit-btn-link">カードを登録する</a>
    `;
    $('panel').style.display = 'block';
  }

  function renderByStatus(data) {
    const status = data.payment_status;
    if (status === 'active') {
      renderActive(data);
    } else if (status === 'cancelled' && data.is_still_usable === true) {
      renderCancelledUsable(data);
    } else if (status === 'cancelled' || status === 'expired') {
      renderExpired(data);
    } else if (status === 'suspended') {
      renderSuspended(data);
    } else {
      renderUnregistered();
    }
  }

  function cardSummaryHtml(data) {
    return `
      <div class="detail-grid">
        <div class="row"><span class="label">カード</span><span class="value">${data.card_brand} **** ${data.card_last4}</span></div>
        <div class="row"><span class="label">有効期限</span><span class="value">${formatCardExpire(data.card_expire)}</span></div>
        <div class="row"><span class="label">月会費</span><span class="value">${(data.monthly_fee_jpy || 5000).toLocaleString()}円（税込）</span></div>
      </div>
    `;
  }

  function formatCardExpire(yymm) {
    if (!yymm || yymm.length !== 4) return '—';
    return `20${yymm.slice(0, 2)}年${parseInt(yymm.slice(2), 10)}月`;
  }

  function renderActive(data) {
    $('panel').innerHTML = `
      <div class="status-box status-active">
        <span class="status-badge badge-active">● ご利用中</span>
        <p class="status-title">次回課金日: ${formatJpDate(data.next_charge_date)}</p>
      </div>
      ${cardSummaryHtml(data)}
      <div class="action-buttons">
        <a href="index.html" class="btn-secondary">カードを変更する</a>
        <a href="history.html" class="btn-secondary">課金履歴を見る</a>
        <a href="cancel.html" class="btn-danger">解約する</a>
      </div>
    `;
    $('panel').style.display = 'block';
  }

  function renderCancelledUsable(data) {
    $('panel').innerHTML = `
      <div class="status-box status-cancelled">
        <span class="status-badge badge-cancelled">● 解約済み</span>
        <p class="status-title">${formatJpDate(data.valid_until)} まで利用可能です</p>
        <p class="status-note">この日を過ぎると機能が停止します。次回の課金は行われません。<br>
        再登録は利用期間終了後に可能になります。</p>
      </div>
      ${cardSummaryHtml(data)}
      <div class="action-buttons">
        <a href="history.html" class="btn-secondary">課金履歴を見る</a>
      </div>
    `;
    $('panel').style.display = 'block';
  }

  function renderExpired(data) {
    $('panel').innerHTML = `
      <div class="status-box status-warn">
        <p class="status-title">利用期間が終了しています</p>
        <p class="status-note">${formatJpDate(data.valid_until)} で利用期間が終了しました。<br>
        再登録すると新規扱いで再開できます。</p>
      </div>
      <a href="index.html" class="submit-btn-link">再登録する</a>
      <div class="action-buttons" style="margin-top:14px;">
        <a href="history.html" class="btn-secondary">課金履歴を見る</a>
      </div>
    `;
    $('panel').style.display = 'block';
  }

  function renderSuspended(data) {
    $('panel').innerHTML = `
      <div class="status-box status-danger">
        <span class="status-badge badge-danger">● 一時停止中</span>
        <p class="status-title">課金に失敗したため、機能が一時停止しています</p>
        <p class="status-note">カード情報を更新してください。お困りの場合はサポートまでご連絡ください。</p>
      </div>
      ${cardSummaryHtml(data)}
      <div class="action-buttons">
        <a href="index.html" class="btn-primary-link">カードを変更する</a>
        <a href="history.html" class="btn-secondary">課金履歴を見る</a>
      </div>
    `;
    $('panel').style.display = 'block';
  }

  document.addEventListener('DOMContentLoaded', initialize);
})();
