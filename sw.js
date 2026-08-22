const CACHE_VERSION = 'brio-v16';
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
  './conductor-admin.html',
  './profile.html',
  './auth-guard.js',
  './auth-service.js',
  './firebase-init.js',
  './account-menu.js',
  './version.js',
  './event-types.js',
  './instruments.js',
  './seating-chart.js',
  './ios-install.js',
  './push-config.js',
  './manifest.json',
  './assets/BrioLogo.jpg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-192-maskable.png',
  './assets/icons/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(CORE_ASSETS))
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

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
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
