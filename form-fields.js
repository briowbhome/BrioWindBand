// 表單題目的輸入元件（10/6 新增）。form.html 的填寫畫面、forms-admin 的「修改回應」共用同一套，
// 幹部改到的欄位跟團員看到的長得一樣。樣式由這個模組自己注入（比照 toast.js 的做法），
// 頁面不需要另外寫 CSS
import { escapeHtml, answerText } from './forms-core.js';

var STYLE_ID = 'form-fields-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.ff-q{background:var(--paper-raised);border:1px solid var(--line);border-radius:var(--radius-md);padding:13px 14px;margin-bottom:10px;}' +
    '.ff-title{font-size:13.5px;font-weight:700;color:var(--ink);}' +
    '.ff-req{color:var(--burgundy);margin-left:2px;}' +
    '.ff-desc{font-size:11.5px;color:var(--ink-soft);margin-top:2px;line-height:1.5;}' +
    '.ff-body{margin-top:10px;display:flex;flex-direction:column;gap:8px;}' +
    '.ff-input{width:100%;border:1px solid var(--line);background:var(--paper);border-radius:var(--radius-sm);' +
      'padding:9px 11px;font-size:14px;color:var(--ink);font-family:inherit;}' +
    '.ff-textarea{min-height:80px;resize:vertical;line-height:1.6;}' +
    '.ff-choice{display:flex;align-items:center;gap:9px;font-size:13.5px;cursor:pointer;}' +
    '.ff-choice input{width:18px;height:18px;margin:0;accent-color:var(--brass);flex:none;}' +
    '.ff-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}' +
    '.ff-item{display:flex;align-items:center;gap:10px;font-size:13.5px;}' +
    '.ff-item-name{flex:1;min-width:0;}' +
    '.ff-item-price{font-family:"Roboto Mono",monospace;font-size:12px;color:var(--ink-soft);}' +
    '.ff-stepper{display:flex;align-items:center;border:1px solid var(--line);border-radius:999px;background:var(--paper);flex:none;}' +
    '.ff-stepper button{width:32px;height:30px;border:none;background:none;color:var(--ink);cursor:pointer;' +
      'display:flex;align-items:center;justify-content:center;padding:0;}' +
    '.ff-qty{min-width:20px;text-align:center;font-family:"Roboto Mono",monospace;font-size:13px;font-weight:700;}' +
    '.ff-ro{font-size:13.5px;color:var(--ink);line-height:1.6;white-space:pre-wrap;word-break:break-word;}' +
    '.ff-empty{color:var(--ink-soft);}';
  document.head.appendChild(style);
}

var MINUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
var PLUS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

var seq = 0; // 同一頁有多個容器時（填寫頁＋代填 sheet），讓 radio 的 name 不會互相衝突

function choiceHtml(type, name, value, label, checked) {
  return '<label class="ff-choice"><input type="' + type + '" name="' + name + '" value="' + escapeHtml(value) + '"' +
    (checked ? ' checked' : '') + '><span>' + escapeHtml(label) + '</span></label>';
}

function inputHtml(q, v, instruments, prefix) {
  var name = prefix + q.id;
  if (q.type === 'text') return '<input type="text" class="ff-input" data-ff maxlength="200" value="' + escapeHtml(v || '') + '">';
  if (q.type === 'paragraph') return '<textarea class="ff-input ff-textarea" data-ff maxlength="2000">' + escapeHtml(v || '') + '</textarea>';
  if (q.type === 'number') return '<input type="number" inputmode="decimal" class="ff-input" data-ff value="' + (typeof v === 'number' ? v : '') + '">';
  if (q.type === 'date') return '<input type="date" class="ff-input" data-ff value="' + escapeHtml(v || '') + '">';
  if (q.type === 'single') {
    return (q.options || []).map(function (o) { return choiceHtml('radio', name, o.id, o.label, v === o.id); }).join('');
  }
  if (q.type === 'multi') {
    var picked = Array.isArray(v) ? v : [];
    return (q.options || []).map(function (o) { return choiceHtml('checkbox', name, o.id, o.label, picked.indexOf(o.id) !== -1); }).join('');
  }
  if (q.type === 'dropdown') {
    return '<select class="ff-input" data-ff><option value="">請選擇</option>' + (q.options || []).map(function (o) {
      return '<option value="' + escapeHtml(o.id) + '"' + (v === o.id ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
    }).join('') + '</select>';
  }
  if (q.type === 'items') {
    var qty = v || {};
    return (q.items || []).map(function (it) {
      return '<div class="ff-item" data-item="' + escapeHtml(it.id) + '">' +
        '<span class="ff-item-name">' + escapeHtml(it.name) + '</span>' +
        '<span class="ff-item-price">$' + (Number(it.price) || 0) + '</span>' +
        '<span class="ff-stepper"><button type="button" data-step="-1" aria-label="減少">' + MINUS + '</button>' +
        '<span class="ff-qty">' + (Number(qty[it.id]) || 0) + '</span>' +
        '<button type="button" data-step="1" aria-label="增加">' + PLUS + '</button></span></div>';
    }).join('');
  }
  if (q.type === 'instrument') {
    var chosen = Array.isArray(v) ? v : [];
    // 已經選過、但後來從系統清單拿掉的樂器也要列出來，不然一儲存就被洗掉
    var names = instruments.slice();
    chosen.forEach(function (n) { if (names.indexOf(n) === -1) names.push(n); });
    if (q.multiple) {
      return '<div class="ff-grid">' + names.map(function (n) { return choiceHtml('checkbox', name, n, n, chosen.indexOf(n) !== -1); }).join('') + '</div>';
    }
    return '<select class="ff-input" data-ff-instrument><option value="">請選擇</option>' + names.map(function (n) {
      return '<option value="' + escapeHtml(n) + '"' + (chosen[0] === n ? ' selected' : '') + '>' + escapeHtml(n) + '</option>';
    }).join('') + '</select>';
  }
  return '';
}

// options：readOnly、showName（多一題必填的「姓名」）、name、nameHint、instruments（樂器名稱陣列）
export function renderFields(container, form, answers, options) {
  ensureStyle();
  options = options || {};
  answers = answers || {};
  var prefix = 'ff' + (++seq) + '_';
  var html = '';
  if (options.showName) {
    html += '<div class="ff-q"><div class="ff-title">姓名<span class="ff-req">*</span></div>' +
      (options.nameHint && !options.readOnly ? '<div class="ff-desc">' + escapeHtml(options.nameHint) + '</div>' : '') +
      '<div class="ff-body">' + (options.readOnly
        ? '<div class="ff-ro">' + escapeHtml(options.name || '') + '</div>'
        : '<input type="text" class="ff-input" data-ff-name maxlength="50" value="' + escapeHtml(options.name || '') + '">') +
      '</div></div>';
  }
  ((form && form.questions) || []).forEach(function (q) {
    var v = answers[q.id];
    var body = options.readOnly
      ? '<div class="ff-ro">' + (escapeHtml(answerText(q, v)) || '<span class="ff-empty">未填寫</span>') + '</div>'
      : inputHtml(q, v, options.instruments || [], prefix);
    html += '<div class="ff-q" data-qid="' + escapeHtml(q.id) + '">' +
      '<div class="ff-title">' + escapeHtml(q.title || '（未命名題目）') + (q.required && !options.readOnly ? '<span class="ff-req">*</span>' : '') + '</div>' +
      (q.description ? '<div class="ff-desc">' + escapeHtml(q.description) + '</div>' : '') +
      '<div class="ff-body">' + body + '</div></div>';
  });
  container.innerHTML = html;

  // 事件只綁一次（同一個容器會被重畫很多次）
  if (!container.dataset.ffBound) {
    container.dataset.ffBound = '1';
    container.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-step]');
      if (!btn || !container.contains(btn)) return;
      var qtyEl = btn.parentNode.querySelector('.ff-qty');
      var n = (parseInt(qtyEl.textContent, 10) || 0) + parseInt(btn.getAttribute('data-step'), 10);
      qtyEl.textContent = Math.max(0, Math.min(99, n));
      notify();
    });
    container.addEventListener('input', notify);
    container.addEventListener('change', notify);
  }
  function notify() {
    container.dispatchEvent(new CustomEvent('ff-change'));
  }
}

export function readFields(container, form) {
  var out = { name: '', answers: {} };
  var nameEl = container.querySelector('[data-ff-name]');
  if (nameEl) out.name = nameEl.value.trim();
  ((form && form.questions) || []).forEach(function (q) {
    var box = container.querySelector('[data-qid="' + CSS.escape(q.id) + '"]');
    if (!box) return;
    var v = null;
    if (q.type === 'text' || q.type === 'paragraph' || q.type === 'date' || q.type === 'dropdown') {
      var el = box.querySelector('[data-ff]');
      v = el && el.value !== '' ? el.value : null;
    } else if (q.type === 'number') {
      var numEl = box.querySelector('[data-ff]');
      v = numEl && numEl.value !== '' ? Number(numEl.value) : null;
    } else if (q.type === 'single') {
      var radio = box.querySelector('input[type=radio]:checked');
      v = radio ? radio.value : null;
    } else if (q.type === 'multi' || (q.type === 'instrument' && q.multiple)) {
      v = Array.prototype.map.call(box.querySelectorAll('input[type=checkbox]:checked'), function (x) { return x.value; });
    } else if (q.type === 'instrument') {
      var sel = box.querySelector('[data-ff-instrument]');
      v = sel && sel.value ? [sel.value] : [];
    } else if (q.type === 'items') {
      v = {};
      box.querySelectorAll('[data-item]').forEach(function (row) {
        var n = parseInt(row.querySelector('.ff-qty').textContent, 10) || 0;
        if (n > 0) v[row.getAttribute('data-item')] = n;
      });
    }
    if (v != null) out.answers[q.id] = v;
  });
  return out;
}
