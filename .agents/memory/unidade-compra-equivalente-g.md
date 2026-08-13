---
name: unidadeCompraEquivalenteG — campo duplo-propósito (embalagem + rendimento de cocção)
description: Como o catálogo de alimentos converte "1 unidade de compra" em gramas na mesma base (crua/cozida) que o resto do catálogo já usa — relevante para qualquer motor que calcule quantidade a comprar a partir de gramas de cardápio.
---

# `unidadeCompraEquivalenteG` absorve DOIS tipos de conversão num só número

O catálogo de alimentos (`dietaCatalogoAlimentosTable`) guarda macros por 100g
numa base que já pode ser crua OU cozida dependendo do item (ex.: "Arroz
branco cozido" já é pós-cocção). Quando se soma gramas de um cardápio ao
longo de N dias e se converte para "quantas unidades de compra" (kg, dúzia,
pacote), é preciso saber quantos gramas UMA unidade de compra rende — mas
"rende" mistura duas coisas diferentes:

1. **Conversão de embalagem** (ex.: 1 dúzia de ovos ≈ 600g; 1 pacote de whey
   ≈ 900g) — pura unidade comercial, sem cocção envolvida.
2. **Rendimento de cocção** (ex.: 1kg de arroz CRU rende ~2700g de arroz
   COZIDO) — necessário porque o catálogo mede o item já cozido, mas se
   compra pelo peso cru.

**Decisão:** um único campo `unidadeCompraEquivalenteG` (real, gramas) cobre
os dois casos — para cada alimento, é simplesmente "quantos gramas, na MESMA
BASE que a coluna kcal/macros do catálogo usa, equivalem a 1 unidade de
compra". Quem preenche o campo (humano, ou futuro robô de preços) decide caso
a caso se está aplicando conversão de embalagem ou de rendimento de cocção —
o motor de lista de compras não precisa saber qual dos dois é.

**Why:** um segundo campo separado ("fator de cocção" vs "gramas por
embalagem") obrigaria o motor de lista de compras a saber, por alimento, qual
conversão aplicar e em que ordem — complexidade que não muda o resultado
final, só o número de campos a manter sincronizados.

**How to apply:** ao adicionar um alimento novo ao catálogo (manualmente ou
via robô de coleta de preços, task seguinte a esta), preencher
`unidadeCompraEquivalenteG` perguntando "quantos gramas do jeito que este
catálogo já mede o item (cru ou cozido, o que a coluna kcal100g usa) eu ganho
comprando 1 `unidadeCompra`?" — nunca um fator de conversão abstrato.
