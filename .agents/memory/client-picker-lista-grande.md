---
name: Seletor de lista grande (ClientPicker)
description: Combobox de cliente com milhares de itens — "ver todos" exige navegar, não só buscar
---

Seletor de cliente reutilizável (`ClientPicker`, Popover + cmdk `Command` com
`shouldFilter={false}`) usado no Cockpit e em Exames do Cliente, sobre ~5.270 clientes.

**Regra:** quando o CEO pede "ver todos os clientes em ordem alfabética", um teto rígido
de N itens (ex.: `slice(0,120)`) REPROVA — ele quer *navegar* a lista inteira, não só
os que casam com a busca digitada. Solução sem dependência nova: rolagem incremental
(carrega em lotes de 200 no `onScroll` da `CommandList`), preservando navegação
alfabética completa. Virtualização (react-virtual/window) seria o ideal, mas não há lib
instalada — não adicionar sem ordem.

**Why:** "buscar" e "navegar/folhear" são requisitos diferentes; o architect pegou que
o corte fixo mascarava o mesmo bug do antigo `slice(0,200)` do Cockpit.

**How to apply:** em qualquer picker de coleção grande, precompute a chave de busca sem
acento uma vez (`normalize NFD`), ordene com `localeCompare("pt-BR")`, e revele por
scroll incremental em vez de teto fixo. `cmdk` com `shouldFilter={false}` deixa você
controlar filtro/janela; `CommandList` encaminha `ref`/`onScroll` via `{...props}`.
