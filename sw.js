// =======================================================
// Dhyaan Service Worker
// Optimized for GitHub Pages + PWA
// =======================================================

const CACHE_VERSION = "dhyaan-v4";

const STATIC_CACHE = `${CACHE_VERSION}-static`;
const AUDIO_CACHE = `${CACHE_VERSION}-audio`;

const STATIC_ASSETS = [

    "./",

    "./index.html",

    "./manifest.json",

    "./script.js",

    "./css/main.css",
    "./css/themes.css",

    "./assets/icons/favicon.ico",
    "./assets/icons/favicon.svg",

    "./assets/icons/icon-192.png",
    "./assets/icons/icon-512.png"

];


// =======================================================
// INSTALL
// =======================================================

self.addEventListener("install", event => {

    self.skipWaiting();

    event.waitUntil(

        caches
            .open(STATIC_CACHE)
            .then(cache => cache.addAll(STATIC_ASSETS))
            .catch(console.error)

    );

});


// =======================================================
// ACTIVATE
// =======================================================

self.addEventListener("activate", event => {

    event.waitUntil(

        (async () => {

            const keys = await caches.keys();

            await Promise.all(

                keys
                    .filter(key =>
                        key.startsWith("dhyaan-") &&
                        key !== STATIC_CACHE &&
                        key !== AUDIO_CACHE
                    )
                    .map(key => caches.delete(key))

            );

            await self.clients.claim();

        })()

    );

});


// =======================================================
// FETCH
// =======================================================

self.addEventListener("fetch", event => {

    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Ignore unsupported schemes
    if (!url.protocol.startsWith("http")) return;

    // ---------------------------------------------------
    // Audio
    // ---------------------------------------------------

    if (isAudio(url)) {

        event.respondWith(audioCacheFirst(request));

        return;

    }

    // ---------------------------------------------------
    // JSON (except manifest)
    // ---------------------------------------------------

    if (

        url.pathname.endsWith(".json") &&
        !url.pathname.endsWith("manifest.json")

    ) {

        event.respondWith(networkFirst(request));

        return;

    }

    // ---------------------------------------------------
    // Fonts
    // ---------------------------------------------------

    if (

        url.hostname.includes("fonts.googleapis.com") ||
        url.hostname.includes("fonts.gstatic.com")

    ) {

        event.respondWith(cacheFirst(request));

        return;

    }

    // ---------------------------------------------------
    // HTML Navigation
    // ---------------------------------------------------

    if (request.mode === "navigate") {

        event.respondWith(navigationHandler(request));

        return;

    }

    // ---------------------------------------------------
    // Default
    // ---------------------------------------------------

    event.respondWith(staleWhileRevalidate(request));

});


// =======================================================
// STRATEGIES
// =======================================================

async function cacheFirst(request, cacheName = STATIC_CACHE) {

    const cached = await caches.match(request);

    if (cached) return cached;

    try {

        const fresh = await fetch(request);

        if (fresh.ok) {

            const cache = await caches.open(cacheName);

            cache.put(request, fresh.clone());

        }

        return fresh;

    }

    catch {

        return new Response("Offline", { status: 503 });

    }

}



async function networkFirst(request) {

    try {

        const fresh = await fetch(request);

        if (fresh.ok) {

            const cache = await caches.open(STATIC_CACHE);

            cache.put(request, fresh.clone());

        }

        return fresh;

    }

    catch {

        const cached = await caches.match(request);

        return cached ||

            new Response("{}", {

                headers: {

                    "Content-Type": "application/json"

                }

            });

    }

}



async function staleWhileRevalidate(request) {

    const cache = await caches.open(STATIC_CACHE);

    const cached = await cache.match(request);

    const network = fetch(request)

        .then(response => {

            if (response.ok)

                cache.put(request, response.clone());

            return response;

        })

        .catch(() => null);

    return cached || await network ||

        new Response("Offline", {

            status: 503

        });

}



async function audioCacheFirst(request) {

    const cached = await caches.match(request);

    if (cached) return cached;

    try {

        const fresh = await fetch(request);

        if (fresh.ok) {

            const length = fresh.headers.get("content-length");

            if (

                !length ||

                Number(length) < 52_428_800

            ) {

                const cache = await caches.open(AUDIO_CACHE);

                cache.put(request, fresh.clone());

            }

        }

        return fresh;

    }

    catch {

        return new Response(

            "Audio unavailable offline",

            { status: 503 }

        );

    }

}



async function navigationHandler(request) {

    try {

        return await fetch(request);

    }

    catch {

        return (

            await caches.match("./index.html")

        ) ||

            new Response(

                "Offline",

                {

                    status: 503

                }

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
// MESSAGE
// =======================================================

self.addEventListener("message", event => {

    if (event.data === "skipWaiting") {

        self.skipWaiting();

    }

});