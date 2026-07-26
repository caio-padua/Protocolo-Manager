# SPEC: ONDA 3 — MEDIÇÃO E PROVA DE VALOR (dias 14 a 45)
_Paxter Loop — Fase 1 (Especificar)_
_Data: 26/07/2026 | Autor: Dr. Replit Manager_
_Roda em paralelo com a Onda 2._

---

## Objetivo

Instrumentar o sistema para medir cada ação de valor que ele realiza, construir o registro imutável dessas ações (livro-caixa de consumo) e entregar o Painel de Prova de Valor — a tela que transforma 60 dias de operação real em argumento de venda auditável para a primeira safra de licenciados.

---

## Contexto e diagnóstico (lido do código)

**O que já existe e é suficiente para medir:**

| Tabela | O que já grava | O que falta |
|---|---|---|
| `dispatch_log` | canal, status, prescriptionId, createdAt | `empresa_id`, `custo_unitario`, `chave_idempotencia` |
| `mensageria_lembrete` | via, periodo, enviadoEm, status, tipo | `empresa_id`, `custo_unitario`, `chave_idempotencia` |
| `agente_messages` | conteúdo, role, createdAt | `empresa_id`, `custo_unitario`, `chave_idempotencia` |
| `drive_watcher_files` | file_id, status, processedAt | `empresa_id` |
| `prescriptions` | todas as receitas geradas | já tem `clientId` → empresa derivável |
| `assinatura` / ZapSign | documentos assinados | `empresa_id`, `custo_unitario`, `chave_idempotencia` |
| `budget` (orçamentos) | orçamentos gerados | `empresa_id` |
| `anamnese_v2_sessions` | sessões de anamnese | `empresa_id` |

---

## Requisitos exatos

### 3.1 — Três colunas de medição nas tabelas de evento cobráveis

**Regras absolutas antes de escrever SQL:**
- APENAS `ADD COLUMN` — nunca `DROP COLUMN`, nunca `ALTER COLUMN` que destrua dado.
- SQL direto no banco (nunca `drizzle-kit push` em banco com dado real).
- Colunas opcionais (nullable) para não quebrar inserts existentes.
- Backfill: `empresa_id = 5` (Instituto Pádua) em todas as linhas existentes — via `UPDATE` após `ADD COLUMN`.

**Tabelas e migrações (8 arquivos SQL, em `lib/db/drizzle/migrations/`):**

```sql
-- migration: 0XXX_onda3_billing_columns.sql
-- dispatch_log
ALTER TABLE dispatch_log
  ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id),
  ADD COLUMN IF NOT EXISTS custo_unitario NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS chave_idempotencia TEXT;
UPDATE dispatch_log SET empresa_id = 5 WHERE empresa_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_log_idempotencia
  ON dispatch_log(chave_idempotencia) WHERE chave_idempotencia IS NOT NULL;

-- mensageria_lembrete
ALTER TABLE mensageria_lembrete
  ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id),
  ADD COLUMN IF NOT EXISTS custo_unitario NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS chave_idempotencia TEXT;
UPDATE mensageria_lembrete SET empresa_id = 5 WHERE empresa_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_mensageria_idempotencia
  ON mensageria_lembrete(chave_idempotencia) WHERE chave_idempotencia IS NOT NULL;

-- agente_messages
ALTER TABLE agente_messages
  ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id),
  ADD COLUMN IF NOT EXISTS custo_unitario NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS chave_idempotencia TEXT;
UPDATE agente_messages SET empresa_id = 5 WHERE empresa_id IS NULL;
```

**Schemas Drizzle** (`lib/db/src/schema/`): adicionar as 3 colunas como `integer("empresa_id").references(...)`, `numeric("custo_unitario", {precision:10, scale:4})` e `text("chave_idempotencia")` em cada tabela afetada.

**Funções de geração de chave_idempotencia** (lib compartilhada):
- Para dispatch_log: `sha256(prescriptionId + channel + batchDate)`
- Para mensageria_lembrete: `sha256(clienteId + tipo + periodo + proximoEnvio.toISOString())`
- Para agente_messages: `sha256(conversationId + role + content.slice(0,64) + createdAt.toISOString())`

### 3.2 — Registro de consumo append-only (livro-caixa)

**Nova tabela**: `consumo_eventos` — o livro-caixa auditável. NUNCA se altera ou apaga uma linha.

```sql
CREATE TABLE IF NOT EXISTS consumo_eventos (
  id SERIAL PRIMARY KEY,
  empresa_id INTEGER NOT NULL REFERENCES empresas(id),
  tipo_evento TEXT NOT NULL,       -- 'dispatch', 'lembrete', 'ia_mensagem', 'exame_ocr', 'assinatura', 'documento'
  origem_id INTEGER,               -- id da linha na tabela original (ex.: dispatch_log.id)
  origem_tabela TEXT,              -- nome da tabela original
  custo_unitario NUMERIC(10,4) NOT NULL DEFAULT 0,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  chave_idempotencia TEXT NOT NULL,
  metadata JSONB,                  -- detalhes extras (canal, via, nome do documento, etc.)
  registrado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_consumo_idempotencia
  ON consumo_eventos(chave_idempotencia);
```

**Regra de escrita**: cada worker ou rota que gera evento cobráve chama `registrarConsumo({ empresaId, tipoEvento, origemId, origemTabela, custoUnitario, chaveIdempotencia, metadata })`. A função usa `INSERT ... ON CONFLICT (chave_idempotencia) DO NOTHING` — idempotente por design.

**Schema Drizzle** para `consumo_eventos` em `lib/db/src/schema/consumo.ts`.

**Lib compartilhada** `artifacts/api-server/src/lib/consumo.ts`:
- `registrarConsumo(params)`: insert idempotente
- `somarConsumo({ empresaId, tipoEvento, de, ate })`: SELECT SUM por período
- `listarConsumo({ empresaId, de, ate, page, pageSize })`: paginação do livro-caixa

### 3.3 — Painel de Prova de Valor

**Onde vive**: nova tela no frontend padcom, rota `/prova-de-valor`, acessível pelo menu do CEO.

**Layout** (seguir `skill-layout-paxter` — skeuomórfico 3D, tokens navy/ouro, TDAH-friendly):
- Filtro de período no topo (semana / mês / 90 dias / personalizado)
- Grade de KPIs (Indicadores-Chave de Desempenho) — 6 cartões salientes:

| KPI | Fonte | Rótulo |
|---|---|---|
| Receitas emitidas | `prescriptions` (COUNT) | RECEITAS EMITIDAS |
| Documentos entregues | `dispatch_log` (status='sent') | DOCUMENTOS ENTREGUES |
| Taxa de confirmação | `dispatch_log` (status='confirmed' / total) | TAXA DE CONFIRMAÇÃO |
| Dúvidas respondidas pela IA | `agente_messages` (role='assistant') | DÚVIDAS RESPONDIDAS PELA IA |
| Lembretes de dose entregues | `mensageria_lembrete` (status='enviado') | LEMBRETES ENTREGUES |
| Laudos processados | `drive_watcher_files` (status='ok') | LAUDOS PROCESSADOS |

- Abaixo dos KPIs: seção "TEMPO DE SECRETARIA ECONOMIZADO" com valor configurável pelo CEO (minutos por ação × número de ações = total de horas). Campo editável de "minutos por receita" e "minutos por lembrete" — salvo em `app_settings`.

- Botão de exportação: "Exportar PDF" — gera PDF com os KPIs do período selecionado, logotipo PADAXOR e rodapé "Painel de Prova de Valor — Instituto Pádua — [período]". Este PDF é a peça de venda.

**Rota de API**:
```
GET /api/prova-de-valor?de=<ISO>&ate=<ISO>
```
Retorna JSON com os 6 KPIs e o total de consumo do período.

**Rota de PDF**:
```
POST /api/prova-de-valor/exportar-pdf
body: { de, ate, minutosRecita, minutosLembrete }
```
Retorna binário PDF.

---

## Casos extremos a tratar

| Cenário | Comportamento esperado |
|---|---|
| Migration rodada duas vezes | `IF NOT EXISTS` e `ON CONFLICT DO NOTHING` garantem idempotência |
| Chave de idempotência repetida no consumo | `INSERT ... ON CONFLICT DO NOTHING` — sem erro, sem duplicata |
| Período sem dados | Painel exibe KPIs zerados com mensagem "Sem dados para este período" (não 404) |
| exportar-pdf com período muito longo (anos) | Timeout de 30 segundos; retornar 504 com mensagem orientando a reduzir o período |
| Tabela `consumo_eventos` crescendo indefinidamente | Projetado para append-only; auditoria exige isso; sem limpeza automática |

---

## Definição de PRONTO

| Critério | Como verificar |
|---|---|
| Migration aplicada sem erro | `SELECT column_name FROM information_schema.columns WHERE table_name='dispatch_log'` → ver as 3 colunas |
| Backfill de empresa_id | `SELECT COUNT(*) FROM dispatch_log WHERE empresa_id IS NULL` → 0 |
| `registrarConsumo` é idempotente | Chamar 2 vezes com mesma chave → 1 linha no banco |
| Painel carrega com dados do Instituto Pádua | Screenshot da tela com KPIs preenchidos |
| PDF exportado com logo e dados | Abrir o PDF, verificar logo PADAXOR, período e KPIs |
| Menu padcom tem link "Prova de Valor" | Screenshot do menu lateral |

---

## Linhas vermelhas

- NUNCA `DELETE` ou `UPDATE` em `consumo_eventos` — a tabela é somente de inserção.
- NUNCA `DROP COLUMN` ou `ALTER COLUMN` em tabela com dado real.
- NUNCA calcular custo retroativamente a partir de preço atual (o `custo_unitario` é congelado no momento do evento).
- NUNCA expor `consumo_eventos` sem autenticação.
- O PDF de exportação é PADAXOR, não Instituto Pádua na capa — seguir Padrão 14 da skill-layout-paxter (PADAXOR emite, exceto receituário que é Pádua).
