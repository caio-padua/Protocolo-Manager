---
name: Cofre de integracoes — contrato implicito de chaves
description: O motor declarativo de credenciais (Padrao 18) compartilha os nomes de chave com as libs consumidoras; renomear quebra em silencio.
---

# Cofre de integracoes (motor unico /api/integrations)

Registro declarativo por plataforma (asaas/stripe/zapsign/telegram) define cada
campo com `key` (chave no cofre/app_settings), `kind` ("secret" | "config") e
toggle. A tela generica (IntegrationVaultCard) consome `/api/integrations` e
nunca remonta layout.

## Regra de ouro (o que nao da pra ver no codigo de relance)
O `key` de cada campo e um CONTRATO compartilhado com as libs que consomem o
segredo via `getSecret(key)` / `getSetting(key)`. Renomear um `key` no registro
NAO quebra typecheck nem o cofre — mas a lib consumidora passa a ler `null` e a
integracao "desliga" em silencio.

**Como aplicar:** ao mexer no registro, so ADICIONE chaves novas; nunca renomeie
as existentes (asaas.apiKey/webhookToken/baseUrl, stripe.secretKey/active,
zapsign.token/active, telegram.botToken/webhookSecret/active). Antes de renomear,
grep por `getSecret("<key>")`/`getSetting("<key>")` em todo o api-server.

## config x secret
- `kind:"config"` (ex.: baseUrl, publishableKey): trafega EM CLARO no GET (campo
  `.value`); a UI pre-preenche um input editavel. NAO e revelado pelo /reveal.
- `kind:"secret"`: GET so devolve `isSet/masked/source`; valor real so sai pelo
  POST /reveal (acao explicita, requireCollaborator, logada).

## Campo personalizado
Metadados em app_settings `integration.custom.<provider>` (JSON [{slug,label}]);
valor no cofre `custom.<provider>.<slug>` (sempre secreto). slug por slugify +
sufixo `_N` em colisao. Limites server-side: label<=60, value<=4096, <=20 campos.

## Estado honesto
GET falhou (data nulo) => card mostra vela vermelha "Indisponivel" + aviso, NUNCA
"Faltam 0 credenciais" (erro != desligado). Mesma diretriz de comunicacao-status-honesto.
