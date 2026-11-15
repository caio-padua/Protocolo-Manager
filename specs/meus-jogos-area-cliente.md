# Meus Jogos (Area do Cliente) — 15/11/2026

Separado de Conexao Milionaria (boloes). Tabelas, rotas, telas e logs proprios (prefixo `meus_jogos_*`, `/area-paciente/meus-jogos`).
Nao le nem mostra a categoria comercial (Prata, Ouro, Platinum, Diamond). Cliente SEMPRE vem do Bearer do portal; clinica (`empresa_id`) vem do cadastro do cliente.

## 1. Fontes oficiais verificadas em 15/11/2026 (CAIXA)
| Modalidade | Universo | Dezenas por aposta | Preco (centavos) | Fonte |
|---|---|---|---|---|
| Mega-Sena | 1 a 60 | 6 a 20 | tabela oficial 6=R$ 6,00 ... 20=R$ 232.560,00 | loterias.caixa.gov.br/Paginas/Mega-Sena.aspx |
| Lotofacil | 1 a 25 | 15 a 20 | 15=R$ 3,50 ... 20=R$ 54.264,00 | .../Lotofacil.aspx |
| Quina | 1 a 80 | 5 a 15 | 5=R$ 3,00 ... 15=R$ 9.009,00 | .../Quina.aspx |
| Lotomania | 00 a 99 (100 dezenas) | exatamente 50 | R$ 3,00 (preco unico) | .../Lotomania.aspx |

- Universo da Lotomania: a pagina declara "marque 50 numeros" e NAO escreve "100"; 00 a 99 foi confirmado pelas dezenas sorteadas dos 24 ultimos concursos (00 e 99 aparecem). Registrado como confirmado por resultado, nao por texto.
- Resultados: API publica `servicebus2.caixa.gov.br/portaldeloterias/api/{modalidade}[/{concurso}]` (acessivel desta maquina em 15/11/2026; sem contrato publicado, pode mudar: falha = "indisponivel", nunca dado inventado).
- Calendario e fechamento da aposta simples agora sao derivados do calendario oficial por concurso; os valores digitados anteriormente pela clinica nao controlam o prazo. O fechamento de bolao digital em dia de semana continua sem confirmacao e nao e oferecido.
- Fora do escopo desta versao: Teimosinha, Aposta-Espelho, Surpresinha pelo robo (a escolha aleatoria e feita na tela, pelo cliente, antes de confirmar).
- Precos sao conferidos contra as paginas oficiais de cada modalidade; divergencia, indisponibilidade ou leitura vencida bloqueia pedidos. O calendario oficial tambem registra as extracoes, horarios, validade e impressao digital. Ver `specs/meus-jogos-calendario-logistica.md`.

## 2. Estados do pedido (individual)
`aguardando_pagamento` -> `pago_na_fila` -> `processando` -> `efetivado` (so com comprovante oficial anexado na mesma transacao).
Desvios: `falha_em_conferencia` (resultado incerto: NAO devolve, NAO repete), `devolucao_pendente` -> `devolvido`, `expirado`, `cancelado`.
- "Pago" so com consulta direta ao Asaas (status RECEIVED/RECEIVED_IN_CASH, valor igual ao total, referencia externa `meusjogos:{id}`). Nenhum pagamento foi feito nesta retomada; nao ha pagamento automatico.
- Pagamento confirmado depois do limite interno: nenhuma aposta foi feita -> `devolucao_pendente` (devolucao e ato humano).
- Pago e nao processado ate o fechamento oficial: a acao manual abre `devolucao_pendente` (nunca foi enviado ao robo). O worker nao reconcilia nem despacha pedidos.
- `falha_em_conferencia` so sai para `efetivado` (comprovante) ou `devolucao_pendente` (gestor atesta, por escrito, que nao houve aposta).
- Idempotencia: chave por cliente (`idempotency_key`), indice unico de pedido ativo com mesmo conteudo (cliente+modalidade+concurso+hash), reivindicacao atomica da fila, chave de idempotencia enviada ao robo (`mj-{id}`), um unico comprovante ativo por pedido. O despacho exige acao manual e confirmacao explicita do gestor.

## 3. Prazos (editaveis pelo gestor, por clinica)
- Margem interna: 240 minutos antes do fechamento oficial (limite interno = fechamento - margem). Pedido novo so ate o limite interno; depois disso, a pessoa escolhe explicitamente outro concurso aberto.
- Meta operacional: 30 min apos confirmacao do pagamento (`meta_efetivacao_em`); atraso e exibido ao gestor, nao altera estado.
- Teto interno por pedido: R$ 500,00 (editavel), 1 a 20 jogos, uma modalidade e um concurso por pedido.
- Fuso: America/Sao_Paulo (-03:00) via `lib/brt.ts`.

## 4. Robo (interface isolada) — NAO CONECTADO
Contrato `RoboLoterias`: `estado()`, `registrarJogos({pedidoId, chave, jogos, concurso})`, `consultarEstado(ref)`, `obterComprovante(ref)`.
Implementacao padrao `roboNaoConectado`: `estado().disponivel=false`. Enquanto indisponivel: a tela mostra "Execucao indisponivel", o botao de confirmar fica desativado e a API recusa criar pedido (503 `execucao_indisponivel`) — nenhum pedido pago e aceito como se funcionasse.
Nao ha acesso formalmente autorizado a CAIXA/lotericas: nenhuma automacao e implementada alem do contrato e de um adaptador simulado usado so em testes.

## 5. Tela do cliente
Entrada pelo Grupo VIP (cartao "Meus Jogos", separado do cartao Conexao Milionaria) e aba propria. Exige ser membro ativo do Grupo VIP.
Volante por toque (marca/desmarca, alvo >= 44 px, teclado, aria-pressed), faixa com selecao/quantidade/preco, limpar, aleatorio, favorito, resumo, confirmacao, ultimos 5 resultados por modalidade (concurso, data, atualizado em, indisponivel), pedidos com linha do tempo.
Gestor: Grupo VIP > "Jogos do cliente": seletor de cliente (PaxterClientSelector), pedidos, margem interna, teto, calendario e fontes. Horarios oficiais nao sao editaveis pela clinica; agenda de atualizacao semanal pertence ao proprietario da plataforma.

## 6. Estado e provas

- A leitura publica da CAIXA em 15/11/2026 confirmou o cronograma de concursos de novembro e dezembro, as paginas de preco das quatro modalidades, o fechamento de domingo e a margem de uma hora para apostas simples em dia de semana.
- O horario de 19h30 para bolao digital em dia de semana nao foi confirmado; esse canal segue bloqueado. Concursos especiais sem preco/regras confirmados tambem seguem bloqueados.
- A coleta real foi somente leitura. Os dados foram validados, mas essa execucao nao os gravou no banco ativo; o primeiro registro sera feito pela atualizacao manual do gestor ou pela rotina semanal.
- O robo da CAIXA permanece desconectado. A venda e o despacho continuam indisponiveis em ambiente real; nenhuma aposta ou pagamento real foi executado.
- Testes isolados atuais: volante, validacao e pedidos, concurso explicito, margem, suspensao e retomada manual, ausencia de robo, comprovante e segregacao por clinica. Nenhuma integracao simulada e apresentada como real.

## 7. Provas adicionais requeridas (Art. 82: dados sinteticos, banco descartavel, Asaas/CAIXA simulados)
Regras e precos (tabela x formula combinatoria), validacao de dezenas, resultados (normalizacao e indisponivel), maquina de estados, idempotencia, concorrencia, integridade financeira (valor/referencia/titular), isolamento entre clinicas e clientes, 401, robo indisponivel bloqueia, layout celular e desktop.
