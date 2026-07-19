# SPEC VISUAL — Painel "Como Funciona" com Glossário Técnico + Leigo

**Data:** 19/07/2026 | **Agente:** Dr. Replit Paxter | **Status:** ESPECIFICADO

---

## Objetivo
Criar dentro da aba Integrações um painel visual explicativo que mostra como cada integração funciona, com o termo técnico + a tradução em linguagem de leigo + um exemplo prático, para que o CEO consiga entender e explicar o sistema a qualquer pessoa.

---

## Requisitos obrigatórios

1. **Seção "Como Funciona — Guia do CEO"** dentro de `AbaIntegracoes`, antes do painel de métricas.
2. **Tabela de Glossário**: 3 colunas — "Termo Técnico" | "O que é (em português simples)" | "Exemplo real no sistema". Linhas cobertas:
   - Webhook → "Campainha digital" → "O Trello toca a campainha quando um card é movido"
   - API → "Garçom digital" → "O sistema pede ao WhatsApp para entregar a mensagem"
   - Token / Secret → "Senha de cofre" → "TRELLO_API_KEY é a senha que abre o cofre do Trello"
   - Board → "Quadro de tarefas" → "O board do Trello tem colunas: A Fazer, Em Andamento, Feito"
   - Card → "Post-it digital" → "Cada atendimento gera um card no Trello com o resumo"
   - Graceful degradation → "Plano B automático" → "Se o Trello não está configurado, o sistema avisa mas não trava"
   - Sandbox → "Área de treino" → "O WhatsApp sandbox é para testes — não envia para qualquer número"
   - Fire-and-forget → "Despachar e esquecer" → "A boas-vindas é enviada em segundo plano — o cadastro não espera"
3. **Fluxo visual de integração** (blueprint com setas): mostrar o caminho completo de uma interação:
   ```
   Cliente cadastrado → Aurora ADM envia WPP boas-vindas → Agente inicia conversa →
   Card criado no Trello → Dashboard registra tudo → CEO vê métricas ao vivo
   ```
   Renderizado como uma linha de steps com ícones e setas (CSS puro, sem biblioteca de diagrama).
4. **Seção "Estado atual do seu sistema"**: resumo das 3 integrações com semáforo (verde/vermelho/amarelo) + texto simples:
   - WhatsApp: "✅ Pronto para usar — Twilio conectado"
   - Trello: "⚠️ Aguardando configuração — 3 secrets faltando"
   - Histórico: "✅ Ativo — conversas sendo salvas automaticamente"
5. **Design**: seguir skill-layout-paxter (panel-3d-sub, bevel-3d, cores da marca). Tabela com cabeçalho pastel navy. Texto dos termos técnicos em `font-mono` ciano. Texto leigo em branco normal.

---

## Definição de PRONTO

- [ ] Glossário com 8 linhas renderizado em tabela emoldurada.
- [ ] Fluxo visual com setas visível.
- [ ] Semáforo de estado atual reflete dados reais do backend.
- [ ] Screenshot aprovado.

---

## Linhas vermelhas

- NÃO usar bibliotecas externas para o fluxo visual (CSS puro).
- NÃO inventar estados que o sistema não reporta.
