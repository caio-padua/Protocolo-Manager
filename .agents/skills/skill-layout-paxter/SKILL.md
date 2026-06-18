---
name: skill-layout-paxter
description: "Sistema de design Paxter (Padcon Conect / PADCOM). Linguagem visual skeuomorfica 3D, vocabulario oficial (Saliente/Bevel, Concavo/Well, Painel 3D), tokens da marca e padroes do Console de Orcamento. Ler ANTES de criar ou redesenhar qualquer tela do Manager para manter a essencia 3D."
---

# Skill Layout Paxter — Sistema de Design (Padcon Conect)

Linguagem visual do Manager, definida pelo CEO Dr. Caio. Mantida pelo Dr. Replit Paxter.
Regra mae: **nunca perca a essencia dos paineis e sub-paineis 3D. So incorpore beneficios.**
Toda mudanca e de APRESENTACAO; o motor de calculo e o payload de salvar nunca mudam por estetica.

## 1. Vocabulario oficial (fala -> codigo)

Sempre falar com o CEO usando "Saliente" e "Concavo". No codigo usar as classes existentes.

| Parte do bloco | Como FALAR | Classe CSS no codigo | O que e |
|---|---|---|---|
| Bloco inteiro que salta da tela | Painel 3D / Skeuomorfico | `panel-3d`, `panel-3d-sub`, `panel-3d-hero` | Cartao com relevo, sombra externa + topo iluminado |
| Bloco selecionado | Painel ativo | `panel-3d-active` | Painel 3D + halo na cor primaria |
| Parte que SAI para fora (alto-relevo) | Saliente / Bevel | `screen-3d` | Mini-tela elevada; numeros/titulos em destaque |
| Parte AFUNDADA (baixo-relevo) | Concavo / Well | `concave-3d` | Campo "gravado" onde o dado entra |
| Campo de input gravado | Campo gravado | `field-engraved` | Input com sombra interna (parece afundado) |
| Tecla classica | Botao 3D | `btn-3d`, `btn-3d-soft` | Botao que afunda no `:active` |
| Faixa de incentivo | Banner de incentivo | `incentive-banner` | Degrade mint suave, carrega "quanto falta" |

Skeuomorfico = estilo que imita objeto fisico real (parece botao/tela de verdade).
Bevel = chanfro que projeta para fora. Well/Inset = campo afundado para dentro.

As definicoes vivem em `artifacts/padcom/src/index.css` (procurar `.panel-3d`, `.screen-3d`,
`.concave-3d`, `.field-engraved`, `.incentive-banner`, `.btn-3d`). Essas classes sao
**unlayered de proposito** para vencer utilitarios do Tailwind/shadcn — nao reordenar camadas.

## 2. Tokens da marca

| Token | Valor | Uso |
|---|---|---|
| Verde-petroleo (primary) | `#3D7A7A` / `hsl(180 30% 28%)` | Sidebar, titulos, barras preenchidas |
| Ciano (accent) | `#45B8CC` / `hsl(187 72% 48%)` | Destaque do item atual, halos, anel de foco |
| Branco | `#FFFFFF` | Fundo de paineis claros |
| Cantos | radius 6px a 8px (`0.25rem`–`0.375rem`) | SEMPRE quadrados; nunca pill/arredondado infantil |
| Labels KPI | MAIUSCULO + `tracking` expandido | Rotulos de indicador |

Estilo: elegante, empirico, sem infantilidades. Tema escuro tem variantes `.dark` para
todas as classes 3D — ao criar classe nova, criar tambem a variante `.dark`.

## 3. Padroes de composicao

- **Conclusao visual primeiro**: o numero/decisao em Saliente; o detalhe em Concavo.
- **Fluxo, nao frase**: caminho/sequencia vira blueprint com setas (ex.: AGORA -> META),
  nunca paragrafo linear. Vale na tela como na resposta ao CEO (Densidade B).
- **Barras**: preferir segmentos/escada a barra continua lisa. Item atual destacado com
  anel ciano. Faixas atingidas preenchidas (primary), futuras esmaecidas.
- **Escada de faixas (TierLadder)**: barras de ALTURA crescente (faixa maior = barra mais
  alta), com seta de chegada (ArrowUp) e o limiar de sessoes; a faixa atual destacada.
  Renderizada no front a partir do catalogo (override do item OU escada global do settings).
  Implementacao de referencia em `artifacts/padcom/src/pages/orcamentos/novo.tsx`.
- **Porquinho**: `artifacts/padcom/public/cofrinho-economia.png` — render 3D realista nas
  cores da marca (sem rosa/cartoon), fundo transparente, usado no banner de desconto.

## 4. Console de Orcamento (referencia viva)

- `pages/orcamentos/novo.tsx` — Montagem (apresentacao). Banner de desconto: titulo
  Saliente no topo, AGORA/META com porcentagens em Concavo, escada de faixas, botao 3D.
- `pages/orcamentos/parametrizacao.tsx` — Parametrizacao. `TierEditor` define as faixas;
  campo "Numero de faixas" gera/encurta N espacos de porcentagem (inputs em `field-engraved`).
- A dose EXIBIDA vem do catalogo; a dose SALVA vem de `r.dose`. Diferenca proposital.
- `Apresentacao` reidrata `itemVolumeTiers` do catalogo por `catalogId` (snapshot do
  orcamento nao persiste override de faixas).

## 5. Linha vermelha (nao cruzar)

- Nao alterar `/api/budgets/calculate` nem o payload de `salvar()` por motivo estetico.
- Nao trocar cantos quadrados por arredondados infantis.
- Nao remover o relevo 3D dos paineis/sub-paineis — e a essencia.
- Ao mexer em classe 3D, mexer so no render (cor/sombra/forma), nunca na logica de dados.

RESUMO EM 1 LINHA: design Paxter = paineis 3D skeuomorficos, Saliente para a conclusao e
Concavo para o dado, cores verde-petroleo/ciano, cantos quadrados, fluxos com setas — so
apresentacao muda, o motor nunca.
