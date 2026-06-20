# Spec — Varredura Visual Paxter (pivô marinho/dourado + acabamento 3D em todo o sistema)

Data: 20/06/2026. Autor: Dr. Replit Paxter. Acionado pelo CEO Dr. Caio ("crie um spec... refaça tudo... coloque isso no loop").
Decisão de alcance travada pelo CEO: **Opção A — pivô total** (marinho vira a cor primária do sistema inteiro; dourado como destaque; verde-petróleo aposentado).

## Objetivo (uma frase)

Varrer TODAS as telas do Padcon Conect como médico-operador e deixar o sistema inteiro coerente na identidade PAWARDS (azul-marinho clássico + dourado champanhe), com tipografia de instrumento, cantos e luzes quadrados, e relevo 3D Paxter (paineis, bevels, inserts/wells) onde estiver faltando — mudando SÓ apresentação, nunca motor/payload.

## Decisões de design (marteladas; o architect e o CEO podem vetar na revisão)

1. Cor primária do sistema = MARINHO `hsl(214 54% 19%)` (#16294a). Substitui o verde-petróleo em `--primary` e `--ring`.
2. Cor de destaque (accent / item atual / foco) = DOURADO `hsl(39 41% 51%)` (#b8924d). Substitui o ciano em `--accent`.
3. Status semânticos PRESERVADOS: verde sucesso, âmbar (limite/atenção), vermelho (erro/excede). Não viram marinho.
4. Tipografia: título de página e rótulos de KPI em fonte de INSTRUMENTO **"Archivo"** (grotesca de formas levemente quadradas, combina com "gosto de quadrado"); corpo e dados em **"Inter"** (já presente). APOSENTAR as serifas Cinzel/Cormorant das telas de trabalho (eram a "fonte inadequada" que o CEO apontou no Dashboard).
5. Tudo quadrado: LEDs e luzes deixam de ser círculo (`border-radius: 9999px` -> `2px`); avatares, bolinhas de cor de substância, badges-pílula e barras de progresso deixam de ser redondos (`rounded-full` -> `rounded-[2px]`/`rounded-[3px]`).
6. Barras: barras de progresso quadradas; preferir segmentadas onde for KPI principal (progresso de protocolo).

## Requisitos exatos (numerados, conferíveis)

### R1 — Fundação de tokens (artifacts/padcom/src/index.css)
- R1.1 `:root` — `--primary: 214 54% 19%`, `--primary-foreground: 0 0% 100%`, `--ring: 214 54% 19%`.
- R1.2 `:root` — `--accent: 39 41% 51%`, `--accent-foreground: 214 54% 12%` (texto escuro sobre dourado).
- R1.3 `:root` — `--chart-1` (era ciano) -> marinho `214 54% 19%`; `--chart-2` (era petróleo) -> dourado `39 41% 51%`. Charts 3/4/5 (âmbar/vermelho/roxo) intactos.
- R1.4 `.dark` — espelhar: `--accent` dourado; `--ring`/`--chart` coerentes; `--primary` do dark continua claro (usado como cor clara sobre fundo escuro) — NÃO quebrar contraste do tema escuro.
- R1.5 Manter o bloco `.pw-home` funcionando, mas sem serifa: `--pw-title` e `.pw-client-name` passam a usar a fonte display (Archivo), não Cinzel/Cormorant. Como o global já fica navy/gold, o `.pw-home` deixa de ser a única fonte do tema (sem regressão visual no Dashboard).

### R2 — Botões na cor marinho clássico (index.css, classes unlayered)
- R2.1 `.btn-3d` (ação primária) passa de gradiente teal para gradiente MARINHO com fio dourado: `border-color: rgba(184,146,77,0.55)`, `background: linear-gradient(180deg,#22406a 0%,#16294a 52%,#0a1f3a 100%)`, `color:#fff`. Brilho de hover muda de ciano para dourado.
- R2.2 `.btn-3d-soft` (secundário) mantém marfim/branco; texto usa `hsl(var(--primary))` (já vira marinho); brilho de hover ciano -> dourado.
- R2.3 `.btn-3d-ok` (verde sucesso "aceito/concluído") permanece verde — é estado terminal, não compete com primário.
- R2.4 Critério: TODO botão de ação primária renderiza em marinho; nenhum botão primário fica teal/ciano. (Verificar por screenshot em pelo menos Dashboard, Orçamentos/novo, Protocolos, Agenda, Prescritor de Exames.)

### R3 — Luzes e cantos quadrados (index.css)
- R3.1 `.paxter-led` `border-radius: 9999px` -> `2px` (luz quadrada). LED default ciano -> dourado (`--led-glow` e gradiente em tom dourado); âmbar/verde/vermelho mantêm cor (semântica).
- R3.2 `.paxter-underglow::after` e `.neon-hover::after`: cor do glow ciano -> dourado; `border-radius` para valor pequeno (`4px`) por princípio.
- R3.3 `.paxter-attention` outline ciano -> dourado.
- R3.4 `@keyframes paxterTierGlow` e `.btn-3d:hover` glow ciano -> dourado.

### R4 — Primitivos redondos -> quadrados (components/ui)
- R4.1 `avatar.tsx`: `rounded-full` -> `rounded-[3px]` (raiz e fallback).
- R4.2 `progress.tsx`: `rounded-full` -> `rounded-[2px]`.
- R4.3 `slider.tsx`: thumb redondo -> `rounded-[2px]` (mantém função; só a forma muda).
- R4.4 NÃO mexer em `radio-group.tsx` (o círculo é semântica de rádio; trocar confundiria com checkbox), `carousel.tsx`, `scroll-area.tsx`, `drawer.tsx` (alça) — registrados como exceção.

### R5 — Elementos redondos nas páginas (sweep por arquivo)
- R5.1 `dashboard.tsx` bolinhas de cor de substância (`w-6 h-6 rounded-full`) -> quadradinho `rounded-[3px]` (Padrão 13 da skill).
- R5.2 `protocols/index.tsx` badge-pílula (`rounded-full`) -> `rounded-[3px]`; barras de progresso (`rounded-full`) -> `rounded-[2px]`; gradiente teal/ciano -> marinho/dourado.
- R5.3 `protocols/detail.tsx` barras de progresso (`rounded-full`) -> `rounded-[2px]`; gradientes `hsl(180 30% 28%)->hsl(187 72% 48%)` -> `hsl(214 54% 19%)->hsl(39 41% 51%)`. Cor por substância (`item.substanceColor`) mantida (identidade do item).
- R5.4 `agenda/index.tsx` círculo de estado-vazio (`concave-3d p-6 rounded-full`) -> `rounded-[6px]`.
- R5.5 Demais arquivos com `rounded-full` (prescricao, substances/shared, clients/*, portal, anamnese, area, nursing-assessment-form, VitrineCard, orcamentos/novo): avaliar caso a caso; converter bolinhas/avatares/badges/barras para quadrado; manter só onde for ícone redondo legítimo (ex.: logo, spinner). Registrar o que manteve e por quê.

### R6 — Cores fixas hardcoded -> tokens/marca (sweep)
- R6.1 Trocar `#3D7A7A` e `#45B8CC` (e minúsculas) nos arquivos `protocols/detail.tsx`, `substances/SubstanceEditSheet.tsx`, `prescricao/index.tsx`, `orcamentos/VitrineCard.tsx` por marinho/dourado ou por `hsl(var(--primary))`/`hsl(var(--accent))`, conforme o papel (estrutura=marinho; destaque=dourado). Cor de substância individual permanece.

### R7 — Relevo 3D faltante (sweep por tela, "como médico-operador")
- R7.1 Em cada tela, cabeçalho de página em painel saliente com ícone em bevel; números/KPI em insert (`screen-3d`); campos de entrada em `field-engraved`; textos de ajuda em `concave-3d`; blocos com `border rounded-md` -> `panel-3d`/`panel-3d-sub`; botões `variant="outline"`/teal -> `btn-3d`/`btn-3d-soft`.
- R7.2 Telas no escopo do sweep (ordem de operação clínica): Dashboard, Clientes (lista/detalhe/novo/editar), Protocolos (lista/novo/detalhe), Agenda, RAS (lista/detalhe), Prescritor de Exames (já feito), Prescrição, Mega Anamnese, Orçamentos (lista/novo/apresentação/parametrização/vitrine), Financeiro, Estoque, SNCR, Substâncias, Catálogos, Cadastros (Exames já feito / Listas), Profissionais, Farmácias. (Portal e Anamnese são telas públicas do cliente — manter coerência mas baixa prioridade.)
- R7.3 Alinhamento e posicionamento (queixa do CEO): conferir colunas alinhadas, slots de posição fixa (Padrão 12/13), respiro entre peças 3D (Padrão 8). Anotar o que estava "fora de alinhamento" e corrigir.

### R8 — Tipografia aplicada
- R8.1 `index.html`: carregar Archivo (pesos 500-800); pode remover Cinzel/Cormorant se nenhuma tela depender mais delas.
- R8.2 `index.css`: definir `--app-font-display: "Archivo"`; aplicar a `h1`/títulos de página e rótulos de KPI (uppercase + tracking). Corpo segue Inter. Números com `tabular-nums`.

## Casos extremos a tratar
- C1 Dourado tem baixo contraste em texto pequeno sobre branco: usar dourado em FUNDOS/bordas/realces e texto escuro sobre dourado; nunca texto dourado miúdo em branco.
- C2 Tema escuro: cada classe 3D tem variante `.dark` — ao mexer em cor, mexer nas duas; conferir que o dark não fica ilegível.
- C3 Não confundir os DOIS verdes: petróleo aposentado; verde-sucesso (`btn-3d-ok`) permanece só para "aceito/concluído".
- C4 LED dourado (atual/foco) x âmbar (limite): manter âmbar nitidamente mais brilhante para não colar com o dourado.
- C5 Não quebrar layout ao trocar `rounded-full` (algumas barras dependem de `overflow-hidden`); manter as demais classes.

## Definição de PRONTO
- P1 Todos os requisitos R1-R8 cumpridos e conferidos pelo architect (Fase 3 do loop).
- P2 Validação real por screenshot das telas-chave (Dashboard, Clientes, Protocolos, Agenda, Orçamentos/novo, Estoque, Financeiro, Substâncias) mostrando: botões marinho, luzes/cantos quadrados, fonte de instrumento, sem verde-petróleo nem ciano residual nos elementos de marca.
- P3 Nenhuma linha vermelha violada (motor/payload intactos).
- P4 Comunicação final ao CEO em Densidade B com "RESUMO EM 1 LINHA".

## Linhas vermelhas (não cruzar)
- L1 NUNCA alterar motor de cálculo, queries, mutations ou payload (`/api/budgets/calculate`, `salvar()`, geração de PDF, motor da grade RAS FAP). Só apresentação.
- L2 NUNCA trocar cantos quadrados por arredondados infantis; NUNCA remover o relevo 3D dos paineis/sub-paineis (é a essência).
- L3 Cor de substância individual (`substanceColor`) é identidade do item — não padronizar para marinho.
- L4 Status semânticos (verde/âmbar/vermelho) não viram marinho.
- L5 Não inventar requisito fora desta spec; escopo extra = nova spec.
