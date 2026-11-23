import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Tiny dependency-free PWA plugin: after the bundle is generated it emits
 * `sw.js` with a precache list of every produced asset, so the production
 * build works offline after the first visit.
 */
function dinoServiceWorker(): Plugin {
  return {
    name: 'dinorush-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const staticFiles = [
        'manifest.webmanifest',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png',
        'icons/icon.svg',
      ];
      const precache = ['./', ...[...files, ...staticFiles].map((f) => './' + f)];
      const version = Date.now().toString(36);
      const source = `/* DinoRUSH service worker – generated at build time */
const CACHE = 'dinorush-${version}';
const PRECACHE = ${JSON.stringify(precache, null, 2)};

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
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), dinoServiceWorker()],
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
} as any);
