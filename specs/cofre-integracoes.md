# Spec — Cofre de Integrações (Padrão 18 em todas as telas de credencial)

Data: 28/06/2026. Decisão do CEO (user_query): **Opção B** — manter cada plataforma
na SUA tela atual, só reformatando todas para o **Padrão 18** (skill-layout-paxter),
com um **motor único declarativo** + **campo personalizado** (Kaizen).

## 1. Objetivo

Hoje só `comunicacao/gateways.tsx` (Twilio/Gupshup) está no Padrão 18 (card de
credencial com olho que revela, máscara, status fixo, toggle no topo). As demais
telas de credencial usam um formato antigo (`SettingsPanel`/`FieldRow`/`SecretBadge`).

Esta onda padroniza TODAS as telas de credencial chave/valor no mesmo Padrão 18,
movidas por um motor único declarativo, e permite ao operador criar campos novos
sozinho (sem o agente).

## 2. Escopo

| Tela | Plataforma(s) | Ação |
|---|---|---|
| configuracoes/pagamentos.tsx | Asaas, Stripe | Reformatar para Padrão 18 via motor genérico |
| configuracoes/assinatura.tsx | ZapSign | Reformatar para Padrão 18 via motor genérico |
| comunicacao/digital.tsx | Telegram (card) | Trocar TelegramTokenField por card do motor; WhatsApp segue ToolCard informativo |
| configuracoes/certificados.tsx | Certificado A1 | Reformatar VISUAL para a moldura Padrão 18 (caso especial: upload + senha, fora do motor genérico) |

FORA de escopo: `comunicacao/gateways.tsx` (já está no Padrão 18 — não tocar).
Dívida registrada: unificar gateways no mesmo registro numa próxima onda.

## 3. Campos por plataforma (cofre = secreto, máscara; config = texto em claro)

| Plataforma | Campo | Chave do cofre/config | Secreto | Toggle (app_settings) |
|---|---|---|---|---|
| Asaas | Chave de API | asaas.apiKey | sim | — |
| Asaas | Token do Webhook | asaas.webhookToken | sim | — |
| Asaas | URL base | asaas.baseUrl (config) | não | — |
| Stripe | Chave secreta | stripe.secretKey | sim | stripe.active |
| Stripe | Segredo do Webhook (NOVO) | stripe.webhookSecret | sim | stripe.active |
| Stripe | Chave publicável (NOVO) | stripe.publishableKey | não | stripe.active |
| ZapSign | Token de acesso | zapsign.token | sim | zapsign.active |
| Telegram | Token do bot | telegram.botToken | sim | telegram.active |
| Telegram | Segredo do Webhook | telegram.webhookSecret | sim | telegram.active |

LINHA VERMELHA: NÃO mudar nenhuma chave de cofre/config já existente (as libs
`asaas.ts`, `telegram.ts`, `stripe`, webhooks etc. leem por `getSecret(vaultKey)` —
trocar a chave quebra a integração real). Campos NOVOS: stripe.webhookSecret e
stripe.publishableKey (guardados; fiação de consumo fica pronta, sem prometer envio).

## 4. Campo personalizado (Kaizen)

Cada plataforma do motor genérico aceita campos extras criados pela tela:
- Metadados (lista) em app_settings `integration.custom.<provider>` = JSON
  `[{ slug, label }]`.
- Valor sempre no cofre cifrado em `custom.<provider>.<slug>` (tratado como
  secreto: máscara + olho que revela), para haver UM caminho só.
- Operações: criar (label → slug normalizado), salvar valor, revelar, remover.

## 5. Motor (backend)

5.1 `lib/integration-registry.ts` — registro declarativo das 4 plataformas
(asaas, stripe, zapsign, telegram) com: `provider`, `label`, `fields[]`
(`field, vaultKey/settingKey, label, secret, kind: "secret"|"config", envName?,
sanitize?, minLen?, maxLen?, placeholder?`), `enabledKey?`, `allowCustom: true`.

5.2 `routes/integrations.ts` (hand-rolled, fora do OpenAPI — igual a comunicacao):

```
GET    /api/integrations                  -> [{provider,label,enabled,configured,missingCount,fields[],custom[]}]
GET    /api/integrations/:provider        -> idem (uma)
PUT    /api/integrations/:provider/credentials   -> grava campos (secret->cofre, config->app_settings) + custom; sanitiza/valida
POST   /api/integrations/:provider/reveal        -> { values } (allowlist do registro + custom); requireCollaborator; log auditoria
POST   /api/integrations/:provider/toggle        -> { enabled } (se enabledKey)
POST   /api/integrations/:provider/custom        -> cria {label,(value?)} -> {slug}
DELETE /api/integrations/:provider/custom/:slug   -> remove metadado + segredo
```

Regras: GET nunca expõe valor em claro (só `isSet` + `masked`); reveal é a ÚNICA
porta para o valor real, protegida por `requireCollaborator`, com log. Campo vazio
no PUT = não altera. Sanitização autoritativa no servidor (não confia só no front).

5.3 Montar o router em `routes/index.ts` (depois de `collaboratorGuard`).

## 6. Motor (frontend)

6.1 `components/integrations/IntegrationVault.tsx` — reaproveita os primitivos do
Padrão 18 de `comunicacao/_shared` (`IntegrationCard, ToggleWell, CredentialField,
VaultStatusStrip, ExplainRow`). Exporta:
- `useIntegration(provider)` — carrega/salva/revela/toggle/custom via `/api/integrations`.
- `<IntegrationVaultCard provider icon accent description labelOn labelOff />` —
  monta: cabeçalho + toggle (se houver) + descrição + VaultStatusStrip + campos
  (secret = CredentialField com olho; config = input pré-preenchido) + bloco
  "Campo personalizado" (adicionar/listar/remover) + botão Salvar.

6.2 Telas viram finas: pagamentos = 2 cards (asaas, stripe); assinatura = 1 (zapsign);
digital = Telegram via card do motor; certificados = moldura Padrão 18 manual (upload).

## 7. Definição de PRONTO

1. As 4 telas renderizam no Padrão 18 (IntegrationCard + CredentialField + VaultStatusStrip).
2. Campos completos por plataforma + campo personalizado (criar/ver/salvar/remover) funcionam.
3. Olho revela o valor real (rota protegida); GET nunca traz valor em claro.
4. Reveal/save sem token = 401; com token = valor correto. Sanitização rejeita lixo (400).
5. Chaves de cofre/config PRESERVADAS (asaas.apiKey, stripe.secretKey, zapsign.token,
   telegram.botToken/webhookSecret, asaas.baseUrl/webhookToken).
6. Typecheck padcom limpo; backend sem novos erros (TS7030 pré-existentes ignorados).
7. Validação por curl (status, save, reveal, custom, rejeição) + screenshots das 4 telas.
8. architect aprova requisito por requisito.

## 8. RESUMO EM 1 LINHA

Padronizar as 4 telas de credencial no Padrão 18 por um motor único declarativo
(registro + router /api/integrations) com campo personalizado, preservando todas as
chaves de cofre para não quebrar as integrações reais.
