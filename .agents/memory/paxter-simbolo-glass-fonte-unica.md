---
name: PaxterSymbolGlass — fonte única do medalhão de vidro
description: Onde e como o efeito "vidro cobrindo o símbolo da marca" deve viver; tom por fundo; exceção do site; símbolo decorativo.
---

# Medalhão de vidro do símbolo PAXTER

Regra de marca (decisão do CEO, 23/06/2026): o efeito **medalhão de vidro nítido
cobrindo o símbolo premium** vale para TODOS os símbolos da marca — internos
(sidebar) e externos (anamnese antiga, /anamnese/v2, portal, área, agendar, entrada).
**Única exceção: o SITE público (`abertura.tsx` / variant `hero`)**, que segue o
símbolo chapado (`paxter-symbol.png`), sem vidro.

**Why:** o CEO quer a mesma assinatura visual em toda a experiência (interna e do
cliente); divergência inline (cada tela com seu próprio quadradinho/vidro/letra "P")
gera inconsistência e retrabalho. O site é a única superfície "cartaz", proposital
chapada.

**How to apply:**
- Existe UMA fonte: `components/layout/paxter-fx/PaxterSymbolGlass.tsx`. Ele envolve
  `PaxterSymbolPremium` (símbolo com aura+faixa+faísca) num medalhão de vidro.
- Props: `size` (px do símbolo; padding e raio escalam proporcionais — pad≈size*0.2,
  raio≈size*0.28) e `tone`:
  - `tone="dark"` → miolo navy. Usar em QUALQUER fundo escuro
    (sidebar navy, headers das telas externas, splash da entrada).
  - `tone="light"` → miolo ESPRESSO quente (marrom-café, gradiente `#2a2113`→`#160f06`).
    Usar SÓ em fundo claro (anamnese /v2: gate branco, BrandMark e cabeçalhos compactos).
- ARMADILHA (corrigida 24/06/2026): o componente IGNORAVA `tone` (`void tone`, miolo navy
  sempre) → no perfil claro o medalhão saía AZUL e destoava do creme. O `tone` agora é
  honrado. O miolo light NÃO é champanhe puro: o símbolo (PNG `mix-blend-mode: screen`)
  precisa de fundo ESCURO p/ o ouro saltar; champanhe puro o apagaria. Espresso resolve:
  fundo escuro o bastante p/ o screen + tom quente que harmoniza com creme/ouro (Hermès).
- O `tone` vai SEMPRE no wrapper (PaxterSymbolGlass), NUNCA no PaxterSymbolPremium; quem
  desenha (ex.: BrandMark) deve repassar `tone={theme==="dark"?"dark":"light"}`.
- Verificado por screenshot (24/06/2026): medalhão claro espresso (sem azul) e escuro navy,
  símbolo nítido nos dois.
- NÃO recriar o medalhão inline (quadradinho com bg/border/box-shadow + `<img>` cru ou
  letra "P"). Sempre plugar o componente.
- Acessibilidade: o símbolo é DECORATIVO (`PaxterSymbolPremium` tem `aria-hidden` no
  root + `alt=""`). Em todo uso ele vem ao lado do texto "PAXTER" visível, que já
  carrega o nome para o leitor de tela — não duplicar com `alt="PAXTER"`.
- `branding/PaxterLogo.tsx`: variants `appHeader` e `compact` consomem o componente;
  o variant `hero` (site) continua com o `symbol` chapado. O CSS antigo
  `.pax-lockup--compact .pax-symbol` foi removido (compact não usa mais essa classe).
