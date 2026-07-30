# AI Central — Guia de Configuração do Gateway

> Documento para o CEO (instância PAWARDS) e para configuração de clones licenciados.

---

## 1. O Problema que Este Sistema Resolve

Sem este sistema, qualquer clone do PADAXOR poderia:
- Usar a IA com **suas próprias credenciais** (sem passar pelo CEO)
- O CEO perde controle de custo e margem
- Impossível desligar um cliente inadimplente sem acesso ao servidor dele

Com este sistema:
- Toda chamada de IA **requer autorização do CEO**
- Clone sem token = IA bloqueada com mensagem clara
- Quando o CF AI Gateway estiver ativo = metering automático por clínica

---

## 2. Variáveis de Ambiente Necessárias

### Instância CEO (padrão — Replit PAWARDS)

| Variável | Valor | Obrigatório |
|---|---|---|
| `PADAXOR_AI_BYPASS` | `true` | **SIM** |
| `CF_AI_GATEWAY_URL` | (ver seção 4) | Quando gateway criado |

### Clone Licenciado

| Variável | Valor | Obrigatório |
|---|---|---|
| `PADAXOR_TENANT_TOKEN` | Token emitido pelo CEO | **SIM** |
| `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | URL do CF AI Gateway (Anthropic) | Quando gateway criado |
| `AI_INTEGRATIONS_GEMINI_BASE_URL` | URL do CF AI Gateway (Gemini) | Quando gateway criado |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | URL do CF AI Gateway (OpenAI) | Quando gateway criado |
| `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | Token do CF AI Gateway | Quando gateway criado |
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Token do CF AI Gateway | Quando gateway criado |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Token do CF AI Gateway | Quando gateway criado |

---

## 3. Como Emitir um PADAXOR_TENANT_TOKEN

Por enquanto: qualquer string aleatória serve como token de autorização inicial.
Exemplo: `openssl rand -hex 32`

No futuro (Onda E — Item C): o token será emitido pela tabela `ai_tenant_tokens`
com expiração e revogação automática.

Para revogar o acesso de um clone inadimplente:
- Excluir ou expirar o `PADAXOR_TENANT_TOKEN` nos Replit Secrets do clone
- O clone perde a IA imediatamente na próxima chamada

---

## 4. Configurar o Cloudflare AI Gateway (Decisão 11 — ainda pendente)

Quando o CEO criar o gateway:

1. Acesse: `dash.cloudflare.com → AI → AI Gateway`
2. Crie um gateway chamado `padaxor-central`
3. Copie o ID da conta Cloudflare (visível na URL)
4. As URLs dos provedores ficam assim:

| Provider | URL no CF Gateway |
|---|---|
| Anthropic | `https://gateway.ai.cloudflare.com/v1/{account_id}/padaxor-central/anthropic` |
| Gemini | `https://gateway.ai.cloudflare.com/v1/{account_id}/padaxor-central/google-ai-studio` |
| OpenAI | `https://gateway.ai.cloudflare.com/v1/{account_id}/padaxor-central/openai` |

5. No Replit Secrets da instância CEO, defina:
   - `CF_AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/{account_id}/padaxor-central`
   - Atualize cada `AI_INTEGRATIONS_*_BASE_URL` para apontar para a URL correspondente acima

6. Para os clones: entregue as mesmas URLs + um token do gateway como `AI_INTEGRATIONS_*_API_KEY`

---

## 5. O Que Acontece em Cada Cenário

### CEO sem `PADAXOR_AI_BYPASS`
```
[PADAXOR] Chamada de IA bloqueada: este ambiente não tem PADAXOR_AI_BYPASS nem
PADAXOR_TENANT_TOKEN configurados.
• Instância CEO: defina PADAXOR_AI_BYPASS=true nos Replit Secrets.
• Clone licenciado: solicite PADAXOR_TENANT_TOKEN em suporte@padaxor.com.br.
```

### Clone sem token
- Todas as chamadas de IA falham com o erro acima
- O servidor **sobe normalmente** — apenas IA está bloqueada
- O frontend recebe um erro 500 com mensagem explicativa

### Clone com token, sem gateway
- IA funciona via Replit integrations (sem metering centralizado)
- Warning no boot: `PADAXOR_TENANT_TOKEN configurado mas CF_AI_GATEWAY_URL ausente`
- Aceitável no período de transição

### Clone com token + gateway ativo
- Toda chamada inclui `cf-aig-metadata: {"empresa_id": "N", "tipo": "clinical"}`
- CF AI Gateway registra custo por tenant automaticamente
- CEO vê dashboard de uso por clínica no Cloudflare

---

## 6. Pontos de Injeção do Guard (11 call sites cobertos)

| Arquivo | Provider | Tipo | Headers |
|---|---|---|---|
| `lib/exam-extraction/extract-anthropic.ts` | Anthropic SDK | clinical | ✅ injetado |
| `lib/exam-extraction/extract.ts` | Gemini SDK | clinical | guard only |
| `lib/exam-extraction/extract-image.ts` | Gemini SDK | clinical | guard only |
| `lib/exam-extraction/extract-openai.ts` | OpenAI fetch | clinical | ✅ injetado |
| `lib/anamnese-tts.ts` | OpenAI fetch | voice | ✅ injetado |
| `routes/agentes-chat.ts` | Anthropic SDK | agent | ✅ injetado |
| `routes/whatsapp-inbound.ts` | Anthropic SDK | whatsapp | ✅ injetado |
| `routes/client-registration.ts` | Gemini SDK | ocr | guard only |
| `routes/empresas.ts` | Gemini SDK | ocr | guard only |

> **Gemini "guard only":** o SDK `@google/genai` não expõe headers por chamada
> na versão atual. Quando o gateway Cloudflare estiver ativo e as `BASE_URL`
> vars forem atualizadas, o tráfego já passa pelo gateway — o header de metadata
> será adicionado numa segunda iteração usando client por request.

---

## 7. Próximos Passos (após Decisão 11)

- [ ] CEO cria gateway `padaxor-central` no Cloudflare (Decisão 11)
- [ ] Atualizar `AI_INTEGRATIONS_*_BASE_URL` na instância CEO para CF gateway
- [ ] Configurar `CF_AI_GATEWAY_URL` no CEO
- [ ] Gerar token do gateway para primeiro clone licenciado
- [ ] Implementar tabela `ai_tenant_tokens` com revogação (Item C — Onda E)
- [ ] Adicionar headers de metadata por request para Gemini (requer client factory)
