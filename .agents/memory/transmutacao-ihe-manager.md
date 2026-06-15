---
name: Transmutacao IHE -> Manager (chupa-cabra)
description: Decisoes duraveis de chave/idempotencia ao importar o catalogo e pacientes do IHE para o Padcon Conect (Manager)
---

# Transmutacao IHE -> Manager

Importa 2 JSON raw do GitHub (catalogo + pacientes com PII real) para tabelas-deposito ADITIVAS. Importador idempotente, transacional por colecao, reporta criados/atualizados/pulados/emRevisao.

## Regra de ouro
- So adicionar/afrouxar, nunca dropar dado operacional. Tabela `clients` afrouxada (cpf/email/phone nullable) e NUNCA truncada.

## Chave de deduplicacao do catalogo (decisao CEO 15/06/2026)
- `catalogo_formulas`, `catalogo_injetaveis`, `catalogo_implantes` deduplicam por `id_ihe` (id de origem do IHE), coluna integer notNull unique.
- **Why:** nessas 3 colecoes nenhum campo de negocio e unico — `codigo_semantico` se repete. Usar hash-de-conteudo ou codigo_semantico causava PERDA de dado (injetaveis caia para 162 em vez de 305). So o id de origem e 100% unico. Contagens corretas: 54 formulas / 305 injetaveis / 32 implantes.
- Isso e uma EXCECAO consciente ao "sem tag de origem" da CONCEITO RAIZ (item 2 do replit.md), registrada no item 6.
- As demais colecoes mantem chave de negocio NATIVA (sem id de origem): `catalogo_itens`=codigo_padcom, `catalogo_blends`=codigo_blend, `periodos_dia`=sigla.

## Pacientes
- Dedup por chave natural, precedencia: codigo_semantico -> codigo_externo -> cpf+1onome -> nome+nasc+telefone -> hash-de-conteudo da fichaClinica (idempotente p/ keyless).
- Pulados: is_teste e registros sem nome. updateClient usa COALESCE (nunca apaga campo existente com null).
- Validacao de aceitacao (nao numeros fixos): `count(*) == count(distinct chave)` por tabela; 2a run = 0 criados.
- `numId()` aceita so inteiro positivo (numero ou string `^\d+$`); "" / 0 / fracionario -> null (pulado), para nao colapsar varios registros no mesmo id.

## Operacao
- Schema com notNull novo em tabela populada quebra o `drizzle-kit push`. Truncar a tabela do catalogo (NUNCA clients) antes do push, ou aplicar a coluna via SQL direto (tabela vazia) e depois rodar push para reconciliar.
- `drizzle-kit push` tem prompt interativo (create vs rename column) que NAO aceita Enter via pipe (precisa TTY). Contornar aplicando ALTER TABLE via psql e depois `push` confirma sem diff.
- Re-rodar: `pnpm --filter @workspace/api-server exec tsx src/scripts/run-transmutacao.ts`. Idempotencia: 2a run = 0 criados, tudo atualizado.
- Quando o IHE republicar os 2 JSON, basta re-rodar o importador.
