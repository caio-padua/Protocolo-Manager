---
name: Wordmark PAXTER — arte oficial PNG, nunca potrace
description: Por que o "PAXTER" do topo ficava "carcomido"/serrilhado e como resolver de vez; sombra preta embutida do PNG oficial no fundo claro.
---

# Wordmark PAXTER — arte oficial PNG, nunca potrace

Regra: para exibir o "PAXTER" use SEMPRE a ARTE OFICIAL (PNG em `assets/brand/paxter-paxter.*`),
NUNCA um SVG redesenhado por traco automatico (potrace). O componente `PaxterWordmarkPremium`
(SVG potrace de `paxterVectorPaths.ts`) tinha contorno serrilhado de ORIGEM — nenhum filtro
(stroke, halo, extrusao, blur "esmeril") conserta, porque o desenho-base e ondulado. Abandonado
em /anamnese/v2.

**Sombra embutida (2a armadilha):** o PNG oficial tem drop-shadow PRETA embutida. Fica linda no
ESCURO (some no navy) e SUJA no CLARO (vira fumaca/halo serrilhado sobre o creme). Solucao: no
claro usar versao SEM o halo (`paxter-paxter-clean.png`, gerada removendo o fundo da arte oficial);
no escuro usar o PNG oficial cru. Escolha por `tone` no `BrandMark`.

**Why:** o CEO perdeu ~2 dias e reprovou varias rodadas de "melhorar o filtro" do SVG serrilhado;
a causa nunca era o filtro, era a fonte do desenho + a sombra embutida.

**How to apply:** ao mexer em qualquer wordmark/selo dourado, ler
`.agents/skills/skill-layout-paxter/references/relevo-3d-ouro/tecnica.md` (receita + imagens
antes/depois + como conferir compondo a arte sobre o fundo do tema quando o screenshot falhar).
