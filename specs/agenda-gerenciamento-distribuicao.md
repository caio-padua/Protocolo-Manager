# Agenda: gerenciar, distribuir e visualizar (Pit Stop + linha do tempo)

Pedido do CEO em 12/11/2026, executado em três partes sequenciais: A (Pit Stop move, arrasta e encaixa),
C (agendas do sistema com o nome das agendas do Google) e B (Dia e Semana no estilo Google, em linha do tempo).

## Regras herdadas (valem para as três partes)

- Nenhuma agenda, local, profissional ou empresa é inferido de outro. Agenda igualmente elegível = "escolha pendente";
  ordem de exibição nunca desempata em silêncio.
- Só se diz "sincronizado" quando a operação externa confirmou. Google nunca é escrito fora do fluxo de confirmação.
- Testes usam dados sintéticos, rotas simuladas e banco isolado. Nenhum evento real, nenhuma mensagem real.
- Regra de Ouro: nada é apagado ou fundido. A visão "Lista" da Agenda continua existindo com todas as ações.

## A. Pit Stop: mover, arrastar e encaixar

- Mover uma ocorrência (visita) do plano: diálogo próprio, com a mesma validação de vaga do motor de distribuição.
- Arrastar no calendário do plano (@dnd-kit, mouse e toque com pressão de 220 ms) usa o mesmo caminho do diálogo.
  Quem não arrasta (teclado) move pelo diálogo; não há sensor de teclado no arraste.
- Encaixe da primeira visita: a isenção do prazo mínimo só vale quando o servidor marca o motivo; o navegador não pede isenção.
- Calendário do plano tem "Abrir calendário maior: Dia | Semana | Mês" e leva a `/agenda?data=AAAA-MM-DD&modo=dia|semana|mes`.
- Verificação: `pit-stop-postgres.test.ts` 35/35; `e2e/pit-stop-redistribuicao.spec.ts` 11/11.

## C. Agendas do sistema com o nome das agendas do Google

- Agendas 19 a 26 têm 10 janelas de horário cada e aceitam marcação.
- Agendas 27, 28 e 29 têm 0 janelas: não aceitam marcação até o CEO definir os horários em Agenda Configuração.
  Nenhuma janela foi inventada.
- A agenda 27 está ligada ao seu calendário do Google.

## B. Linha do tempo (Dia e Semana)

### Comportamento

- Eixo de horas de 7h a 20h, ampliado só quando existe compromisso fora da faixa. Uma coluna por dia.
- Cor por agenda: sessões usam a cor da agenda ligada (mesma do Google/local); sessão sem agenda ligada usa cinza e
  o texto "Sem agenda ligada". Compromissos do Google usam a cor do calendário, com cadeado e tracejado.
- Linha vermelha de "agora" com rótulo da hora, no horário de Brasília (o navegador pode estar em outro fuso).
- Sobreposição: itens que se cruzam ficam lado a lado, nunca um por cima do outro.
- Aproximação: atendimento aberto (agendado ou confirmado), hoje, começando em até 30 minutos, respira em contorno suave.
  Vale para toda sessão, inclusive enfermagem. Concluído, faltou e cancelado nunca chamam atenção.
  Com `prefers-reduced-motion` a animação some e fica um anel estático.
- Passar o mouse: brilho suave na cor da agenda.
- Clique: detalhes com agenda, atendimento, semana do protocolo, local, profissional, enfermagem, situação e um quadradinho
  por aplicação (aplicada, a aplicar, próxima, não aplicada, indisponível, conferir), com as mesmas palavras do cartão.
  "Cartão completo com ações" abre o cartão de sempre sob demanda; "Reagendar sessão" usa o fluxo existente.
- Google: clique abre detalhes somente leitura; a descrição é carregada só ao abrir (mesma consulta, recusa e sanitização da lista).
- Legenda de agendas liga e desliga cada agenda; "Agora" volta o olho para o horário atual; chip do próximo atendimento com contagem.
- Aviso sonoro: sino suave sintetizado (Web Audio), nasce DESLIGADO, liga por clique (política de autoplay dos navegadores),
  toca uma vez por atendimento, 10 minutos antes; a escolha fica em `paxter_agenda_aviso_sonoro`.
- Falha do Google é avisada ("Google indisponível agora") e as sessões continuam visíveis.
- Parâmetros de link: `?data=AAAA-MM-DD&modo=dia|semana|mes&visao=linha|lista`. Valor inválido é ignorado.

### Dados

- A resposta de sessão ganhou `resourceId`, `agendaNome`, `agendaCor` e `durationMinutes` (aditivos e opcionais).
  Duração: valor da sessão; se ausente, a das aplicações; se ausente, 30 minutos desenhados.
- O que não existe no sistema não é inventado: não há campo "consulta/retorno" nas sessões, só visitas de aplicação
  (Aplicação EV, Aplicação IM, Implante) com a semana do protocolo.

### Pendências e riscos conhecidos

- Se o Google reimportar um evento criado pelo PAXTER, ele pode aparecer duas vezes (um do sistema, um do Google).
  No banco de desenvolvimento: 7 sessões com evento no Google, 0 ecoadas. Não verificado com dados reais.
- Agendas 27, 28 e 29 dependem de o CEO definir horários.

### Verificação

- `timeline-logica.test.ts` e `GoogleCommitments.test.ts`: 19/19 (rodar de dentro de `artifacts/padcom`).
- `e2e/agenda-timeline.spec.ts`: 8/8; `e2e/agenda-integracao.spec.ts` + `e2e/agenda-mes-google.spec.ts`: 15/15.
- A API devolve os novos campos de sessão (conferido por requisição autenticada: 31 de 51 sessões com agenda ligada).
