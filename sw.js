/*
 * Offline shell.
 *
 * Navigations are NETWORK-FIRST, assets are cache-first. That split matters:
 * Vite fingerprints asset filenames, so a cached `index.html` from an older
 * build points at JavaScript that no longer exists on the server. Serving that
 * stale HTML gives every returning player a white screen until they clear their
 * site data — which is exactly what happened the first time a new build was
 * pushed to the test server.
 *
 * So: always try the network for the document, fall back to cache only when
 * genuinely offline. Hashed assets can be cached hard, because a new build
 * requests new filenames.
 */
// v3 (27 Sep 2026): arena pictures were cached forever under unchanged names, so a
// returning player never saw a repainted arena. Bumping the name purges every
// old cache on the next visit.
const CACHE = 'persia-at-war-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html'])).catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // The document: network first, so a fresh build is always picked up.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Build assets under /assets/ are content-hashed: a new build requests new
  // filenames, so they can be cached hard.
  const hashed = new URL(req.url).pathname.includes('/assets/');
  if (hashed) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ??
          fetch(req)
            .then((res) => {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
              return res;
            })
            .catch(() => Promise.reject(new Error('offline'))),
      ),
    );
    return;
  }

  // Everything else — the arena pictures, portraits, icons — keeps its name
  // when it is replaced. Network first, so a repainted arena shows up; the cache
  // only answers when the player is genuinely offline.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit ?? Response.error())),
  );
});
