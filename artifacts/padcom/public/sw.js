// Service worker do Padcon Conect (PWA instalavel).
// Estrategia network-first: busca sempre a versao fresca; so cai no cache
// quando offline. Nunca cacheia /api (dados sempre frescos).
const CACHE = "padcon-conect-v2";
// A porta de entrada do app instalado e /entrada (start_url do manifest), entao
// o fallback offline precisa ser /entrada — e nao / (que pode nunca ser cacheado).
const OFFLINE_FALLBACK = "/entrada";

self.addEventListener("install", (event) => {
  // Pre-cacheia a porta de entrada na instalacao para garantir abertura offline
  // deterministica (best-effort: se falhar, o app ainda funciona online).
  event.waitUntil(
    (async () => {
      try {
        const c = await caches.open(CACHE);
        await c.add(OFFLINE_FALLBACK);
      } catch {
        /* best-effort */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Mesma origem apenas; nunca interceptar API.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/api/")) return;

  event.respondWith(
    (async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      } catch {
        const cached = await caches.match(req);
        if (cached) return cached;
        if (req.mode === "navigate") {
          const fallback = await caches.match(OFFLINE_FALLBACK);
          if (fallback) return fallback;
        }
        return Response.error();
      }
    })(),
  );
});
