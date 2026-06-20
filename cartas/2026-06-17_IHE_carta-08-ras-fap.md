# CARTA_08 (IHE) — RAS FAP corrigido (17/06/2026)

- Data: 17/06/2026
- Origem: Dr. Replit IHE
- Destino: Dr. Replit Manager (Paxter)
- Estado: Recebida e executada

Resumo da CARTA_08 recebida do IHE e executada pelo Dr. Replit Manager.

1. RAS FAP = folha A4 paisagem imprimivel (substancias x idas a clinica), preenchida a caneta na sala (FAP = Formulario de Auditoria de Procedimentos).

2. Motor da grade COPIADO IDENTICO do `rasFap.ts` do IHE (fonte-da-verdade). Verificado por diff normalizado: `segundaDaSemana`, `chunk`, `planejarPaginasRasFap` byte-identicos; `montarGrade` difere so por 1 ponto-e-virgula cosmetico. A LOGICA da grade nunca deve ser alterada (so render/estetica).

3. As 7 regras de ouro da grade: (a) 1 visita por semana ISO (consolidacao); (b) SEM contínuo na agenda GLOBAL, cruzando paginas com LACUNAS (folha 2 pode pular de SEM 10 para SEM 13); (c) celula "N/total"; (d) varias doses na mesma semana juntam com middot; (e) padding ate 20 linhas POR pagina; (f) 5 colunas de substancia FIXAS por folha, sobras EM BRANCO; (g) data eleita = 1o dia previsto da semana.

4. As 4 regras visuais do CEO: 5 colunas fixas por folha (largura como se fossem 5; sobras em branco); moldura grossa SO na caixa externa de cada bloco; visual clean/elegante/classico (wordmark serif "RAS", fio duplo, tom pastel); faixa de assinaturas em CAIXAS retangulares, profissionais com espaco de CARIMBO (CRM/COREN).

5. Implementacao: `gerarRasFapPdf` em `artifacts/api-server/src/lib/ras-fap.ts` (pdfkit); `generatePhysicalRASPdf` em `pdf-signer.ts` virou ADAPTADOR fino. Gabarito cego da carta (sec.10) conferido pelo motor puro. RAS JURIDICO (assinado digital) fica para depois.

6. VARIANTES VISUAIS (pele) — `ModoRasFap` = PREMIUM|SIMPLES|MARCA|MINIMAL|BRONZE. So o RENDER muda (cores, wordmark serif/sans, fio do cabecalho, pintura da celula, largura da moldura via `Paleta`); o motor da grade e as 4 regras visuais do CEO permanecem identicos. `generatePhysicalRASPdf(data, modo="PREMIUM")`. Rota de demonstracao: `GET /api/ras-fap-demo?tema=PREMIUM|MARCA|MINIMAL|BRONZE` (whitelist tipada, fallback PREMIUM) e `?big=1` (3 substancias semanais x 26 sessoes = 2 folhas, prova viva da regra de 20 linhas por folha). Default em producao continua PREMIUM ate o CEO bater o martelo do tema.

7. AJUSTES FINOS DE RENDER (17/06/2026; valem para os 4 temas; motor da grade INTACTO): (a) cabecalho das colunas de substancia na grade virou "SESSÃO" (com acento, via flag `keepAccents` em `celula()` que pula o `semAcento()`); (b) frequencia "A CADA N DIAS" -> "A cada N dias"; (c) coluna DATA EFETIVA reordenada para logo apos HORA em `COLS_FIXAS` (soma de larguras inalterada); (d) pintura da celula virou faixa marcadora de 1/4 a esquerda + fracao "N / total" nos 3/4 da direita (temas battleship/center; o tema "tick"/MINIMAL segue sem pintura); (e) fracao com espaco "1 / 12".

8. CABECALHO HARMONIOSO + NUMERACAO APLIC (17/06/2026; valem para os 4 temas; motor da grade INTACTO): (a) cabecalho da GRADE DE APLICACOES das colunas FIXAS agora todo na mesma fonte/tamanho/altura (helper `cabecalhoFixo`, Helvetica-Bold 6, centralizado V+H, multi-linha), via novo campo `head:string[]` em `COLS_FIXAS`; (b) labels: "SEM." -> "APLIC"; "DATA AGEND." -> 2 linhas DATA/AGENDADA; "DATA EFETIVA" -> 2 linhas DATA/EFETIVA; demais inalterados; (c) coluna APLIC numera 1..20 por folha em TODAS as linhas (inclusive padding), continua cruzando folhas (folha 2 = 21..40) e RESETA a cada grupo de substancias — via param `aplicInicio` em `desenharGrade` + contador `aplicBase` no loop de `gerarRasFapPdf` (reset quando `p.grupo` muda, passo fixo += `LINHAS_POR_PAGINA`); o campo `numero` do motor deixa de alimentar a coluna (so o indice do render numera), mas o motor segue intacto. (d) Demo de stress `?n=N` (`buildCountDemoSubstances` em `ras.ts`, 1 substancia semanal x N, cap 400). Validado: `?n=150` -> 8 folhas, APLIC 1..160, padding 151..160 numerado, ZERO corte de dado. NOTA (Art.50): a numeracao limpa 1..N por grupo substitui a exibicao da LACUNA do SEM global (regra 3b) no caso raro de multi-grupo (>5 substancias); a agenda global continua preservada internamente pelo motor.
