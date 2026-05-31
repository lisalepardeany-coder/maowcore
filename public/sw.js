// MaowCore dashboard service worker.
//
// Caches the app shell so the dashboard works briefly offline, and falls
// back to the cached dashboard.html on navigation failures. Bumped to v2
// in v3.2.3 to fix a handful of intercept bugs:
//
//   - Old SW intercepted EVERY GET, including cross-origin requests to
//     Discord CDN. When fetch failed (e.g., on an animated avatar that
//     returned 415 / on an offline second-instance health probe), it
//     returned dashboard.html as a fallback, which the browser then tried
//     to render as an image / parse as JSON. Hence the noisy console
//     errors and the 415 on `a_*.gif`.
//   - It also double-logged every same-origin fetch (once from SW, once
//     from the page) because every GET went through respondWith.
//
// New rules:
//   - Skip non-GET, websocket upgrades, and cross-origin entirely. Let
//     the browser handle them without SW involvement.
//   - Skip /api/* — API responses are dynamic and shouldn't be served
//     from a stale cache; if the backend is unreachable, surface the
//     network error instead of returning HTML.
//   - For navigation requests (HTML): network-first, fall back to the
//     cached dashboard.html so the SPA still loads offline.
//   - For static assets (.css, .js, .svg, manifest, icons): network-first,
//     fall back to the cache match for the same URL.

const CACHE = 'maowcore-v2';
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
  const req = e.request;

  // Only handle GETs. Anything else (POST, PUT, etc.) goes straight to network.
  if (req.method !== 'GET') return;

  // Skip websocket upgrades.
  if (req.headers.get('upgrade') === 'websocket') return;

  const url = new URL(req.url);

  // Skip cross-origin entirely — let the browser handle Discord CDN, other
  // instance probes, etc. Returning dashboard.html as a fallback for an
  // image or JSON request produces confusing errors.
  if (url.origin !== self.location.origin) return;

  // Skip API routes — these are dynamic, must not be cached, and must
  // surface real network errors to the caller (otherwise a failed
  // /api/health would return dashboard.html and the parser would explode).
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests (top-level HTML loads): network-first, fall back
  // to cached dashboard.html so the SPA still boots offline.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/dashboard.html')));
    return;
  }

  // Static assets: network-first, fall back to a cache hit for the exact
  // request URL. Never substitute a different cached asset.
  e.respondWith(fetch(req).catch(() => caches.match(req)));
});
