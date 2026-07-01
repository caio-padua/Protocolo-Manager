---
name: Marcacao de consulta — pele travada por tema
description: Qual mockup vale para claro e para escuro na tela de marcacao de consulta (decisao do CEO).
---

# Marcacao de consulta — pele por tema (travada 01/07/2026)

O CEO Dr. Caio escolheu combinar duas peles aprovadas, uma por tema:

- CLARO  = variante "A · Editorial" (grupo `marcacao-fusao`, `FusaoEditorialClaro.tsx`).
- ESCURO = variante "Carteira" concierge (grupo `marcacao-concierge`, `ConciergeCarteiraEscuro.tsx`).

**Why:** o CEO comparou ENTREGA 42 (Editorial) e ENTREGA 43 (Concierge) no Canvas e gostou
do Editorial no claro e do cartao-membro navy+ouro (DNA "Via Concierge") no escuro.

**How to apply:** ao virar rota real (`/agendar` interno) ou nova onda de marcacao, usar
essas duas peles como baseline, uma por tema — nao propor outra sem ordem do CEO. Nao
negociavel: Corpo Medico separado das outras categorias; cartao do Dr. Caio maior/mais
largo com irmaos uniformes (componente unico); no escuro o cartao do Dr. Caio e "black
card" navy+ouro. Detalhe completo em `specs/marcacao-consulta.md` (bloco "DECISAO TRAVADA").
