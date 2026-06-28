# Spec — Onda dos E-mails Ricos no casco Hermes (navy/ouro)

Decisao do CEO Dr. Caio em 28/06/2026 (Opcao A): os e-mails ricos (com tabelas
clinicas densas e anexos) passam a sair PELO Motor Unico de Envio Branded (Hermes
Paxter), re-tematizados para navy/ouro DENTRO do casco do motor, preservando 100%
do conteudo e dos anexos. Onda separada da spec `padrao-envios-paxter.md`.

## Objetivo

Fazer os 5 envios ricos (4 do `email-service.ts` + 1 par de demos do RAS) sairem
pelo motor `enviarMensagemPaxter`, vestindo o casco Hermes navy/ouro, com as
tabelas clinicas re-tematizadas para fundo escuro, sem perder nenhum dado nem
nenhum anexo (.ics / PDF assinado / PDF do protocolo).

## Escopo — os 5 envios ricos

| # | Envio | Fonte hoje | Anexo a preservar |
|---|---|---|---|
| 1 | Pre-sessao | `email-service.ts` buildPreSessionHTML / sendPreSessionEmail | `.ics` (quando ha sessionId) |
| 2 | Pos-sessao | `email-service.ts` buildPostSessionHTML / sendPostSessionEmail | PDF do RAS assinado ICP-Brasil |
| 3 | Protocolo | `email-service.ts` buildProtocolEmailHTML / sendProtocolEmail | PDF do protocolo / RAS FAP |
| 4 | Onboarding | `email-service.ts` buildOnboardingHTML / sendProtocolOnboardingEmail | `.ics` consolidado |
| 5 | RAS demos | `routes/ras.ts` buildDemoEmailHtml / buildFichasEmailHtml | PDF de demonstracao |

## Mecanismo (sem forkar o casco)

1. Estender `PaxterDoc` com campo opcional `blocosHtml?: string[]`: blocos de HTML
   ja confiavel (tabelas/cartoes clinicos) que o motor injeta DENTRO do casco
   Hermes, entre os paragrafos e o botao. Default ausente = e-mail simples (como hoje).
2. `render-email.ts` (`renderPaxterEmail`) injeta `blocosHtml` no `inner`, dentro
   do mesmo card navy, sem alterar cabecalho/rodape/wordmark.
3. Os 5 envios passam a montar `PaxterDoc` com `blocosHtml` (tabelas re-tematizadas)
   + `anexos`, e chamam `enviarMensagemPaxter(doc, destino, ["EMAIL"], { baseUrl })`.
4. `whatsapp`/`telegram` desses 5: se o canal nao for solicitado hoje, nao acrescentar
   canal novo nesta onda (escopo = e-mail). Os blocos HTML so afetam o e-mail; os
   cartoes (WhatsApp/Telegram) ja ignoram `blocosHtml` por contrato (so leem texto).

## Re-tema (mapa de cores claro -> navy/ouro Hermes)

| Papel | Antes (claro) | Depois (Hermes) |
|---|---|---|
| Fundo do painel/tabela | #ffffff / #f8fafc | #0f1d3a (painel) sobre o card #0b1426 |
| Borda | #e2e8f0 / #f0f0f0 | rgba(201,162,79,.25) |
| Cabecalho de tabela (th) | fundo #f8fafc, texto #64748b | fundo #102043, texto #c9a24f (ouro) |
| Titulo de secao (h2/h3) | #1e293b / azul / verde | #f3ead6 com regua ouro |
| Texto corpo | #475569 / #64748b | #c2cee0 / #7e90ab (muted) |
| Caixa de codigo de validacao | azul claro #f0f9ff | navy #0f1d3a, borda ouro, codigo em #c9a24f |
| Aviso .ics | ciano #ecfeff | navy #0f1d3a, titulo ouro |
| Status "Aplicado" | verde #dcfce7/#166534 | manter semantica: pílula verde sobre escuro (#0f2a1e / #34d399) |
| Status "Nao aplicado" | vermelho #fee2e2/#991b1b | pílula vermelha sobre escuro (#2a1010 / #f87171) |
| Barra de impacto (track) | #e5e7eb | rgba(255,255,255,.10); fill mantem a cor semantica do sistema |
| Ponto colorido da substancia | s.color (mantido) | s.color (mantido — semantico) |
| Estrelas de eficacia | ouro/cinza | manter ouro #c9a24f / vazio #5b6b86 |

Serifa nas manchetes = Georgia (igual ao casco). Sans no corpo = stack do casco.

## Requisitos exatos

1. `PaxterDoc.blocosHtml?: string[]` adicionado em `types.ts` com comentario.
2. `renderPaxterEmail` injeta os blocos no card navy, entre paragrafos e botao;
   ausencia de `blocosHtml` produz EXATAMENTE o e-mail simples de hoje (sem regressao).
3. Os 5 envios saem por `enviarMensagemPaxter` (e-mail), nunca mais por
   `sendGmailMessage` direto a partir desses pontos.
4. TODOS os anexos preservados: pre-sessao `.ics` so quando ha sessionId; pos-sessao
   PDF do RAS so quando ha buffer+rasId; protocolo PDF sempre; onboarding `.ics`
   consolidado; RAS demos PDF de demonstracao.
5. Conteudo 100% preservado: codigo de validacao, tabela de substancias (dose,
   sessao), blocos de detalhe por substancia (descricao, funcao, impacto por sistema,
   efeitos percebidos, energia, sono, performance, pele, longevidade), termos de
   consentimento, avisos, cronograma de sessoes, lista de substancias do protocolo.
6. Re-tema navy/ouro aplicado a TODAS as tabelas/caixas internas (mapa acima); nada
   de "ilha branca" sobre o navy.
7. Assuntos preservados (ou equivalentes): pre-sessao com codigo, pos-sessao com data,
   protocolo, onboarding, RAS demos.
8. Status honesto por canal mantido (sent/mock/error) conforme o motor ja faz.

## Casos extremos

1. Substancia sem `bodySystemEffects` / sem campos opcionais: bloco omite a parte
   ausente (como hoje), sem quebrar.
2. `blocosHtml` vazio ou ausente: e-mail simples, sem secao extra.
3. Cor da substancia `s.color` pode ser clara: usar so como ponto/barra, nunca como
   fundo de texto (legibilidade no navy).
4. E-mail rico deve continuar legivel em cliente que ignora `<style>` (estilos inline,
   tabelas role=presentation — ja e o padrao do casco).
5. Gmail nao conectado: motor retorna mock honesto; nao travar o fluxo chamador.

## Definicao de PRONTO

| Criterio | Como conferir |
|---|---|
| Os 5 envios saem pelo motor | grep: nenhum `sendGmailMessage` nos 5 pontos |
| Anexos preservados | leitura do diff: `.ics`/PDF anexados via `doc.anexos` |
| Re-tema navy/ouro sem ilha branca | render real do HTML -> inspecao visual |
| Sem regressao no e-mail simples | `blocosHtml` ausente == casco de hoje |
| Conteudo integral | conferir campo a campo contra os builders atuais |
| architect PASS requisito-a-requisito | code_review com includeGitDiff:true |

## Linhas vermelhas

1. NAO quebrar nenhum anexo (`.ics`, PDF do RAS assinado, PDF do protocolo).
2. NAO alterar o motor de `.ics` (`buildVCalendar`, UID/SEQUENCE/PUBLISH/fuso BRT).
3. NAO alterar a assinatura digital nem o conteudo dos PDFs (so o corpo do e-mail).
4. NAO mudar o casco Hermes (cabecalho/wordmark/rodape) — so injetar blocos no miolo.
5. NAO acrescentar canal (WhatsApp/Telegram) onde hoje so ha e-mail nesses 5.
6. NAO logar token nem PII sensivel.
