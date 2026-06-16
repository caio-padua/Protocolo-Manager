---
name: PUT/PATCH de substancias descarta campos fora do contrato
description: campos editaveis precisam estar no OpenAPI body schema senao o update os perde em silencio
---

# Edicao de entidades: o contrato manda

Qualquer campo que a tela de edicao envia precisa existir no schema do corpo no OpenAPI
(e, no caso de PATCH manual, na whitelist da rota). Senao o campo e descartado em silencio,
o request retorna 200 e nada persiste. **200 NAO prova persistencia** — confirme sempre com GET.

**Why:** descoberto em 16/06/2026 — campos clinicos (estrelas, efeitos por sistema, descricoes)
nunca salvavam pelo PUT porque o body schema so tinha nome/categoria/cor/estoque/preco. O zod
gerado por orval usa `zod.object`, que faz `.strip()` por padrao e remove chaves desconhecidas.

**How to apply:**
- Ao adicionar campo editavel: 1) coluna no schema Drizzle; 2) propriedade no body E na resposta
  no OpenAPI; 3) codegen; 4) db push; 5) incluir no payload do onSave; 6) se houver PATCH com
  whitelist manual, adicionar la tambem; 7) validar PUT e PATCH por GET.
- Objeto livre (mapa chave->numero): no OpenAPI use `type: object` + `additionalProperties` ->
  orval gera `zod.record` (preserva todas as chaves). Sem `additionalProperties` vira `zod.object({})`
  que apaga tudo.
- Coerencia nullable: nao marque `nullable` no contrato para coluna que e NOT NULL no banco, ou um
  `null` enviado passa no parse e estoura 500 no update.
