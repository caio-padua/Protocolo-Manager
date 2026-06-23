---
name: Pivot navy/ouro nas telas do Manager (padcom)
description: Regra de cor para todo o app padcom apos o pivot navy/ouro — o que e chrome de marca (morre verde) e o que e status (verde sobrevive); cupula unica; toggle de tema.
---

# Marca Paxter navy/ouro no app real `artifacts/padcom`

Lei promulgada em 23/06/2026 (CEO Dr. Caio). A marca passou a ser **navy + ouro**. Verde-petroleo
(`#3D7A7A`) e ciano (`#45B8CC`) deixaram de ser chrome de marca.

## Regra de cor (a fronteira que sempre confunde)
- **CHROME de marca** (sidebar, header, CTA primario, molduras, aneis, wordmark): navy + ouro. ZERO
  `teal-*`, ZERO `#3D7A7A`/`#45B8CC`. Conferir por `rg "teal-|#3D7A7A|#45B8CC"` em `*.tsx/*.ts`
  (CSS guarda so aliases ja mapeados).
- **STATUS / dado** (sobrevive como cor, NAO e marca): verde=concluido/ok/pago/ativo/economia,
  ambar=limite, vermelho=erro, ciano=etapa atual, azul=`validated`. `emerald-*` permanece legitimo
  nesses contextos e em paletas CATEGORICAS de dados (ex.: body-system, tipos de formula).
- **Armadilha**: `emerald` aparece em ~17 arquivos como STATUS — NAO trocar em massa por `green`
  (ambos renderizam verde, troca e ruido com risco de regressao). So `teal`/petroleo eram o
  verde-de-MARCA real a matar.

**Why:** o CEO listou "matar teal/emerald" mas tambem "manter verde=done". A leitura correta e:
`teal`/petroleo = marca (morre); `emerald`/green usado como estado/categoria = status (fica). Tentar
zerar emerald global quebra semantica de sucesso sem ganho visual.
**How to apply:** ao varrer cor, separar por CONTEXTO (chrome vs status), nao por literal cru. Onde
teal aparecia em paleta categorica, recolorir para `cyan`/`sky` (mantem distincao, sem verde).

## Cupula do simbolo — fonte unica
- Simbolo SEMPRE dentro de `components/layout/paxter-fx/PaxterSymbolGlass.tsx` (medalhao de vidro).
  Props `size` e `tone` (`dark` p/ fundo escuro, `light` p/ fundo claro). Unica excecao: site publico
  `abertura.tsx` (variant `hero`, chapado). Documentado no Padrao 14 da skill-layout-paxter.
- Wordmark `PaxterWordmarkPremium.tsx` NAO monta glint/craquelado (so ouro 3D limpo). O motor de luz
  (faisca/aura) vive SO no simbolo (`PaxterSymbolPremium.tsx`), aprovado.

## Toggle de tema claro/escuro (telas do cliente)
- `components/theme/useScreenTheme.ts` (chave localStorage `paxter.theme`) + `ThemeToggle.tsx`;
  aplica classe `.dark` no wrapper da tela; tokens `.dark` do index.css respondem. Hoje em
  `anamnese-v2` e `agendar`.
- **Truque de verificacao** (so para screenshot, SEMPRE reverter depois): no topo de `readTheme()`
  por `return "dark";` para forcar o tema escuro, screenshotar, e desfazer. localStorage nao persiste
  entre sessoes de screenshot.
