// Minimal service worker — caches the shell so the dashboard works briefly offline.
const CACHE = 'maowcore-v1';
const SHELL = ['/', '/dashboard.html', '/style.css', '/app.js', '/icon.svg', '/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Bypass WebSocket upgrades and dynamic stuff
  if (e.request.headers.get('upgrade') === 'websocket') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match('/dashboard.html')))
  );
});
