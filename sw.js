// sw.js — Dhyaan Service Worker
// Cache strategy: cache-first for assets, network-first for data

const CACHE_VERSION = 'dhyaan-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const AUDIO_CACHE  = `${CACHE_VERSION}-audio`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/main.css',
  '/css/themes.css',
  '/js/app.js',
  '/js/config.js',
  '/js/explorer.js',
  '/js/player.js',
  '/js/playlist.js',
  '/js/recommendations.js',
  '/js/search.js',
  '/js/storage.js',
  '/js/ui.js',
  '/js/visualizer.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=DM+Mono:wght@300;400&display=swap',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(STATIC_CACHE).then(cache => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn(`[SW] Failed to cache ${url}:`, err))
        )
      );
    })
  );
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('dhyaan-') && k !== STATIC_CACHE && k !== AUDIO_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // Skip chrome-extension or non-http
  if (!request.url.startsWith('http')) return;

  // Audio files: cache-first with network fallback, store in audio cache
  if (isAudio(url)) {
    e.respondWith(audioCacheFirst(request));
    return;
  }

  // Data endpoint: network-first with cache fallback
  if (url.pathname.endsWith('.json') && !url.pathname.includes('manifest')) {
    e.respondWith(networkFirst(request));
    return;
  }

  // Fonts (Google Fonts): cache-first
  if (url.hostname.includes('fonts.g')) {
    e.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Everything else: stale-while-revalidate
  e.respondWith(staleWhileRevalidate(request));
});

// ── Strategies ───────────────────────────────────────────────────────────────
async function cacheFirst(request, cacheName = STATIC_CACHE) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  }
}

async function audioCacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) {
      // Only cache audio files under 50MB
      const cl = fresh.headers.get('content-length');
      if (!cl || parseInt(cl, 10) < 52_428_800) {
        const cache = await caches.open(AUDIO_CACHE);
        cache.put(request, fresh.clone());
      }
    }
    return fresh;
  } catch {
    return new Response('Audio unavailable offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(fresh => {
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  }).catch(() => null);
  return cached || (await fetchPromise) || new Response('Offline', { status: 503 });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isAudio(url) {
  return /\.(mp3|ogg|wav|flac|aac|m4a|opus)(\?|$)/i.test(url.pathname);
}

// ── Background sync (optional, graceful) ─────────────────────────────────────
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
