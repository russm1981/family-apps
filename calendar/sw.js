/* Keeps the app itself available offline. Calendar and points data always come live from Google. */
const CACHE = 'calendar-v78';
const FILES = ["./", "index.html", "app.js", "calendar.css", "manifest.webmanifest", "icons/icon-192.png", "../shared/fd.js", "../shared/base.css", "../shared/pair.js", "../shared/qrcode.js"];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('calendar-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.endsWith('/version.json')) return;                            // update checks: always the network, never kept   // Google requests go straight to the network
  // Network first so updates show straight away; fall back to the saved copy when offline.
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
