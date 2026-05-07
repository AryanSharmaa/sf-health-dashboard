const CACHE = "sfhealth-v15";

// Only truly static, versioned assets get cached
const PRECACHE = ["/favicon.svg", "/manifest.json", "/icons/icon-192.svg", "/icons/icon-512.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = e.request.url;
  if (!url.startsWith("http://") && !url.startsWith("https://")) return;

  const { origin, pathname } = new URL(url);
  if (origin !== self.location.origin) return;

  // NEVER cache: HTML pages, API calls, auth, session, user endpoints
  // These must always go to the network so session state is always fresh.
  const neverCache =
    e.request.mode === "navigate" ||           // any HTML page navigation
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/user/") ||
    pathname.startsWith("/share/");

  if (neverCache) {
    e.respondWith(
      fetch(e.request).catch(() => {
        // Offline fallback for navigations only
        if (e.request.mode === "navigate") {
          return caches.match("/app") || new Response("Offline", { status: 503 });
        }
        return new Response(JSON.stringify({ error: "Offline" }), {
          headers: { "Content-Type": "application/json" },
        });
      })
    );
    return;
  }

  // Cache-first only for static assets (icons, manifest, favicon)
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (e.request.method === "GET" && response.status === 200) {
          caches.open(CACHE).then(c => c.put(e.request, response.clone()));
        }
        return response;
      });
    })
  );
});
