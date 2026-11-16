/* Keeps houserunner.app (the Configurator / Family Admin) available offline. Family data always comes live from Google.
 * The screen, the Family Calendar app and the licence pages look after themselves, so they're left alone here. */
const CACHE = 'root-v106';
const FILES = ["./", "index.html", "manifest.webmanifest", "admin/app.js", "admin/phone.js", "admin/phone.css", "admin/admin.css", "admin/icons/icon-192.png", "setup/desk.css", "setup/editor.css", "setup/editor.js", "setup/calsetup.js", "setup/config.js",
  "help/topics.js", "shared/fd.js", "shared/head.js", "shared/storecheck.js", "shared/move.js", "shared/base.css", "shared/brand/mark.svg", "shared/privacy.js", "shared/countries.js", "shared/icons.js", "shared/pair.js", "shared/qrcode.js"];
const OWN = /^\/(screen|dashboard|calendar|licencing|windows|downloads|Scripts)\//;
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('root-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || OWN.test(u.pathname) || u.pathname.endsWith('/version.json')) return;
  // Network first so updates show straight away; the saved copy when offline.
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
