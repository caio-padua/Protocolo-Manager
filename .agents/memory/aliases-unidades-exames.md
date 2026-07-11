---
name: Apelidos + unidades por exame (curadoria universal)
description: Como a planilha de faixas cura apelidos/unidades e por que salvar apelido já ensina o scanner sem tocar o motor.
---

# Apelidos (synonyms) + unidades por exame — curadoria universal

Regra: para dar "cobertura de TODOS os exames" sem inventar dados clínicos, o valor está no
MECANISMO (curadoria universal + promoção), não em semear tudo. A SEMENTE cobre só os comuns.

**Salvar apelido em `synonyms` já ensina o scanner — NÃO tocar o motor.** O motor de extração
(`persist.ts` loadCatalog) monta as chaves de matching a partir de `displayName + synonyms` e
`matchAnalyte` casa por `normalizeAnalyteName`. Logo, gravar apelidos na coluna `synonyms` do
catálogo estende as chaves reconhecidas sem reescrever o matching (princípio "só estender chaves").

**Promoção universal:** curar apelido/unidade de QUALQUER linha da planilha (inclusive nomes crus de
laudo que ainda não estão no catálogo) faz INSERT no catálogo com `code = chaveFaixa(displayName)`.
Assim o exame passa a existir e a ser reconhecido. No backend isso é `resolverCodeCatalogo` (acha por
code, senão por chave canônica do nome, senão promove). Como a promoção muda o `code` de uma linha
não-catálogo, o frontend precisa de um `remapCode(oldCode,newCode)` que reancora todos os rascunhos
(aliasDraft/unitDraft/drafts/snapshots) e o `expandido`.

**Unidades:** substituir o conjunto (delete+reinsert por analyteCode) com exatamente UMA canônica
(fator forçado a 1) e atualizar `canonicalUnit` do catálogo. Dedup por `normUnit`.

**Why:** o CEO pediu "para TODOS os exames possíveis"; a resposta honesta é mecanismo que cobre 100%
por curadoria + semente dos comuns, jamais fabricar apelido de nome de laudo desconhecido.

**How to apply:** ao mexer nesta planilha (`PlanilhaFaixasTool.tsx` + `exames-lab.ts`
GET/PUT catalogo-faixas), lembrar: GET deve devolver `synonyms` em TODA linha (catálogo e crua =[]),
senão o type Row/UI quebra; e qualquer PUT que promova tem de devolver o `code` final para o front
reancorar.
