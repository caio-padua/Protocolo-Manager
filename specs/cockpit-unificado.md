# SPEC: Cockpit de Consulta Unificado v2
**Data:** 23/07/2026  
**Onda:** Fusão Cockpit + Cadastro — Paxter Loop FASE 2 CONSTRUIR  
**Status:** CONSTRUINDO  

## Objetivo
Transformar o Cockpit da Consulta (/cockpit-cliente) na ÚNICA tela do cliente:
- 7 abas existentes intactas
- 3 novas abas transplantadas do clients/detail.tsx: Protocolos, Financeiro, Cadastro
- Nav sticky (fixo durante scroll)
- Bevel 3D (skill-layout-paxter) em toda a UI nova
- REGRA DIAMANTE: 1 único cockpit; detail.tsx intacto no código mas rota redireciona

## Design (julho 2026)
- Nav bar: `sticky top-0 z-50` — wraps header + tab rail juntos
- Accordion: Protocolos expandem por clique (sessões da onda)  
- Bevel 3D: panel-3d-sub para cards, bevel-3d para badges/rótulos, concave-3d para inputs
- Tema: CLARO (cream hsl(40 33% 96%)), header navy fixed
- KPI row em cada aba nova: números grandes em screen-3d

## 3 arquivos tocados
1. cockpit-cliente/index.tsx — transplante dos 3 órgãos + sticky + accordion
2. App.tsx — /clients/:id → redirect para /cockpit-cliente?cliente={id}
3. Layout.tsx — remove entrada "Cockpit (formato antigo)" do menu

## Problema Hassan (exames sem cliente)
- Exames importados pelo Drive watcher podem chegar sem clientId (cliente não cadastrado)
- Aba Exames mostra banner de alerta se existirem registros órfãos (sem vínculo)
- Duas vias de entrada visíveis na aba: portal do cliente + Drive watcher

## Regra de Ouro
- clients/detail.tsx: INTACTO (código permanece, rota redireciona)
- cockpit/index.tsx: INTACTO (rota /cockpit permanece acessível)
- Nenhum arquivo deletado nesta onda
