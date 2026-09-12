import { GROUPS, PAGES } from './admin-pages.js';

const STYLE_ID = 'admin-nav-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.admin-nav-btn{' +
      'width:30px;height:30px;flex:none;border:none;background:none;border-radius:50%;' +
      'display:flex;align-items:center;justify-content:center;color:var(--ink);cursor:pointer;padding:0;' +
    '}' +
    '.admin-nav-btn:active{background:rgba(32,36,47,.06);}' +
    '.admin-nav-overlay{' +
      'position:fixed;inset:0;z-index:90;background:rgba(32,36,47,.45);' +
      'opacity:0;pointer-events:none;transition:opacity .2s ease;' +
    '}' +
    '.admin-nav-overlay.show{opacity:1;pointer-events:auto;}' +
    '.admin-nav-drawer{' +
      'position:fixed;top:0;bottom:0;left:0;width:264px;max-width:82vw;z-index:91;' +
      'background:var(--paper-raised);' +
      'transform:translateX(-100%);transition:transform .25s cubic-bezier(.32,.72,0,1);' +
      'display:flex;flex-direction:column;' +
      'padding-top:env(safe-area-inset-top);' +
      'font-family:"Noto Sans TC","Noto Sans",sans-serif;color:var(--ink);' +
    '}' +
    // box-shadow 只在展開時才加：off-screen 的抽屜雖然整個框被 translateX(-100%) 推出視窗，
    // box-shadow 本身還是會照原本的框位置畫（往右偏移 12px、模糊 30px），框的右邊界剛好
    // 貼齊視窗左緣，陰影的模糊範圍就會往右暈進畫面，變成側邊選單頁面左側一條突兀的黑色漸層——
    // 收合狀態不需要陰影（反正看不到抽屜本體），乾脆展開時才加這個樣式最乾淨
    '.admin-nav-drawer.show{transform:translateX(0);box-shadow:12px 0 30px rgba(32,36,47,.3);}' +
    '.admin-nav-head{padding:18px 18px 14px;border-bottom:1px solid var(--line);}' +
    '.admin-nav-home{' +
      'display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;' +
      'color:var(--brass-deep);text-decoration:none;' +
    '}' +
    '.admin-nav-list{flex:1;overflow-y:auto;padding:8px;}' +
    '.admin-nav-group-label{' +
      'margin:14px 12px 4px;font-family:"Roboto Mono",monospace;font-size:10px;letter-spacing:.1em;' +
      'color:var(--ink-soft);text-transform:uppercase;' +
    '}' +
    '.admin-nav-group-label:first-child{margin-top:6px;}' +
    '.admin-nav-item{' +
      'display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:12px;' +
      'font-size:13px;color:var(--ink);text-decoration:none;margin-bottom:2px;' +
    '}' +
    '.admin-nav-item:not(.current):active{background:rgba(32,36,47,.06);}' +
    '.admin-nav-item .ani{width:18px;height:18px;flex:none;color:var(--ink-soft);}' +
    '.admin-nav-item.current{background:var(--sage-bg);color:var(--sage);font-weight:700;}' +
    '.admin-nav-item.current .ani{color:var(--sage);}';
  document.head.appendChild(style);
}

// 掛在 appbar 返回箭頭左側的漢堡按鈕上（頁面 HTML 要先放一顆 id="adminNavBtn" 的按鈕）。
// currentKey 對應 admin-pages.js 裡 PAGES 清單的 key，用來把目前頁面那一項標示成不可點的「current」樣式
export function initAdminNav(currentKey) {
  var trigger = document.getElementById('adminNavBtn');
  if (!trigger) return;

  ensureStyle();

  var overlay = document.createElement('div');
  overlay.className = 'admin-nav-overlay';

  var drawer = document.createElement('div');
  drawer.className = 'admin-nav-drawer';
  drawer.innerHTML =
    '<div class="admin-nav-head"><a class="admin-nav-home" href="admin-index.html">‹ 回控制台首頁</a></div>' +
    '<div class="admin-nav-list">' +
    GROUPS.map(function (g) {
      var itemsHtml = PAGES.filter(function (p) { return p.group === g.key; }).map(function (p) {
        var isCurrent = p.key === currentKey;
        return (
          '<a class="admin-nav-item' + (isCurrent ? ' current' : '') + '"' +
            (isCurrent ? '' : ' href="' + p.href + '"') + '>' +
            '<svg class="ani" viewBox="0 0 24 24" fill="none">' + p.icon + '</svg>' +
            p.label +
          '</a>'
        );
      }).join('');
      return '<div class="admin-nav-group-label">' + g.label + '</div>' + itemsHtml;
    }).join('') +
    '</div>';

  document.body.appendChild(overlay);
  document.body.appendChild(drawer);

  function closeNav() {
    drawer.classList.remove('show');
    overlay.classList.remove('show');
  }
  function toggleNav() {
    var opening = !drawer.classList.contains('show');
    drawer.classList.toggle('show', opening);
    overlay.classList.toggle('show', opening);
  }

  trigger.addEventListener('click', toggleNav);
  overlay.addEventListener('click', closeNav);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeNav();
  });
}
