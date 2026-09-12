const STYLE_ID = 'confirm-dialog-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.app-confirm-overlay{' +
      'position:fixed;inset:0;z-index:96;' +
      'background:rgba(32,36,47,.45);' +
      'display:none;align-items:center;justify-content:center;padding:0 28px;' +
    '}' +
    '.app-confirm-overlay.show{display:flex;}' +
    '.app-confirm-card{' +
      'width:100%;max-width:300px;background:var(--paper-raised);border-radius:18px;' +
      'box-shadow:0 20px 40px -12px rgba(32,36,47,.45);padding:22px 20px 20px;text-align:center;' +
    '}' +
    '.app-confirm-icon{width:28px;height:28px;margin:0 auto 12px;color:var(--ink);}' +
    '.app-confirm-icon.danger{color:var(--burgundy);}' +
    '.app-confirm-msg{' +
      'font-family:"Noto Sans TC","Noto Sans",sans-serif;font-size:13.5px;' +
      'line-height:1.65;color:var(--ink);white-space:pre-line;' +
    '}' +
    '.app-confirm-actions{display:flex;gap:10px;margin-top:18px;}' +
    '.app-confirm-btn{' +
      'flex:1;padding:12px 10px;border-radius:14px;font-weight:700;font-size:13.5px;' +
      'border:none;cursor:pointer;font-family:"Noto Sans TC","Noto Sans",sans-serif;' +
      'transition:transform .12s ease,background .12s ease;' +
    '}' +
    '.app-confirm-btn:active{transform:scale(.97);}' +
    '.app-confirm-btn-cancel{background:var(--paper);color:var(--ink-soft);border:1px solid var(--line);}' +
    '.app-confirm-btn-primary{background:var(--brass);color:var(--ink);}' +
    '.app-confirm-btn-primary:hover{background:#C7963F;}' +
    '.app-confirm-btn-danger{background:var(--burgundy);color:#F2EFE5;}' +
    '.app-confirm-btn-danger:hover{background:var(--burgundy-deep);}';
  document.head.appendChild(style);
}

var ICONS = {
  neutral: '<circle cx="12" cy="12" r="8.3" stroke="currentColor" stroke-width="1.5"/>' +
    '<path d="M10.1 10.4a1.9 1.9 0 1 1 2.5 1.8c-.56.28-.77.63-.77 1.18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<circle cx="12" cy="15.7" r="0.75" fill="currentColor"/>',
  danger: '<path d="M12 4.6 21 19.6H3Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<path d="M12 10.6v3.6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="12" cy="16.9" r="0.9" fill="currentColor"/>'
};

var overlayEl = null;
var iconEl = null;
var msgEl = null;
var cancelBtnEl = null;
var confirmBtnEl = null;

function ensureDom() {
  if (overlayEl) return;
  ensureStyle();
  overlayEl = document.createElement('div');
  overlayEl.className = 'app-confirm-overlay';
  overlayEl.innerHTML =
    '<div class="app-confirm-card">' +
      '<svg class="app-confirm-icon" viewBox="0 0 24 24" fill="none"></svg>' +
      '<div class="app-confirm-msg"></div>' +
      '<div class="app-confirm-actions">' +
        '<button type="button" class="app-confirm-btn app-confirm-btn-cancel"></button>' +
        '<button type="button" class="app-confirm-btn app-confirm-btn-primary"></button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlayEl);
  iconEl = overlayEl.querySelector('.app-confirm-icon');
  msgEl = overlayEl.querySelector('.app-confirm-msg');
  cancelBtnEl = overlayEl.querySelector('.app-confirm-btn-cancel');
  confirmBtnEl = overlayEl.querySelector('.app-confirm-btn-primary');
}

// 取代 confirm() 的自訂彈窗。只有一顆共用的 overlay/card（跟 toast.js 一樣不做堆疊佇列）——
// 呼叫端都是 await 完才會決定下一步，不會有第二個彈窗疊上來的情境。danger:true 時圖示跟
// 確定鈕換成警示色（burgundy），用於刪除/作廢等破壞性動作；預設是一般色調（brass），
// 用於套用範本、開啟簽到這類非破壞性確認。
export function showConfirm(message, options) {
  options = options || {};
  ensureDom();
  var danger = !!options.danger;

  // SVGElement.className 是唯讀的 SVGAnimatedString，不能直接指派，要用 setAttribute
  iconEl.setAttribute('class', 'app-confirm-icon' + (danger ? ' danger' : ''));
  iconEl.innerHTML = danger ? ICONS.danger : ICONS.neutral;
  msgEl.textContent = message;
  cancelBtnEl.textContent = options.cancelText || '取消';
  confirmBtnEl.textContent = options.confirmText || '確定';
  confirmBtnEl.className = 'app-confirm-btn ' + (danger ? 'app-confirm-btn-danger' : 'app-confirm-btn-primary');

  overlayEl.classList.add('show');

  return new Promise(function (resolve) {
    function cleanup(result) {
      overlayEl.classList.remove('show');
      overlayEl.removeEventListener('click', onBackdrop);
      confirmBtnEl.removeEventListener('click', onConfirm);
      cancelBtnEl.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onBackdrop(e) { if (e.target === overlayEl) cleanup(false); }
    confirmBtnEl.addEventListener('click', onConfirm);
    cancelBtnEl.addEventListener('click', onCancel);
    overlayEl.addEventListener('click', onBackdrop);
  });
}
