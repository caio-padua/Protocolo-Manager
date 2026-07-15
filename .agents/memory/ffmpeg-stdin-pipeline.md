---
name: Pipeline ffmpeg via stdin (GIF/MP4 de marca)
description: Armadilhas ao gerar GIF/MP4 alimentando ffmpeg por stdin em Node (EPIPE, drain pendurado, palettegen)
---

Regras aprendidas gerando o banner animado PAXTER (GIF/MP4) com o ffmpeg do sistema:

1. **EPIPE mata o processo**: se o ffmpeg fechar a entrada cedo, `stdin.write` emite `error` no socket; sem `ff.stdin.on("error", noop)` o Node inteiro cai (mesmo com `.catch` na promessa externa).
2. **Drain pendurado = unhandled rejection**: se o laço aguarda `once("drain")` e o ffmpeg morre, o drain nunca vem e a rejeição do "fim" fica sem dono → crash. Solução: `fim.catch(noop)` + `await Promise.race([drain, fim])` + checar `stdin.writable`.
3. **ffmpeg 6.1 não tem `palettegen=stat_mode`** — usar `palettegen` puro; `paletteuse=dither=sierra2_4a` funciona e elimina o serrilhado do gradiente.
4. **GIF via ffmpeg >> gifenc**: quantização simples (gifenc, sem dithering) gera banding em gradientes escuros e arquivo 5x maior (843 KB vs 154 KB). Pausa longa = repetir o último quadro na taxa fixa (o codificador comprime bem).
5. Cache em memória exige **dedup de promessa em voo** por formato e tmp file com nome único (`randomUUID`) + `unlink` em `finally` (senão requisições simultâneas disputam o mesmo arquivo e falha vaza parcial).

**Como aplicar:** qualquer geração de mídia server-side via child_process alimentado por pipe.
