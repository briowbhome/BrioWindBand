// 後台頁面清單，之後新增後台功能只要在這裡加一筆，側邊選單會自動多一個項目
export const ADMIN_PAGES = [
  { href: "admin-index.html", label: "控制台首頁" },
  { href: "admin.html", label: "團員審核" },
  { href: "members-admin.html", label: "成員資料" },
  { href: "event-admin.html", label: "活動管理" },
  { href: "checkin-admin.html", label: "簽到管理" },
  { href: "announce-admin.html", label: "公告管理" },
  { href: "roles-admin.html", label: "權限管理" }
];

// 每個後台頁面都要有 #adminMenuBtn（appbar 上的漢堡按鈕）、
// #drawerOverlay（背景遮罩）、#drawerPanel（抽屜本體，空的 <nav>）
export function initAdminNav(activeHref) {
  var overlay = document.getElementById("drawerOverlay");
  var panel = document.getElementById("drawerPanel");
  var menuBtn = document.getElementById("adminMenuBtn");

  panel.innerHTML =
    '<div class="drawer-header"><span class="name">後台管理</span></div>' +
    '<a class="drawer-home" href="index.html">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M15 5 8 12l7 7" stroke="#4A4F5C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      '返回首頁' +
    '</a>' +
    '<div class="drawer-section-label">Admin Tools</div>' +
    ADMIN_PAGES.map(function (page) {
      var isActive = page.href === activeHref;
      return '<a class="drawer-link' + (isActive ? " active" : "") + '" href="' + page.href + '">' + page.label + "</a>";
    }).join("");

  function openDrawer() { overlay.classList.add("active"); }
  function closeDrawer() { overlay.classList.remove("active"); }

  menuBtn.addEventListener("click", openDrawer);
  overlay.addEventListener("click", function (e) {
    if (e.target === overlay) closeDrawer();
  });
}
