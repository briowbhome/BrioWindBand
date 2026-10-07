// 表單管理：「回應」分頁（10/6 新增）：每題統計、逐份回應、回應明細（修改／刪除／綁定到團員）
import { showToast } from './toast.js';
import { showConfirm } from './dialog.js';
import { updateResponse, deleteResponse, bindResponse } from './forms.js';
import {
  escapeHtml, summarizeQuestion, responseKind, itemsSummary, validateAnswers, cleanAnswers,
  paidTotal, formatMoney, formatShortDateTime
} from './forms-core.js';
import { renderFields, readFields } from './form-fields.js';

var view = 'stats'; // 'stats' | 'list'

function tsMs(ts){ return ts && ts.toMillis ? ts.toMillis() : 0; }

function userName(ctx, uid){
  var u = ctx.teamUsers[uid];
  return u ? u.name : '';
}

function tagsHtml(ctx, r){
  var kind = responseKind(r, ctx.teamUsers);
  var tags = [];
  if (kind === 'proxy') tags.push('<span class="chip line">' + escapeHtml((userName(ctx, r.proxyBy) || '團員') + ' 代填') + '</span>');
  if (kind === 'guest') tags.push('<span class="chip line">訪客</span>');
  if (kind === 'member' && ctx.teamUsers[r.uid].status !== 'approved') tags.push('<span class="chip brass">待審核</span>');
  if (r.boundUid) tags.push('<span class="chip sage">已綁定：' + escapeHtml(userName(ctx, r.boundUid) || '團員') + '</span>');
  return tags.join('');
}

function whoText(ctx, r){
  return r.proxyBy ? r.name + '・' + (userName(ctx, r.proxyBy) || '團員') + ' 代填' : r.name;
}

function barRows(rows, valueText){
  var max = rows.reduce(function(m, x){ return Math.max(m, x.count); }, 0) || 1;
  return rows.map(function(x){
    return '<div class="bar-row"><span class="lbl">' + escapeHtml(x.label) + '</span>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round(x.count / max * 100) + '%"></div></div>' +
      '<span class="n">' + valueText(x) + '</span></div>';
  }).join('');
}

function statsHtml(ctx){
  return (ctx.form.questions || []).map(function(q){
    var s = summarizeQuestion(q, ctx.responses);
    var head = s.answered + ' 人回答';
    var inner;
    if (q.type === 'items'){
      head = '共 ' + s.totalQty + ' 份・' + formatMoney(s.totalAmount);
      inner = barRows(s.rows, function(x){ return x.count + '・' + formatMoney(x.amount); });
    } else if (q.type === 'number'){
      inner = '<div class="text-ans">加總 ' + s.sum + '・平均 ' + s.avg + '</div>';
    } else if (s.texts){
      inner = s.texts.map(function(t){
        return '<div class="text-ans">' + escapeHtml(t.text) + '<span class="who">' + escapeHtml(whoText(ctx, t.response)) + '</span></div>';
      }).join('');
    } else {
      inner = s.rows.length ? barRows(s.rows, function(x){ return String(x.count); }) : '<div class="qe-hint">還沒有人回答</div>';
    }
    return '<div class="stat"><div class="stat-h"><span>' + escapeHtml(q.title || '（未命名題目）') + '</span><span class="c">' + head + '</span></div>' + inner + '</div>';
  }).join('');
}

function listHtml(ctx){
  return ctx.responses.slice().sort(function(a, b){ return tsMs(a.submittedAt) - tsMs(b.submittedAt); }).map(function(r){
    var summary = itemsSummary(ctx.form, r.answers);
    return '<button type="button" class="resp-row" data-resp="' + escapeHtml(r.id) + '">' +
      '<span class="main"><span class="nm">' + escapeHtml(r.name) + tagsHtml(ctx, r) + '</span>' +
      (summary ? '<span class="sub">' + escapeHtml(summary) + '</span>' : '') + '</span>' +
      '<span class="when">' + formatShortDateTime(r.submittedAt) + '</span></button>';
  }).join('');
}

export function renderResponses(ctx){
  ctx.bodyEl.innerHTML =
    '<div class="seg">' +
      '<button type="button" data-view="stats"' + (view === 'stats' ? ' class="active"' : '') + '>統計</button>' +
      '<button type="button" data-view="list"' + (view === 'list' ? ' class="active"' : '') + '>逐份回應</button>' +
    '</div>' +
    (ctx.responses.length ? (view === 'stats' ? statsHtml(ctx) : listHtml(ctx)) : '<div class="fm-empty">還沒有任何回應。</div>');
  ctx.bodyEl.onclick = function(e){
    var v = e.target.closest('[data-view]');
    if (v){
      view = v.getAttribute('data-view');
      renderResponses(ctx);
      return;
    }
    var row = e.target.closest('[data-resp]');
    if (row) openResponseDetail(ctx, row.getAttribute('data-resp'));
  };
}

export function openResponseDetail(ctx, responseId){
  var r = ctx.responses.filter(function(x){ return x.id === responseId; })[0];
  if (!r) return;
  var kind = responseKind(r, ctx.teamUsers);
  var editing = false;
  var meta = [];
  if (kind === 'proxy') meta.push((userName(ctx, r.proxyBy) || '團員') + ' 代填');
  if (kind === 'guest') meta.push(r.boundUid ? '訪客・已綁定到 ' + (userName(ctx, r.boundUid) || '團員') : '訪客');
  if (kind === 'member' && ctx.teamUsers[r.uid].status !== 'approved') meta.push('帳號待審核');
  meta.push('送出 ' + formatShortDateTime(r.submittedAt));
  var el = ctx.openSubSheet({ title: r.name, meta: meta.join('・'), bodyHtml: '<div id="respFields"></div>', footerHtml: ' ' });
  var fieldsEl = el.body.querySelector('#respFields');

  function paint(){
    // 團員回應的姓名來自帳號，不開放修改；訪客和代填的姓名是自己填的，可以改
    renderFields(fieldsEl, ctx.form, r.answers, {
      readOnly: !editing, showName: kind !== 'member', name: r.name, instruments: ctx.instruments
    });
    el.footer.innerHTML = editing
      ? '<button type="button" class="cta-btn cta-btn-secondary" data-act="cancel">取消</button>' +
        '<button type="button" class="cta-btn" data-act="save">儲存</button>'
      : '<button type="button" class="cta-btn cta-btn-danger" data-act="delete">刪除</button>' +
        (kind === 'guest' ? '<button type="button" class="cta-btn cta-btn-secondary" data-act="bind">' + (r.boundUid ? '變更綁定' : '綁定到團員') + '</button>' : '') +
        '<button type="button" class="cta-btn" data-act="edit">修改</button>';
  }
  paint();

  el.footer.onclick = async function(e){
    var btn = e.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    if (act === 'edit'){ editing = true; paint(); return; }
    if (act === 'cancel'){ editing = false; paint(); return; }
    if (act === 'bind'){ openBindPicker(ctx, r); return; }
    btn.disabled = true;
    try {
      if (act === 'save'){
        var data = readFields(fieldsEl, ctx.form);
        var needName = kind !== 'member';
        var errors = validateAnswers(ctx.form, data.answers, { requireName: needName, name: data.name });
        if (errors.length){ showToast(errors[0], 'error'); return; }
        await updateResponse(ctx.form.id, r.id, needName ? data.name : r.name, cleanAnswers(ctx.form, data.answers));
        ctx.closeSubSheet();
        showToast('已儲存', 'success');
      } else if (act === 'delete'){
        var payment = ctx.payments[r.id];
        var msg = payment
          ? '這份回應已有收款紀錄（實收 ' + formatMoney(paidTotal(payment)) + '）。刪除後收款紀錄會保留在「收款」分頁，方便處理退款。確定要刪除嗎？'
          : '確定要刪除「' + r.name + '」的回應嗎？此動作無法復原。';
        if (!(await showConfirm(msg, { danger: true, confirmText: '刪除' }))) return;
        await deleteResponse(ctx.form.id, r.id);
        ctx.closeSubSheet();
        showToast('已刪除', 'success');
      }
      await ctx.refresh();
    } catch (err){
      showToast('操作失敗：' + (err.code || err.message), 'error');
    } finally {
      btn.disabled = false;
    }
  };
}

// 訪客回應綁定到團員（寫入 boundUid）。匯入名單分頁的「無法匯入：沒有帳號」也用這個
export function openBindPicker(ctx, r){
  var users = Object.keys(ctx.teamUsers).map(function(uid){
    var u = ctx.teamUsers[uid];
    return { uid: uid, name: u.name, account: u.account, status: u.status };
  }).filter(function(u){
    return u.status === 'approved' || u.status === 'pending';
  }).sort(function(a, b){
    return a.name.localeCompare(b.name, 'zh-Hant');
  });
  var el = ctx.openSubSheet({
    title: '綁定到團員',
    meta: '「' + r.name + '」這份訪客回應要歸到哪個帳號？',
    bodyHtml: '<input class="field-input" id="bindSearch" placeholder="搜尋姓名或帳號"><div class="bind-list" id="bindList"></div>'
  });
  var listEl = el.body.querySelector('#bindList');

  function paintList(q){
    var hits = users.filter(function(u){
      return !q || u.name.toLowerCase().indexOf(q) !== -1 || (u.account || '').toLowerCase().indexOf(q) !== -1;
    });
    listEl.innerHTML = hits.length ? hits.map(function(u){
      return '<button type="button" class="bind-item" data-bind="' + escapeHtml(u.uid) + '">' +
        '<span>' + escapeHtml(u.name) + (u.status === 'pending' ? ' <span class="chip brass">待審核</span>' : '') + '</span>' +
        '<span class="acct">' + escapeHtml(u.account || '') + '</span></button>';
    }).join('') : '<div class="qe-hint">找不到符合的團員</div>';
  }
  paintList('');

  el.body.oninput = function(e){
    if (e.target.id === 'bindSearch') paintList(e.target.value.trim().toLowerCase());
  };
  el.body.onclick = async function(e){
    var b = e.target.closest('[data-bind]');
    if (!b) return;
    var uid = b.getAttribute('data-bind');
    var name = ctx.teamUsers[uid].name;
    if (!(await showConfirm('要把「' + r.name + '」的回應綁定到 ' + name + ' 嗎？'))) return;
    try {
      await bindResponse(ctx.form.id, r.id, uid);
      ctx.closeSubSheet();
      showToast('已綁定到 ' + name, 'success');
      await ctx.refresh();
    } catch (err){
      showToast('綁定失敗：' + (err.code || err.message), 'error');
    }
  };
}
