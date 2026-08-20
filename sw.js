const CACHE_VERSION = 'brio-v11';
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
  './auth-guard.js',
  './auth-service.js',
  './firebase-init.js',
  './account-menu.js',
  './version.js',
  './event-types.js',
  './instruments.js',
  './seating-chart.js',
  './ios-install.js',
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
