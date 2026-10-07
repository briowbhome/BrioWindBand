// 表單管理：「設定與題目」分頁（10/6 新增）。
// 編輯的是 draft 副本，按「儲存」才寫回 Firestore；狀態按鈕（發佈、關閉…）會順便把尚未儲存的修改一起存
import { Timestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { showToast } from './toast.js';
import { showConfirm } from './dialog.js';
import { updateForm } from './forms.js';
import { QUESTION_TYPE_LABELS, QUESTION_TYPE_ORDER, newId, escapeHtml, toDatetimeLocalValue } from './forms-core.js';

var draft = null;          // 編輯中的副本（closesAt 存成 datetime-local 字串，linkedTo 存成 'event:ID' 字串）
var expandedId = null;     // 目前展開編輯的題目
var showTypePicker = false;

var CHOICE_TYPES = ['single', 'multi', 'dropdown'];
var DAY = 24 * 3600 * 1000;

var SVG = {
  up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 18V6M7 11l5-5 5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 6v12M7 13l5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  plus: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  link: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
};

var STATUS_DONE = { publish: '已發佈', close: '已關閉表單', reopen: '已重新開放', archive: '已封存', unarchive: '已還原' };

export function resetEditor(){
  draft = null;
  expandedId = null;
  showTypePicker = false;
}

export function renderEditor(ctx){
  if (!draft || draft.formId !== ctx.form.id){
    draft = makeDraft(ctx.form);
    expandedId = null;
    showTypePicker = false;
    ctx.editorDirty = false;
  }
  paint(ctx);
}

function makeDraft(form){
  return {
    formId: form.id,
    title: form.title || '',
    description: form.description || '',
    linkValue: form.linkedTo ? form.linkedTo.type + ':' + form.linkedTo.id : '',
    closesAtValue: toDatetimeLocalValue(form.closesAt),
    allowGuest: !!form.allowGuest,
    questions: JSON.parse(JSON.stringify(form.questions || []))
  };
}

function normalizeQuestion(q){
  var out = { id: q.id, type: q.type, title: (q.title || '').trim(), description: (q.description || '').trim(), required: !!q.required };
  if (CHOICE_TYPES.indexOf(q.type) !== -1){
    out.options = (q.options || []).filter(function(o){ return o.label.trim(); })
      .map(function(o){ return { id: o.id, label: o.label.trim() }; });
  }
  if (q.type === 'items'){
    out.items = (q.items || []).filter(function(it){ return it.name.trim(); })
      .map(function(it){ return { id: it.id, name: it.name.trim(), price: Math.max(0, Math.round(Number(it.price) || 0)) }; });
  }
  if (q.type === 'instrument') out.multiple = !!q.multiple;
  return out;
}

function draftToPatch(d){
  var linkedTo = null;
  if (d.linkValue){
    var i = d.linkValue.indexOf(':');
    linkedTo = { type: d.linkValue.slice(0, i), id: d.linkValue.slice(i + 1) };
  }
  return {
    title: d.title.trim() || '未命名表單',
    description: d.description,
    linkedTo: linkedTo,
    closesAt: d.closesAtValue ? Timestamp.fromDate(new Date(d.closesAtValue)) : null,
    allowGuest: d.allowGuest,
    questions: d.questions.map(normalizeQuestion)
  };
}

function validateDraft(d){
  for (var i = 0; i < d.questions.length; i++){
    var q = normalizeQuestion(d.questions[i]);
    if (!q.title) return '第 ' + (i + 1) + ' 題還沒有填題目';
    if (CHOICE_TYPES.indexOf(q.type) !== -1 && !q.options.length) return '「' + q.title + '」至少要有一個選項';
    if (q.type === 'items' && !q.items.length) return '「' + q.title + '」至少要有一個品項';
  }
  return null;
}

function newQuestion(type){
  var q = { id: newId(), type: type, title: '', description: '', required: false };
  if (CHOICE_TYPES.indexOf(type) !== -1) q.options = [{ id: newId(), label: '選項 1' }];
  if (type === 'items') q.items = [{ id: newId(), name: '', price: 0 }];
  if (type === 'instrument') q.multiple = false;
  return q;
}

// 單價有變、或品項被刪掉，都會讓已收款的差額變動
function pricesChanged(oldQuestions, newQuestions){
  var now = {};
  newQuestions.forEach(function(q){ (q.items || []).forEach(function(it){ now[it.id] = it.price; }); });
  return (oldQuestions || []).some(function(q){
    return (q.items || []).some(function(it){ return now[it.id] !== it.price; });
  });
}

function shortDate(ms){
  var d = new Date(ms);
  return (d.getMonth() + 1) + '/' + d.getDate();
}

function linkOptionsHtml(ctx){
  var current = draft.linkValue;
  var now = Date.now();
  function opt(type, x){
    var v = type + ':' + x.id;
    return '<option value="' + escapeHtml(v) + '"' + (v === current ? ' selected' : '') + '>' +
      escapeHtml(x.title) + (x.dateMs ? '（' + shortDate(x.dateMs) + '）' : '') + '</option>';
  }
  // 只列近期的活動和音樂會，避免選單太長；已經連結的那一個不管多舊都要列出來
  var events = ctx.linkTargets.events.filter(function(x){ return x.dateMs >= now - 90 * DAY || 'event:' + x.id === current; });
  var concerts = ctx.linkTargets.concerts.filter(function(x){ return x.dateMs >= now - 180 * DAY || 'concert:' + x.id === current; });
  return '<option value="">不連結</option>' +
    (events.length ? '<optgroup label="活動">' + events.map(function(x){ return opt('event', x); }).join('') + '</optgroup>' : '') +
    (concerts.length ? '<optgroup label="音樂會">' + concerts.map(function(x){ return opt('concert', x); }).join('') + '</optgroup>' : '');
}

function summaryText(q){
  var prefix = q.required ? '必填・' : '選填・';
  if (CHOICE_TYPES.indexOf(q.type) !== -1) return prefix + ((q.options || []).map(function(o){ return o.label; }).join('、') || '還沒有選項');
  if (q.type === 'items') return prefix + ((q.items || []).map(function(it){ return (it.name || '未命名') + ' $' + (Number(it.price) || 0); }).join('、') || '還沒有品項');
  if (q.type === 'instrument') return prefix + (q.multiple ? '可複選' : '單選') + '，選項使用系統樂器清單';
  return prefix + QUESTION_TYPE_LABELS[q.type];
}

function questionHtml(q, idx, total, ctx){
  var open = expandedId === q.id;
  var html = '<div class="qe' + (open ? ' open' : '') + '" data-qid="' + escapeHtml(q.id) + '">' +
    '<div class="qe-top" data-toggle-q>' +
      '<span class="qe-type">' + QUESTION_TYPE_LABELS[q.type] + '</span>' +
      '<span class="qe-title">' + escapeHtml(q.title || '（還沒有題目）') + '</span>' +
      '<span class="qe-ctl">' +
        '<button type="button" data-move="-1" aria-label="上移"' + (idx === 0 ? ' disabled' : '') + '>' + SVG.up + '</button>' +
        '<button type="button" data-move="1" aria-label="下移"' + (idx === total - 1 ? ' disabled' : '') + '>' + SVG.down + '</button>' +
        '<button type="button" data-del-q aria-label="刪除這題">' + SVG.trash + '</button>' +
      '</span>' +
    '</div>';
  if (!open) return html + '<div class="qe-summary">' + escapeHtml(summaryText(q)) + '</div></div>';

  html += '<div class="qe-body">' +
    '<input class="field-input" data-qk="title" placeholder="題目" maxlength="100" value="' + escapeHtml(q.title) + '">' +
    '<input class="field-input" data-qk="description" placeholder="說明（選填）" maxlength="200" value="' + escapeHtml(q.description) + '">' +
    '<label class="qe-check"><input type="checkbox" data-qk="required"' + (q.required ? ' checked' : '') + '>必填</label>';
  if (CHOICE_TYPES.indexOf(q.type) !== -1){
    html += (q.options || []).map(function(o){
      return '<div class="qe-opt"><input class="field-input" data-opt="' + escapeHtml(o.id) + '" maxlength="60" value="' + escapeHtml(o.label) + '">' +
        '<button type="button" class="qe-x" data-del-opt="' + escapeHtml(o.id) + '" aria-label="刪除選項">' + SVG.x + '</button></div>';
    }).join('') + '<button type="button" class="small-btn" data-add-opt>' + SVG.plus + '新增選項</button>';
  }
  if (q.type === 'items'){
    html += (q.items || []).map(function(it){
      return '<div class="qe-opt">' +
        '<input class="field-input" data-item-name="' + escapeHtml(it.id) + '" placeholder="品項名稱" maxlength="40" value="' + escapeHtml(it.name) + '">' +
        '<input class="field-input price" type="number" inputmode="numeric" min="0" step="1" data-item-price="' + escapeHtml(it.id) + '" placeholder="單價" value="' + (Number(it.price) || 0) + '">' +
        '<button type="button" class="qe-x" data-del-item="' + escapeHtml(it.id) + '" aria-label="刪除品項">' + SVG.x + '</button></div>';
    }).join('') + '<button type="button" class="small-btn" data-add-item>' + SVG.plus + '新增品項</button>';
    var payCount = Object.keys(ctx.payments).length;
    if (payCount) html += '<div class="qe-note">已有 ' + payCount + ' 筆收款紀錄，修改單價後差額會變動。</div>';
    else if (ctx.responses.length) html += '<div class="qe-note">已有 ' + ctx.responses.length + ' 份回應，修改品項會影響已填的答案。</div>';
  }
  if (q.type === 'instrument'){
    html += '<label class="qe-check"><input type="checkbox" data-qk="multiple"' + (q.multiple ? ' checked' : '') + '>可以選多個樂器</label>' +
      '<div class="qe-hint">選項自動使用系統的樂器清單。表單連結到音樂會時，這題的答案會用在「匯入名單」。</div>';
  }
  return html + '</div></div>';
}

function statusButtonsHtml(ctx){
  var f = ctx.form;
  var b = [];
  function btn(action, label, tone){
    return '<button type="button" class="small-btn' + (tone ? ' ' + tone : '') + '" data-status="' + action + '">' + label + '</button>';
  }
  if (f.archived) b.push(btn('unarchive', '還原', 'dark'));
  else if (f.status === 'draft'){ b.push(btn('publish', '發佈', 'primary')); b.push(btn('archive', '封存')); }
  else if (f.status === 'open') b.push(btn('close', '關閉表單'));
  else if (f.status === 'closed'){ b.push(btn('reopen', '重新開放', 'primary')); b.push(btn('archive', '封存')); }
  if (f.status !== 'draft'){
    b.push('<button type="button" class="small-btn" data-copy-link>' + SVG.link + (f.allowGuest ? '複製分享連結' : '複製連結') + '</button>');
  }
  return '<div class="status-row">' + b.join('') + '</div>';
}

function paint(ctx){
  var qs = draft.questions;
  var hasInstrument = qs.some(function(q){ return q.type === 'instrument'; });
  ctx.bodyEl.innerHTML =
    '<div class="field"><span class="label">標題</span><input class="field-input" data-k="title" maxlength="60" value="' + escapeHtml(draft.title) + '"></div>' +
    '<div class="field"><span class="label">說明</span><textarea class="field-input" data-k="description" maxlength="2000" placeholder="截止時間、取餐地點、匯款方式等，網址會自動變成連結">' + escapeHtml(draft.description) + '</textarea></div>' +
    '<div class="field"><span class="label">連結活動或音樂會</span><select class="field-input" data-k="linkValue">' + linkOptionsHtml(ctx) + '</select></div>' +
    '<div class="field"><span class="label">截止時間（選填）</span><div class="field-row">' +
      '<input class="field-input" type="datetime-local" data-k="closesAtValue" value="' + escapeHtml(draft.closesAtValue) + '">' +
      (draft.closesAtValue ? '<button type="button" class="small-btn" data-clear-closes>清除</button>' : '') +
    '</div></div>' +
    '<label class="switch-row"><span class="txt">允許未登入填寫<span class="hint">開啟後，沒有帳號的人也能用分享連結填寫，例如音樂會新成員報名。訂餐這類內部表單建議維持關閉。</span></span>' +
      '<input type="checkbox" data-k="allowGuest"' + (draft.allowGuest ? ' checked' : '') + '></label>' +
    '<div class="label">題目（' + qs.length + '）</div>' +
    qs.map(function(q, i){ return questionHtml(q, i, qs.length, ctx); }).join('') +
    '<button type="button" class="add-q" data-add-q>' + SVG.plus + '新增題目</button>' +
    (showTypePicker ? '<div class="type-grid">' + QUESTION_TYPE_ORDER.map(function(t){
      var special = t === 'items' || t === 'instrument';
      var disabled = t === 'instrument' && hasInstrument;
      return '<button type="button" data-new-type="' + t + '"' + (special ? ' class="special"' : '') + (disabled ? ' disabled' : '') + '>' + QUESTION_TYPE_LABELS[t] + '</button>';
    }).join('') + '</div>' : '') +
    statusButtonsHtml(ctx);

  ctx.footerEl.innerHTML = '<button type="button" class="cta-btn" data-save' + (ctx.editorDirty ? '' : ' disabled') + '>儲存</button>';
  ctx.footerEl.classList.remove('hidden');
  ctx.footerEl.onclick = function(e){
    if (!e.target.closest('[data-save]')) return;
    save(ctx).then(function(ok){ if (ok) showToast('已儲存', 'success'); });
  };
  ctx.bodyEl.oninput = function(e){ onInput(ctx, e); };
  ctx.bodyEl.onchange = function(e){ onInput(ctx, e); };
  ctx.bodyEl.onclick = function(e){ onClick(ctx, e); };
}

function markDirty(ctx){
  ctx.editorDirty = true;
  var b = ctx.footerEl.querySelector('[data-save]');
  if (b) b.disabled = false;
}

function findQuestion(el){
  var box = el.closest('[data-qid]');
  if (!box) return null;
  var id = box.getAttribute('data-qid');
  return draft.questions.filter(function(q){ return q.id === id; })[0] || null;
}

function onInput(ctx, e){
  var t = e.target;
  var k = t.getAttribute('data-k');
  if (k){
    draft[k] = t.type === 'checkbox' ? t.checked : t.value;
    markDirty(ctx);
    if (k === 'closesAtValue' && e.type === 'change') paint(ctx); // 顯示或隱藏「清除」按鈕
    return;
  }
  var q = findQuestion(t);
  if (!q) return;
  var qk = t.getAttribute('data-qk');
  if (qk){
    q[qk] = t.type === 'checkbox' ? t.checked : t.value;
    if (qk === 'title') t.closest('[data-qid]').querySelector('.qe-title').textContent = t.value || '（還沒有題目）';
    markDirty(ctx);
    return;
  }
  var optId = t.getAttribute('data-opt');
  if (optId){
    q.options.forEach(function(o){ if (o.id === optId) o.label = t.value; });
    markDirty(ctx);
    return;
  }
  var nameId = t.getAttribute('data-item-name');
  if (nameId){
    q.items.forEach(function(it){ if (it.id === nameId) it.name = t.value; });
    markDirty(ctx);
    return;
  }
  var priceId = t.getAttribute('data-item-price');
  if (priceId){
    q.items.forEach(function(it){ if (it.id === priceId) it.price = t.value; });
    markDirty(ctx);
  }
}

async function onClick(ctx, e){
  var t = e.target;
  var q = findQuestion(t);
  var moveBtn = t.closest('[data-move]');
  if (moveBtn && q){
    var i = draft.questions.indexOf(q);
    var j = i + parseInt(moveBtn.getAttribute('data-move'), 10);
    if (j < 0 || j >= draft.questions.length) return;
    draft.questions[i] = draft.questions[j];
    draft.questions[j] = q;
    markDirty(ctx);
    paint(ctx);
    return;
  }
  if (t.closest('[data-del-q]') && q){
    var label = q.title || '這題';
    var msg = ctx.responses.length
      ? '已經有 ' + ctx.responses.length + ' 份回應，刪除「' + label + '」後，舊答案就不會再顯示。確定要刪除嗎？'
      : '確定要刪除「' + label + '」嗎？';
    if (!(await showConfirm(msg, { danger: true, confirmText: '刪除' }))) return;
    draft.questions.splice(draft.questions.indexOf(q), 1);
    markDirty(ctx);
    paint(ctx);
    return;
  }
  if (t.closest('[data-toggle-q]') && q){
    expandedId = expandedId === q.id ? null : q.id;
    paint(ctx);
    return;
  }
  if (t.closest('[data-add-opt]') && q){
    q.options.push({ id: newId(), label: '選項 ' + (q.options.length + 1) });
    markDirty(ctx);
    paint(ctx);
    return;
  }
  var delOpt = t.closest('[data-del-opt]');
  if (delOpt && q){
    var oid = delOpt.getAttribute('data-del-opt');
    q.options = q.options.filter(function(o){ return o.id !== oid; });
    markDirty(ctx);
    paint(ctx);
    return;
  }
  if (t.closest('[data-add-item]') && q){
    q.items.push({ id: newId(), name: '', price: 0 });
    markDirty(ctx);
    paint(ctx);
    return;
  }
  var delItem = t.closest('[data-del-item]');
  if (delItem && q){
    var iid = delItem.getAttribute('data-del-item');
    q.items = q.items.filter(function(it){ return it.id !== iid; });
    markDirty(ctx);
    paint(ctx);
    return;
  }
  if (t.closest('[data-add-q]')){
    showTypePicker = !showTypePicker;
    paint(ctx);
    return;
  }
  var typeBtn = t.closest('[data-new-type]');
  if (typeBtn){
    var nq = newQuestion(typeBtn.getAttribute('data-new-type'));
    draft.questions.push(nq);
    expandedId = nq.id;
    showTypePicker = false;
    markDirty(ctx);
    paint(ctx);
    return;
  }
  if (t.closest('[data-clear-closes]')){
    draft.closesAtValue = '';
    markDirty(ctx);
    paint(ctx);
    return;
  }
  var statusBtn = t.closest('[data-status]');
  if (statusBtn){
    changeStatus(ctx, statusBtn.getAttribute('data-status'));
    return;
  }
  if (t.closest('[data-copy-link]')) copyLink(ctx);
}

async function save(ctx, extra){
  var err = validateDraft(draft);
  if (err){
    showToast(err, 'error');
    return false;
  }
  var patch = Object.assign(draftToPatch(draft), extra || {});
  var payCount = Object.keys(ctx.payments).length;
  if (payCount && pricesChanged(ctx.form.questions, patch.questions)){
    var ok = await showConfirm('已有 ' + payCount + ' 筆收款紀錄，修改單價或刪除品項後，差額會跟著變動。確定要儲存嗎？');
    if (!ok) return false;
  }
  try {
    await updateForm(ctx.form.id, patch);
  } catch (e){
    showToast('儲存失敗：' + (e.code || e.message), 'error');
    return false;
  }
  var updated = Object.assign({}, ctx.form, patch);
  draft = makeDraft(updated);
  ctx.editorDirty = false;
  ctx.onFormChanged(updated);
  paint(ctx);
  return true;
}

async function changeStatus(ctx, action){
  var extra = {};
  if (action === 'publish' || action === 'reopen'){
    if (!draft.questions.length){
      showToast('請先新增至少一題', 'error');
      return;
    }
    if (draft.closesAtValue && new Date(draft.closesAtValue).getTime() <= Date.now()){
      showToast('截止時間已經過了，請先延後或清除截止時間', 'error');
      return;
    }
    extra.status = 'open';
  }
  if (action === 'close'){
    if (!(await showConfirm('關閉後，團員就不能再填寫或修改回應。確定要關閉嗎？', { confirmText: '關閉' }))) return;
    extra.status = 'closed';
  }
  if (action === 'archive') extra.archived = true;
  if (action === 'unarchive') extra.archived = false;
  if (await save(ctx, extra)) showToast(STATUS_DONE[action], 'success');
}

function copyLink(ctx){
  var url = location.href.replace(/forms-admin\.html.*$/, 'form.html?id=' + encodeURIComponent(ctx.form.id));
  var done = ctx.form.allowGuest ? '已複製分享連結' : '已複製連結（團員登入後填寫）';
  if (navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(url).then(function(){ showToast(done, 'success'); }, function(){ showToast('無法自動複製，連結：' + url); });
  } else {
    showToast('無法自動複製，連結：' + url);
  }
}
