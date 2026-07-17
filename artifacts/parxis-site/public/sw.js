// PARXIS Service Worker — cache-first para carregamento instantâneo
const CACHE = 'parxis-v1';

const PRECACHE = [
  '/parxis/',
  '/parxis/manifest.json',
  '/parxis/brand/parxis-symbol.png',
  '/parxis/brand/parxis-logo.png',
];

// Instala e pré-cacheia os assets essenciais
self.addEventListener('install', function(e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(PRECACHE).catch(function() {});
    })
  );
});

// Ativa e limpa caches velhos
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

// Estratégia: network-first para HTML (sempre fresco), cache-first para assets
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // Ignora requests não-GET e externos
  if (e.request.method !== 'GET') return;
  if (!url.startsWith(self.location.origin)) return;

  // HTML: network-first (atualiza sempre, fallback no cache)
  if (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html')) {
    e.respondWith(
      fetch(e.request).then(function(res) {
        var clone = res.clone();
        caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        return res;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }

  // Assets (JS, CSS, imagens, fontes): cache-first
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(res) {
        if (!res || res.status !== 200) return res;
        var clone = res.clone();
        caches.open(CACHE).then(function(c) { c.put(e.request, clone); });
        return res;
      });
    })
  );
});
