// =======================================================
// Dhyaan Service Worker v5
// Optimized for GitHub Pages + PWA + Audio streaming
// =======================================================

const CACHE_VERSION   = 'dhyaan-v5';
const STATIC_CACHE    = `${CACHE_VERSION}-static`;
const AUDIO_CACHE     = `${CACHE_VERSION}-audio`;
const FONT_CACHE      = `${CACHE_VERSION}-fonts`;

// Max audio file size to cache: 60 MB
const AUDIO_CACHE_LIMIT = 62_914_560;

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './script.js',
  './css/main.css',
  './css/themes.css',
  './assets/icons/favicon.ico',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];


// =======================================================
// INSTALL — pre-cache static shell
// =======================================================

self.addEventListener('install', event => {
  self.skipWaiting();

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(err => console.warn('[SW] Pre-cache failed:', err))
  );
});


// =======================================================
// ACTIVATE — delete stale caches
// =======================================================

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(key =>
            key.startsWith('dhyaan-') &&
            key !== STATIC_CACHE &&
            key !== AUDIO_CACHE &&
            key !== FONT_CACHE
          )
          .map(key => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});


// =======================================================
// FETCH — route to strategy
// =======================================================

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (!url.protocol.startsWith('http')) return;

  // ── Audio files: cache-first, skip range requests
  if (isAudio(url)) {
    // Range requests from the audio element (buffering) must go to network.
    // We only cache the full response on a non-range fetch.
    if (req.headers.get('range')) {
      event.respondWith(fetch(req).catch(() =>
        new Response('Audio unavailable offline', { status: 503 })
      ));
    } else {
      event.respondWith(audioCacheFirst(req));
    }
    return;
  }

  // ── JSON data (meditation.json etc.): network-first
  if (url.pathname.endsWith('.json') && !url.pathname.endsWith('manifest.json')) {
    event.respondWith(networkFirst(req));
    return;
  }

  // ── Google Fonts: cache-first
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(cacheFirst(req, FONT_CACHE));
    return;
  }

  // ── HTML navigation: network-first, fallback to shell
  if (req.mode === 'navigate') {
    event.respondWith(navigationHandler(req));
    return;
  }

  // ── Everything else: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(req));
});


// =======================================================
// STRATEGIES
// =======================================================

async function cacheFirst(req, cacheName = STATIC_CACHE) {
  const cached = await caches.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(cacheName);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}


async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    const cached = await caches.match(req);
    return cached || new Response('{}', {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}


async function staleWhileRevalidate(req) {
  const cache  = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);

  const networkPromise = fetch(req)
    .then(res => { if (res.ok) cache.put(req, res.clone()); return res; })
    .catch(() => null);

  return cached || await networkPromise ||
    new Response('Offline', { status: 503 });
}


async function audioCacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;

  try {
    const res = await fetch(req);
    if (res.ok) {
      const length = res.headers.get('content-length');
      // Only cache if size is known and within limit
      if (!length || Number(length) < AUDIO_CACHE_LIMIT) {
        const cache = await caches.open(AUDIO_CACHE);
        cache.put(req, res.clone());
      }
    }
    return res;
  } catch {
    return new Response('Audio unavailable offline', { status: 503 });
  }
}


async function navigationHandler(req) {
  try {
    return await fetch(req);
  } catch {
    return (
      (await caches.match('./index.html')) ||
      (await caches.match('./')) ||
      new Response('Offline', { status: 503 })
    );
  }
}


// =======================================================
// HELPERS
// =======================================================

function isAudio(url) {
  return /\.(mp3|ogg|wav|flac|aac|m4a|opus)(\?|$)/i.test(url.pathname);
}


// =======================================================
// MESSAGES
// =======================================================

self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
