# SPEC — Identidade PAWARDS na Tela Inicial (Painel de Controle)

Data: 20/06/2026 · Autor: Dr. Replit Paxter · Aprovacao do escopo: CEO Dr. Caio (opcao A)

## 1. OBJETIVO

Aplicar a identidade visual PAWARDS (azul-marinho profundo + dourado/champanhe + branco gelo,
fontes classicas Cinzel/Cormorant nos titulos + Inter na interface) na TELA INICIAL
(componente `dashboard.tsx`, rota `/`), igual ao espirito da demo aprovada em `/pawards`.

## 2. REGRAS DURAS (linha vermelha — decisao do CEO)

| Regra | O que significa na pratica |
|---|---|
| Nao mudar as pecas 3D | Estrutura, geometria e COMPORTAMENTO de panel-3d, bevel-3d, concave-3d, screen-3d, btn-3d, toggles e paxter-alert permanecem 100% intactos. Muda SO a COR da superficie (fundo + borda). O relevo (box-shadow) e preservado. |
| So trocar a tipografia, nao o tamanho | Titulos viram serif (Cinzel/Cormorant); interface e numeros seguem Inter. Tamanho de fonte/numero IGUAL ao atual. Se a troca de fonte mudar o tamanho aparente, AJUSTAR via letter-spacing / line-height ate igualar — nunca encolher/aumentar o conteudo. |
| So a tela inicial | Escopo exclusivo `.pw-home` no root do dashboard. Menu lateral (Layout, compartilhado por todas as telas) NAO muda nesta onda. |
| Manter semantica de status | Verde = sucesso/ok, vermelho = critico, ambar = aviso permanecem (nao viram dourado). So as cores de MARCA (verde-petroleo -> marinho, ciano -> dourado) mudam. |

## 3. TECNICA DE ESCOPO

- Wrapper `.pw-home` no `<div>` raiz do `dashboard.tsx`.
- Bloco CSS UNLAYERED escopado em `.pw-home`, anexado ao FIM de `index.css` (vence utilitarios
  Tailwind e os blocos `.dark .X`, por ordem de fonte + especificidade classe+classe).
- Filosofia identica ao `.area-elite` ja existente: muda SO a cor, relevo Paxter intacto.

## 4. PALETA (mesma da demo / area-elite)

| Token | Valor |
|---|---|
| Marinho 900 (texto/banda) | #16294a |
| Marinho 700 | #22406a |
| Marinho 950 (botao fundo) | #0a1f3a |
| Dourado champanhe | #b8924d |
| Dourado soft / light | #c2a05a / #d9bd7e |
| Marfim / perola (superficies) | #ffffff -> #faf7ef -> #f1ece0 |
| Slate (texto secundario) | #647c97 |

## 5. MUDANCAS DE TOKEN (dentro de `.pw-home`)

- `--primary` -> marinho (214 54% 19%)  · `--accent` -> dourado (39 41% 51%)
- `--foreground` -> marinho ink  · `--muted-foreground` -> slate
- `--card-border`, `--border`, `--ring` -> fio dourado
- Efeito automatico: `text-primary` (numeros KPI, data da sessao), barras do recharts
  (`fill="hsl(var(--primary))"`), grade/bordas do grafico e hairlines herdam a nova cor.

## 6. RECOLORACAO DAS PECAS 3D (so background + border-color; box-shadow intacto)

| Classe | Fundo novo | Borda nova |
|---|---|---|
| panel-3d / panel-3d-sub / panel-3d-hero | marfim quente (gradiente claro) | fio dourado |
| bevel-3d | marfim | fio dourado |
| concave-3d | perola gravada | fio dourado |
| screen-3d | marfim alto-relevo | fio dourado |
| btn-3d (acao primaria) | gradiente MARINHO | borda dourada, texto branco |
| btn-3d-soft (acao secundaria) | marfim | borda dourada, texto marinho |
| paxter-alert (red/amber/info) | inalterado (semantica de status) | inalterado |

## 7. TIPOGRAFIA

- Carregar Cinzel + Cormorant Garamond + Inter (pesos 400-900) no `index.html`.
- Var `--pw-title: "Cinzel","Cormorant Garamond",Georgia,serif` dentro de `.pw-home`.
- Classe utilitaria `.pw-home .pw-title-serif { font-family: var(--pw-title) }` aplicada em:
  titulo H1 ("Painel de Controle") e nos titulos de bloco
  (Fila de Validacao, Sessoes Agendadas, Alertas Operacionais, Receita Recente).
- Rotulos de KPI, numeros, textos de corpo e badges seguem Inter (NAO recebem serif).
- Cinzel e caixa-alta de x-height baixa: ajustar letter-spacing/line-height ate o titulo
  ocupar o MESMO espaco visual do atual. Validar por captura, iterar.

## 8. EDICOES PONTUAIS EM dashboard.tsx

- Envolver root com classe `pw-home`.
- Adicionar `pw-title-serif` aos 5 titulos citados.
- Remapear as cores inline dos 4 KPIs (marca -> PAWARDS; status -> mantem):
  Sessoes Hoje ciano->dourado · Protocolos Ativos petroleo->marinho ·
  Receita ambar->dourado profundo · Taxa de Conclusao verde/vermelho (mantem).
- Fundo da area: `.pw-home` preenche a area de conteudo (margem negativa compensando
  o padding do Layout) com gradiente marfim/dourado discreto, edge-to-edge.

## 9. CRITERIOS DE ACEITE

1. Tela inicial em marinho/dourado com fontes classicas, mantendo TODO o relevo 3D.
2. Tamanho de fonte/numeros identico ao atual (proporcao conferida por captura).
3. Menu lateral e demais telas inalterados.
4. Semantica de status (verde/vermelho/ambar) preservada.
5. Sem erro de runtime; grafico recharts recolorido; hover/relevo funcionando.
6. Revisao do architect sem pendencia severa.

## 10. FORA DE ESCOPO

- Menu lateral / Layout / demais telas.
- Renomear produto (Padcon Conect x PAWARDS) — decisao do CEO pendente.
- RAS / PDFs / motor / payload.
