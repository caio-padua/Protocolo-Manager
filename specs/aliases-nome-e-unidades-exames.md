# Spec — Apelidos de nome (aliases) + 5 unidades por exame

Data: 11/07/2026. Método: Paxter Loop. NÃO desconstruir a planilha nem as 5 faixas já aprovadas.

## Objetivo (uma frase)
Cada exame tem UM nome elegível (canônico) único e uma lista de apelidos curados (até 5 visíveis
na tela, ilimitados por dentro) para que a varredura reconheça qualquer variação de nome vinda do
laudo; e cada exame passa a expor as 5 unidades mais comuns (uma marcada como padrão).

## Estado atual VERIFICADO (não reconstruir)
- O sistema JÁ reconhece apelidos: a tabela `exam_analyte_catalog` tem a coluna `synonyms`
  (lista de textos, ilimitada, editável) e o motor de varredura (`persist.ts` → `loadCatalog` +
  `matchAnalyte`) JÁ casa o nome do laudo contra `displayName` + todos os `synonyms`, com
  normalização (sem acento, minúsculo, só letra/número).
- O que FALTA: (a) tela para o médico curar esses apelidos; (b) semente rica de apelidos comuns;
  (c) garantir unicidade do apelido; (d) expor 5 unidades comuns por exame (hoje só 2–3 semeadas).

## Requisitos exatos
- R1 Nome elegível único: cada exame tem 1 `displayName` canônico; nenhum apelido pode repetir um
     `displayName` (nem de outro exame) nem um apelido já usado por outro exame.
- R2 Apelidos na tela (planilha): 5 campos de texto por exame para curar apelidos visíveis. O
     backend continua com `synonyms` (lista ilimitada). Salvar é NÃO destrutivo: se houver mais de 5
     apelidos internos (vindos da semente), os excedentes aparecem como etiquetas somente-leitura
     ("+N internos") e são PRESERVADOS no salvar; os 5 slots editam os 5 primeiros curados.
- R3 5 unidades por exame: a planilha permite CURAR até 5 unidades comuns por exame (adicionar,
     editar rótulo, informar o fator de conversão para a canônica, remover) e marcar UMA como padrão
     (canônica, fator 1). Substitui o conjunto de unidades do exame no salvar. O dropdown de unidade
     padrão (já existente) segue funcionando. Sem hard-code no motor.
- R4 Matching: o conjunto de chaves da varredura passa a incluir os apelidos curados (já incluía os
     `synonyms`); nome-apelido do laudo (ex.: "25-OH vitamina D") resolve para o nome elegível
     ("Vitamina D"). SÓ ESTENDER o conjunto de chaves; NÃO reescrever o motor.
- R5 Semente curada: popular apelidos comuns e até 5 unidades comuns para os analitos comuns já
     semeados. Ex.: Vitamina D → ["25 hidroxivitamina D", "25-OH vitamina D", "vitamina D3",
     "colecalciferol", "calcidiol"]. Idempotente e NÃO destrutiva.
- R6 Unicidade: ao salvar apelidos, se algum colidir (com displayName de qualquer exame, ou com
     apelido de outro exame), bloquear a gravação e devolver 400 com a colisão apontada.
- R7 Persistência espelhada: PUT salva; GET catalogo-faixas devolve apelidos + unidades; a
     Evolução e a DirecaoExamesTool continuam lendo da MESMA chave, sem regressão.
- R8 Promoção universal ("todos os exames possíveis"): a planilha lista exames curados MAIS os nomes
     crus vindos de laudos que ainda não estão no catálogo. Curar apelido/unidade de QUALQUER linha
     PROMOVE o exame ao catálogo (INSERT com code = chave canônica do nome), passando a ser
     reconhecido pelo motor. Assim o MECANISMO cobre 100% dos exames; a SEMENTE cobre de fábrica os
     comuns (curadoria honesta — não se inventa apelido de nome de laudo desconhecido).

## Casos extremos
- Menos de 5 apelidos → slots vazios em branco (não inventar apelido).
- Apelido duplicado dentro do próprio exame → deduplicar em silêncio (não é erro).
- Apelido igual a displayName/apelido de OUTRO exame → 400 (colisão), não grava.
- Unidade sem fator de conversão → mantém regra atual (status "conferência", sem "revisado").
- Reboot repetido → semente idempotente (2ª vez "inseridas: 0"); curadoria manual preservada.
- Exame de imagem/qualitativo → sem unidades numéricas; apelidos ainda permitidos.

## Definição de PRONTO
- P1 Planilha mostra por exame: nome elegível + 5 slots de apelido (+ etiquetas de internos) + até
     5 unidades com a padrão marcada. Salvar persiste; GET reflete. Provado por curl.
- P2 Varredura: laudo com nome-apelido casa no exame do nome elegível. Provado por curl/teste.
- P3 Semente curada idempotente e não destrutiva (2º boot "inseridas: 0"; edição manual intacta).
     Provado por curl/SQL.
- P4 Colisão de apelido bloqueada (400). Provado por curl.
- P5 architect aprova requisito por requisito, zero pendência bloqueante.

## Linhas vermelhas
- NÃO desconstruir as 5 faixas nem a planilha já aprovada; só SOMAR colunas de apelido/unidade.
- NÃO reescrever o motor de matching (`matchAnalyte`/`normalizeAnalyteName`) — só estender chaves.
- Semente NUNCA sobrescreve campo editado por humano (synonyms curados, isCanonical, canonicalUnit,
  factor, direction) — só semear no INSERT (lição "seed materializador não destrutivo").
- NÃO tocar assinatura/PDF, agenda, pagamentos.
- Preservar a DirecaoExamesTool validada.
