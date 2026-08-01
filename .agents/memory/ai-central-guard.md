---
name: AI Central — guard de clone + CF AI Gateway
description: Proteção do modelo de negócio: clone sem credenciais CEO não faz chamadas de IA.
---

# AI Central — Guard de Clone + Cloudflare AI Gateway

## A Regra

Toda chamada de IA no api-server DEVE passar por `requireAiTenant(empresaId, tipo)` antes de chamar qualquer LLM. Sem isso, o clone consegue IA própria e o CEO perde controle de custo.

**Why:** Sem o guard, um licenciado pode configurar suas próprias `AI_INTEGRATIONS_*` vars e usar IA sem pagar ao CEO. O guard fecha o modelo de negócio.

## Como Aplicar

- **CEO (instância PAWARDS):** `PADAXOR_AI_BYPASS=true` (env var shared). Boot mostra INFO.
- **Clone licenciado:** `PADAXOR_TENANT_TOKEN=<token emitido pelo CEO>`. Boot mostra INFO.
- **Clone sem credenciais:** qualquer chamada de IA lança erro explícito. Boot mostra WARN.

## Gateway padaxor-central — STATUS: ✅ ATIVO (criado 30/07/2026)

- **Conta CF:** `c68f93d5feb576ea2862974ec3564c48`
- **Gateway ID:** `padaxor-central`
- **CF_AI_GATEWAY_URL** → `https://gateway.ai.cloudflare.com/v1/c68f93d5feb576ea2862974ec3564c48/padaxor-central`

URLs por provider:
```
Anthropic  : .../padaxor-central/anthropic
Gemini     : .../padaxor-central/google-ai-studio
OpenAI     : .../padaxor-central/openai
```

**Limitação na instância CEO:** `AI_INTEGRATIONS_*_BASE_URL` são gerenciadas pelo Replit AI
integrations system (`localhost:1106/modelfarm/...`) — não alteráveis via setEnvVars.
Os headers `cf-aig-metadata` são injetados nas chamadas SDK, mas o tráfego não passa
fisicamente pelo CF gateway. Para clones: eles configuram BASE_URL para o gateway.

## Headers do CF AI Gateway

Quando `CF_AI_GATEWAY_URL` está definido, `requireAiTenant()` retorna:
```typescript
{ headers: { "cf-aig-metadata": '{"empresa_id":"5","tipo":"clinical"}' } }
```

- **Anthropic:** headers passados como segundo arg em `messages.create(params, { headers })`
- **OpenAI fetch:** `...aiHeaders` no objeto headers do fetch
- **Gemini:** guard only por enquanto (SDK não suporta headers por request na versão atual)

## Ledger Interno — ai_usage_log (Task 22 — mergeada 30/07/2026)

- Tabela `ai_usage_log` criada via `CREATE TABLE IF NOT EXISTS` no boot
- `logAiUsage()` em `ai-central.ts` — registra custo, nunca lança
- `GET /api/ai-usage/resumo?periodo=7d|30d|90d` — agrega por empresa+provider+tipo
- Wired em `routes/agentes-chat.ts` após cada stream Anthropic

## 11 Call Sites Cobertos

```
lib/exam-extraction/extract-anthropic.ts  → Anthropic SDK  (guard + headers)
lib/exam-extraction/extract.ts            → Gemini SDK     (guard only)
lib/exam-extraction/extract-image.ts      → Gemini SDK     (guard only)
lib/exam-extraction/extract-openai.ts     → OpenAI fetch   (guard + headers)
lib/anamnese-tts.ts                       → OpenAI fetch   (guard + headers)
routes/agentes-chat.ts                    → Anthropic SDK  (guard + headers + logAiUsage)
routes/whatsapp-inbound.ts                → Anthropic SDK  (guard + headers)
routes/client-registration.ts             → Gemini SDK     (guard only)
routes/empresas.ts                        → Gemini SDK     (guard only)
```

## Próximos Passos (tarefas propostas, não fazer sem ordem)

- Task #21: headers Gemini por request via client factory
- Task #23: logAiUsage nas rotas de extração de laudo
- Task #24: garantir empresa_id correto no ledger
- Task #25: proteger endpoint /api/ai-usage para não aparecer em clones
- Item C Onda E: `ai_tenant_tokens` com revogação
