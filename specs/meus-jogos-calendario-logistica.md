# Meus Jogos — Calendario oficial e logistica de concursos — 15/11/2026

Complementa `specs/meus-jogos-area-cliente.md` (nada daquela spec e removido). Fonte unica de verdade de datas e fechamentos: CAIXA.
Horario sempre em Brasilia (UTC-3, sufixo `-03:00`, `lib/brt.ts`).

## 1. Fontes oficiais lidas em 15/11/2026 (todas baixadas de verdade)
| Fonte | O que prova | Como o sistema le |
|---|---|---|
| `loterias.caixa.gov.br/Paginas/regras-sorteios.aspx` | Cronograma semanal: Mega ter/qui 21h + dom 11h; Lotofacil e Quina seg a sex 21h + dom 11h; Lotomania seg/qua/sex 21h | ancoras de texto; sumiu ancora = regra semanal NAO verificada |
| `caixa.gov.br/loterias/comunicados-importantes` | Desde 19/07/2026 sorteio de sabado passou para domingo 11h; aposta de concurso de domingo ate sabado 22h; bolao no canal eletronico encerra 15 min antes do sorteio | ancoras de texto; so abre a regra de domingo se as ancoras existirem |
| `caixa.gov.br/Downloads/caixa-loterias/Cronograma_MM_mes_AAAA.pdf` (mes atual e seguinte) | Data, numero do concurso, feriados sem sorteio, excecoes do dia (ex.: 24/12 apostas ate 16h, sorteio 17h), concursos especiais, regra "demais modalidades: apostas encerram 1 hora antes do sorteio" | PDF lido com posicao de cada texto (pdfjs); coluna = cabecalho mais proximo |
| API publica de resultados (`servicebus2.caixa.gov.br/portaldeloterias/api/{modalidade}`) | proximo concurso e data | consulta ao vivo antes de cada venda; precisa bater com o PDF |
| Paginas das modalidades | precos e regras de aposta simples | leitura das quatro paginas; divergencia bloqueia pedidos |

Nao verificado em fonte oficial (por isso BLOQUEIA ou fica "nao verificado"): precos e regras de concursos especiais; fechamento do bolao digital em dias de semana (19h30 nao foi confirmado). O canal de bolao digital em dia de semana fica indisponivel.

## 2. Canais (produtos distintos, nunca confundir)
| Canal | Concurso de domingo (11h) | Concurso em dia de semana (21h) | Excecao do dia |
|---|---|---|---|
| `aposta_simples` (e o que Meus Jogos vende) | sabado 22h | 1 hora antes do sorteio (20h) | vale a hora da excecao |
| `bolao_caixa_digital` (so informativo) | domingo 10h45 | indisponivel | horario de dia de semana nao confirmado |

Fechamento interno = fechamento oficial do canal `aposta_simples` menos a margem configuravel (padrao 240 min). Domingo: sabado 18h.

## 3. Regras de decisao
1. Concurso so existe se constar no calendario mensal verificado. Feriado sem sorteio = ausente do PDF = nenhum concurso naquela data (o sistema nao inventa regra de feriado).
2. Data/concurso da API ao vivo precisa existir no PDF (mesma data, mesmo numero). Divergencia, API fora do ar, PDF vencido ou ilegivel = `dados_oficiais_indisponiveis`/`dados_divergentes` = venda bloqueada.
3. Sorteio fora do cronograma semanal regular (e nao especial) = `fora_do_cronograma_regular` = bloqueado ate verificacao.
4. Concurso citado em nota do PDF como "Especial"/"Vendas exclusivas" = especial = bloqueado (`especial_nao_verificado`) ate haver preco e regras verificados.
5. Passou do limite interno: o servidor devolve a lista de proximos concursos abertos; o cliente escolhe (`concurso` no pedido). Sem escolha e primeiro fechado = 409 com opcoes. Nunca ha transferencia automatica.
6. Validade do calendario: 8 dias (configuravel). A consulta da API do proximo concurso antes de cada venda vale 10 minutos.

## 4. Pedido pago e prazo de processamento
- Horario da solicitacao (`criado_em`) e prazo de processamento (`meta_efetivacao_em` = pago_em + 30 min) sao campos distintos. Texto: "previsao de ate 30 minutos; e previsao, nao garantia de registro".
- Pagamento confirmado nao despacha automaticamente. A fila so pode ser processada manualmente por gestor com confirmacao explicita; o worker nunca faz apostas.
- Antes de qualquer despacho manual, o servidor confere fonte, concurso e fechamento. Falhou ou mudou: pedido pago fica em `pago_na_fila`, com `suspenso_motivo`/`suspenso_em`, evento registrado e sem movimento de dinheiro. A retomada exige nova acao manual depois de reconferir. Se o fechamento oficial mudou, o novo valor verificado e gravado; se ja passou, abre devolucao pendente para tratamento humano.
- Estado incerto: conciliacao apenas CONSULTA o canal, nunca repete `registrarJogos` nem devolve sozinha. `registrado` + comprovante valido = efetivado; `recusado_sem_aposta` = devolucao pendente (ato humano); resto continua em conferencia.

## 5. Rotina semanal
Configuravel (padrao segunda 06:00 BRT, validade 8 dias). Worker confere a cada 15 minutos se a rotina somente de leitura esta devida; consulta regras semanais, comunicados, PDFs e paginas de modalidades. Cada leitura grava uma extracao (origem, instante, resultado, validade, impressao digital). Dado invalido NAO substitui o ultimo calendario valido; ele so deixa de valer ao vencer. Alteracao entre extracoes validas e registrada.
O worker nao reconcilia pagamentos, nao despacha pedidos e nao concilia resultados incertos. Essas acoes continuam fora da rotina automatica.

## 6. Notificacoes
Nenhum canal novo. Nenhuma mensagem e enviada por este modulo: os eventos ficam em `meus_jogos_eventos` e na linha do tempo. Qualquer mensagem futura exige a autorizacao ja existente do cliente.

## 7. Portal
Indicador "Dados oficiais" (verificado/desatualizado/indisponivel + validade), ultimas 5 extracoes, cronometro ate o prazo interno, escolha explicita do proximo concurso, linha do tempo (Solicitado, Pago, Despachado, Registro, Comprovante), nada "oficial/registrado" sem comprovante validado. A acao manual de despacho exige confirmacao explicita e fica desativada sem robo conectado.

## 8. Avatar
Figura ilustrativa, pequena e neutra; animacao breve de corrida e comemoracao alternando bracos SO quando o pedido esta `efetivado` com comprovante. `prefers-reduced-motion` = pose estatica. O esquema permite foto de perfil do medico, mas nao registra autorizacao de uso de imagem; portanto a foto nao e usada. O painel do gestor informa somente se ha caminho de foto cadastrado, que o acesso ao arquivo nao foi verificado e que a autorizacao nao esta cadastrada; nunca devolve a URL privada.

## 9. Provas (Art. 82: sinteticos, banco descartavel, CAIXA/Asaas simulados)
Calendario puro: domingo, virada de dia, feriado, excecao 24/12, especial, domingo x bolao, margem. Extracao: PDF real baixado (fixture) lido por coluna, fonte alterada/invalida/indisponivel. Banco: escolha de concurso, nunca transferir, suspensao e retomada, fechamento alterado, pagamento atrasado, duplicidade (2 despachos concorrentes = 1 chamada), conciliacao sem repetir. Tela: celular e desktop.
