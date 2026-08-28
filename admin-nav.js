const STYLE_ID = 'admin-nav-style';

// 跟 admin-index.html 九張卡片同順序、同文案、同圖示（直接複用卡片的 SVG path）。
// 之後新增後台頁面只要改這份清單，9 個頁面呼叫 initAdminNav() 的地方都不用動
const PAGES = [
  { key: 'review', href: 'review-admin.html', label: '團員審核',
    icon: '<circle cx="9" cy="8" r="3.2" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 19c1-3.4 3.3-5 5.5-5s4.5 1.6 5.5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M15.5 5.5c1.4.3 2.5 1.6 2.5 3.1s-1.1 2.8-2.5 3.1M18 14c1.8.5 3 1.9 3.5 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  { key: 'members', href: 'members-admin.html', label: '成員資料',
    icon: '<rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><circle cx="9" cy="11" r="2" stroke="currentColor" stroke-width="1.6"/><path d="M6 16c.5-1.6 1.8-2.5 3-2.5s2.5.9 3 2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M14 10h4M14 13h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  { key: 'event', href: 'event-admin.html', label: '活動管理',
    icon: '<rect x="4" y="5" width="16" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  { key: 'roster', href: 'roster-admin.html', label: '名單管理',
    icon: '<rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  { key: 'repertoire', href: 'repertoire-admin.html', label: '藏譜管理',
    icon: '<path d="M9 18V5l11-2v13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.6"/><circle cx="17" cy="16" r="3" stroke="currentColor" stroke-width="1.6"/>' },
  { key: 'announce', href: 'announce-admin.html', label: '公告管理',
    icon: '<path d="M3 10v4a1 1 0 0 0 1 1h2l6 4V5L6 9H4a1 1 0 0 0-1 1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 8.5a5 5 0 0 1 0 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' },
  { key: 'roles', href: 'roles-admin.html', label: '權限管理',
    icon: '<path d="M12 2l7 3v6c0 4.8-3 8.6-7 11-4-2.4-7-6.2-7-11V5l7-3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' },
  { key: 'stats', href: 'stats-admin.html', label: '統計資料',
    icon: '<path d="M4 20V10M11 20V4M18 20v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' },
  { key: 'conductor', href: 'conductor-admin.html', label: '指揮專用',
    icon: '<path d="m5 19 12-12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="18" cy="6" r="2.4" stroke="currentColor" stroke-width="1.6"/><path d="M5 19c-1 0-1.6-.9-1.2-1.8l1.7-3.7 3.7 3.7-1.8 1.7c-.4.4-1 .1-2.4.1Z" fill="currentColor"/>' }
];

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
      'background:var(--paper-raised);box-shadow:12px 0 30px rgba(32,36,47,.3);' +
      'transform:translateX(-100%);transition:transform .25s cubic-bezier(.32,.72,0,1);' +
      'display:flex;flex-direction:column;' +
      'padding-top:env(safe-area-inset-top);' +
      'font-family:"Noto Sans TC","Noto Sans",sans-serif;color:var(--ink);' +
    '}' +
    '.admin-nav-drawer.show{transform:translateX(0);}' +
    '.admin-nav-head{padding:18px 18px 14px;border-bottom:1px solid var(--line);}' +
    '.admin-nav-home{' +
      'display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;' +
      'color:var(--brass-deep);text-decoration:none;' +
    '}' +
    '.admin-nav-list{flex:1;overflow-y:auto;padding:8px;}' +
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
// currentKey 對應上面 PAGES 清單的 key，用來把目前頁面那一項標示成不可點的「current」樣式
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
    PAGES.map(function (p) {
      var isCurrent = p.key === currentKey;
      return (
        '<a class="admin-nav-item' + (isCurrent ? ' current' : '') + '"' +
          (isCurrent ? '' : ' href="' + p.href + '"') + '>' +
          '<svg class="ani" viewBox="0 0 24 24" fill="none">' + p.icon + '</svg>' +
          p.label +
        '</a>'
      );
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
