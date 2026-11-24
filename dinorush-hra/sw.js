/* DinoRUSH service worker – generated at build time */
const CACHE = 'dinorush-mwu098b6';
const PRECACHE = [
  "./",
  "./assets/index-CZ0qvmqI.js",
  "./assets/index-DqmtW1VM.css",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/icon.svg"
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('dinorush-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (req.mode === 'navigate') {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) cache.put('./', fresh.clone());
        return fresh;
      } catch (e) {
        return (await cache.match('./')) || (await cache.match('./index.html')) || Response.error();
      }
    }
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      return Response.error();
    }
  })());
});
