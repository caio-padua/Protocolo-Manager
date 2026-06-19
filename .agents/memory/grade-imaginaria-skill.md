---
name: Grade Imaginaria — modelo mental de card
description: Skill permanente de layout criada pelo Paxter Loop em 19/06/2026; captura o principio das zonas empilhadas e slots fixos que faz o CEO extrair informacao em uma unica olhada.
---

# Grade Imaginaria — Skill de Layout

## A regra

Um card bem construido cria linhas horizontais e verticais IMPLICITAS pela regularidade das zonas.
O CEO (TDAH) pousa o olhar uma vez e extrai tudo. Sem a grade, os campos saltam de posicao com o conteudo.

## As 5 zonas canonicas (de cima para baixo)

1. **TOP BAR** — altura fixa; contem: icone+horario · seq (Sem. X) · menu (ml-auto). Nunca cresce.
2. **TITULO** — nome em linha propria, `font-black uppercase truncate`.
3. **IDENTIDADE** — [CPF/ID concave-3d] + [BADGE STATUS concave-3d] na MESMA linha. Badge nunca ao lado do nome (posicao varia com comprimento do nome).
4. **META GRID** — `grid-cols-N` fixo. `MetaField` sempre presente: vazio = "—", nunca some.
5. **CONTEUDO** — sulco `concave-3d` com linhas em `grid-cols-[template fixo]`.

## Faixa lateral de status

Maxima 4–6px (`w-1` ou `w-1.5`). Nunca um bloco largo que comprime conteudo.

## LED proibido em contagem/titulo

`paxter-led-on` so para status binario on/off de ITEM. Em contagem de sessoes ("1 sessao") ou titulo de secao: contagem estatica em `concave-3d`. Razao: CEO confunde "1 sessao" com "primeira sessao" quando ha animacao.

## Onde esta documentado

- Referencia completa (diagrama ASCII + receita JSX + anti-padroes + checklist 10 pontos): `.agents/skills/skill-layout-paxter/references/grade-imaginaria.md`
- Spec do loop: `specs/grade-imaginaria-layout.md`
- Codigo Paxter: Art. 54 (Titulo X) em `.agents/skills/paxter-loop/CODIGO-PAXTER.md`
- SKILL.md atualizado: Padrao 12/13 com referencia cruzada + fluxo de uso atualizado

**Why:** aprendizado direto da reforma da Agenda Semanal (19/06/2026) — o redesenho resolveu: badge saltando de posicao, horario comprimindo o nome, LED confundindo contagem com "primeira sessao", separador invisivel, dropdown duplicado.

**How to apply:** ao criar QUALQUER card ou lista de itens, ler `grade-imaginaria.md` ANTES de escrever o JSX. Vale para Manager, IHE e sistemas primos.
