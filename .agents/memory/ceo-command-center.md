---
name: CEO Command Center + Pirâmide de Licenciamento
description: Tela Swipe SSE multi-tenant + schema da árvore de licenciamento (Cartas 05 e 07)
---

# CEO Command Center + Pirâmide

## Pirâmide de Licenciamento (Carta 05)

**Regra:** ALTER TABLE empresas ADD COLUMN (3 colunas) + CREATE TABLE arvore_licenciamento.
Nunca recriar — só ADD COLUMN.

Colunas adicionadas em `empresas`:
- `tipo_relacionamento` TEXT NOT NULL DEFAULT 'licenciada_direta' (propria / sub_unidade / licenciada_direta / licenciada_por_clinica)
- `parent_empresa_id` INTEGER REFERENCES empresas(id)
- `pode_sublicenciar` BOOLEAN NOT NULL DEFAULT FALSE

Tabela `arvore_licenciamento`: parent_id, child_id, tipo, percentual_royalty, valor_mensal, modelo_cobranca, ativo, autorizado_por_id, data_inicio, data_fim.
UNIQUE (parent_id, child_id).

Drizzle: `arvoreLicenciamentoTable` em `lib/db/src/schema/empresas.ts` (exportado pelo barrel).

## CEO Command Center

Rotas (requerem isPlatformOwner):
- `GET /api/ceo/resumo` — snapshot JSON de todas as empresas ativas
- `GET /api/ceo/stream` — SSE push a cada 30s (text/event-stream)

Frontend: `artifacts/padcom/src/pages/CommandCenter.tsx` → `/ceo/command-center`.
Menu: Estrutura & Governança → CEO Command Center (ícone Crown).

## Armadilhas descobertas

- **stockTable não existe** — nome real é `stockItemsTable` (pgTable "stock_items").
- **scheduledDate é TEXT** — armazena "YYYY-MM-DD" como texto; usar `eq(sessionsTable.scheduledDate, "YYYY-MM-DD")`, nunca `gte`/`lt` com Date.
- **SSE headers obrigatórios**: `X-Accel-Buffering: no` + `res.flushHeaders()` para nginx/proxy não bufferizar.

## Guard de módulos (Carta 06)

`artifacts/api-server/src/middleware/moduleGuard.ts` — fábrica `moduleGuard(moduloId)`.
- Platform owner: nunca bloqueado.
- `modulos_ativos` vazio/null: acesso total (legacy fail-open).
- `modulos_ativos[moduloId] === false`: bloqueia com 403.
- Erro de BD: fail-open (não bloqueia).

**Why:** Carta 06 identificou que o toggle de módulos na UI não bloqueava as rotas.
**How to apply:** `router.get("/exames", moduleGuard("exames_lab"), handler)`.
