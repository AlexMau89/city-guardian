const CACHE_NAME = "city-guardian-v1";

const FILES_TO_CACHE = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(FILES_TO_CACHE))
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
    );
});