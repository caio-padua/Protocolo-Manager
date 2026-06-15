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
- Dedup por chave natural, precedencia: codigo_semantico -> codigo_externo -> cpf+1onome -> nome+nasc+telefone -> id_ihe (campo `id` do export, ultimo recurso). O `id` fica gravado em ficha_clinica->>'id'.
- **NUNCA promover id_ihe acima do passo 5**: ~148 fichas duplicadas da MESMA pessoa precisam fundir pelos passos 1-4; o id de origem e unico por linha, entao promove-lo quebraria a fusao.
- Hash-de-conteudo foi REMOVIDO da cascata (criava orfa ao editar+reimportar). id_ihe no passo 5 e estavel (edita -> mesmo id -> UPDATE, sem orfa).
- Fail-closed no passo 5 (doutrina "nunca fallback silencioso"): se chegar SEM id_ihe, contabiliza `passo5_sem_id_ihe` no relatorio + log.warn + insere com needsReview=true (dado nunca dropado, mas flagueado p/ conferencia humana).
- Pulados: is_teste e registros sem nome. updateClient usa COALESCE (nunca apaga campo existente com null).
- Validacao de aceitacao (nao numeros fixos): `count(*) == count(distinct chave)` por tabela; 2a run = 0 criados.
- `numId()` aceita so inteiro positivo (numero ou string `^\d+$`); "" / 0 / fracionario -> null (pulado), para nao colapsar varios registros no mesmo id.

## Caixinhas operacionais (deposito -> tela)
- O deposito (`catalogo_*`) guarda 100% do dado; as TELAS leem de tabelas operacionais proprias, nao do deposito. Para "operar", importa-se do deposito para a caixinha que a tela ja consome.
- Substancias: tela `/substances` le tabela `substances`. Importa-se `catalogo_itens` (categorias injetavel_ev/injetavel_im/implante = substancias aplicaveis) para `substances`, idempotente por `codigo_padcom` (unique). Exames/protocolos NAO sao substancias; formulas vao para a caixinha de Prescricao.
- **Why:** misturar tudo numa tela so seria clinicamente errado; cada natureza tem sua caixinha.
- Upsert preserva campos operacionais/manuais: o `set` do onConflictDoUpdate so inclui campos do catalogo (stock e beneficios clinicos ficam de fora). Preco so e sobrescrito quando o catalogo traz valor valido — catalogo sem preco NAO zera preco ajustado a mao (regra de ouro).
- Os 9 seeds antigos de `substances` tem `codigo_padcom` NULL e coexistem (Postgres permite multiplos NULL em coluna unique); nunca sao tocados pelo import.
- Prescricao (formulas): a tela mescla formulas curadas estaticas + formulas do banco (rota le `catalogo_itens` categoria=formula + componentes `catalogo_formulas`). Merge dedup por id, estatico vence. As do IHE entram na categoria unica "ihe" ("Formulas Padcon (importadas)"), NAO mapeadas para categorias clinicas. **Why:** mapear area_semantica->categoria clinica arriscava mis-categorizacao (Dr. e medico); bucket neutro deixa o medico recategorizar. **Pitfall React:** ao mesclar estatico+banco, todo `useMemo` derivado (filtered/stats) precisa do array mesclado nas deps, senao filtra so o estatico enquanto o badge conta o total.
- Deposito de formulas veio INCOMPLETO do IHE: so 5 de 13 com ativos; 8 vieram so com titulo. Carta de pedido de reexport em `CARTA_AO_DR_REPLIT_IHE_FORMULAS_FALTANTES_26.06.15.md`. Quando o IHE reexportar completo, re-rodar importador e elas aparecem sozinhas.

## Onda motor/exames (3o export do IHE)
- 13 colecoes: chave de negocio NATIVA onde existe (exames=codigo_exame, analitos=codigo, blocos=codigo_bloco, bloco_exames=bloco_id+nome_exame+grau, sintomas/cid10=codigo, direcao=nome_exame, decisao_clinica=caso_id).
- `id_ihe` ESTENDIDO para 5 colecoes onde NENHUM campo de negocio e unico: doencas, regras_motor (regra_id repete 3x), anamnese_questionario (pergunta_id Q030 duplica), mapa_anamnese_motor, endovenosos. Verificado por teste de unicidade que o `id` de origem e 100% unico nessas.
- **Why:** mesma logica da excecao do item 6 do replit.md (zero perda quando nao ha chave natural). E uma EXTENSAO da excecao documentada — sinalizada ao CEO (Art.50), nao decisao silenciosa.
- `catalogo_exames` tem coluna `dados` jsonb com a linha crua inteira (68 colunas da origem) -> garante zero perda mesmo das colunas nao promovidas.
- A GRADE (bloco x exame) e a tabela `catalogo_bloco_exames`; grau ordena por ranking (BASICA<INTERMEDIARIA<SOFISTICADA<AMPLIADA), fallback 99 p/ desconhecido.

## Operacao
- Schema com notNull novo em tabela populada quebra o `drizzle-kit push`. Truncar a tabela do catalogo (NUNCA clients) antes do push, ou aplicar a coluna via SQL direto (tabela vazia) e depois rodar push para reconciliar.
- `drizzle-kit push` tem prompt interativo (create vs rename column) que NAO aceita Enter via pipe (precisa TTY). Contornar aplicando ALTER TABLE via psql e depois `push` confirma sem diff.
- Re-rodar: `pnpm --filter @workspace/api-server exec tsx src/scripts/run-transmutacao.ts`. Idempotencia: 2a run = 0 criados, tudo atualizado.
- Quando o IHE republicar os 2 JSON, basta re-rodar o importador.
