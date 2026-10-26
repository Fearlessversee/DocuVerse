const CACHE_NAME = "docuverse-v2.1";
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

  // For app assets & CDN libraries, try cache first, fallback to network
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Fetch in background to update cache for next time
        fetch(req).then((networkRes) => {
          if (networkRes && networkRes.status === 200) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
        }).catch(() => {});
        return cached;
      }

      return fetch(req).then((networkRes) => {
        if (!networkRes || networkRes.status !== 200 || networkRes.type !== "basic") {
          // If it's a CDN resource (cors), also cache it
          if (networkRes && networkRes.status === 200 && (url.hostname.includes("jsdelivr.net") || url.hostname.includes("cdnjs.cloudflare.com") || url.hostname.includes("fonts.gstatic.com") || url.hostname.includes("fonts.googleapis.com"))) {
            const resClone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return networkRes;
        }

        const resClone = networkRes.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return networkRes;
      }).catch(() => {
        // Offline fallback for documents
        if (req.headers.get("accept") && req.headers.get("accept").includes("text/html")) {
          return caches.match("index.html");
        }
      });
    })
  );
});
