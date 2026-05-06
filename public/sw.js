const CACHE = "sfhealth-v1";

// On install — skip waiting so new SW activates immediately
self.addEventListener("install", () => self.skipWaiting());

// On activate — delete ALL old caches and take control of all open tabs
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// On fetch — network-first for HTML navigation, cache-first for assets
self.addEventListener("fetch", e => {
  if (e.request.mode === "navigate") {
    // Always fetch HTML fresh from network; browser cache is bypassed
    e.respondWith(
      fetch(e.request, { cache: "no-store" }).catch(() => caches.match(e.request))
    );
  }
});
