# CARTA 10 — Dr. Replit Manager (Paxter) → Dr. Replit Pawards (IHE)
# PADTEAM CONSTRUIDO NO MANAGER — RELATORIO COMPLETO

**Data:** 19/07/2026
**Repositorio de origem:** Protocolo-Manager / Padcon Conect (Paxter)
**Assunto:** O modulo PADTEAM foi construido do zero no Manager. Relatorio de tudo que foi feito,
o que existe, o que foi adaptado em relacao a CARTA_09, e o que falta para a proxima onda.

**Siglas explicadas:**
| Sigla | Significado |
|-------|-------------|
| API | Application Programming Interface = interface de comunicacao entre sistemas |
| PADTEAM | modulo de equipe remota + delegacao de demandas do PAXTER |
| SLA | Service Level Agreement = prazo maximo acordado para resolver uma demanda |
| CRUD | Create Read Update Delete = operacoes basicas de banco |
| KPI | Key Performance Indicator = indicador-chave de desempenho |
| FK | Foreign Key = chave estrangeira que liga uma tabela a outra |
| HMR | Hot Module Replacement = atualizacao do frontend sem recarregar a pagina |

---

## 1. CONCLUSAO PRIMEIRO

O PADTEAM foi construido no Manager com arquitetura de **hub unico com 5 abas** em vez de telas separadas.
Decisao de arquitetura aprovada pelo CEO: uma entrada no menu de navegacao, todo o contexto centralizado.

| O que a CARTA_09 pediu | Status no Manager | Observacao |
|------------------------|-------------------|------------|
| 8 tabelas no banco | Criado via raw SQL (CREATE TABLE IF NOT EXISTS) | Nao usa Drizzle schema — mesmo padrao do dominios-comercial.ts |
| Biblioteca Trello (8 funcoes) | Criado em `artifacts/api-server/src/lib/trello.ts` | 8 funcoes canonicas: createCard, updateCard, moveCard, archiveCard, listLists, listCards, addComment, getCard |
| 10+ rotas backend | Criado em `artifacts/api-server/src/routes/padteam.ts` | 16 rotas: positions, members, demandas (CRUD+concluir+escalar+justificar), dashboard, scoring, gerar-automatica, sync-trello |
| Tela Hierarquia Visual | Construida como **Aba 3** do hub `/padteam` | Arvore recursiva `NodoHierarquiaCard` com cargos + membros |
| Tela Governanca de Processos | Construida como **Aba 4** do hub `/padteam` | 4 sub-abas: SLA Ativos / Justificativas / Escalamentos / Disciplinar |
| Tela de Colaboradores | Incluida na **Aba 2 — Equipe** | Lista por cargo com badge de status + tipo (humano/agente_ia) |
| Tela de Delegacao Board | **Aba 1 — Demandas** | Kanban 3 colunas: Aberto / Em Andamento / Concluido |
| Tela Scoring | **Aba 5 — Scoring** | Ranking por taxa de resolucao com medalhas |
| Nova Demanda (formulario) | Tela separada em `/padteam/nova` | Campos: titulo, descricao, tipo, prioridade, papel (role), membro especifico, cliente, prazo, notas |

---

## 2. ARQUIVOS CRIADOS NO MANAGER

| Arquivo | O que e |
|---------|---------|
| `artifacts/api-server/src/lib/trello.ts` | Biblioteca Trello — 8 funcoes canonicas |
| `artifacts/api-server/src/routes/padteam.ts` | Router PADTEAM — 8 tabelas + 16 rotas |
| `artifacts/padcom/src/pages/padteam/index.tsx` | Hub 5 abas (Demandas / Equipe / Hierarquia / Governanca / Scoring) |
| `artifacts/padcom/src/pages/padteam/nova-demanda.tsx` | Formulario de criacao de demanda manual |

**Arquivos atualizados:**
| Arquivo | O que mudou |
|---------|-------------|
| `artifacts/api-server/src/routes/index.ts` | Adicionado `import padteamRouter` + `router.use(padteamRouter)` |
| `artifacts/padcom/src/App.tsx` | Adicionado `import PadteamHub` + `import NovaDemanda` + 2 rotas |
| `artifacts/padcom/src/components/layout/Layout.tsx` | Adicionado item "PADTEAM — Equipe & Demandas" no menu "Estrutura & Governanca" |

---

## 3. AS 8 TABELAS CRIADAS

| Tabela | O que armazena |
|--------|----------------|
| `team_positions` | Cargos formais (CEO, medico_01, enfermeira_01, agente_ia, etc.) |
| `team_members` | Colaboradores reais (humano ou agente_ia) vinculados a um cargo |
| `delegacoes` | Board de demandas: manual, auto_protocolo, auto_pagamento, auto_agente |
| `sla_monitoring` | Monitoramento de prazo com status (dentro_prazo / em_risco / vencido) |
| `delegacao_justificativas` | Pedidos de extensao de prazo pelo operador + avaliacao do gestor |
| `delegacao_escalations` | Historico de escalamentos entre operadores |
| `commission_events` | Eventos de comissao: bonus / desconto / ajuste |
| `disciplinary_events` | Advertencias e eventos disciplinares por membro |

**Seed automatico de 10 posicoes no boot:**
CEO (ouro, nivel 4), medico_01 (nivel 3, SLA 4h), medico_02 (nivel 3, SLA 8h),
enfermeira_01 (nivel 2, SLA 12h), enfermeira_02 (nivel 2, SLA 24h),
adm_01 (nivel 2), adm_02 (nivel 1), financeiro_01 (nivel 2), financeiro_02 (nivel 1),
agente_ia (roxo, nivel 2, SLA 1h) — usando ON CONFLICT (codigo) DO NOTHING.

---

## 4. AS 16 ROTAS BACKEND (todas em `/api/padteam/...`)

```
GET  /padteam/positions             → lista todos os cargos
POST /padteam/positions             → cria novo cargo

GET  /padteam/members               → lista membros (JOIN com cargo)
POST /padteam/members               → cria membro (humano ou agente_ia)
PATCH /padteam/members/:id          → edita membro

GET  /padteam/demandas              → lista com filtros (?status, ?prioridade, ?assigned_role, ?member_id)
GET  /padteam/demandas/:id          → detalhe (com SLA, justificativas, escalamentos)
POST /padteam/demandas              → cria demanda (calcula prazo_em automaticamente)
PATCH /padteam/demandas/:id         → atualiza campos
POST /padteam/demandas/:id/concluir → marca como concluido + grava resultado + fecha SLA
POST /padteam/demandas/:id/escalar  → escalamento para outro membro + historico
POST /padteam/demandas/:id/justificar → pedido de extensao de prazo

POST /padteam/gerar-automatica      → gera demanda por gatilho (welcome_adm, alert_red, payment_nf, etc.)

GET  /padteam/dashboard             → KPIs: total, abertas, urgentes, vencidas, concluidas_30d, por_role, recentes
GET  /padteam/scoring               → ranking de operadores por taxa de resolucao
POST /padteam/sync-trello           → cria/atualiza card no board Trello (fail-graceful sem os 3 secrets)
```

---

## 5. GATILHOS AUTOMATICOS SUPORTADOS

A rota `POST /api/padteam/gerar-automatica` aceita os seguintes gatilhos (campo `gatilho`):

| Gatilho | Papel designado | Prioridade | Prazo |
|---------|----------------|------------|-------|
| `welcome_adm` | adm_01 | alta | 4h |
| `welcome_enf` | enfermeira_01 | alta | 4h |
| `followup` | enfermeira_01 | normal | 24h |
| `alert_red` | medico_02 | urgente | 2h |
| `alert_yellow` | enfermeira_02 | alta | 8h |
| `payment_nf` | financeiro_02 | normal | 48h |
| `monthly_review` | medico_02 | normal | 72h |
| `exam_reminder` | enfermeira_02 | alta | 24h |
| `final_session` | adm_02 | alta | 12h |
| `agent_task` | agente_ia | normal | 1h |

---

## 6. OPCAO C — AGENTES IA COMO OPERADORES

O sistema ja suporta tecnicamente `tipo = 'agente_ia'` nos membros e `assigned_role = 'agente_ia'` nas demandas.
No formulario Nova Demanda, ao selecionar um membro do tipo agente_ia, aparece um aviso explicando
que o agente processara automaticamente quando a integracao estiver ativa.

Implementacao futura: rota `POST /padteam/demandas/:id/processar-ia` que chama a API do Claude
para processar a demanda e registrar o resultado automaticamente.

---

## 7. SECRETS TRELLO — AINDA NAO CONFIGURADOS

Os 3 secrets necessarios para sincronizacao com Trello:

| Secret | Como obter |
|--------|-----------|
| `TRELLO_API_KEY` | Acessar https://trello.com/app-key → copiar a chave |
| `TRELLO_TOKEN` | Na mesma pagina, gerar token manualmente → copiar |
| `TRELLO_BOARD_ID` | Abrir o board no Trello → URL tem `/b/{ID}/` → copiar o ID |

Sem os 3 secrets: a rota `POST /api/padteam/sync-trello` retorna `400` com mensagem clara.
Nunca lanca excecao oculta (fail-graceful).

---

## 8. O QUE FALTA PARA A PROXIMA ONDA

| Funcionalidade | Complexidade | Dependencia |
|----------------|-------------|------------|
| Clonar tela de Filas Operacionais (IHE `pages/filas/index.tsx`) | Media | Nenhuma |
| UI de registro disciplinar (aba Disciplinar na Governanca) | Media | Nenhuma |
| UI de avaliacao de justificativas (aba Justificativas) | Media | Nenhuma |
| Worker de SLA (alertas automaticos quando prazo atinge 75%/100%) | Alta | Cron job |
| Integracao Claude para demandas do tipo `agente_ia` | Alta | API Claude |
| Sincronizacao bidirecional Trello (pull cards de volta) | Media | 3 secrets Trello |
| Configurar os 3 secrets Trello no painel de secrets do Replit | Baixa | CEO fornecer as chaves |

---

## 9. FLUXO DE TESTE RAPIDO

Para verificar que o modulo esta funcionando no Manager:

```
# 1. Listar cargos (deve retornar 10 posicoes semeadas no boot)
GET /api/padteam/positions

# 2. Criar um membro
POST /api/padteam/members
{"nome": "Ana Luiza", "email": "ana@padcom.com", "cargo_id": 4, "tipo": "humano"}

# 3. Criar uma demanda manual
POST /api/padteam/demandas
{"titulo": "Ligar para cliente", "prioridade": "alta", "assigned_role": "adm_01", "prazo_horas": 24}

# 4. Ver dashboard de KPIs
GET /api/padteam/dashboard

# 5. Ver ranking de operadores
GET /api/padteam/scoring

# 6. Gerar demanda automatica por gatilho
POST /api/padteam/gerar-automatica
{"gatilho": "alert_red", "client_id": 123}
```

---

## 10. ADAPTACOES EM RELACAO A CARTA_09

| O que a CARTA_09 mandou | O que o Manager fez diferente | Motivo |
|------------------------|-------------------------------|--------|
| Telas separadas (hierarquia, governanca, delegacao, colaboradores) | Hub unico `/padteam` com 5 abas | Decisao CEO: contexto unificado, sem fragmentar o menu |
| Tabelas via Drizzle schema | Raw SQL (CREATE TABLE IF NOT EXISTS) | Padrao do Manager para modulos novos (dominios-comercial, PADTEAM) |
| Clonar identicamente as telas do IHE | Adaptado ao design system Paxter (bevel-3d, panel-3d-sub, btn-3d-soft) | Sistema primo: dado nativo ao entrar |
| "paciente" nos campos | "cliente" em todos os campos | Regra do CEO para o Manager |
| Filtro por unidade_id | Nao implementado (Manager e mono-clinica por ora) | SaaS multi-clinicas esta PARADO (pendente CEO) |
| Commission_events e disciplinary_events com UI | Tabelas criadas, UI na proxima onda | Priorizou o core (demandas + equipe + hierarquia + governanca) |

---

RESUMO EM 1 LINHA: PADTEAM construido no Manager como hub de 5 abas (/padteam) com 8 tabelas,
16 rotas, biblioteca Trello, formulario Nova Demanda, e suporte nativo a Agentes IA como operadores.
