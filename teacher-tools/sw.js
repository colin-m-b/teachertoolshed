/* PureWrite offline app-shell cache.
   Registered from purewrite.html with the default scope (/teacher-tools/,
   since there's no server config here to widen it) — it only intercepts
   requests for the assets PureWrite itself needs, listed below. It does not
   touch the rest of the site's tools.

   Cache-first for everything listed: once a student has loaded the tool
   once, losing the network mid-session must not break it. CACHE_NAME is
   version-tagged so a future edit to this file's own asset list evicts the
   old cache instead of serving stale files forever. */
const CACHE_NAME = 'purewrite-shell-v1';
const SHELL_ASSETS = [
  'purewrite.html',
  'purewrite-setup.html',
  'purewrite-export.js',
  '../js/toolshed-zip.js',
  'vendor/jspdf.umd.min.js',
  '../css/toolshed.css',
  '../favicon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return; // leave Google Fonts etc. to the network/browser cache

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(resp => {
        if (resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
        return resp;
      }).catch(() => cached);
    })
  );
});
