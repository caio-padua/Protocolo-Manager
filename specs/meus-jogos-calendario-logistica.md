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
| Paginas das modalidades | precos e regras (ja existia) + bolao digital da semana 19h30 | `conferirFonte` |

Nao verificado em fonte oficial (por isso BLOQUEIA ou fica "nao verificado"): preco e horario do especial Mega da Virada 3100; fechamento do bolao em dias com excecao.

## 2. Canais (produtos distintos, nunca confundir)
| Canal | Concurso de domingo (11h) | Concurso em dia de semana (21h) | Excecao do dia |
|---|---|---|---|
| `aposta_simples` (e o que Meus Jogos vende) | sabado 22h | 1 hora antes do sorteio (20h) | vale a hora da excecao |
| `bolao_caixa_digital` (so informativo) | domingo 10h45 | 19h30 do mesmo dia | nao verificado ate haver fonte |

Fechamento interno = fechamento oficial do canal `aposta_simples` menos a margem configuravel (padrao 240 min). Domingo: sabado 18h.

## 3. Regras de decisao
1. Concurso so existe se constar no calendario mensal verificado. Feriado sem sorteio = ausente do PDF = nenhum concurso naquela data (o sistema nao inventa regra de feriado).
2. Data/concurso da API ao vivo precisa existir no PDF (mesma data, mesmo numero). Divergencia, API fora do ar, PDF vencido ou ilegivel = `dados_oficiais_indisponiveis`/`dados_divergentes` = venda bloqueada.
3. Sorteio fora do cronograma semanal regular (e nao especial) = `fora_do_cronograma_regular` = bloqueado ate verificacao.
4. Concurso citado em nota do PDF como "Especial"/"Vendas exclusivas" = especial = bloqueado (`especial_nao_verificado`) ate haver preco e regras verificados.
5. Passou do limite interno: o servidor devolve a lista de proximos concursos abertos; o cliente escolhe (`concurso` no pedido). Sem escolha e primeiro fechado = 409 com opcoes. Nunca ha transferencia automatica.
6. Validade do calendario: 8 dias (configuravel). Consulta ao vivo da API antes de cada venda vale 10 min.

## 4. Pedido pago e prazo de processamento
- Horario da solicitacao (`criado_em`) e prazo de processamento (`meta_efetivacao_em` = pago_em + 30 min) sao campos distintos. Texto: "previsao de ate 30 minutos; e previsao, nao garantia de registro".
- Pagamento confirmado: despacho imediato ao canal (`despachado_em`). Sem canal conectado nada e despachado e nada vira "registrado".
- Antes de despachar, o servidor confere a fonte. Falhou ou mudou: pedido pago fica em `pago_na_fila`, com `suspenso_motivo`/`suspenso_em`, evento registrado, nenhum dinheiro movido. Volta sozinho quando a fonte for verificada. Se o fechamento oficial mudou, o novo valor verificado e gravado (evento `fechamento_atualizado`); se ja passou, a reconciliacao existente abre devolucao.
- Estado incerto: `conciliarIncertos` so CONSULTA o canal (`consultarEstado`), nunca chama `registrarJogos`, nunca devolve sozinho. `registrado` + comprovante valido = efetivado; `recusado_sem_aposta` = devolucao pendente (ato humano); resto continua em conferencia.

## 5. Rotina semanal
Configuravel (padrao segunda 06:00 BRT, validade 8 dias). Worker confere a cada 15 min se a rotina esta devida; roda: regras semanais, comunicados, PDFs, paginas de modalidades. Cada leitura grava uma extracao (origem, instante, resultado, validade, impressao digital). Dado invalido NAO substitui o ultimo calendario valido; ele so deixa de valer ao vencer. Alteracao entre extracoes validas e registrada.
Fila (reconciliar prazos, despachar, conciliar incertos) roda a cada minuto no worker.

## 6. Notificacoes
Nenhum canal novo. Nenhuma mensagem e enviada por este modulo: os eventos ficam em `meus_jogos_eventos` e na linha do tempo. Qualquer mensagem futura exige a autorizacao ja existente do cliente.

## 7. Portal
Indicador "Dados oficiais" (verificado/desatualizado/indisponivel + validade), ultimas 5 extracoes, cronometro ate o prazo interno, escolha explicita do proximo concurso, linha do tempo (Solicitado, Pago, Despachado, Registro, Comprovante), nada "oficial/registrado" sem comprovante validado.

## 8. Avatar
Figura estilizada, pequena, esbelta; animacao breve de corrida e comemoracao alternando bracos SO quando o pedido esta `efetivado` com comprovante. `prefers-reduced-motion` = pose estatica discreta. Foto do medico: existe 1 medico principal com foto cadastrada, mas NAO existe campo de autorizacao de uso de imagem, nem "medico executor", nem "diretor tecnico" no cadastro (so `responsavel_legal_nome` em empresas). Logo a foto NAO e usada, nao se alega semelhanca e a figura e neutra. Painel do gestor mostra existe/acessivel/autorizacao.

## 9. Provas (Art. 82: sinteticos, banco descartavel, CAIXA/Asaas simulados)
Calendario puro: domingo, virada de dia, feriado, excecao 24/12, especial, domingo x bolao, margem. Extracao: PDF real baixado (fixture) lido por coluna, fonte alterada/invalida/indisponivel. Banco: escolha de concurso, nunca transferir, suspensao e retomada, fechamento alterado, pagamento atrasado, duplicidade (2 despachos concorrentes = 1 chamada), conciliacao sem repetir. Tela: celular e desktop.
