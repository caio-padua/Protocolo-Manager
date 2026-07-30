---
name: AI Central — guard de clone + CF AI Gateway
description: Proteção do modelo de negócio: clone sem credenciais CEO não faz chamadas de IA.
---

# AI Central — Guard de Clone + Cloudflare AI Gateway

## A Regra

Toda chamada de IA no api-server DEVE passar por `requireAiTenant(empresaId, tipo)` antes de chamar qualquer LLM. Sem isso, o clone consegue IA própria e o CEO perde controle de custo.

**Why:** Sem o guard, um licenciado pode configurar suas próprias `AI_INTEGRATIONS_*` vars e usar IA sem pagar ao CEO. O guard fecha o modelo de negócio.

## Como Aplicar

- **CEO (instância PAWARDS):** definir `PADAXOR_AI_BYPASS=true` nos Replit Secrets. Boot mostra INFO.
- **Clone licenciado:** definir `PADAXOR_TENANT_TOKEN=<token emitido pelo CEO>`. Boot mostra INFO.
- **Clone sem credenciais:** qualquer chamada de IA lança erro explícito. Boot mostra WARN.

## Onde Mora o Código

- `artifacts/api-server/src/lib/ai-central.ts` — módulo central: `requireAiTenant()` + `checkAiSetup()`
- `checkAiSetup()` é chamado em `app.ts` no boot para avisar inconsistências

## Headers do CF AI Gateway

Quando `CF_AI_GATEWAY_URL` está definido, `requireAiTenant()` retorna:
```typescript
{ headers: { "cf-aig-metadata": '{"empresa_id":"5","tipo":"clinical"}' } }
```

- **Anthropic:** headers passados como segundo arg em `messages.create(params, { headers })`
- **OpenAI fetch:** `...aiHeaders` no objeto headers do fetch
- **Gemini:** guard only por enquanto (SDK não suporta headers por request na versão atual)

## URLs do CF AI Gateway (quando CEO criar — Decisão 11)

```
https://gateway.ai.cloudflare.com/v1/{account_id}/padaxor-central/anthropic
https://gateway.ai.cloudflare.com/v1/{account_id}/padaxor-central/google-ai-studio
https://gateway.ai.cloudflare.com/v1/{account_id}/padaxor-central/openai
```

Definir `CF_AI_GATEWAY_URL=<raiz>` + atualizar cada `AI_INTEGRATIONS_*_BASE_URL` para apontar para o gateway.

## 11 Call Sites Cobertos

```
lib/exam-extraction/extract-anthropic.ts  → Anthropic SDK  (guard + headers)
lib/exam-extraction/extract.ts            → Gemini SDK     (guard only)
lib/exam-extraction/extract-image.ts      → Gemini SDK     (guard only)
lib/exam-extraction/extract-openai.ts     → OpenAI fetch   (guard + headers)
lib/anamnese-tts.ts                       → OpenAI fetch   (guard + headers)
routes/agentes-chat.ts                    → Anthropic SDK  (guard + headers)
routes/whatsapp-inbound.ts                → Anthropic SDK  (guard + headers)
routes/client-registration.ts             → Gemini SDK     (guard only)
routes/empresas.ts                        → Gemini SDK     (guard only)
```

## Próximo Passo (não fazer sem ordem)

- Adicionar headers por request para Gemini usando client factory (cria `GoogleGenAI` por request com `httpOptions.headers`)
- Implementar `ai_tenant_tokens` table com revogação (Item C — Onda E do KAIZEN)
