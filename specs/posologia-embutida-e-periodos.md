# Spec — Posologia embutida, periodos canonicos e mensagem sem acento

Data: 09/07/2026. Loop: Paxter Loop. Autonomia total concedida pelo CEO (sem validacao
intermediaria). Opcao mais robusta, com melhorias kaizen. Arquivo escrito SEM acento
(regra nova do CEO: tudo sem acento para nao dar erro).

## Objetivo (uma frase)
A posologia ja nasce embutida na formula (sugestao do catalogo aplicada automaticamente),
pode ser ditada pelo CEO no ato da indicacao (edicao manual que SOBREVIVE a re-sincronizacao),
esta amarrada aos 9 periodos canonicos do dia (jejum ate ceia), e toda a mensagem de WhatsApp
sai sem acento.

## Requisitos exatos
1. SEM ACENTO: toda mensagem de lembrete WhatsApp (Opus e template simples) passa por um
   normalizador unico `semAcento` no ponto final de montagem (um so funil). Emojis e
   formatacao (*_) preservados; somente marcas diacriticas e "ç" removidas.
2. GLOSSARIO: criar `specs/glossario-posologia.md` definindo, em linguagem simples e tabela:
   dose, posologia, tomada, diferenca entre dose e capsula/apresentacao, via, e os 9 periodos
   canonicos. Este arquivo e a referencia conceitual do sistema (espelho do conceito do IHE).
3. PERIODOS CANONICOS (9): o motor do lembrete passa de 3 periodos (manha/tarde/noite) para os
   9 canonicos ja existentes na tabela `periodos_dia` (transmutados do IHE):
   JE Jejum 05:00 | IM Inicio da Manha 07:00 | MM Meio da Manha 09:00 | AL Almoco 11:00 |
   IT Inicio da Tarde 13:30 | MT Meio da Tarde 16:00 | NO Noite 18:00 | FN Final da Noite 20:00 |
   CE Ceia 22:30. Horario de envio = inicio da janela do periodo.
4. HEURISTICA DE PERIODO por tomada (POSO): jejum/acordar -> JE; cafe/desjejum/manha -> IM;
   almoco/meio-dia -> AL; tarde -> IT; jantar/noite/treino -> NO; deitar/dormir -> FN;
   ceia -> CE. Sem pista -> IM (padrao deterministico).
5. POSOLOGIA EMBUTIDA: ao derivar a formula do catalogo, a posologia sugerida (POSO) ja vem
   aplicada automaticamente (comportamento atual, agora garantido e documentado).
6. DITADA NO ATO: quando o CEO edita a posologia de uma formula na Central de Lembretes
   (PATCH /api/lembretes/:clienteId), o campo ganha a marca `posologiaManual: true`.
   A re-sincronizacao (`sincronizarLembretePrescricao`) RESPEITA a marca: posologia manual
   vence a sugestao automatica do catalogo; demais campos seguem a regra atual.
7. BIBLIOTECA: promover o parser a pacote `@workspace/posologia` (lib composta do monorepo),
   com teste automatizado (vitest) do parser e do compositor cobrindo: 2 POSO no mesmo periodo,
   POSO sem refeicao, SUBS 01 sem numero, decimal com virgula e ponto.
8. KAIZEN: (a) um unico funil de normalizacao de acento; (b) fonte unica de periodos
   (MAPA_PERIODO espelha `periodos_dia`); (c) teste como blindagem de regressao.

## Casos extremos
1. Lembrete persistido antigo (siglas IM/IT/NO) continua valido — siglas coincidem com o canone.
2. Edicao manual apagada (posologia vazia no PATCH) -> remove a marca manual e volta a sugestao.
3. Formula sem POSO -> fallback IM+NO sem posologia (comportamento atual adaptado ao canone).

## Definicao de PRONTO
1. Preview do cliente 44 sem NENHUM acento e com almoco no periodo AL (11h00), jantar em NO.
2. Editar posologia via PATCH, re-sincronizar (demo-galeria) e a edicao manual SOBREVIVE.
3. Teste do pacote `@workspace/posologia` passando.
4. Typecheck sem erros novos nos arquivos tocados; revisao do architect com zero pendencia.

## Linhas vermelhas
1. NAO tocar no motor de disparo/idempotencia/janela BRT alem do mapa de periodos.
2. NAO mexer no receituario PDF.
3. Pacote sem prefixo de origem (primos independentes).
4. Rodape de marca PAXTER preservado.
