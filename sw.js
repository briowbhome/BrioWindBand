const CACHE_VERSION = 'brio-v53';
const CORE_ASSETS = [
  './',
  './index.html',
  './login.html',
  './checkin.html',
  './review-admin.html',
  './admin-index.html',
  './members-admin.html',
  './event-admin.html',
  './roster-admin.html',
  './announce-admin.html',
  './roles-admin.html',
  './stats-admin.html',
  './checkin-stats-admin.html',
  './concert-stats-admin.html',
  './member-stats-admin.html',
  './conductor-admin.html',
  './finance-admin.html',
  './feedback-admin.html',
  './profile.html',
  './sheet-music.html',
  './repertoire-admin.html',
  './section-admin.html',
  './theme.css',
  './team-switcher.js',
  './pdf-split.js',
  './pdf.worker.min.mjs',
  './auth-guard.js',
  './auth-service.js',
  './firebase-init.js',
  './account-menu.js',
  './admin-pages.js',
  './admin-nav.js',
  './roster-templates.js',
  './dialog.js',
  './toast.js',
  './messages.js',
  './version.js',
  './event-types.js',
  './data-cache.js',
  './instruments.js',
  './repertoire.js',
  './seating-chart.js',
  './finance.js',
  './ios-install.js',
  './pull-refresh.js',
  './pwa-register.js',
  './push-config.js',
  './manifest.json',
  './assets/BrioLogo.jpg',
  './assets/icons/badge-96.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-192-maskable.png',
  './assets/icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // cache.addAll() 內部的 fetch 會照瀏覽器自己的 HTTP 快取規則走，GitHub Pages
      // 對靜態檔案下的 Cache-Control 可能讓這裡撈到還沒過期的舊內容，跟部署的新版本兜不起來，
      // 明確用 no-store 跳過瀏覽器快取，確保每次安裝都是真的問伺服器要最新版本
      Promise.all(CORE_ASSETS.map((url) =>
        fetch(url, { cache: 'no-store' }).then((response) => cache.put(url, response))
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// 整頁導頁（mode:'navigate'，也就是點連結/從主畫面圖示開 App 這種請求）不能套用下面
// 「快取優先，背景偷偷更新」那套：iOS Safari 遇到 service worker 用一個網路沒抓完整的
// response（訊號差、App 切到背景導致連線中斷）去回應導頁請求時，不會走一般的載入失敗重試，
// 而是把這份殘缺內容當成無法辨識的檔案，跳出「下載/在其他 App 開啟」的畫面，而不是渲染
// 網頁——2026-09 起陸續有 iOS 使用者反應點功能卡沒有正確跳轉、卻跳出檔案下載畫面，
// 疑似就是這個情境。所以導頁請求改成單純「先打網路，
// 失敗才退回快取／首頁」，不要把還在賭網路一定會抓完整的 response 直接拿去 respond
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, response.clone()));
        return response;
      }).catch(() =>
        caches.open(CACHE_VERSION).then((cache) =>
          cache.match(event.request).then((cached) => cached || cache.match('./index.html'))
        )
      )
    );
    return;
  }

  // 快取優先＋背景更新：先用本機已有的版本立即回應（不受當下網路好壞影響），
  // 背景同時打一次網路把快取更新成最新版，下次載入才會是新的。取捨是部署新版本後
  // 使用者要再重整一次才看得到（pwa-register.js 的更新提示 banner 會告知並讓他手動觸發）
  event.respondWith(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.match(event.request).then((cached) => {
        // 同樣要跳過瀏覽器 HTTP 快取（理由同 install 事件），不然背景更新可能一直
        // 撈到同一份舊內容，變成不管重整幾次都更新不了
        const network = fetch(event.request, { cache: 'no-store' })
          .then((response) => { cache.put(event.request, response.clone()); return response; })
          .catch(() => null);
        return cached || network;
      })
    )
  );
});

// 收「推播」的一半管線：這輪還沒有 Cloud Function 會真的送推播，先把接收端搭好，
// 之後接上發送端就能直接用，不用回頭補這段
self.addEventListener('push', (event) => {
  var payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (e) {}
  var title = payload.title || '布利歐管樂團';
  var options = {
    body: payload.body || '',
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/badge-96.png',
    data: { url: payload.url || './index.html' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || './index.html';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (var i = 0; i < clientList.length; i++) {
        if (clientList[i].url.indexOf(url) !== -1 && 'focus' in clientList[i]) return clientList[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
