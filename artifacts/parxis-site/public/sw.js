// PARXIS Service Worker — network-first em dev, cache de apoio em prod
const CACHE = 'parxis-v3';

// Em dev (Vite), NUNCA cachear JS/CSS para não travar HMR
const isDev = self.location.hostname === 'localhost' || self.location.hostname.includes('replit');

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  // Em dev: sempre network-first, sem cachear JS/CSS
  if (isDev) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Em prod: network-first para HTML, cache-first para assets imutáveis
  e.respondWith(
    fetch(e.request).then(function(res) {
      if (res && res.status === 200) {
        var clone = res.clone();
        caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
      }
      return res;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
