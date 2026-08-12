# HANDOFF — Dr. Code & Dr. Manus
**Emitido por:** Dr. Replit Paxter (12/08/2026)
**Repositório:** `caio-padua/Protocolo-Manager`
**Branch:** `main` — HEAD `ed54f5b`

> Este documento é o ponto de partida para auditoria, continuação e extensão do trabalho.
> Leia do início ao fim antes de tocar qualquer arquivo.

---

## 1. CONTEXTO GERAL DO SISTEMA

O sistema se chama **PAXTER / PADAXOR** — plataforma SaaS de clínica médica do Dr. Caio Henrique Fernandes Padua (endocrinologista). É um monorepo `pnpm` com os seguintes artefatos principais:

| Artefato | Diretório | Porta dev | Propósito |
|---|---|---|---|
| API Server | `artifacts/api-server` | 8080 | Backend Express + Drizzle ORM + PostgreSQL |
| PADCOM Web | `artifacts/padcom` | 18148 | Frontend React + Vite — sistema principal |
| Vitrine Demo | `artifacts/vitrine-demo` | 18694 | Vitrine pública para licenciados |
| Parxis Site | `artifacts/parxis-site` | 21575 | Site institucional do motor clínico |
| Mockup Sandbox | `artifacts/mockup-sandbox` | 8081 | Preview de componentes no canvas |

**Stack técnica:**
- Backend: Node.js + Express + Pino + Drizzle ORM + PostgreSQL (Railway)
- Frontend: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui + TanStack Query
- Auth: token HMAC colaborador (`createCollaboratorToken`), token de agendamento (`createSchedulingToken`)
- Mensageria: Twilio WhatsApp, Telegram Bot (`@Paduaclinica_bot`), Resend e-mail
- Pagamentos: Asaas (PIX + cartão de crédito, webhook assinado)
- AI: Anthropic Claude, Gemini, OpenAI — via Replit AI Integrations proxy

**Regras invioláveis do CEO (ler antes de qualquer mudança):**
1. **Nunca DROP/TRUNCATE/DELETE sem ordem escrita dupla.** Tela obsoleta = fora do menu, arquivo intacto.
2. **ADD COLUMN sempre, DROP COLUMN nunca.**
3. **Nunca db push — migrations são sempre SQL direto** (`ALTER TABLE`, `CREATE TABLE IF NOT EXISTS`).
4. **`brtNow()` da `lib/brt.ts` é a ÚNICA fonte de data/hora** — nunca `new Date()` nu para arquivo/exibição.
5. **Tabela única de clientes:** `empresa_id=5`, `location_id=8`, `status='active'` são obrigatórios.

---

## 2. O QUE FOI FEITO NESTA SESSÃO (12/08/2026)

### 2.1 Trava de Escassez do Concierge

**Problema resolvido:** Clientes geravam cobranças concierge (sinal de R$150,00) e abandonavam sem pagar, desperdiçando slots reais da agenda do Dr. Caio.

**Arquitetura implementada:**

```
Cliente no funil /agendar
        │
        ▼
GET /scheduling/concierge-offer?cpf=XXX
        │
        ├─► getPenalidade(cpf)          ← lib/concierge-penalidade.ts
        │         │
        │         ├─ 0 falhas → offset=0 (datas normais)
        │         ├─ 1 falha  → offset=+7 dias
        │         ├─ 2 falhas → offset=+30 dias
        │         └─ ≥3 falhas → { blocked: true }
        │
        ▼
computeConciergeOffer({ earliestDate: original + offset })
        │
        ▼
Response: { ...oferta, penalidade_dias, tentativas }
        ou
Response: { blocked: true, motivo, mensagem }

Quando pagamento vira expirado/cancelado:
        │
        ├─► Webhook Asaas (routes/asaas.ts:692-727)
        │         └─ PAYMENT_OVERDUE / PAYMENT_DELETED → registrarFalha(cpf)
        │
        └─► Polling (routes/scheduling.ts:752-762)
                  └─ transition → expirado/cancelado → registrarFalha(cpf)
```

**Arquivos criados/modificados:**

| Arquivo | Tipo | O que mudou |
|---|---|---|
| `artifacts/api-server/src/lib/concierge-penalidade.ts` | NOVO | Motor completo: `getPenalidade`, `registrarFalha`, `calcularPenalidadeDias`, `ensureTable` (lazy singleton) |
| `artifacts/api-server/src/routes/scheduling.ts` | MODIFICADO | Import da lib; GET concierge-offer aceita `?cpf=`; aplica offset; retorna `blocked` ou dados enriquecidos; hook no polling |
| `artifacts/api-server/src/routes/asaas.ts` | MODIFICADO | Import da lib; hooks em PAYMENT_OVERDUE e PAYMENT_DELETED/REFUNDED para concierge requests |
| `artifacts/padcom/src/pages/agendar.tsx` | MODIFICADO | `useGetConciergeOffer` substituído por `useQuery` + `fetch` direto (para passar `?cpf=`); stage `oferta` com painel de bloqueio + banner de penalidade; aviso nos botões de cancelar |

**Tabela criada no banco:**
```sql
CREATE TABLE IF NOT EXISTS concierge_penalidades (
  cpf                  TEXT        NOT NULL PRIMARY KEY,
  tentativas_falha     INTEGER     NOT NULL DEFAULT 0,
  bloqueado_permanente BOOLEAN     NOT NULL DEFAULT FALSE,
  ultima_falha_at      TIMESTAMPTZ,
  criado_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
> Criada lazy (singleton `_tableReady`) na primeira chamada de `getPenalidade` ou `registrarFalha`.

**Commits desta entrega:**
- `bd2b0b6` — Backend: lib + hooks webhook + polling
- `ae44e79` — Frontend: UI de bloqueio/penalidade no funil
- `ed54f5b` — Task agent: CPF coletado no início do stage `oferta` (task #145)

---

### 2.2 Correções Visuais em `/agendar`

**Commits:** `7884996`, `762fdc8`

- Todos os stages (`oferta`, `comum`, `pay`) envolvidos em `panel-3d` com topbar dourada.
- `<select>` nativos substituídos por `PaxterSelect` (dropdown 100% Paxter).
- `dc-chip[data-active]` com efeito "pressionado" (translateY + inset shadow).
- Botão "← Cancelar e mudar forma de pagamento" reseta `invoiceUrl`/`pixQrImage`/`pixPayload`/`payStatus`.
- Rodapé do guia-digital removido de `leva-fabric` hardcoded para `panel-3d` responsivo.

### 2.3 Menu — 5 Telas Adicionadas

**Commit:** `b6b4eba`

Rotas que existiam como código mas estavam fora do menu:
- `/comunicacao/avatares` — Avatares de comunicação
- `/arsenal/drive-watcher` — Drive Watcher
- `/importar-drive` — Importar Exames do Drive
- `/cadastros/empresas` — Cadastro de Empresas
- `/cadastros/equipe` — Equipe – Cadastro Interno

---

## 3. O QUE ESTÁ EM ANDAMENTO (tasks abertas)

| Task | Status | O que é |
|---|---|---|
| `#144` | IN_PROGRESS | Testes da trava de escassez (3 cenários) |
| `#146` | MERGING | Painel CEO para ver/resetar penalidades |
| `#149` | PROPOSED | Confirmar que o CEO consegue resetar de ponta a ponta |
| `#150` | PROPOSED | Audit log quando CEO reseta penalidade |
| `#151` | PROPOSED | CPF não pedido duas vezes no reset |
| `#152` | PROPOSED | Confirmar que webhook Asaas dispara penalidade |
| `#153` | PROPOSED | Penalidade aparece no histórico do paciente |

---

## 4. OS PRÓXIMOS 10 PASSOS (visão 10x)

### Passo 1 — Fechar os testes da trava de escassez (task #144)
**Arquivo:** `artifacts/api-server/src/lib/concierge-penalidade.ts`
**O que testar:**
- `calcularPenalidadeDias(0)` → `{ bloqueado: false, penalidade_dias: 0 }`
- `calcularPenalidadeDias(1)` → `{ bloqueado: false, penalidade_dias: 7 }`
- `calcularPenalidadeDias(2)` → `{ bloqueado: false, penalidade_dias: 30 }`
- `calcularPenalidadeDias(3)` → `{ bloqueado: true, penalidade_dias: 0 }`
- `getPenalidade(cpf_sem_registro)` → `{ bloqueado: false, ... }`
- `registrarFalha` + `getPenalidade` integrado com banco de teste
- `GET /scheduling/concierge-offer?cpf=BLOQUEADO` → `{ blocked: true }`

### Passo 2 — Resetar penalidade quando cliente paga com sucesso
**Arquivo:** `artifacts/api-server/src/lib/concierge-finalize.ts`
**O que fazer:** No final de `finalizeConciergeBooking()`, após o pagamento confirmado, chamar:
```typescript
await db.execute(sql`
  UPDATE concierge_penalidades
  SET tentativas_falha=0, bloqueado_permanente=FALSE, atualizado_at=NOW()
  WHERE cpf=${cpfDigits}
`);
```
**Decisão pendente do CEO:** confirmar se quer reset automático ao pagar.

### Passo 3 — Inteligência Comercial Fase A (unificar dados existentes)
Nova tela `/inteligencia` com 3 painéis burros que consultam dados já existentes:

**Painel A — Funil do Concierge:**
```sql
SELECT
  sr.patient_cpf,
  sr.patient_name,
  sr.payment_status,
  sr.created_at,
  cp.tentativas_falha,
  cp.bloqueado_permanente
FROM scheduling_requests sr
LEFT JOIN concierge_penalidades cp ON cp.cpf = REGEXP_REPLACE(sr.patient_cpf, '\D', '', 'g')
WHERE sr.path = 'concierge'
ORDER BY sr.created_at DESC
LIMIT 100;
```

**Painel B — Leads da Vitrine:**
Tabela `vitrine_leads` já existe. Rota `GET /vitrine-leads` já existe.

**Painel C — Eventos do Guia Digital:**
Tabela de `onboarding/evento` já existe. Rota já existe.

**Arquivo a criar:** `artifacts/padcom/src/pages/inteligencia/index.tsx`
**Rota:** `/inteligencia`

### Passo 4 — Instrumentar Área do Cliente (evento por seção)
Adicionar `POST /api/evt` beacon que captura:
```typescript
interface ClienteEvento {
  secao: string;        // ex: "protocolos", "financeiro", "exames"
  origem: "area" | "agendar" | "guia" | "vitrine";
  cpf_hash: string;     // SHA-256 do CPF — nunca CPF cru
  dispositivo: string;
  timestamp: string;    // BRT
}
```
Chamado silenciosamente no `useEffect` de cada seção da `area.tsx`.

### Passo 5 — Score de calor de lead
```sql
CREATE OR REPLACE VIEW lead_heat_score AS
SELECT
  cpf_hash,
  COUNT(*) as total_eventos,
  COUNT(DISTINCT secao) as secoes_distintas,
  MAX(timestamp) as ultima_visita,
  (COUNT(*) * 2 + COUNT(DISTINCT secao) * 5) as score
FROM ceo_eventos
GROUP BY cpf_hash
ORDER BY score DESC;
```

### Passo 6 — Radar de Licenciados
Instrumentar `artifacts/vitrine-demo` e `artifacts/parxis-site` com o mesmo beacon `/api/evt` usando `origem: "vitrine-licenciado"`. Cruzar com `vitrine_leads` por e-mail/CPF quando disponível.

### Passo 7 — Notificação Slack quando lead "esquenta"
Quando `score > 20` em 24h (ou quando alguém completa o formulário de licença), disparar mensagem no `#padaxor-projeto` via Slack. Padrão já existe em `lib/slack-padaxor.ts`.

### Passo 8 — Painel de auditoria de penalidades (task #150)
Toda ação de reset pelo CEO deve gerar registro em `collaborator_audit` com:
```typescript
{
  method: "DELETE",
  path: "/admin/concierge-penalidade/:cpf",
  detail: { cpfMasked, tentativasAntes, motivoCEO },
  ip: req.ip
}
```

### Passo 9 — Relatório semanal automático para o CEO
Todo domingo 08:00 BRT: Slack + e-mail com:
- N conversões concierge na semana
- N leads novos na vitrine
- N CPFs com penalidade ativa
- Score do lead mais quente

### Passo 10 — Exportar dados para licenciados (multi-tenant)
Quando o sistema for licenciado para outra clínica:
- `empresa_id` diferente de 5 → dados completamente isolados
- O painel de inteligência do licenciado mostra só os SEUS clientes
- `GET /inteligencia` filtra por `empresa_id` do colaborador logado

---

## 5. PROPOSTAS KAIZEN

### K-001 — Voltar useGetConciergeOffer para hook gerado
**Problema:** Em `agendar.tsx`, o `useGetConciergeOffer` (hook gerado por orval/OpenAPI) foi substituído por `useQuery` + `fetch` manual porque o schema gerado não incluía o campo `cpf`.
**Solução:** Adicionar `cpf` ao schema OpenAPI do endpoint `GET /scheduling/concierge-offer`, rodar `pnpm codegen`, voltar ao hook gerado.
**Arquivo:** `packages/api-zod/src/openapi.yaml` (ou equivalente)
**Impacto:** Reduz divergência entre spec e implementação; melhora type safety.

### K-002 — Normalização de CPF centralizada
**Problema:** `.replace(/\D/g, "")` aparece em múltiplos lugares (`agendar.tsx`, `concierge-penalidade.ts`, `concierge-finalize.ts`).
**Solução:** Exportar `normCpf(raw: string | null | undefined): string` de um pacote compartilhado (`@workspace/shared` ou `packages/utils`).

### K-003 — Idempotência do hook de penalidade no polling
**Problema atual:** O polling chama `registrarFalha` na PRIMEIRA transição para `expirado`/`cancelado`. Mas se o servidor reiniciar antes de persistir, o polling pode chamar de novo.
**Solução:** Adicionar coluna `penalidade_registrada BOOLEAN DEFAULT FALSE` em `scheduling_requests` e marcar `TRUE` antes de chamar `registrarFalha`.

### K-004 — Monitoramento de bloqueios em tempo real
**Problema:** CEO não sabe quando um cliente é bloqueado.
**Solução:** Em `registrarFalha`, quando o UPSERT resulta em `bloqueado_permanente=TRUE`, disparar Slack: "CPF *** foi bloqueado no Concierge após 3 tentativas sem pagamento."

### K-005 — Limpeza periódica de penalidades antigas
**Problema:** Penalidades acumulam indefinidamente. Um cliente que tentou há 2 anos e agora quer voltar fica bloqueado para sempre.
**Solução:** Cron mensal que reseta penalidades com `ultima_falha_at < NOW() - INTERVAL '6 months'` e `bloqueado_permanente=FALSE` (só os de +7/+30 dias, não os bloqueados permanentes).

---

## 6. ARQUITETURA DE COMPONENTES DO FRONTEND

### Sistema de design (ler ANTES de criar qualquer tela)
**Skill:** `.agents/skills/skill-layout-paxter/SKILL.md`

Classes principais:
- `panel-3d` — container saliente (bevel)
- `panel-3d-sub` — container encaixado (concave)
- `login-card-topbar` — topbar dourada de painel
- `login-card-body` — corpo de painel
- `dc-chip` — botão selecionável (chip)
- `dc-chip[data-active]` — estado selecionado do chip
- `bevel-3d` — relevo 3D genérico
- `btn-3d-gold` — botão primário ouro

**Cores da marca:**
- Navy: `#16284a` (fundo escuro)
- Ouro: `#c2a05a` (destaque, topbar)
- Texto claro: `text-stone-300` / `text-stone-400`

### Seletor universal de cliente
**Skill:** `.agents/skills/skill-paxter-client-selector/SKILL.md`
**Componente:** `PaxterClientSelector` — substitui ClientPicker/ClientCombobox.
**Props obrigatórias:** `cpf`, `phone`, `photoUrl` no array de opções.

### Cockpit
Arquitetura: `CockpitShell` + lazy panels. URL é fonte de verdade. `key={clientId}` no Route. Ver `cockpit-v2-arquitetura.md` em memória.

---

## 7. ARQUITETURA DO BACKEND

### Banco de dados
- ORM: Drizzle ORM — `packages/db/src/schema.ts`
- NUNCA usar `db push` em produção — sempre SQL direto
- Padrão de boot migration: `CREATE TABLE IF NOT EXISTS` dentro da lib que usa a tabela (lazy, singleton por processo)

### Guards de autenticação
- `requireCollaborator` — protege rotas administrativas
- `schedulingTokenMatches(req, id)` — protege rotas de agendamento públicas
- `requireCeoOrSuperAdmin` — para ações CEO-only

### Padrão de rotas novas
```typescript
// 1. Importar db e tabelas
import { db, schedulingRequestsTable } from "@workspace/db";
// 2. Importar lib de domínio (nunca lógica na rota)
import { meuMotor } from "../lib/meu-motor.js";
// 3. Rota
router.get("/minha-rota", async (req, res): Promise<void> => {
  try {
    const result = await meuMotor(req.query);
    res.json(result);
  } catch (err) {
    req.log.error({ err: String(err) }, "Erro em minha-rota");
    res.status(500).json({ error: "Falha interna" });
  }
});
```

### Segredos e variáveis de ambiente
- **Nunca expor em código** — usar `getSecret(key)` de `lib/secure-settings.ts`
- Chaves disponíveis: `ASAAS_API_KEY`, `SESSION_SECRET`, `TWILIO_*`, `GITHUB_PAT`, etc.
- Variáveis de ambiente: `process.env.NODE_ENV`, `process.env.ALLOWED_ORIGINS`

---

## 8. COMO AUDITAR O QUE FOI FEITO

### Passo a passo para Dr. Code / Dr. Manus auditarem:

```bash
# 1. Clonar / puxar o repositório
git clone https://github.com/caio-padua/Protocolo-Manager.git
# ou
git pull origin main

# 2. Verificar os commits desta sessão
git log --oneline ed54f5b bd2b0b6 ae44e79 b6b4eba 762fdc8 7884996

# 3. Ver o diff completo da trava de escassez
git diff 8a13d58..ed54f5b -- artifacts/api-server/src/lib/concierge-penalidade.ts
git diff 8a13d58..ed54f5b -- artifacts/api-server/src/routes/scheduling.ts
git diff 8a13d58..ed54f5b -- artifacts/api-server/src/routes/asaas.ts
git diff 8a13d58..ed54f5b -- artifacts/padcom/src/pages/agendar.tsx

# 4. Instalar dependências
pnpm install

# 5. Buildar o backend
cd artifacts/api-server && pnpm build

# 6. Verificar a lib de penalidade diretamente
# (calcularPenalidadeDias é função pura — testável sem banco)
node -e "
const { calcularPenalidadeDias } = require('./dist/index.mjs');
// ou importar o TS diretamente com tsx
"

# 7. Testar o endpoint com curl (precisa do api-server rodando)
# Sem CPF — deve funcionar normal:
curl "http://localhost:8080/api/scheduling/concierge-offer?weekday=2&period=manha"

# Com CPF bloqueado (após inserir no banco):
# INSERT INTO concierge_penalidades(cpf,tentativas_falha,bloqueado_permanente)
# VALUES('12345678901',3,TRUE);
curl "http://localhost:8080/api/scheduling/concierge-offer?cpf=12345678901"
# Deve retornar: { "blocked": true, "motivo": "concierge_bloqueado", ... }
```

### Verificações de integridade:

```sql
-- Ver todos os CPFs penalizados
SELECT cpf, tentativas_falha, bloqueado_permanente, ultima_falha_at
FROM concierge_penalidades
ORDER BY ultima_falha_at DESC;

-- Ver solicitações concierge por status de pagamento
SELECT
  sr.id,
  sr.patient_name,
  sr.patient_cpf,
  sr.payment_status,
  sr.created_at,
  cp.tentativas_falha,
  cp.bloqueado_permanente
FROM scheduling_requests sr
LEFT JOIN concierge_penalidades cp
  ON cp.cpf = REGEXP_REPLACE(sr.patient_cpf, '\D', '', 'g')
WHERE sr.path = 'concierge'
ORDER BY sr.created_at DESC
LIMIT 50;
```

---

## 9. PERGUNTAS ABERTAS PARA DR. CODE E DR. MANUS

As seguintes decisões estão **pendentes de validação técnica**:

1. **K-001:** O schema OpenAPI do projeto fica em qual arquivo exatamente? Como rodar o codegen (`orval`)?
2. **K-003:** A idempotência do polling de penalidade é suficiente como está, ou é preciso a coluna `penalidade_registrada`?
3. **Passo 2:** O CEO confirmou que quer reset automático de penalidade ao pagar? (não confirmado ainda)
4. **K-005:** O prazo de expiração de penalidade de 6 meses é razoável para a prática médica do CEO?
5. **Inteligência Comercial:** O CEO escolheu o escopo A (unificar dados existentes). Aprovam a abordagem de tela nova em `/inteligencia` ou preferem aba extra no `/radar-clinico`?

---

## 10. GLOSSÁRIO (para Dr. Code e Dr. Manus)

| Termo | Significado no sistema |
|---|---|
| CEO | Dr. Caio — único usuário com papel `ceo` |
| Concierge | Via de agendamento prioritária com pagamento de sinal (R$150,00) |
| Via Normal | Agendamento comum sem pagamento antecipado |
| Stage | Etapa do funil de agendamento (`form → motor1 → vias → oferta → pay`) |
| Colaborador | Funcionário da clínica com acesso ao sistema (não é o CEO) |
| Licenciado | Outro dono de clínica que assina a licença do PAXTER |
| Penalidade | Afastamento de datas por tentativas de concierge abandonadas |
| Bloqueio | Suspensão permanente do concierge após ≥3 falhas |
| BRT | Horário de Brasília (UTC-3) — `lib/brt.ts` é a fonte única |
| Drizzle | ORM TypeScript usado para queries com type safety |
| Panel-3D | Classe CSS do design system Paxter para painéis com relevo |

---

*Documento gerado automaticamente por Dr. Replit Paxter — 12/08/2026.*
*Para atualizar: editar `docs/HANDOFF-DR-CODE-MANUS.md` e fazer push para `main`.*
