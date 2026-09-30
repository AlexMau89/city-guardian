const CACHE_NAME = "guardian-v3";

const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./config.js",
    "./manifest.json",
    "./camaras.json",
    "./admin.html",
    "./assets/icon-192.png",
    "./assets/icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(FILES_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;
    const requestUrl = new URL(request.url);
    if (request.method !== "GET" || requestUrl.pathname.startsWith("/api/")) return;

    event.respondWith(
        fetch(request)
            .catch(() => caches.match(request))
    );
});
