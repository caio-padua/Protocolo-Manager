# Spec: empresa_id correto no ledger — chamadas de agentes

**Data:** 31/07/2026
**Relacionado a:** Task #24

---

## Objetivo

Garantir que toda chamada à rota `POST /api/agentes-chat` registre no ledger
`ai_usage_log` o `empresa_id` real do tenant que originou a chamada —
nunca o valor hardcoded `0`.

---

## Contexto

`routes/agentes-chat.ts` contém dois usos de `empresaId` hardcoded como `0`:

1. `requireAiTenant(0, "agent")` — guard de clone passado com `0`
2. `logAiUsage({ empresaId: 0, ... })` — ledger registrado com `0`

O middleware `tenantContextMiddleware` já popula `req.tenantContext.empresaId`
em cada requisição (valor atual = `5` — Instituto Pádua).
A correção é trivial: ler `req.tenantContext.empresaId` nos dois pontos.

---

## Requisitos

1. `requireAiTenant(req.tenantContext.empresaId, "agent")` — substituir `0`.
2. `logAiUsage({ empresaId: req.tenantContext.empresaId, ... })` — substituir `0`.
3. A variável `empresaId` deve ser extraída UMA ÚNICA VEZ no início do handler
   (`const { empresaId } = req.tenantContext`) e reutilizada nos dois pontos.
4. Nenhuma outra lógica do handler deve ser alterada.
5. O campo `// agentes-chat ainda não tem empresa_id no request` deve ser
   removido ou atualizado para refletir a nova realidade.

---

## Casos extremos

- `tenantContext` ausente por bug de middleware: o desestruturamento causaria
  crash em runtime — aceitável; é um bug de infraestrutura, não desta feature.
- Clone sem `PADAXOR_TENANT_TOKEN`: `requireAiTenant` lança antes mesmo de
  `logAiUsage` — comportamento correto e inalterado.

---

## Definição de PRONTO

- [ ] `grep -n "empresaId: 0" routes/agentes-chat.ts` retorna zero ocorrências.
- [ ] `grep -n "requireAiTenant(0" routes/agentes-chat.ts` retorna zero ocorrências.
- [ ] Build do api-server passa sem erro.
- [ ] Boot limpo confirmado nos logs.

---

## Linhas vermelhas

- Não alterar a lógica de streaming SSE.
- Não alterar `tenantContextMiddleware`.
- Não adicionar nenhuma rota nova.
