// 表單管理：「匯入名單」分頁（10/6 新增）：把音樂會報名結果寫進 concertRosters。
// 先比對差異讓幹部確認：新增一律匯入；樂器變更逐人勾選（預設採用報名答案）；
// 名單中未報名逐人勾選（預設保留）
import { Timestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { showToast } from './toast.js';
import { loadConcertRoster, saveRosterImport } from './forms.js';
import { diffRosterImport, applyRosterImport, escapeHtml, formatShortDateTime } from './forms-core.js';
import { openBindPicker } from './forms-admin-responses.js';

var state = null; // { formId, concertId, roster, diff, accept: {uid: bool}, remove: {uid: bool} }

export async function renderImport(ctx){
  var formId = ctx.form.id;
  var concertId = ctx.form.linkedTo.id;
  ctx.bodyEl.innerHTML = '<div class="fm-loading">比對名單中…</div>';
  var roster;
  try {
    roster = await loadConcertRoster(concertId);
  } catch (err){
    console.error('讀取音樂會名單失敗', err);
    ctx.bodyEl.innerHTML = '<div class="fm-empty">讀取音樂會名單失敗，請重新整理</div>';
    return;
  }
  // 讀取期間使用者可能切到別張表單或別的分頁
  if (!ctx.form || ctx.form.id !== formId || ctx.activeTab !== 'import') return;
  var diff = diffRosterImport(ctx.form, ctx.responses, roster.members, ctx.teamUsers);
  var accept = {};
  diff.changes.forEach(function(c){ accept[c.uid] = true; });
  state = { formId: formId, concertId: concertId, roster: roster, diff: diff, accept: accept, remove: {} };
  paint(ctx);
}

function section(title, hint, rows){
  return '<div class="diff-h"><span class="label">' + title + '</span>' + (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>' +
    '<div class="diff-list">' + rows.join('') + '</div>';
}

function paint(ctx){
  var d = state.diff;
  var html = '';
  if (ctx.form.rosterImportedAt) html += '<div class="import-note">上次匯入：' + formatShortDateTime(ctx.form.rosterImportedAt) + '</div>';
  html += '<div class="diff-sum">' +
    '<div class="add"><div class="v">+' + d.adds.length + '</div><div class="k">新增</div></div>' +
    '<div class="chg"><div class="v">' + d.changes.length + '</div><div class="k">樂器變更</div></div>' +
    '<div class="gone"><div class="v">' + d.unregistered.length + '</div><div class="k">名單中未報名</div></div>' +
  '</div>';
  if (d.adds.length){
    html += section('新增', '', d.adds.map(function(a){
      return '<div class="diff-row"><span class="nm">' + escapeHtml(a.name) + '</span><span class="inst">' + escapeHtml(a.instruments.join('、')) + '</span></div>';
    }));
  }
  if (d.changes.length){
    html += section('樂器變更', '取消勾選＝保留名單上的樂器', d.changes.map(function(c){
      return '<label class="diff-row"><input type="checkbox" class="keep" data-accept="' + escapeHtml(c.uid) + '"' + (state.accept[c.uid] ? ' checked' : '') + '>' +
        '<span class="nm">' + escapeHtml(c.name) + '</span>' +
        '<span class="inst">' + escapeHtml(c.from.join('、') || '未設定') + ' → <b>' + escapeHtml(c.to.join('、')) + '</b></span></label>';
    }));
  }
  if (d.unregistered.length){
    html += section('名單中未報名', '勾選的人會移出名單', d.unregistered.map(function(u){
      return '<label class="diff-row"><input type="checkbox" data-remove="' + escapeHtml(u.uid) + '"' + (state.remove[u.uid] ? ' checked' : '') + '>' +
        '<span class="nm">' + escapeHtml(u.name) + '<span class="why">名單原有，這次沒有可匯入的報名</span></span></label>';
    }));
  }
  if (d.blocked.length){
    html += section('暫時無法匯入（' + d.blocked.length + '）', '', d.blocked.map(function(b){
      return '<div class="diff-row"><span class="nm">' + escapeHtml(b.name) + '<span class="why">' + escapeHtml(b.reason) + '</span></span>' +
        (b.canBind ? '<button type="button" class="small-btn" data-bind-resp="' + escapeHtml(b.responseId) + '">綁定到團員</button>' : '') + '</div>';
    }));
  }
  ctx.bodyEl.innerHTML = html;
  paintFooter(ctx);

  // 勾選只更新狀態和底部按鈕，不重畫清單，捲動位置才不會跳掉
  ctx.bodyEl.onchange = function(e){
    var a = e.target.getAttribute('data-accept');
    if (a){ state.accept[a] = e.target.checked; paintFooter(ctx); return; }
    var r = e.target.getAttribute('data-remove');
    if (r){ state.remove[r] = e.target.checked; paintFooter(ctx); }
  };
  ctx.bodyEl.onclick = function(e){
    var b = e.target.closest('[data-bind-resp]');
    if (!b) return;
    var resp = ctx.responses.filter(function(x){ return x.id === b.getAttribute('data-bind-resp'); })[0];
    if (resp) openBindPicker(ctx, resp); // 綁定完成後 ctx.refresh() 會重新跑 renderImport
  };
}

function paintFooter(ctx){
  var d = state.diff;
  var changeCount = d.changes.filter(function(c){ return state.accept[c.uid]; }).length;
  var removeCount = Object.keys(state.remove).filter(function(k){ return state.remove[k]; }).length;
  var parts = [];
  if (d.adds.length) parts.push('+' + d.adds.length);
  if (changeCount) parts.push('變更 ' + changeCount);
  if (removeCount) parts.push('移除 ' + removeCount);
  ctx.footerEl.innerHTML = '<button type="button" class="cta-btn" data-import' + (parts.length ? '' : ' disabled') + '>' +
    (parts.length ? '匯入名單（' + parts.join('、') + '）' : '名單已經是最新狀態') + '</button>';
  ctx.footerEl.classList.remove('hidden');
  ctx.footerEl.onclick = function(e){
    var btn = e.target.closest('[data-import]');
    if (btn) doImport(ctx, btn);
  };
}

async function doImport(ctx, btn){
  btn.disabled = true;
  try {
    // 確認期間名單被別人改過（例如另一位幹部在活動管理手動調整）：重新比對，請幹部再確認一次
    var fresh = await loadConcertRoster(state.concertId);
    if (fresh.updatedAtMs !== state.roster.updatedAtMs){
      showToast('名單剛剛被修改過，已重新比對，請再確認一次', 'error');
      await renderImport(ctx);
      return;
    }
    var members = applyRosterImport(state.roster.members, state.diff, state.accept, state.remove);
    await saveRosterImport(ctx.form.id, state.concertId, members, !state.roster.exists, ctx.adminUid);
    showToast('已匯入名單', 'success');
    ctx.onFormChanged(Object.assign({}, ctx.form, { rosterImportedAt: Timestamp.now(), rosterImportedBy: ctx.adminUid }));
    await renderImport(ctx);
  } catch (err){
    btn.disabled = false;
    showToast('匯入失敗：' + (err.code || err.message), 'error');
  }
}
