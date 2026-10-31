const CACHE_NAME = "docuverse-v2.6";
const STATIC_ASSETS = [
  "./",
  "index.html",
  "manifest.json",
  "assets/styles.css",
  "assets/app.js",
  "assets/favicon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "docs/backend-architecture.md",
  "docs/readme.md",
  "https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js",
  "https://cdn.jsdelivr.net/npm/marked-footnote@1.4.0/dist/index.umd.js",
  "https://cdn.jsdelivr.net/npm/dompurify@3.2.6/dist/purify.min.js",
  "https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js",
  "https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only handle GET requests
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Network-First for core application code (HTML, JS, CSS) to ensure instant updates
  if (req.mode === "navigate" || url.pathname.includes("app.js") || url.pathname.includes("styles.css")) {
    event.respondWith(
      fetch(req).then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const resClone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return networkRes;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-First with background revalidation for CDN vendor libraries & static icons
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(req).then((networkRes) => {
        if (!networkRes || networkRes.status !== 200) {
          return networkRes;
        }

        const resClone = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return networkRes;
      });
    })
  );
});
