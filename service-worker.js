self.addEventListener("install", e => {
  e.waitUntil(
    caches.open("fg-auto-v1").then(cache =>
      cache.addAll([
        "./",
        "./index.html",
        "./styles.css",
        "./app.js",
        "./data.js",
        "./manifest.json",
        "./assets/icons/logo.png",
        "./assets/icons/favicon.ico"
      ])
    )
  );
});

self.addEventListener("fetch", e => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});
