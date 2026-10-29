---
name: JPEG enviado — decodificar e regravar sem EXIF
description: Regra de segurança e estabilidade para imagens JPEG recebidas por upload no servidor.
---

JPEG recebido de usuário deve ser integralmente decodificado e regravado antes de persistir ou incorporar em documento. Conferir apenas MIME, extensão, marcadores ou `pdf-lib.embedJpg()` não prova que todos os pixels são decodificáveis. A regravação também deve remover EXIF, GPS, miniaturas e identificação do aparelho.

**Why:** `pdf-lib.embedJpg()` aceitou arquivos truncados, preservando os bytes originais e seus metadados. Um decoder nativo baseado em canvas derrubou o processo no Node 24 durante o upload; o decoder JavaScript puro permaneceu estável e rejeitou o truncado.

**How to apply:** em rotas de upload JPEG, limitar tamanho, memória e resolução; decodificar todos os pixels com biblioteca JavaScript pura; reencodar para JPEG limpo; só então fazer troca atômica. Testar truncado, EXIF ausente e consumo pelo gerador final.