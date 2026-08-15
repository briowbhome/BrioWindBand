import { logout } from './auth-guard.js';

const STYLE_ID = 'acct-menu-style';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    '.acct-menu{position:fixed;z-index:50;min-width:160px;background:var(--paper-raised);' +
    'border:1px solid var(--line);border-radius:var(--radius-md);box-shadow:var(--shadow-card);' +
    'padding:8px;display:none;}' +
    '.acct-menu.open{display:block;}' +
    '.acct-menu .acct-name{padding:8px 10px 6px;font-weight:700;font-size:13.5px;color:var(--ink);' +
    'border-bottom:1px solid var(--line);margin-bottom:4px;}' +
    '.acct-menu button,.acct-menu a{display:block;width:100%;text-align:left;background:none;border:none;' +
    'padding:8px 10px;font-size:13.5px;border-radius:8px;cursor:pointer;font-family:inherit;' +
    'text-decoration:none;box-sizing:border-box;}' +
    '.acct-menu a{color:var(--ink);}' +
    '.acct-menu button{color:var(--burgundy);}' +
    '.acct-menu button:hover,.acct-menu button:active,.acct-menu a:hover,.acct-menu a:active{background:var(--sage-bg);}';
  document.head.appendChild(style);
}

// 掛在 appbar 右上角大頭貼按鈕上的帳號選單。
// adminHref：只有需要顯示「後台管理」連結時才傳（例如 index.html 對幹部/擁有者），其他頁面不用傳。
// 之後「帳號資料」頁做出來可以在這裡再加一個入口
export function initAccountMenu(name, adminHref) {
  var avatarBtn = document.getElementById('avatarBtn');
  if (!avatarBtn) return;

  ensureStyle();

  avatarBtn.setAttribute('aria-label', '帳號選單');
  avatarBtn.removeAttribute('title');

  var menu = document.createElement('div');
  menu.className = 'acct-menu';
  menu.innerHTML =
    '<div class="acct-name"></div>' +
    (adminHref ? '<a href="' + adminHref + '">後台管理</a>' : '') +
    '<button type="button" data-action="logout">登出</button>';
  menu.querySelector('.acct-name').textContent = name || '';
  document.body.appendChild(menu);

  function positionMenu() {
    var rect = avatarBtn.getBoundingClientRect();
    menu.style.top = (rect.bottom + 8) + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';
  }

  function closeMenu() {
    menu.classList.remove('open');
  }

  function toggleMenu(e) {
    e.stopPropagation();
    var opening = !menu.classList.contains('open');
    if (opening) positionMenu();
    menu.classList.toggle('open', opening);
  }

  avatarBtn.addEventListener('click', toggleMenu);
  document.addEventListener('click', function (e) {
    if (!menu.contains(e.target) && e.target !== avatarBtn) closeMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  menu.querySelector('[data-action="logout"]').addEventListener('click', function () {
    closeMenu();
    if (confirm('確定要登出嗎？')) logout();
  });
}
