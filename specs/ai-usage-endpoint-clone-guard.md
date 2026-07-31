# Spec: Guard de instância CEO no endpoint de custo IA

**Data:** 31/07/2026
**Relacionado a:** Task #25

---

## Objetivo

Fazer com que `GET /api/ai-usage/resumo` retorne `403` em qualquer instância
que NÃO seja a do CEO — mesmo que o `tenantContext.isPlatformOwner` seja `true`
(o que ocorre em toda instância na fase single-tenant atual).

---

## Contexto

`requirePlatformOwner` checa `req.tenantContext.isPlatformOwner`. Na fase atual,
o middleware hardcoda `isPlatformOwner = true` em **todas** as instâncias.
Portanto, um clone licenciado conseguiria ver o custo global de IA da plataforma,
quebrando o sigilo comercial do CEO.

A proteção correta é baseada em **variável de ambiente**, não em tenant context:
- `PADAXOR_AI_BYPASS=true` → instância CEO → pode ver o resumo.
- `PADAXOR_TENANT_TOKEN=<tok>` → clone autorizado → 403 neste endpoint.
- Nenhuma das duas → clone não autorizado → 403 (IA já bloqueada por `requireAiTenant`).

---

## Requisitos

1. Criar um middleware `requireCeoInstance` em
   `artifacts/api-server/src/middleware/tenantContext.ts`.
2. `requireCeoInstance` verifica `process.env.PADAXOR_AI_BYPASS === "true"`.
   - Verdadeiro → `next()`.
   - Falso → `res.status(403).json({ error: "Endpoint exclusivo da instância CEO (PADAXOR_AI_BYPASS)." })`.
3. Em `routes/ai-usage.ts`, substituir `requirePlatformOwner` por
   `requireCeoInstance` na rota `GET /ai-usage/resumo`.
4. Exportar `requireCeoInstance` de `tenantContext.ts` (já importado em ai-usage.ts).
5. Nenhum dado é deletado; nenhuma tabela é alterada.

---

## Casos extremos

- Variável `PADAXOR_AI_BYPASS` não definida → trata como `false` → 403 (correto).
- Variável definida como `"1"` ou `"yes"` → trata como `false` → 403
  (aceitável; o valor canônico é `"true"`).
- `requirePlatformOwner` continua existindo e sendo usado em outras rotas —
  não removê-lo, apenas não usá-lo neste endpoint.

---

## Definição de PRONTO

- [ ] `GET /api/ai-usage/resumo` retorna `403` quando `PADAXOR_AI_BYPASS` não está definido.
- [ ] `GET /api/ai-usage/resumo` retorna `200` quando `PADAXOR_AI_BYPASS=true` (instância CEO).
- [ ] `requireCeoInstance` exportado de `tenantContext.ts` e importado em `ai-usage.ts`.
- [ ] Build do api-server passa sem erro.
- [ ] `requirePlatformOwner` permanece intacto em `tenantContext.ts`.

---

## Linhas vermelhas

- Não alterar a lógica de consulta SQL do resumo.
- Não remover `requirePlatformOwner` nem qualquer rota existente.
- Não modificar `tenantContextMiddleware`.
