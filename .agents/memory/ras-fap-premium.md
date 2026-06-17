---
name: RAS FAP premium layout
description: Como o gerador do RAS FAP (PDF paisagem) calcula a grade e por que difere das sessions globais
---

# RAS FAP — modelo "PDF PREMIUM"

Regra: a grade do RAS FAP calcula o cronograma POR GRUPO de substancias
(chunks de ate 5 colunas por pagina), derivando as datas e o numero da sessao
de cada substancia a partir de `startDate` + k*`frequencyDays` (ate `totalSessions`),
e consolidando por SEMANA ISO (segunda a domingo). NAO usa as `sessions` globais
ja consolidadas do protocolo para montar as linhas.

**Why:** No modelo aprovado pelo CEO (FABIO MORGON), cada pagina/grupo de
substancias REINICIA as datas das semanas independentemente das outras paginas
(ex.: pagina 2 da testosterona comeca em 13/06 mesmo que a pagina 1 ja tenha
semanas em outras datas). A consolidacao global do protocolo funde semanas entre
substancias de paginas diferentes e quebraria essa fidelidade.

**How to apply:** Ao mexer em `generatePhysicalRASPdf` (artifacts/api-server/src/lib/pdf-signer.ts),
manter o calculo por grupo. Detalhes fieis ao modelo que NAO sao bug:
- `DATA ATENDIMENTO` fica EM BRANCO de proposito (preenchida a mao no modelo).
- Data eleita da semana = aplicacao mais cedo da semana (bate com o modelo).
- Colunas/linhas em branco ate completar 20 linhas por pagina; numeracao SEM.
  continua entre paginas (slotBase += 20 por pagina).
- Cabecalho da substancia = `name` + ` ` + `dose` (dose vem de protocol_items.dose).
- Texto via helper `enc`: mantem Latin-1 (acentos do WinAnsi), troca tab/quebra
  por espaco e chars exoticos por "-" (celulas sao de 1 linha).

# Endpoint publico com efeitos colaterais (e-mail/Drive) — exigir chave + allowlist

Regra: qualquer rota PUBLICA que dispare envio de e-mail (sendGmailMessage) ou
upload ao Drive (uploadToFolderById) NAO pode aceitar destinatario livre. Exigir
chave secreta (process.env.SESSION_SECRET via query/header) E allowlist fixa de
destinatarios; sem isso vira relay aberto / exaustao de quota.

**Why:** A revisao (architect) reprovou a 1a versao da rota de demonstracao do RAS
FAP por permitir `?send=1&to=qualquer-email` sem auth — vetor de spam/custo.

**How to apply:** O download do PDF (dados ficticios) pode continuar publico; so os
efeitos colaterais ficam atras do guard. Padrao usado: `authorizedSend = send &&
emailValido && key === SESSION_SECRET && ALLOWED.has(to)`.

# Colisao de rota Express por segmento unico

`/ras/:id` (registrada antes) captura qualquer `/ras/<um-segmento>`, inclusive
`/ras/physical-demo`, e tenta parsear como id numerico (400). Rotas novas de
segmento unico sob `/ras/...` devem usar PREFIXO distinto (ex.: `/ras-fap-demo`)
ou ser registradas ANTES de `/ras/:id`.
