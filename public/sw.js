const CACHE = "sfhealth-v10";
const STATIC = ["/app", "/favicon.svg", "/manifest.json", "/icons/icon-192.svg", "/icons/icon-512.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const url = e.request.url;
  // Only handle http/https — skip chrome-extension and other schemes
  if (!url.startsWith("http://") && !url.startsWith("https://")) return;
  // Only handle requests to our own origin — let external URLs (e.g. SF logout) pass through untouched
  if (new URL(url).origin !== self.location.origin) return;

  const path = new URL(url).pathname;

  // Never cache: API calls, auth, share pages (each share URL is unique per user)
  if (path.startsWith("/api/") || path.startsWith("/auth/") || path.startsWith("/share/")) {
    e.respondWith(fetch(e.request).catch(() => new Response(JSON.stringify({ error: "Offline" }), { headers: { "Content-Type": "application/json" } })));
    return;
  }

  // Cache-first for static assets only
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (e.request.method === "GET" && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return response;
      });
    })
  );
});
