/**
 * 課金履歴画面ロジック (history.html)
 *
 * - セッション確立 → /payment/get-history
 * - 過去12ヶ月を初期表示、それより古いものは「もっと見る」で展開
 * - success / failed / retry をアイコンで視覚化
 *
 * 日付の月数算出は GAS の charged_at（JST 固定）をクライアント側で
 * パースして比較するのみ。本来 GAS にフィルタを持たせるべきだが、
 * 件数が限定的（最大200件）なのでクライアント側で実施可。
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

  function formatJpDateTime(isoStr) {
    if (!isoStr) return '—';
    const m = String(isoStr).match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return isoStr;
    const date = `${m[1]}年${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
    if (m[4]) return `${date} ${m[4]}:${m[5]}`;
    return date;
  }

  function iconFor(entry) {
    if (entry.result === 'success' && entry.retry_attempt > 1) {
      return '<span class="icon icon-retry" title="リトライ成功">🔄</span>';
    }
    if (entry.result === 'success') return '<span class="icon icon-success" title="成功">✅</span>';
    if (entry.result === 'failed') return '<span class="icon icon-failed" title="失敗">❌</span>';
    return '<span class="icon">—</span>';
  }

  function statusLabel(entry) {
    if (entry.result === 'success' && entry.retry_attempt > 1) return `成功（${entry.retry_attempt}回目）`;
    if (entry.result === 'success') return '成功';
    if (entry.result === 'failed') return '失敗';
    return entry.result;
  }

  // 12ヶ月前の閾値（JST）
  function thresholdIso() {
    const d = new Date();
    d.setMonth(d.getMonth() - 12);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  let allHistory = [];
  let showAll = false;

  function renderTable() {
    const threshold = thresholdIso();
    const visible = showAll
      ? allHistory
      : allHistory.filter((h) => String(h.charged_at).slice(0, 10) >= threshold);

    if (visible.length === 0) {
      $('tableWrap').innerHTML = '<p class="empty-state">課金履歴はまだありません。</p>';
      $('moreWrap').style.display = 'none';
      return;
    }

    let html = '<table class="history-table"><thead><tr>'
      + '<th></th><th>日時</th><th>用途</th><th>金額</th><th>ステータス</th>'
      + '</tr></thead><tbody>';
    for (const h of visible) {
      const errorRow = h.result === 'failed' && h.error_message
        ? `<tr class="error-detail"><td colspan="5">↳ ${escapeHtml(h.error_message)}</td></tr>`
        : '';
      html += `<tr>
        <td>${iconFor(h)}</td>
        <td>${formatJpDateTime(h.charged_at)}</td>
        <td>${escapeHtml(h.purpose || '—')}</td>
        <td class="amount">${h.amount.toLocaleString()}円</td>
        <td>${statusLabel(h)}</td>
      </tr>${errorRow}`;
    }
    html += '</tbody></table>';
    $('tableWrap').innerHTML = html;

    const olderCount = allHistory.length - visible.length;
    if (olderCount > 0 && !showAll) {
      $('moreWrap').style.display = 'block';
      $('moreBtn').textContent = `もっと見る（過去のすべて: 残り ${olderCount} 件）`;
    } else {
      $('moreWrap').style.display = 'none';
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function initialize() {
    if (config.MOCK_MODE) $('mockBanner').style.display = 'block';

    showMessage('loading', '<span class="spinner"></span>履歴を読み込んでいます...');

    const auth = await window.PaymentAuth.initialize();
    if (!auth.ok) {
      showMessage('error', '❌ ' + auth.error);
      return;
    }

    let result;
    try {
      result = await window.PaymentAPI.getHistory(auth.session.session_token, auth.session.shop, 200);
    } catch (e) {
      showMessage('error', '❌ 通信エラー: ' + e.message);
      return;
    }

    if (result.status !== 'success') {
      showMessage('error', '❌ ' + (result.message || '履歴取得に失敗しました'));
      return;
    }

    $('shopNameDisplay').textContent = auth.session.shop_name || auth.session.shop;
    clearMessage();
    allHistory = result.data.history || [];
    renderTable();
    $('historyPanel').style.display = 'block';
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('moreBtn').addEventListener('click', () => {
      showAll = true;
      renderTable();
    });
    initialize();
  });
})();
