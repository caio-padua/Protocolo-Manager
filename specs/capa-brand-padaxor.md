# Spec — Capa Premium PADAXOR (correção da marca)

**Data:** 13/08/2026
**Autor:** Dr. Replit Paxter
**Arquivo alvo:** `artifacts/api-server/src/lib/pdf-signer.ts` → função `drawPremiumCover`

---

## Objetivo

Substituir a captura de tela de slide ("03-loginho-vidro-sistema.png", 574×314 px, com
número e legenda embutidos no pixel) pelo lockup oficial da marca PADAXOR, composto
de dois arquivos PNG com canal alfa real, renderizados em proporção nativa sobre o
fundo navy — sem placa, sem moldura, sem retângulo de fundo.

---

## Requisitos

| # | Requisito |
|---|---|
| R1 | A imagem usada como símbolo é `padaxor-symbol-medalhao.png` (381×369 px, transparente nos cantos). NUNCA `03-loginho-vidro-sistema.png`. |
| R2 | A imagem usada como wordmark é `padaxor-wordmark-trim.png` (1740×225 px, transparente nos cantos). NUNCA texto digitado como substituto principal. |
| R3 | O símbolo é desenhado em proporção nativa (altura fixa de 74 pt, largura calculada pelo ratio 381/369 ≈ 1.033). NUNCA esticado para proporção errada. |
| R4 | O wordmark é desenhado em proporção nativa (largura fixa de 216 pt, altura calculada pelo ratio 225/1740 ≈ 0.129). NUNCA esticado. |
| R5 | Símbolo e wordmark flutuam sobre o fundo navy sem qualquer retângulo, placa ou cor de fundo atrás deles. |
| R6 | A sequência vertical é: símbolo → wordmark → "Clinical Intelligence System" (fonte Cormorant Garamond SemiBold, 10 pt, cor GOLD_P). |
| R7 | A palavra PAXTER NÃO aparece em nenhum lugar da capa (nem em texto, nem embutida em imagem). |
| R8 | Se o arquivo de símbolo ou wordmark não for encontrado, a capa não quebra: o fallback para texto só se ativa quando o arquivo físico está ausente. |
| R9 | Os caminhos de asset resolvem nos três cenários: bundle de produção (`dist/`), código-fonte via `tsx` (`src/lib/`), e variante com `assets/` adjacente. |
| R10 | A validação inclui screenshot real da capa — não só "compilou" ou código HTTP 200. |

---

## Casos extremos

- Arquivo PNG ausente em produção: a capa gera com fallback (texto "PADAXOR" em Cormorant Bold 42pt, branco), sem lançar exceção.
- Proporção do arquivo diferente do esperado: a largura/altura são calculadas de forma dinâmica pelo ratio real do arquivo embutido (`symbolImg.width / symbolImg.height`), não por constante hardcoded.

---

## Definição de PRONTO

1. Screenshot da capa mostra símbolo dourado 3D + wordmark PADAXOR ouro, sem placa, sobre navy escuro.
2. Zoom na área do lockup confirma que não há retângulo de fundo, borda ou artefato de captura.
3. A palavra PAXTER não aparece visualmente.
4. `pdffonts` confirma fontes TrueType embutidas (subset: true).
5. `pdftoppm` converte a página 1 sem erro.
6. O arquivo gerado supera 500 KB (presença das imagens embutidas).

---

## Linhas vermelhas

- NUNCA usar `embedPadaxorSymbol` com `03-loginho-vidro-sistema.png` de volta.
- NUNCA adicionar `sendProtocolEmail` ou chamadas ao Drive neste script de pré-visualização.
- NUNCA chamar a rota `GET /api/protocols/:id/document-pdf` para validar aparência (ela envia e-mail real).
