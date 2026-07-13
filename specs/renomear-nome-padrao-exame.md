# Spec — Renomear o "nome padrão" de um exame (Opção A, zero perda)

## Objetivo
Permitir ao CEO editar o nome de exibição ("nome padrão") de QUALQUER exame no Console de Exames, de forma geral (sem hardcode), mantendo a identidade interna fixa e preservando o nome anterior como apelido automático — sem perder nada do que já existe.

## Contexto verificado na fonte
- Tabela `exam_analyte_catalog` (lib/db/src/schema/exam-results.ts): `id` (PK), `code` (text, UNIQUE — identidade), `display_name` (NOT NULL — rótulo exibido), `synonyms` (jsonb string[] — apelidos), `direction`, `active`, `origin`, `updatedAt` (auto).
- Vínculo com histórico: `exam_results.analyte_code`, `exam_analyte_ranges.analyte_code` e `exam_analyte_units.analyte_code` apontam para `code`. Portanto RENOMEAR NÃO PODE MUDAR `code`.
- Rota atual `PUT /api/exames-lab/catalogo-faixas/aliases`: grava só `synonyms` para exame existente; usa `resolverCodeCatalogo` que pode derivar `code` novo via `chaveFaixa(displayName)`. Não serve para renomear com segurança.
- Front `ConsoleExamesTool.tsx`: painel "IDENTIDADE" (render ~1397) hoje só edita apelidos (`aliasDraft`, `salvarApelidos`). `aliasDraft` é inicializado ao selecionar um exame (~807-808).
- Rotas de exames-lab usam fetch cru (BASE + path), fora do contrato Orval/OpenAPI — logo não há codegen a regenerar.

## Requisitos exatos
1. NOVA rota backend `PUT /api/exames-lab/catalogo/renomear`, body `{ code: string, novoNome: string }`.
2. A rota busca o exame pelo `code` (identidade). O `code` NUNCA muda.
3. Se o exame existe no catálogo:
   3.1. Lê o `display_name` atual DO BANCO (fonte de verdade), não do front.
   3.2. Grava `display_name = novoNome`.
   3.3. Adiciona o nome anterior a `synonyms` (apelido automático) — só se `chaveFaixa(anterior) !== chaveFaixa(novoNome)` e ainda não estiver na lista.
   3.4. Preserva synonyms/faixas/unidades/direção existentes (não destrutivo).
4. Se o exame NÃO existe no catálogo (linha de fallback vinda de resultados): promove — cria linha com `code` recebido (estável), `display_name = novoNome`, `origin = "descoberto"`, `active = true`, e coloca o `nomeAtual` recebido do front em `synonyms` para preservar a grafia que os resultados usam. Para isso o body aceita opcional `nomeAtual?: string`.
5. Validação de unicidade: se `chaveFaixa(novoNome)` colidir com `code`, `display_name` ou qualquer `synonym` de OUTRO exame → 400 com mensagem clara indicando o dono do conflito. (Reusar a lógica `donoPorChave`.)
6. Idempotência: se `chaveFaixa(novoNome) === chaveFaixa(nome atual)` → 200 sem alteração (não é erro).
7. `novoNome` vazio/só espaços → 400.
8. Operação transacional; retorno `{ ok: true, code, displayName, synonyms }`.
9. Front: no painel "IDENTIDADE" do Console de Exames, ADICIONAR (acima dos apelidos) um campo "Nome padrão" editável + botão "Salvar nome".
   9.1. Estado `nomeDraft` inicializado com `display_name` do exame ao selecioná-lo (junto de `aliasDraft`).
   9.2. `salvarNome` chama a nova rota; ao sucesso atualiza a linha em `setRows` (novo `display_name`, `synonyms` retornados), mantém o `code`, e mostra mensagem de sucesso/erro no mesmo padrão de `salvarApelidos`.
   9.3. Botão desabilitado enquanto salva ou se o nome estiver vazio ou igual ao atual.
10. Visual segue o sistema Paxter (skill-layout-paxter): painel `panel-3d-sub`, input `concave-3d`, botão `btn-3d`/`bevel-3d` — espelhar exatamente o estilo já usado no bloco de apelidos.

## Casos extremos a tratar
- Renomear para nome que já é apelido/nome de outro exame → 400 (não fundir por renomeação; para fundir existe ENGLOBAR).
- Renomear para o mesmo nome (com/sem acento/caixa) → no-op 200.
- Exame de fallback (inCatalog=false) → promover preservando a grafia atual como apelido.
- Nome anterior já presente em synonyms → não duplicar.
- Muitos apelidos: o antigo entra na lista completa do banco (não limitado aos 5 visíveis da UI).

## Definição de PRONTO
- `pnpm --filter @workspace/api-server run typecheck` e `pnpm --filter @workspace/padcom run typecheck` sem NOVOS erros (globais pré-quebrados inalterados).
- Curl de renomear em exame real: `code` inalterado, `display_name` novo, nome antigo presente em `synonyms`; SELECT confirma que `exam_results` do analito seguem apontando o mesmo `analyte_code`.
- Curl de colisão retorna 400; curl idempotente (mesmo nome) retorna 200 sem mudança.
- Triagem passa a reconhecer o nome antigo (por estar em synonyms) — verificado logicamente pelo motor existente (displayName + synonyms).
- Architect: PASS requisito por requisito.

## Linhas vermelhas
- NUNCA alterar `code` de exame existente.
- NUNCA apagar synonyms/faixas/unidades/direção/resultados.
- NÃO tocar no motor de ENGLOBAR/TRANSFERIR/DESFAZER nem no motor de triagem.
- NÃO mexer em OpenAPI/Orval (rotas exames-lab são fetch cru).
- NÃO hardcode de "Vitamina D" — solução geral.
