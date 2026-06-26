---
name: Área do Cliente — desejo IMPLÍCITO + faixas/marca
description: Regras do CEO para a home da Área do Cliente (motor de encantamento) — desejo implícito por descoberta, nunca upsell explícito; cabeçalho em faixas separadas.
---

# Área do Cliente — desejo IMPLÍCITO (CEO Dr. Caio, 26/06/2026)

Regra: o motor de desejo (planos/upgrade) é IMPLÍCITO, por DESCOBERTA. O cliente
clica e descobre. Proibido na home: bloco "COMPARE OS PLANOS", caixa de upgrade
aberta, e upsell com preço/economia ("economize R$ X/mês"). O CEO rejeitou a v2
por ser explícita demais.

**Como aplicar (home da Área do Cliente):**
- Planos viram um ÍCONE-COROA discreto (sem texto, sem preço). Ao tocar, revela os planos. Mistério é o ponto.
- Itens/benefícios premium fora do plano atual mostram um CADEADO dourado discreto — desperta curiosidade, sem dizer preço.
- Benefícios e a categoria do cliente ficam VISÍVEIS; o comparativo/upgrade fica ESCONDIDO atrás do ícone.
- Upgrade (contrato + link de pagamento Asaas) só DEPOIS da descoberta.

**Cabeçalho em 3 FAIXAS separadas (retângulos nítidos), nesta ordem:**
1. PAXTER (o SISTEMA) — com o "R" renderizado OFICIAL: `PaxterSymbolPremium` + `PaxterWord` (injetar `LOCKUP_STYLE`). Nunca o "R" desenhado à mão.
2. Nome + CPF.
3. "Bem-vindo, senhor Ricardo" — saudação SEMPRE com tratamento (senhor/senhora). O nome NUNCA fica embaixo do PAXTER.

**Outras travas visuais do CEO:**
- Retângulos harmônicos; progresso em SEGMENTOS retangulares; proibida barra arredondada/pill.
- Suportar protocolos em PARALELO (vários ativos, não "1").
- Textura de alfaiataria NAVY (terno escuro) nas faixas do sistema (ver `specs/marcacao-luxo-bordo-mocha.md`).
- O CEO GOSTA dos botões 3D (manter btn-3d / btn-3d-soft).

**Por quê:** luxo/exclusividade vende por insinuação, não por vitrine. O CEO quer
que o cliente "desperte" o desejo sozinho. Tela alvo real: `artifacts/padcom/src/pages/area.tsx`
(graduar depois). Mockup: `artifacts/mockup-sandbox/.../area-cliente/AreaCliente.tsx`.
