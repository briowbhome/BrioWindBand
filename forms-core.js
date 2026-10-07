// 表單功能的純函式（10/6 新增，見 docs/superpowers/specs/2026-10-06-forms-design.md）。
// 不碰 Firestore、不碰 DOM：form.html、forms-admin*.js、index.html 共用，
// 也讓 tests/unit/forms-core.test.mjs 可以直接用 node --test 測試。

export var QUESTION_TYPE_LABELS = {
  text: '簡答', paragraph: '段落', single: '單選', multi: '複選', dropdown: '下拉選單',
  number: '數字', date: '日期', items: '品項數量', instrument: '樂器'
};
export var QUESTION_TYPE_ORDER = ['text', 'paragraph', 'single', 'multi', 'dropdown', 'number', 'date', 'items', 'instrument'];
export var TEAM_LABELS = { alumni: '校友團', school: '校內團' };

var WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function newId() {
  var s = '';
  while (s.length < 8) s += Math.random().toString(36).slice(2);
  return s.slice(0, 8);
}

// Firestore Timestamp／Date／毫秒數 → 毫秒數；沒有值回傳 null
function toMillis(ts) {
  if (ts == null) return null;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  return null;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 跟 firestore.rules 的 formIsOpen() 是同一個定義
export function isFormOpen(form, nowMs) {
  if (!form || form.status !== 'open') return false;
  var closesAt = toMillis(form.closesAt);
  return closesAt == null || nowMs < closesAt;
}

export function formStatusChip(form, nowMs) {
  if (form.archived) return { label: '已封存', tone: 'line' };
  if (form.status === 'draft') return { label: '草稿', tone: 'line' };
  if (form.status === 'closed') return { label: '已關閉', tone: 'line' };
  return isFormOpen(form, nowMs) ? { label: '開放中', tone: 'sage' } : { label: '已截止', tone: 'brass' };
}

function questionsOf(form) {
  return (form && form.questions) || [];
}

export function hasItemsQuestion(form) {
  return questionsOf(form).some(function (q) { return q.type === 'items'; });
}

export function findInstrumentQuestion(form) {
  return questionsOf(form).filter(function (q) { return q.type === 'instrument'; })[0] || null;
}

// 應付金額 = Σ（份數 × 品項目前的單價），已經被刪除的品項不計
export function computeDue(form, answers) {
  var total = 0;
  questionsOf(form).forEach(function (q) {
    if (q.type !== 'items') return;
    var picked = (answers && answers[q.id]) || {};
    (q.items || []).forEach(function (item) {
      var qty = Number(picked[item.id]) || 0;
      if (qty > 0) total += qty * (Number(item.price) || 0);
    });
  });
  return total;
}

export function itemsSummary(form, answers) {
  var parts = [];
  questionsOf(form).forEach(function (q) {
    if (q.type !== 'items') return;
    var picked = (answers && answers[q.id]) || {};
    (q.items || []).forEach(function (item) {
      var qty = Number(picked[item.id]) || 0;
      if (qty > 0) parts.push(item.name + ' ×' + qty);
    });
  });
  return parts.join('、');
}

export function paidTotal(payment) {
  if (!payment || !Array.isArray(payment.entries)) return 0;
  return payment.entries.reduce(function (sum, e) { return sum + (Number(e.amount) || 0); }, 0);
}

function isAnswered(q, v) {
  if (v == null) return false;
  if (q.type === 'number') return typeof v === 'number' && isFinite(v);
  if (q.type === 'multi' || q.type === 'instrument') return Array.isArray(v) && v.length > 0;
  if (q.type === 'items') return Object.keys(v).some(function (k) { return Number(v[k]) > 0; });
  return typeof v === 'string' && v.trim() !== '';
}

export function validateAnswers(form, answers, options) {
  var errors = [];
  options = options || {};
  if (options.requireName && !(options.name && options.name.trim())) errors.push('請填寫姓名');
  questionsOf(form).forEach(function (q) {
    if (q.required && !isAnswered(q, answers && answers[q.id])) errors.push('「' + q.title + '」為必填');
  });
  return errors;
}

// 只留下目前還存在的題目、拿掉空答案與 0 份的品項，文字去掉前後空白
export function cleanAnswers(form, answers) {
  var out = {};
  questionsOf(form).forEach(function (q) {
    var v = answers && answers[q.id];
    if (!isAnswered(q, v)) return;
    if (q.type === 'items') {
      var items = {};
      Object.keys(v).forEach(function (k) {
        var n = Number(v[k]) || 0;
        if (n > 0) items[k] = n;
      });
      out[q.id] = items;
    } else if (typeof v === 'string') {
      out[q.id] = v.trim();
    } else {
      out[q.id] = v;
    }
  });
  return out;
}

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// 表單說明用：先跳脫，再把網址轉成在新分頁開啟的連結
export function linkifyText(text) {
  return escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, function (url) {
    return '<a href="' + url + '" target="_blank" rel="noopener">' + url + '</a>';
  });
}

export function formatMoney(n) {
  var v = Math.round(Number(n) || 0);
  return (v < 0 ? '-$' : '$') + Math.abs(v).toLocaleString('en-US');
}

export function formatDeadline(ts) {
  var ms = toMillis(ts);
  if (ms == null) return '';
  var d = new Date(ms);
  return (d.getMonth() + 1) + '/' + d.getDate() + '（' + WEEKDAYS[d.getDay()] + '）' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

export function formatShortDateTime(ts) {
  var ms = toMillis(ts);
  if (ms == null) return '';
  var d = new Date(ms);
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

// <input type="datetime-local"> 的 value 格式
export function toDatetimeLocalValue(ts) {
  var ms = toMillis(ts);
  if (ms == null) return '';
  var d = new Date(ms);
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}

function optionLabel(q, id) {
  var o = (q.options || []).filter(function (x) { return x.id === id; })[0];
  return o ? o.label : '（已刪除的選項）';
}

// 把一題的答案轉成給人看的文字（回應明細、唯讀顯示用）
export function answerText(q, v) {
  if (v == null || v === '') return '';
  if (q.type === 'single' || q.type === 'dropdown') return optionLabel(q, v);
  if (q.type === 'multi') return v.map(function (id) { return optionLabel(q, id); }).join('、');
  if (q.type === 'instrument') return v.join('、');
  if (q.type === 'items') {
    return (q.items || []).filter(function (it) { return Number(v[it.id]) > 0; }).map(function (it) {
      return it.name + ' ×' + v[it.id] + '（' + formatMoney(v[it.id] * (Number(it.price) || 0)) + '）';
    }).join('、');
  }
  return String(v);
}

// 「回應」分頁的每題統計
export function summarizeQuestion(q, responses) {
  var out = { type: q.type };
  var answered = 0;
  function valueOf(r) { return r.answers ? r.answers[q.id] : null; }

  if (q.type === 'single' || q.type === 'dropdown' || q.type === 'multi') {
    var counts = {};
    (q.options || []).forEach(function (o) { counts[o.id] = 0; });
    responses.forEach(function (r) {
      var v = valueOf(r);
      var ids = Array.isArray(v) ? v : (v ? [v] : []);
      if (!ids.length) return;
      answered++;
      ids.forEach(function (id) { if (counts[id] != null) counts[id]++; });
    });
    out.rows = (q.options || []).map(function (o) { return { label: o.label, count: counts[o.id] }; });
  } else if (q.type === 'instrument' || q.type === 'date') {
    var tally = {};
    responses.forEach(function (r) {
      var v = valueOf(r);
      var keys = Array.isArray(v) ? v : (v ? [v] : []);
      if (!keys.length) return;
      answered++;
      keys.forEach(function (k) { tally[k] = (tally[k] || 0) + 1; });
    });
    var labels = Object.keys(tally);
    if (q.type === 'date') labels.sort();
    else labels.sort(function (a, b) { return tally[b] - tally[a] || a.localeCompare(b); });
    out.rows = labels.map(function (k) { return { label: k, count: tally[k] }; });
  } else if (q.type === 'items') {
    var qty = {};
    (q.items || []).forEach(function (it) { qty[it.id] = 0; });
    responses.forEach(function (r) {
      var v = valueOf(r) || {};
      var any = false;
      Object.keys(v).forEach(function (id) {
        var n = Number(v[id]) || 0;
        if (n > 0 && qty[id] != null) { qty[id] += n; any = true; }
      });
      if (any) answered++;
    });
    out.rows = (q.items || []).map(function (it) {
      return { label: it.name, count: qty[it.id], amount: qty[it.id] * (Number(it.price) || 0) };
    });
    out.totalQty = out.rows.reduce(function (s, x) { return s + x.count; }, 0);
    out.totalAmount = out.rows.reduce(function (s, x) { return s + x.amount; }, 0);
  } else if (q.type === 'number') {
    var sum = 0;
    responses.forEach(function (r) {
      var v = valueOf(r);
      if (typeof v === 'number' && isFinite(v)) { answered++; sum += v; }
    });
    out.sum = sum;
    out.avg = answered ? Math.round((sum / answered) * 100) / 100 : 0;
  } else {
    out.texts = [];
    responses.forEach(function (r) {
      var v = valueOf(r);
      if (typeof v === 'string' && v.trim()) { answered++; out.texts.push({ text: v, response: r }); }
    });
  }
  out.answered = answered;
  return out;
}

// 回應類型不存欄位，每次即時判斷（訪客升級帳號後 uid 不變，users 文件出現就自然變成團員回應）
export function responseKind(resp, knownUserUids) {
  if (resp.proxyBy) return 'proxy';
  if (resp.uid && knownUserUids && knownUserUids[resp.uid]) return 'member';
  return 'guest';
}

// ---------- 收款（每份回應各自一本帳，畫面依代填人分組）----------
export function balanceStatus(due, paid) {
  var balance = due - paid;
  if (due === 0 && paid === 0) return { balance: 0, tone: 'none', text: '無需付款' };
  if (balance > 0) return { balance: balance, tone: 'owe', text: (paid === 0 ? '未付 ' : '還欠 ') + formatMoney(balance) };
  if (balance < 0) return { balance: balance, tone: 'over', text: '多收 ' + formatMoney(-balance) };
  return { balance: 0, tone: 'paid', text: '已付清' };
}

// ownerNames：{uid: 姓名}，代填人自己沒有填回應時，用來顯示這一組的名字
export function buildPaymentGroups(form, responses, payments, ownerNames) {
  payments = payments || {};
  var groups = {};
  var order = [];
  function group(key, title) {
    if (!groups[key]) {
      groups[key] = { key: key, title: title, deleted: false, rows: [] };
      order.push(key);
    }
    return groups[key];
  }
  function row(r, isProxy) {
    return {
      responseId: r.id, name: r.name, isProxy: isProxy, deleted: false,
      due: computeDue(form, r.answers), paid: paidTotal(payments[r.id]), summary: itemsSummary(form, r.answers)
    };
  }

  var known = {};
  responses.forEach(function (r) { known[r.id] = true; });
  responses.filter(function (r) { return !r.proxyBy; }).forEach(function (r) {
    group('u:' + r.uid, r.name).rows.push(row(r, false));
  });
  responses.filter(function (r) { return r.proxyBy; })
    .sort(function (a, b) { return (toMillis(a.submittedAt) || 0) - (toMillis(b.submittedAt) || 0); })
    .forEach(function (r) {
      group('u:' + r.proxyBy, (ownerNames && ownerNames[r.proxyBy]) || '（代填人）').rows.push(row(r, true));
    });
  // 回應已經被刪除、但還有收款紀錄：單獨一組，提醒幹部處理退款
  Object.keys(payments).forEach(function (id) {
    if (known[id]) return;
    var name = payments[id].name || '（已刪除的回應）';
    var g = group('x:' + id, name);
    g.deleted = true;
    g.rows.push({ responseId: id, name: name, isProxy: false, deleted: true, due: 0, paid: paidTotal(payments[id]), summary: '' });
  });

  return order.map(function (key) {
    var g = groups[key];
    g.rows.forEach(function (r) { r.status = balanceStatus(r.due, r.paid); });
    g.due = g.rows.reduce(function (s, r) { return s + r.due; }, 0);
    g.paid = g.rows.reduce(function (s, r) { return s + r.paid; }, 0);
    g.status = balanceStatus(g.due, g.paid);
    g.unsettled = g.rows.some(function (r) { return r.status.balance !== 0; });
    return g;
  }).sort(function (a, b) {
    return (a.deleted - b.deleted) || a.title.localeCompare(b.title, 'zh-Hant');
  });
}

export function paymentTotals(groups) {
  var t = { due: 0, paid: 0, outstanding: 0, unsettledCount: 0 };
  groups.forEach(function (g) {
    t.due += g.due;
    t.paid += g.paid;
    g.rows.forEach(function (r) { if (r.status.balance > 0) t.outstanding += r.status.balance; });
    if (g.unsettled) t.unsettledCount++;
  });
  return t;
}

// 整組輸入一個金額時的分配：依序把每份補到付清，分完還有剩就全部記在最後一份（顯示多收）
export function allocateAmount(rows, amount) {
  var remaining = amount;
  var out = rows.map(function (r) {
    var owe = Math.max(r.due - r.paid, 0);
    var give = Math.min(owe, remaining);
    remaining -= give;
    return give;
  });
  if (remaining > 0 && out.length) out[out.length - 1] += remaining;
  return out;
}

// ---------- 音樂會名單匯入 ----------
export function sameInstrumentSet(a, b) {
  var x = (a || []).slice().sort();
  var y = (b || []).slice().sort();
  return x.length === y.length && x.every(function (v, i) { return v === y[i]; });
}

// teamUsers：{uid: {name, account, status}}，這一團 teamIds 包含的所有帳號（含待審核）
export function diffRosterImport(form, responses, rosterMembers, teamUsers) {
  var q = findInstrumentQuestion(form);
  var picked = {};
  var blocked = [];
  // 自己的回應排在被綁定的訪客回應前面：同一個人兩份都有時，以自己填的為準
  var sorted = responses.slice().sort(function (a, b) { return (a.boundUid ? 1 : 0) - (b.boundUid ? 1 : 0); });
  sorted.forEach(function (r) {
    function block(reason, canBind) { blocked.push({ responseId: r.id, name: r.name, reason: reason, canBind: !!canBind }); }
    if (r.proxyBy) { block('代填回應不匯入'); return; }
    var target = r.boundUid || r.uid;
    var user = target ? teamUsers[target] : null;
    if (!user) { block('沒有帳號', !r.boundUid); return; }
    if (user.status !== 'approved') { block('帳號待審核，核准後再匯入一次'); return; }
    var answer = q && r.answers ? r.answers[q.id] : null;
    var instruments = Array.isArray(answer) ? answer.filter(Boolean) : [];
    if (!instruments.length) { block('沒有回答樂器'); return; }
    if (picked[target]) { block('重複'); return; }
    picked[target] = { uid: target, name: user.name, account: user.account || '', instruments: instruments, responseId: r.id };
  });

  var inRoster = {};
  (rosterMembers || []).forEach(function (m) { inRoster[m.uid] = m; });
  var adds = [];
  var changes = [];
  Object.keys(picked).forEach(function (uid) {
    var p = picked[uid];
    var m = inRoster[uid];
    if (!m) adds.push(p);
    else if (!sameInstrumentSet(m.instruments, p.instruments)) changes.push({ uid: uid, name: p.name, from: m.instruments || [], to: p.instruments });
  });
  var unregistered = (rosterMembers || []).filter(function (m) { return !picked[m.uid]; })
    .map(function (m) { return { uid: m.uid, name: m.name || m.uid }; });
  return { adds: adds, changes: changes, unregistered: unregistered, blocked: blocked };
}

export function applyRosterImport(rosterMembers, diff, acceptChange, removeUid) {
  var changeByUid = {};
  diff.changes.forEach(function (c) { changeByUid[c.uid] = c; });
  var next = [];
  (rosterMembers || []).forEach(function (m) {
    if (removeUid[m.uid]) return;
    var c = changeByUid[m.uid];
    next.push(c && acceptChange[m.uid] ? Object.assign({}, m, { instruments: c.to.slice() }) : m);
  });
  diff.adds.forEach(function (a) {
    next.push({ uid: a.uid, instruments: a.instruments.slice(), name: a.name, account: a.account });
  });
  return next;
}
