# Spec — Linha do Tempo Viva do evento no Google Agenda (Kaizen K1 a K6)

Data: 09/11/2026. Autor: Dr. Replit Pawards (a mando do CEO Dr. Caio). Método: Paxter Loop.
Aprovação do CEO: opção A de 09/11/2026 ("aprovar K1 a K6, na ordem, uma por vez, com revisão independente depois de cada uma").
Estado de engenharia: K1 CONSTRUÍDA, TESTADA E REVISADA (revisão independente apontou 1 impeditivo e 1 importante; ambos corrigidos e testados); K2 a K6 EM ESPECIFICAÇÃO (cada uma é detalhada e revisada antes de construir).

Pedidos novos do CEO em 09/11/2026 (ainda sem spec própria, aguardam decisões): ver seção 11.

Glossário rápido:
- Evento = o compromisso de uma visita no Google Agenda da clínica.
- colorId = cor da caixa do evento no calendário (paleta fixa de 11 cores do Google).
- Fase = situação da visita calculada pelo relógio de Brasília e pelo registro de aplicações; nunca é gravada.
- Reserva = marca gravada na sessão enquanto o Google responde (impede duas escritas ao mesmo tempo).

## 1. Objetivo

O evento da visita no Google deve mudar sozinho conforme o tempo passa e conforme as ações são registradas
(aplicada, não realizada, remarcada, cancelada), e a agenda do sistema deve usar a MESMA regra.

## 2. Verdades verificadas antes de construir (09/11/2026)

| Fato | Fonte |
|---|---|
| IHE atualizava o evento ao confirmar a aplicação (melhor esforço) | repo Integrative-Health-Engine, routes/sessoes.ts, confirmar-substancia |
| Manager só grava no banco ao confirmar | routes/sessions.ts, confirm-substance |
| Só remarcar, cancelar e o botão manual atualizam o Google hoje | session-google-sync.ts |
| Cor da caixa (colorId) é fixa por tipo de procedimento | google-calendar.ts, getColorIdForProcedure |
| Estado da substância não olha data | estado-aplicacao-protocolo.ts |
| Existe tarefa agendada em fuso de Brasília (node-cron) | lib/cron.ts |
| Falha ao atualizar evento existente hoje DEIXA a reserva (teste existente exige) | tests/protocol-visit-changes-postgres.test.ts |
| Registrar aplicação é recusado (409) enquanto há reserva; teste existente exige | tests/confirmacao-aplicacao-clinica.test.ts |

## 3. Linhas vermelhas

3.1 Nunca apagar e recriar evento; sempre o mesmo identificador (events.update), sendUpdates "none", sem convidado.
3.2 Google nunca dentro de transação do banco; falha do Google nunca desfaz nem bloqueia o registro clínico.
3.3 Não alterar o motor de cálculo de vagas (agenda-motor) nem a regra de ocupação.
3.4 Não tocar nas sessões 433 a 440 (protocolo 67, formato antigo) nem apagar dado.
3.5 Quadrados por substância e a legenda continuam como o CEO aprovou (verde DISP, amarelo PROX, azul APLI, vermelho NREA, branco INDI, laranja CONF).
3.6 Teste só com dados sintéticos, banco isolado e Google simulado. Nenhum evento real sem ordem escrita do CEO.
3.7 Não enfraquecer teste existente. Comportamento padrão de remarcação e envio manual fica igual.

## 4. K1 — Aplicar ou marcar "não realizada" atualiza o mesmo evento

Requisitos:
4.1 Depois de gravar a aplicação (aplicada ou não realizada) e DEPOIS do commit, atualizar o mesmo evento da visita.
4.2 Visita sem evento no Google (sem identificador e sem reserva): nenhuma chamada ao Google e nenhum aviso.
4.3 O evento é remontado a partir do banco no momento da chamada (não do que a tela mandou), pelo montador único já existente.
4.4 Conta Google da clínica não confirmada, erro do Google ou demora acima de 8 segundos: a resposta continua 200, a aplicação continua gravada e vem `googleSyncWarning` com texto fixo, sem detalhe interno.
4.5 Falha ao atualizar evento que JÁ existe NÃO deixa reserva pendente nesta rota (liberação por comparação com a operação própria), porque repetir a atualização com o mesmo identificador é seguro e a reserva bloquearia a próxima aplicação da mesma visita. Remarcação e envio manual mantêm o comportamento atual (reserva fica).
4.6 A recusa 409 de registrar aplicação enquanto o Google responde permanece como está.
4.7 Repetir o mesmo registro (duplo clique) é aceito sem novo efeito clínico e também reenvia a atualização (cura uma falha anterior).
4.8 `PUT /sessions/:id` que muda o status para concluída ou faltou também atualiza o mesmo evento, com as mesmas regras de aviso.
4.9 A tela da agenda mostra o aviso quando a resposta trouxer `googleSyncWarning`.
4.10 Registrar duas substâncias da mesma visita em seguida é o fluxo normal: se a reserva presente for de ATUALIZAÇÃO de evento (a do registro anterior), o novo registro espera até 3 segundos antes de ser recusado. Reserva de primeiro envio (criação) continua recusando na hora.
4.11 A ação clínica nunca reivindica a reserva de outra operação (envio manual, criação, remarcação): se houver reserva ativa ao atualizar, devolve aviso "há outra sincronização em andamento" e não escreve no Google. (Achado impeditivo da revisão independente de 09/11/2026.)
4.12 A chamada de atualização tem prazo próprio de 7 segundos (a chamada HTTP também recebe o limite). Estourou o prazo: a reserva própria é liberada e a próxima ação segue; a atualização reescreve o evento inteiro a partir do banco, então repetir é seguro. (Achado importante da revisão independente.)

Casos extremos e barreiras (matriz de falhas):

| ID | Falha | Gravidade | Barreira | Teste |
|---|---|---|---|---|
| F1 | Google fora do ar ao aplicar | Alta | Aviso; aplicação vale; reserva liberada (4.5) | T-K1-2 |
| F2 | Segunda aplicação da mesma visita depois de F1 | Alta | Sem reserva presa, registra normalmente | T-K1-3 |
| F3 | Conta Google não confirmada | Alta | Nenhum evento tocado; aviso | T-K1-4 |
| F4 | Visita nunca enviada ao Google | Média | Zero chamadas ao Google | T-K1-5 |
| F5 | Envio manual em andamento (reserva ativa) | Alta | 409 existente permanece | teste existente |
| F6 | Google lento | Média | Limite de 8 s e aviso; reserva liberada ao terminar com erro | T-K1-6 |
| F7 | Clínica errada ou profissional sem vínculo | Crítica | Autorização anterior à gravação, inalterada | teste existente |
| F8 | Descrição não reflete o estado final | Média | Montada do banco depois do commit | T-K1-1 |
| F9 | Duas aplicações simultâneas na mesma visita | Média | Travas existentes; cada resposta refaz o evento do banco | T-K1-7 |
| F10 | Segundo registro enquanto o primeiro ainda atualiza o evento | Alta | Espera até 3 s por reserva de atualização (4.10) | T-K1-7 |
| F11 | Envio manual reserva o evento entre o commit e a atualização automática | Crítica | Ação clínica não reivindica reserva alheia (4.11) | T-K1-10 |
| F12 | Google nunca responde | Alta | Prazo de 7 s libera a reserva própria (4.12) | T-K1-11 |

Definição de PRONTO de K1: testes T-K1-1 a T-K1-11 verdes em banco isolado; testes existentes dos arquivos de agenda e Google continuam verdes; revisão independente sem pendência; nenhuma chamada real ao Google.

## 5. K2 — Linha "QUANDO" no evento (a detalhar antes de construir)

5.1 Função pura única `calcularFaseVisita` (data da visita, hora, situação da sessão, estados das aplicações devidas, "hoje" em Brasília) devolve fase, texto QUANDO e cor.
5.2 Semana = segunda a domingo, em Brasília. "Hoje" = data de Brasília (lib/brt.ts), nunca `new Date()` nu.
5.3 Fases: programada, nesta semana, hoje, aguardando registro, realizada, parcial ou não realizada, cancelada, conferir.
5.4 Textos: "Programada para 17/11 às 10:00 (em 8 dias)", "Disponível nesta semana: terça 10/11 às 10:00", "Disponível HOJE às 10:00", "Aguardando registro da enfermagem", "Aplicações realizadas em 10/11 às 10:12", "Parcialmente realizada" ou "Não realizada".
5.5 O montador único insere a linha QUANDO; nenhum outro montador cria texto próprio.

## 6. K3 — Cor da caixa muda por fase

6.1 colorId por fase: programada = Banana (5); nesta semana = Sálvia (2); hoje = Manjericão (10); aguardando registro = Tangerina (6); realizada = Mirtilo (9); parcial ou não realizada = Tomate (11); cancelada = Grafite (8).
6.2 A cor deixa de indicar o tipo de procedimento; o tipo continua no título e na lista de procedimentos.
6.3 Evento cancelado continua sendo removido do Google (comportamento atual).

## 7. K4 — Virada automática do dia

7.1 Tarefa agendada em Brasília (00:05 e 06:00) atualiza SOMENTE eventos cuja fase calculada mudou desde o último envio.
7.2 Exige guardar a fase enviada por visita (coluna nova criada por SQL bruto, nunca por push do drizzle com drift).
7.3 Lote limitado por rodada, uma visita por vez, conta Google confirmada antes; sessão com reserva pendente é pulada e contada para conferência humana.
7.4 Idempotente: rodar duas vezes seguidas não gera segunda chamada ao Google.
7.5 Registro de resumo da rodada no log; falha vira contagem, nunca derruba o servidor.
7.6 Chave de desligamento por variável de ambiente; no desenvolvimento a tarefa nunca chama o Google real.

## 8. K5 — Aguardando registro

8.1 Visita de dia passado, sem conclusão e com aplicação devida pendente mostra "Aguardando registro da enfermagem" (laranja), nunca verde.
8.2 Isso afirma apenas que ninguém registrou, não que a aplicação não aconteceu.

## 9. K6 — Mesma regra no sistema

9.1 A agenda e a tela do protocolo importam a fase da MESMA função (a função pura é compartilhada pelo servidor; o servidor devolve a fase pronta; a tela não recalcula).
9.2 Barra lateral do cartão e anel de hoje passam a obedecer a fase.

## 10. Revisão e ordem

Ordem: K1, K2, K3, K5 (usa a mesma função), K6, K4 (por último, pois depende de coluna nova e do restante). Revisão independente depois de cada uma, em sequência. Próxima unidade só depois do aceite da anterior.

## 11. Pedidos novos do CEO em 09/11/2026 (a especificar depois das decisões)

Vocabulário do CEO: mudança AGUDA = atualização imediata disparada por uma ação (K1 e o que vier). Mudança CRÔNICA = atualização pelo relógio (K4/K5); a crônica só CONFIRMA se a aguda foi feita e corrige se não foi.

11.1 Protocolo completo constante: toda visita mostra TODAS as substâncias do protocolo; as que a frequência não permite naquela semana ficam listadas como constantes (para a enfermagem responder ao cliente olhando a tela), com a linha "Hoje: X de Y substâncias".
11.2 Chave de aplicação de 6 dígitos enviada ao cliente por e-mail, WhatsApp, Telegram e SMS; o cliente passa à enfermagem; a enfermagem digita na tela (celular ou notebook da clínica); a chave vale como assinatura (rubrica digital) do cliente.
11.3 RAS FAP vivo: cada chave validada preenche a linha da semana (data efetiva, hora, ciência/rubrica do cliente, rubrica da enfermagem, contadores) com ligação direta ao dado (data bind).
11.4 Mensagem imediata ao cliente nos mesmos canais confirmando a aplicação realizada.
11.5 Reaproveitar o melhor do IHE: código guardado só como hash, prazo curto, limite de tentativas, trava anti-repetição, modelo de mensagem por unidade.
