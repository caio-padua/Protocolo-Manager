# Spec — Rodapé PADCON na capa premium

**Data:** 13/08/2026
**Arquivo alvo:** `artifacts/api-server/src/lib/pdf-signer.ts` → função `drawPremiumCover`

## Objetivo
Adicionar o lockup PADCON (símbolo + wordmark + frase "Advanced Systems Architecture")
no canto inferior esquerdo da capa, pequeno e discreto, como crédito de infraestrutura.

## Requisitos

| # | Requisito |
|---|---|
| R1 | Usar `padcon-platform.png` (1001×957 px, fundo transparente confirmado). Nunca texto digitado. |
| R2 | Posição: canto inferior esquerdo, alinhado com a margem esquerda (MARGIN) e a linha de rodapé. |
| R3 | Tamanho: altura 38 pt; largura calculada pelo ratio real do arquivo (nunca esticado). |
| R4 | O lockup flutua sobre o navy sem qualquer placa, borda ou retângulo atrás. |
| R5 | Ausência do arquivo não quebra a geração da capa (best-effort, mesmo padrão do símbolo PADAXOR). |
| R6 | A linha de texto do rodapé existente ("Documento clinico individual…") continua visível e não é sobreposta. |

## Definição de PRONTO
- Screenshot da capa mostra o lockup PADCON no canto inferior esquerdo.
- O lockup flutua sobre o navy sem placa.
- O texto do rodapé existente permanece legível à direita ou abaixo.
- PDF gerado sem erro, tamanho > 500 KB.
