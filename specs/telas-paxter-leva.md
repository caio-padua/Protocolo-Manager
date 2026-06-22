# SPEC — Leva de telas PAXTER (Anamnese + Consulta) com combo travado

Data: 22/06/2026. Dono: Dr. Replit Paxter. Método: Paxter Loop (esta spec ANTES de construir).

## Objetivo
Entregar 5 mockups mobile na linguagem PAXTER, com o COMBO travado pelo CEO, para o CEO
comparar e bater o martelo. Cada tela é um protótipo (mockup), não a tela real ligada à lógica.

## Combo travado (eixos S/F/B/L)
| Eixo | Escolha | O que é |
|---|---|---|
| S — Símbolo | S1 | Símbolo atual (PNG real), com o flash percorrendo o TRAÇADO do desenho |
| F — Frase | F3 | Tagline serif itálico dourado, com efeito de "escrita" (luz percorre a frase) |
| B — Botão | B2 | Botão dourado polido (o do "Exemplo 2"), 2D mais nítido, bevel-up forte, neon + hover |
| L — Layout | L cartões soltos | Cartões separados que leem como PAINÉIS em bevel saliente, sombra BEM delimitada (não espalhada) |

## Efeito de "escrita" (flash que percorre o traçado) — JÁ DECODIFICADO
Motor reutilizável: `artifacts/mockup-sandbox/src/components/mockups/_shared/traceFlash.tsx`.
- O símbolo é descrito como CAMINHOS SVG (atributo `d`) = as coordenadas de cada traço (o trabalho de formiguinha).
- `pathLength={100}` normaliza o comprimento; não precisa medir em JavaScript.
- "Escrita" = `stroke-dasharray:100` + `stroke-dashoffset` de 100 (invisível) a 0 (desenhado).
- "Flash" = um tracinho curto e brilhante correndo pelo MESMO caminho, em loop.
- Data-driven: recebe `d`, então o MESMO efeito é replicável em qualquer símbolo/logo/frase.
- Já existe `PAXTER_SYMBOL_PATH` = contorno REAL do símbolo (vetorizado do PNG), e `PaxterGlintPremium`
  = brilho de ouro correndo o traçado real POR CIMA do PNG 3D (mix-blend plus-lighter).
- Frase (F3): aplicar o mesmo princípio de "ser escrita" — revelação/luz da esquerda p/ direita.

## Os 5 entregáveis
1. Anamnese — ESCURA (navy #0d1830 + ouro)
2. Anamnese — CLARA (papel creme + tinta navy + ouro) — tema NOVO, a construir
3. Consulta/Agendar — ESCURA
4. Consulta/Agendar — CLARA
5. Mistura do agente (5º) — combinação autoral do melhor dos quatro

## Itens a construir/ajustar
- pbtn-2: deixar 2D mais nítido + bevel-up mais alto + neon no hover (refino sobre o existente).
- panel-3d (layout L): sombra mais delimitada (offset curto, blur menor), bevel mais saliente.
- Tema CLARO: paleta nova (creme/papel, tinta navy, ouro) mantendo relevo 3D e legibilidade.
- F3 com efeito de escrita aplicado (hoje F3 é só serif itálico estático).
- Aplicar S1 + flash-traçado no header das telas (glint sobre o PNG real).

## Fora de escopo (não construir agora)
- Ligar lógica real (skip-logic da anamnese, agendamento real Google Calendar).
- Transformar as telas REAIS do app (só depois da aprovação do mockup).

## Definição de pronto
- 5 frames ao vivo no Canvas (ENTREGA nova, selo numerado), mobile 390.
- Combo aplicado igual em todas; flash-traçado visível no símbolo e na frase.
- Revisão com architect sem pendência grave.
