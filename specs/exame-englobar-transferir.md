# Spec — Ferramentas de Curadoria do Console de Exames: ENGLOBAR + TRANSFERIR

Status: PRONTO (Fase 3 — architect PASS). Autor: Dr. Replit Paxter. Data: 13/07/2026.
Backend validado por curl+SQL (reversão fiel). Frontend construído em ConsoleExamesTool.tsx
(picker de destino, blocos ENGLOBAR/TRANSFERIR/OPERAÇÕES-RECENTES) com guard de corrida em
carregarTraProc. Typecheck padcom e api-server sem novos erros. Revisão architect: PASS.
Decisão do CEO: Opção A, versão mais abrangente/robusta/difícil (as duas ferramentas juntas,
com auditoria, idempotência e desfazer).

## Objetivo

Dar ao operador duas ferramentas no Console de Exames para consertar erros de garimpo/alocação:
(1) ENGLOBAR um exame já cadastrado (ex.: "15-3") dentro de um exame padrão (ex.: "CA 15-3"),
movendo os resultados, virando apelido e desativando o errado; e (2) TRANSFERIR resultado(s)
alocado(s) por engano de um exame para outro — tudo com trilha de auditoria e botão de desfazer.

## Glossário (siglas e termos, explicados na primeira vez)

| Termo | O que é |
|---|---|
| analyteCode (código do analito) | Código canônico do exame no catálogo (ex.: "ca 15 3"); resultado sem code = ainda não casado |
| normKey (chave normalizada) | Grafia crua normalizada (sem acento/caixa/pontuação) usada para agrupar variações |
| faixa / referência | Intervalo que classifica o resultado (normal/alto/baixo); interna curada tem prioridade sobre a do laudo |
| descoberto | Exame criado automaticamente a partir de um laudo (origin="descoberto"), não da base oficial |
| reclassificar | Recalcular valueCanonical/refLow/refHigh/status de um resultado contra o exame destino |
| idempotência | Rodar de novo a mesma operação sem duplicar nem corromper |
| batch (lote) | Um agrupador (uuid) de todas as linhas afetadas por UMA operação, para permitir desfazer |

## Requisitos exatos

### R0 — Motor compartilhado de reclassificação (reusável)
- R0.1 Criar função reutilizável que, dado um resultado (linha de exam_results) e um targetCode,
  recalcula: valueCanonical, unitCanonical, refLow, refHigh e status — espelhando EXATAMENTE a
  lógica já existente em `persist.ts` (parseBrazilNumber → resolveConversion pela unidade do laudo
  → faixa interna curada `exam_analyte_ranges` tem PRIORIDADE; unidade sem fator conhecido → status
  "conferencia"). Não duplicar regra: extrair/reusar os helpers já existentes.
- R0.2 Se o exame destino não tiver unidade/faixa curada, o resultado fica quantitativo quando houver
  valor numérico + unidade casável; caso contrário mantém-se sem classificação (não inventar faixa).

### R1 — Auditoria + desfazer (tabela nova)
- R1.1 Nova tabela `exam_result_reassignments` guardando, por resultado afetado, o ESTADO ANTERIOR
  completo (prevAnalyteCode, prevValueCanonical, prevUnitCanonical, prevRefLow, prevRefHigh,
  prevStatus, prevUnitConverted), o operation ("englobar"|"transferir"), sourceCode, targetCode,
  batchId (uuid do lote), createdAt e undoneAt (nulo até desfazer).
- R1.2 Para ENGLOBAR, guardar também o estado do catálogo de origem afetado (se foi desativado; quais
  apelidos foram adicionados ao destino) para o desfazer reverter fielmente. Guardar num registro de
  lote (pode ser JSONB num campo `catalogSnapshot` da própria tabela na 1ª linha do batch, ou tabela
  companheira — escolher o mais simples e robusto).
- R1.3 Toda operação roda em TRANSAÇÃO (tudo ou nada).
- R1.4 Desfazer (`POST .../reassignments/:batchId/desfazer`): restaura analyteCode e a classificação
  anterior de cada resultado do lote, reativa o exame de origem (se englobar) e remove os apelidos
  adicionados por aquele lote; marca undoneAt. Idempotente: desfazer duas vezes não quebra (2ª = no-op).

### R2 — Ferramenta 1: ENGLOBAR exame no padrão
- R2.1 Rota `POST /exames-lab/exames/englobar` com body { sourceCode, targetCode }.
- R2.2 Validações (retornar 400/409 com mensagem clara):
  - sourceCode ≠ targetCode;
  - ambos existem no catálogo;
  - não englobar um exame OFICIAL (origin="catalogo") como ORIGEM sem confirmação explícita
    (campo confirmOficial=true no body) — proteger a base oficial.
- R2.3 Ações em transação:
  1. mover todos os exam_results de sourceCode → targetCode (analyteCode) e RECLASSIFICAR (R0);
  2. absorver displayName da origem + synonyms da origem como apelidos do destino (reusar
     `absorbAsAlias`, respeitando o guarda anti-colisão; grafias que colidirem com terceiros são
     puladas, não abortam a operação);
  3. desativar o exame de origem (active=false) — não apagar (preserva histórico e permite desfazer);
  4. gravar auditoria (R1) com snapshot por resultado + snapshot do catálogo.
- R2.4 Idempotência: se a origem já não tiver resultados e já estiver inativa, retornar ok com
  contagem 0 (não recriar apelidos duplicados; absorbAsAlias já é idempotente).
- R2.5 Endpoint de PRÉVIA `GET /exames-lab/exames/:code/impacto` devolve: nº de resultados,
  nº de clientes distintos, nº de documentos distintos, e se é oficial/descoberto — para a tela
  mostrar o impacto ANTES de confirmar.

### R3 — Ferramenta 2: TRANSFERIR resultado(s) por engano
- R3.1 Rota `POST /exames-lab/exames/transferir` com body:
  { targetCode, resultIds?: number[], sourceCode?, examDocumentId?, clientId? }.
- R3.2 Seleção do que mover (nesta ordem de precedência):
  - se `resultIds` vier, move exatamente esses (granularidade fina, por resultado);
  - senão, se `sourceCode` vier, move os resultados daquele exame, opcionalmente restritos por
    `examDocumentId` e/ou `clientId` (por documento / por cliente / por exame inteiro).
- R3.3 Validações: pelo menos um seletor presente; targetCode existe; resultIds pertencem a
  exam_results; não permitir mover para o MESMO code (no-op explícito com contagem 0).
- R3.4 Ações em transação: atualizar analyteCode dos selecionados → targetCode + RECLASSIFICAR (R0)
  + gravar auditoria por resultado (R1). NÃO desativa exame nenhum (transfer é nível resultado).
- R3.5 Endpoint de apoio para a tela escolher resultados: reusar a procedência já existente
  (`GET /exames-lab/catalogo/:code/procedencia`) para listar documentos/linhas do exame de origem.

### R4 — Frente (Console de Exames)
- R4.1 No `ConsoleExamesTool.tsx`, ao selecionar um exame, exibir dois novos blocos 3D (padrões do
  skill-layout-paxter: `panel-3d-sub`, `BlockTitle` com ícone, `btn-3d`/`bevel-3d`, `field-engraved`,
  `concave-3d`):
  - Bloco "ENGLOBAR NESTE PADRÃO": escolher o exame DESTINO (busca no catálogo), mostrar a prévia de
    impacto (nº resultados/clientes/documentos), botão "Englobar" com confirmação; se a origem for
    oficial, exigir marcação extra de confirmação.
  - Bloco "TRANSFERIR RESULTADO(S)": listar documentos/linhas do exame selecionado (procedência) com
    caixas de seleção (marcar linhas ou "todas"), escolher exame DESTINO e botão "Transferir".
- R4.2 Bloco "OPERAÇÕES RECENTES / DESFAZER": listar os últimos lotes (englobar/transferir) com
  resumo (o que moveu, quantos, quando) e botão "Desfazer" por lote.
- R4.3 Após cada operação, a tela recarrega a lista de exames e o detalhe (o exame de origem some da
  lista quando englobado; contagens atualizam).
- R4.4 Textos em português (Brasil), termo "cliente" (não "paciente").

## Casos extremos a tratar

| Caso | Tratamento |
|---|---|
| Englobar A em B e B em A (ciclo) | Cada operação é independente; validar source≠target; sem "merge automático reverso" |
| Origem sem resultados | ok com contagem 0; ainda absorve apelido e desativa (idempotente) |
| Apelido da origem já pertence a terceiro exame | pular aquele apelido (não aborta); registrar quais foram absorvidos |
| Resultado já no destino (transferir para o mesmo code) | no-op explícito, contagem 0 |
| Unidade do laudo sem fator no destino | status "conferencia" (honesto), não inventar faixa |
| Desfazer duas vezes | 2ª vez é no-op (undoneAt já preenchido) |
| Exame oficial como origem do englobar | bloquear sem confirmOficial=true |
| Concorrência (dois cliques) | transação + idempotência; contagem real vem do resultado da transação |

## Definição de PRONTO

| Critério | Como conferir |
|---|---|
| Englobar move resultados, vira apelido e desativa origem | curl na rota + SELECT count por analyteCode antes/depois |
| Resultados englobados ganham faixa/quantitativo quando o destino tem curadoria | SELECT status/value_canonical dos resultados movidos |
| Transferir move só o selecionado (por resultado/documento/cliente) | curl com resultIds e com sourceCode+docId |
| Desfazer restaura estado anterior fielmente (código + classificação + apelido + ativo) | executar operação → desfazer → SELECT compara com o estado inicial |
| Idempotência (repetir operação/undo não corrompe) | rodar 2x; contagens coerentes |
| Auditoria grava snapshot por resultado + lote | SELECT em exam_result_reassignments |
| Tela mostra prévia de impacto, executa e lista desfazer | screenshot do Console |
| typecheck padcom e api-server sem novos erros | pnpm --filter run typecheck em cada pacote |
| architect PASS requisito por requisito | Fase 3 |

## Linhas vermelhas (NÃO violar)

- NÃO alterar o motor de triagem/faxina (`triagem.ts` runTriagemBackfill / persist de import) por
  estética; só REUSAR seus helpers (`absorbAsAlias`, e a lógica de classificação do `persist.ts`).
- NÃO mudar o payload/contrato de rotas existentes de exames por conveniência.
- NÃO apagar resultados nem exames fisicamente (soft: active=false); zero perda de dado.
- NÃO inventar autenticação por rota (app admin single-tenant, consistente com o resto).
- Manter o padrão visual 3D do skill-layout-paxter (nada de estilo novo por tela).
