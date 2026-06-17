---
name: RAS FAP — motor de grade (agenda global)
description: Como o RAS FAP monta a grade substancias x idas (agenda GLOBAL, nao por grupo) e as regras visuais do CEO
---

# RAS FAP — motor de grade (AGENDA GLOBAL)

Regra: a grade do RAS FAP usa uma AGENDA GLOBAL unica para todas as substancias.
Cada substancia gera suas idas por `inicio + k*frequenciaDias` (ate `sessoes`);
todas as idas entram numa unica linha do tempo consolidada por SEMANA ISO
(segunda a domingo); a numeracao SEM e CONTINUA atravessando paginas. Quando uma
folha (bloco de 5 colunas) nao tem nenhuma substancia aplicada numa semana,
aquela SEM NAO aparece naquela folha — geram-se LACUNAS (ex.: folha 2 pula de
SEM 10 para SEM 13). Celula = "N/total"; varias doses na mesma semana juntam com
middot ("\u00b7").

**Why:** Decisao do CEO (Dr. Caio) — o motor deve ser IDENTICO ao `rasFap.ts` do
IHE (fonte-da-verdade). Verificado por diff normalizado: segundaDaSemana, chunk e
planejarPaginasRasFap byte-identicos; montarGrade difere so por 1 ponto-e-virgula
cosmetico. Isto SUBSTITUI o modelo antigo "por grupo / pagina reinicia datas" —
esse modelo esta MORTO, nao reintroduzir.

**How to apply:** O motor vive em `artifacts/api-server/src/lib/ras-fap.ts` e a
LOGICA da grade nunca deve ser alterada (so render/estetica). `generatePhysicalRASPdf`
em `pdf-signer.ts` e so um ADAPTADOR (PhysicalRASData -> DadosRasFap); normaliza
dados ruins do banco (clampInt sessoes/frequencia em [1,365]) e falha explicita em
data invalida (nao imprimir cronograma errado). Regras visuais fixas do CEO:
5 colunas de substancia por folha, largura fixa, sobras EM BRANCO; moldura grossa
so na caixa externa de cada bloco; assinaturas em caixas + carimbo (CRM/COREN);
padding ate 20 linhas por pagina. Gotcha de build: pdfkit no bundle ESM precisa dos
`.afm` copiados para `dist/data` (build.mjs) e da dep transitiva `@swc/helpers`.

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

# Pele (tema visual) parametrizada — motor intacto

Regra: o RAS FAP tem N temas visuais selecionaveis (`ModoRasFap` =
PREMIUM|SIMPLES|MARCA|MINIMAL|BRONZE). Toda a variacao vive numa `Paleta`
(fundo, wordmark serif/sans, fio do cabecalho duplo/simples/hairline, estilo da
celula aplicada, largura da moldura). O tema so muda RENDER — nunca datas,
contadores, agrupamento, paginacao ou as 4 regras visuais fixas do CEO.

**Why:** o CEO quis comparar opcoes visuais sem tocar na grade (que e copia
byte-identica do IHE). Misturar pele com motor reintroduziria o modelo morto
"por grupo".

**How to apply:** adicionar tema = nova entrada em `PALETAS` (Record completo por
`ModoRasFap`) + render le sempre de `pal`. Acesso defensivo `PALETAS[modo] ??
PALETAS.PREMIUM`. Rota demo `/ras-fap-demo?tema=` valida por whitelist tipada
(`as const satisfies readonly ModoRasFap[]`) com fallback PREMIUM; `?big=1` usa
3 subs semanais x 26 sessoes = 26 idas -> 2 folhas, prova viva da regra
LINHAS_POR_PAGINA=20 (folha 1 = 20 linhas, folha 2 = 6).

# Colisao de rota Express por segmento unico

`/ras/:id` (registrada antes) captura qualquer `/ras/<um-segmento>`, inclusive
`/ras/physical-demo`, e tenta parsear como id numerico (400). Rotas novas de
segmento unico sob `/ras/...` devem usar PREFIXO distinto (ex.: `/ras-fap-demo`)
ou ser registradas ANTES de `/ras/:id`.
