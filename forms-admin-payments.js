// 表單管理：「收款」分頁（10/6 新增）。每份回應各自一本帳（forms/{id}/payments/{responseId}），
// 畫面依代填人分組：可以每個人分開收，也可以整組一次收
import { showToast } from './toast.js';
import { addPaymentEntries } from './forms.js';
import {
  buildPaymentGroups, paymentTotals, allocateAmount, formatMoney, formatShortDateTime, escapeHtml
} from './forms-core.js';

var filter = 'unsettled'; // 'unsettled' | 'all'
var search = '';
var expanded = {};

var CHEV = '<svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9.5l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function tsMs(ts){ return ts && ts.toMillis ? ts.toMillis() : 0; }

function currentGroups(ctx){
  var names = {};
  Object.keys(ctx.teamUsers).forEach(function(uid){ names[uid] = ctx.teamUsers[uid].name; });
  return buildPaymentGroups(ctx.form, ctx.responses, ctx.payments, names);
}

function oweOf(rows){
  return rows.reduce(function(s, r){ return s + Math.max(r.status.balance, 0); }, 0);
}

function groupHtml(g){
  var proxyCount = g.rows.filter(function(r){ return r.isProxy; }).length;
  var sub = g.deleted ? '回應已刪除' : (proxyCount ? '含代填 ' + proxyCount + ' 份' : (g.rows[0].summary || '沒有點餐'));
  var rows = g.rows.map(function(r){
    var action = r.deleted
      ? '<button type="button" class="small-btn" data-pay="' + escapeHtml(r.responseId) + '" data-mode="refund">記錄退款</button>'
      : '<button type="button" class="small-btn" data-pay="' + escapeHtml(r.responseId) + '" data-mode="row">收款</button>';
    return '<div class="pd-row"><div class="nm">' + escapeHtml(r.name) + (r.isProxy ? ' <span class="chip line">代填</span>' : '') +
      '<span class="sub">' + escapeHtml(r.deleted ? '回應已被刪除，請確認是否退款' : (r.summary || '沒有點餐')) + '</span></div>' +
      '<div class="money"><span class="due">' + formatMoney(r.due) + '</span><span class="st ' + r.status.tone + '">' + r.status.text + '</span></div>' +
      action + '</div>';
  }).join('');
  var owe = oweOf(g.rows);
  var actions = (g.rows.length > 1 && owe > 0)
    ? '<div class="pd-actions">' +
        '<button type="button" class="small-btn" data-pay-group="' + escapeHtml(g.key) + '">整組輸入金額</button>' +
        '<button type="button" class="small-btn primary" data-pay-all="' + escapeHtml(g.key) + '">整組付清 ' + formatMoney(owe) + '</button>' +
      '</div>'
    : '';
  return '<div class="pg' + (expanded[g.key] ? ' open' : '') + '">' +
    '<button type="button" class="pg-top" data-toggle-group="' + escapeHtml(g.key) + '">' +
      '<span class="nm"><b>' + escapeHtml(g.title) + '</b><span class="sub">' + escapeHtml(sub) + '</span></span>' +
      '<span class="money"><span class="due">' + formatMoney(g.due) + '</span><span class="st ' + g.status.tone + '">' + g.status.text + '</span></span>' +
      CHEV +
    '</button>' +
    '<div class="pg-detail">' + rows + actions + '</div></div>';
}

function kpiHtml(k, v, alert){
  return '<div class="kpi' + (alert ? ' alert' : '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
}

export function renderPayments(ctx){
  var groups = currentGroups(ctx);
  var t = paymentTotals(groups);
  ctx.bodyEl.innerHTML =
    '<div class="kpis">' +
      kpiHtml('應收', formatMoney(t.due)) +
      kpiHtml('實收', formatMoney(t.paid)) +
      kpiHtml('未收', formatMoney(t.outstanding), t.outstanding > 0) +
      kpiHtml('未付清', t.unsettledCount + ' 人') +
    '</div>' +
    '<div class="pay-tools">' +
      '<input class="pay-search" id="paySearch" placeholder="搜尋姓名" value="' + escapeHtml(search) + '">' +
      '<button type="button" class="small-btn' + (filter === 'unsettled' ? ' dark' : '') + '" data-filter="unsettled">未付清</button>' +
      '<button type="button" class="small-btn' + (filter === 'all' ? ' dark' : '') + '" data-filter="all">全部</button>' +
    '</div>' +
    '<div id="payGroups"></div>';
  paintGroups(ctx, groups);
  // 搜尋只重畫名單，不重畫整個分頁，輸入框才不會失去焦點
  ctx.bodyEl.oninput = function(e){
    if (e.target.id !== 'paySearch') return;
    search = e.target.value.trim();
    paintGroups(ctx, currentGroups(ctx));
  };
  ctx.bodyEl.onclick = function(e){ onClick(ctx, e); };
}

function paintGroups(ctx, groups){
  var q = search.toLowerCase();
  var visible = groups.filter(function(g){
    if (filter === 'unsettled' && !g.unsettled) return false;
    if (!q) return true;
    return g.title.toLowerCase().indexOf(q) !== -1 || g.rows.some(function(r){ return r.name.toLowerCase().indexOf(q) !== -1; });
  });
  ctx.bodyEl.querySelector('#payGroups').innerHTML = visible.length
    ? visible.map(groupHtml).join('')
    : '<div class="fm-empty">' + (filter === 'unsettled' && !q ? '全部都付清了。' : '沒有符合條件的人。') + '</div>';
}

async function onClick(ctx, e){
  var f = e.target.closest('[data-filter]');
  if (f){
    filter = f.getAttribute('data-filter');
    renderPayments(ctx);
    return;
  }
  var toggle = e.target.closest('[data-toggle-group]');
  if (toggle){
    var key = toggle.getAttribute('data-toggle-group');
    expanded[key] = !expanded[key];
    paintGroups(ctx, currentGroups(ctx));
    return;
  }
  var groups = currentGroups(ctx);
  function groupByKey(k){ return groups.filter(function(g){ return g.key === k; })[0]; }
  var all = e.target.closest('[data-pay-all]');
  if (all){
    await payAll(ctx, groupByKey(all.getAttribute('data-pay-all')), all);
    return;
  }
  var pg = e.target.closest('[data-pay-group]');
  if (pg){
    openPaySheet(ctx, { mode: 'group', group: groupByKey(pg.getAttribute('data-pay-group')) });
    return;
  }
  var p = e.target.closest('[data-pay]');
  if (p){
    var id = p.getAttribute('data-pay');
    var row = null;
    groups.forEach(function(g){ g.rows.forEach(function(r){ if (r.responseId === id) row = r; }); });
    if (row) openPaySheet(ctx, { mode: p.getAttribute('data-mode'), row: row });
  }
}

async function payAll(ctx, g, btn){
  var entries = g.rows.filter(function(r){ return !r.deleted && r.status.balance > 0; }).map(function(r){
    return { responseId: r.responseId, name: r.name, amount: r.status.balance, note: '整組付款' };
  });
  if (!entries.length) return;
  btn.disabled = true;
  try {
    await addPaymentEntries(ctx.form.id, entries, ctx.adminUid, ctx.adminName);
    var total = entries.reduce(function(s, x){ return s + x.amount; }, 0);
    showToast('已記錄 ' + g.title + ' 整組付款 ' + formatMoney(total), 'success');
    await ctx.refresh();
  } catch (err){
    btn.disabled = false;
    showToast('記錄失敗：' + (err.code || err.message), 'error');
  }
}

function historyHtml(payment){
  var entries = ((payment && payment.entries) || []).slice().sort(function(a, b){ return tsMs(a.at) - tsMs(b.at); });
  if (!entries.length) return '';
  var total = entries.reduce(function(s, x){ return s + (Number(x.amount) || 0); }, 0);
  return '<div class="label" style="margin-top:18px">收款紀錄</div>' + entries.map(function(x){
    var neg = x.amount < 0;
    return '<div class="entry"><span class="when">' + formatShortDateTime(x.at) + '</span>' +
      '<div class="what">' + (neg ? '退款' : '收款') +
        '<span class="sub">' + escapeHtml((x.byName || '幹部') + (neg ? ' 退' : ' 收') + (x.note ? '・' + x.note : '')) + '</span></div>' +
      '<span class="amt' + (neg ? ' neg' : '') + '">' + (neg ? '' : '+') + formatMoney(x.amount) + '</span></div>';
  }).join('') +
    '<div class="entry"><span class="when"></span><div class="what">實收合計</div><span class="amt">' + formatMoney(total) + '</span></div>';
}

// mode：'row'（單筆收款）、'refund'（回應已刪除，記錄退款）、'group'（整組輸入金額，依序分配）
function openPaySheet(ctx, opts){
  var isGroup = opts.mode === 'group';
  var refund = opts.mode === 'refund';
  var rows = isGroup ? opts.group.rows.filter(function(r){ return !r.deleted; }) : [opts.row];
  var due = rows.reduce(function(s, r){ return s + r.due; }, 0);
  var paid = rows.reduce(function(s, r){ return s + r.paid; }, 0);
  var owe = oweOf(rows);
  var startAmount = refund ? Math.max(paid - due, 0) : owe;
  var el = ctx.openSubSheet({
    title: isGroup ? opts.group.title + '（整組）' : opts.row.name,
    meta: (isGroup ? '整組應付 ' : '應付 ') + formatMoney(due) + '・已收 ' + formatMoney(paid),
    bodyHtml:
      '<div class="label" id="payLabel">這次' + (refund ? '退還' : '收到') + '</div>' +
      '<input class="amt-input" id="payAmount" type="number" inputmode="numeric" min="1" step="1" value="' + (startAmount || '') + '">' +
      '<div class="quick">' +
        (owe > 0 ? '<button type="button" class="small-btn" data-quick="' + owe + '">補足差額 ' + formatMoney(owe) + '</button>' : '') +
        '<button type="button" class="small-btn" data-quick="100">$100</button>' +
        '<button type="button" class="small-btn" data-quick="200">$200</button>' +
        (isGroup ? '' : '<button type="button" class="small-btn' + (refund ? ' active' : '') + '" data-refund-toggle>找零 / 退款</button>') +
      '</div>' +
      '<input class="field-input" id="payNote" placeholder="備註（選填）" maxlength="60" style="margin-top:10px">' +
      (isGroup ? '<div class="alloc" id="payAlloc"></div>' : '') +
      (isGroup ? '' : historyHtml(ctx.payments[opts.row.responseId])),
    footerHtml:
      '<button type="button" class="cta-btn cta-btn-secondary" data-act="cancel">取消</button>' +
      '<button type="button" class="cta-btn" data-act="confirm">記錄</button>'
  });
  var amountEl = el.body.querySelector('#payAmount');
  var confirmBtn = el.footer.querySelector('[data-act="confirm"]');

  function amount(){
    return Math.max(0, Math.round(Number(amountEl.value) || 0));
  }
  function sync(){
    var a = amount();
    confirmBtn.textContent = (refund ? '記錄退款 ' : '記錄收款 ') + formatMoney(a);
    confirmBtn.disabled = a <= 0;
    if (isGroup){
      var parts = allocateAmount(rows, a);
      el.body.querySelector('#payAlloc').innerHTML = '<div class="label">分配到每個人</div>' + rows.map(function(r, i){
        return '<div class="alloc-row"><span>' + escapeHtml(r.name) + '</span><span>' + formatMoney(parts[i]) + '</span></div>';
      }).join('');
    }
  }
  sync();

  el.body.oninput = sync;
  el.body.onclick = function(e){
    var q = e.target.closest('[data-quick]');
    if (q){
      amountEl.value = q.getAttribute('data-quick');
      sync();
      return;
    }
    var t = e.target.closest('[data-refund-toggle]');
    if (t){
      refund = !refund;
      t.classList.toggle('active', refund);
      el.body.querySelector('#payLabel').textContent = '這次' + (refund ? '退還' : '收到');
      sync();
    }
  };
  el.footer.onclick = async function(e){
    var b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.getAttribute('data-act') === 'cancel'){ ctx.closeSubSheet(); return; }
    var a = amount();
    if (a <= 0) return;
    var note = el.body.querySelector('#payNote').value.trim();
    var entries;
    if (isGroup){
      var parts = allocateAmount(rows, a);
      entries = rows.map(function(r, i){
        return { responseId: r.responseId, name: r.name, amount: parts[i], note: note || '整組付款' };
      }).filter(function(x){ return x.amount > 0; });
    } else {
      entries = [{ responseId: opts.row.responseId, name: opts.row.name, amount: refund ? -a : a, note: note }];
    }
    b.disabled = true;
    try {
      await addPaymentEntries(ctx.form.id, entries, ctx.adminUid, ctx.adminName);
      ctx.closeSubSheet();
      showToast((refund ? '已記錄退款 ' : '已記錄收款 ') + formatMoney(a), 'success');
      await ctx.refresh();
    } catch (err){
      b.disabled = false;
      showToast('記錄失敗：' + (err.code || err.message), 'error');
    }
  };
}
