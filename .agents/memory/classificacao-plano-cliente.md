---
name: Classificação e nível (plano) do cliente
description: Níveis Prata/Ouro/Platinum/Diamond (clients.plano), mapeamento do modelo antigo, marcador legado, rollback e o que não existe.
---

Nível do cliente (`clients.plano`), na ordem: **prata, ouro, platinum, diamond**; entrada = prata.
Decisão do responsável em 14/11/2026. Nomes e paleta moram em `padcom/src/lib/nivel-cliente.ts`;
o contrato (OpenAPI → zod) aceita só esses quatro valores. Classificação A–D é outro atributo.

**Modelo antigo real** (contrato de 13/11/2026): bronze, prata, ouro, "rodio" (erro de voz para
"ródio"). Platina/Noir só existiam em textos e cartas, nunca no banco. Todos os clientes estavam em bronze.

**Mapeamento:** só bronze→prata é automático. prata, ouro e rodio antigos coincidem em nome mas não em
posição, então ficam preservados como `legado:<valor>` e a interface mostra "A REVISAR" (nada vem
marcado; a equipe escolhe). A API recusa gravar `legado:*`. A migração é de execução única: o livro
`cliente_nivel_migracao` (cliente, clínica, valor antes/depois) impede reinterpretar "prata" novo como
antigo e alimenta o rollback em `scripts/migrations/rollback/` (restaura só quem não foi alterado depois).

**Não existe no código** (não inventar): filtro por nível, progressão automática, benefícios por nível,
nível na Área do Cliente do celular. Critérios, descontos e privilégios nunca foram definidos.

**Why:** pedido de preservar hierarquia, vínculos e histórico; nome igual não prova equivalência.

**How to apply:** não reintroduzir bronze/platina/noir. "BRONZE" em `ras-fap.ts`/`ras.ts` é tema de cor do
RAS, outro conceito. Ao mudar valores aceitos: OpenAPI, codegen e conferir que `lib/api-zod/src/index.ts`
exporta só `./generated/api`. Teste de e2e: `toHaveText` lê o HTML, o CSS põe caixa alta (usar regex /i).
Antes de aplicar a migração em outro banco, conferir os valores existentes de `plano` (pendências = `legado:%`).
