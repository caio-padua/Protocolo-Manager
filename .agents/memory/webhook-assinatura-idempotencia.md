---
name: Webhook de assinatura — idempotência e assinatura inválida
description: Regras invioláveis ao receber callbacks de provedor de assinatura (ZapSign) com dedup por eventId.
---

# Webhook de assinatura remota — idempotência e segurança

Regras ao processar callback de provedor externo de assinatura (ZapSign no Paxter,
mesmo padrão no IHE de origem). A dedup é por `eventId` único + `onConflictDoNothing`.

1. **eventId DETERMINÍSTICO — nunca usar relógio.** O provedor (ZapSign) não emite id
   estável; derivamos de `doc_token|event_type|timestamp`. Se o timestamp do provedor
   (`last_update_at`) faltar, o fallback é `sha256(JSON.stringify(payload))` — **jamais
   `new Date()`**. Relógio local faz cada retry do MESMO evento gerar id diferente,
   furando a deduplicação e duplicando notificações/arquivamentos.

2. **Assinatura inválida NÃO pode marcar `processado=true`.** Marcar fecharia aquele
   `eventId` como "duplicado terminal"; um evento LEGÍTIMO posterior com o mesmo id
   (retry já assinado corretamente) seria suprimido — DoS lógico. Em assinatura
   inválida: gravar só `erroProcessamento` e retornar `unauthorized` (401), deixando a
   linha reprocessável.

3. **Webhook registrado ANTES do guard de sessão**, igual ao asaas (provedor externo
   não tem cookie/token de colaborador). Autenticidade via header secreto próprio
   (`x-paxter-secret`), não HMAC do corpo — por isso reserializar `req.body` como
   rawBody é seguro. Só expor provedores realmente cabeados/testados (Onda F = só
   `zapsign`; demais → 404), para não prometer validação que não existe.

**Como aplicar:** qualquer novo provedor/rota de webhook de assinatura segue os 3 pontos.
Falha transitória (ex.: upload do PDF assinado) deve retornar não-200 (503) SEM marcar
processado, para o provedor reentregar.
