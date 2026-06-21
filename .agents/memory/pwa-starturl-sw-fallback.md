---
name: PWA start_url e fallback do service worker andam juntos
description: Ao mudar o start_url do manifest, mudar o OFFLINE_FALLBACK do sw em lockstep
---

Regra: ao trocar `start_url` no `manifest.webmanifest`, trocar tambem o `OFFLINE_FALLBACK`
do `public/sw.js` para a MESMA rota e pre-cachea-la no evento `install`; e subir a versao do
CACHE (v1->v2) para invalidar o cache velho.

**Why:** sw network-first so cacheia o que foi visitado. Se o app instalado abre em /entrada
mas o fallback offline aponta para "/", o "/" pode nunca ter sido cacheado e a abertura offline
falha (tela morta). Achado em revisao do architect na onda da porta de entrada (PADCOM).

**How to apply:** qualquer mudanca de porta de entrada do PWA -> editar os dois arquivos juntos
(manifest start_url + sw OFFLINE_FALLBACK + bump CACHE). sw so registra em PROD (import.meta.env.PROD).
