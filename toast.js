const STYLE_ID = 'toast-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.app-toast-el{' +
      'position:fixed;left:50%;bottom:calc(72px + env(safe-area-inset-bottom));' +
      'transform:translate(-50%,8px);max-width:min(320px,86vw);' +
      'background:var(--ink);color:var(--paper);' +
      'font-family:"Noto Sans TC","Noto Sans",sans-serif;font-size:12.5px;font-weight:600;line-height:1.5;' +
      'text-align:center;padding:10px 18px;border-radius:999px;' +
      'opacity:0;pointer-events:none;z-index:95;' +
      'box-shadow:0 10px 24px rgba(32,36,47,.25);' +
      'transition:opacity .2s ease, transform .2s ease;' +
    '}' +
    '.app-toast-el.show{opacity:1;transform:translate(-50%,0);}' +
    '.app-toast-el.tone-success{background:var(--sage);}' +
    '.app-toast-el.tone-error{background:var(--burgundy);}';
  document.head.appendChild(style);
}

var toastEl = null;
var hideTimer = null;

function ensureToastEl() {
  if (toastEl) return toastEl;
  ensureStyle();
  toastEl = document.createElement('div');
  toastEl.className = 'app-toast-el';
  document.body.appendChild(toastEl);
  return toastEl;
}

// 取代 alert() 的自訂提示，語氣沿用 App 既有配色：tone 可以是 undefined（一般通知）、
// 'success'、'error'，只顯示一則、2.6 秒後自動消失，沒有堆疊佇列（這輪呼叫點都是
// 單一用途，不需要更複雜的機制）
export function showToast(message, tone) {
  var el = ensureToastEl();
  el.textContent = message;
  el.className = 'app-toast-el show' + (tone ? ' tone-' + tone : '');
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(function () {
    el.classList.remove('show');
  }, 2600);
}
