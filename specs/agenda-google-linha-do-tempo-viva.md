# Spec — Linha do Tempo Viva do evento no Google Agenda (Kaizen K1 a K6)

Data: 09/11/2026. Autor: Dr. Replit Pawards (a mando do CEO Dr. Caio). Método: Paxter Loop.
Aprovação do CEO: opção A de 09/11/2026 ("aprovar K1 a K6, na ordem, uma por vez, com revisão independente depois de cada uma").
Estado de engenharia: K1 CONSTRUÍDA, TESTADA E REVISADA (2 revisões independentes; achados corrigidos e testados, incluindo prazo absoluto da chamada ao Google e devolução da reserva em falha de leitura). K7 (protocolo completo constante) CONSTRUÍDA E TESTADA (227 testes verdes em 3 lotes; 5 achados da revisão corrigidos; a última correção, devolução da reserva em falha de leitura, não passou por terceira revisão e é coberta por testes com mutação). K8, K9 e K10 EM ESPECIFICAÇÃO; K2 a K6 EM ESPECIFICAÇÃO (cada uma é detalhada e revisada antes de construir). Nada publicado; nenhum evento real do Google foi tocado.

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

Ordem aprovada pelo CEO em 09/11/2026 ("quero tudo", opção A): K1 (pronta), K7, K8, K9, K10 (pedidos novos, seção 12), depois K2, K3, K5 (usa a mesma função), K6 e K4 (por último, pois depende de coluna nova e do restante). Revisão independente depois de cada uma, em sequência. Próxima unidade só depois do aceite da anterior.

## 11. Pedidos novos do CEO em 09/11/2026 (a especificar depois das decisões)

Vocabulário do CEO: mudança AGUDA = atualização imediata disparada por uma ação (K1 e o que vier). Mudança CRÔNICA = atualização pelo relógio (K4/K5); a crônica só CONFIRMA se a aguda foi feita e corrige se não foi.

11.1 Protocolo completo constante: toda visita mostra TODAS as substâncias do protocolo; as que a frequência não permite naquela semana ficam listadas como constantes (para a enfermagem responder ao cliente olhando a tela), com a linha "Hoje: X de Y substâncias".
11.2 Chave de aplicação de 6 dígitos enviada ao cliente por e-mail, WhatsApp, Telegram e SMS; o cliente passa à enfermagem; a enfermagem digita na tela (celular ou notebook da clínica); a chave vale como assinatura (rubrica digital) do cliente.
11.3 RAS FAP vivo: cada chave validada preenche a linha da semana (data efetiva, hora, ciência/rubrica do cliente, rubrica da enfermagem, contadores) com ligação direta ao dado (data bind).
11.4 Mensagem imediata ao cliente nos mesmos canais confirmando a aplicação realizada.
11.5 Reaproveitar o melhor do IHE: código guardado só como hash, prazo curto, limite de tentativas, trava anti-repetição, modelo de mensagem por unidade.

## 12. Pedidos novos viram unidades K7 a K10 (decisão do CEO em 09/11/2026)

Decisão do CEO: fazer tudo; UMA chave por VISITA (por aplicação da semana, não por substância).

| Unidade | Entrega | Depende de |
|---|---|---|
| K7 | Protocolo completo constante (todas as substâncias em toda visita + linha "NESTA VISITA: X de Y") no Google e na tela | Nada externo |
| K8 | Chave de 6 dígitos por visita (hash, 10 min, 5 tentativas, trava de 60 s), envio aos canais do cliente, validação pela enfermagem, rubrica digital gravada | Canais externos (e-mail, Telegram, WhatsApp, SMS) |
| K9 | RAS FAP vivo: linha da semana preenchida com data efetiva, hora, rubrica do cliente e da enfermagem | K8 |
| K10 | Mensagem imediata "Aplicação realizada com sucesso" nos mesmos canais | K8 |

### 12.1 K7 — Protocolo completo constante

Requisitos:
12.1.1 A lista de substâncias do protocolo vem de `protocol_items` (uma por substância). Toda substância do protocolo aparece em TODA visita do protocolo.
12.1.2 Substância que já tem linha na visita (disponível, próxima, aplicada, não realizada, indisponível) aparece como hoje, sem duplicar.
12.1.3 Substância SEM linha na visita aparece como "constante": no Google com o quadrado branco e a sigla [INDI] já existentes na legenda (nenhum símbolo novo) e posição "–/total"; na tela com o texto "Não nesta visita".
12.1.4 Linha "NESTA VISITA: X de Y substâncias": X = substâncias distintas com linha disponível (DISP) na visita; Y = substâncias distintas LISTADAS (itens do protocolo mais qualquer linha da visita sem item correspondente). Assim X nunca passa de Y e Y é exatamente o que a enfermagem vê na lista.
12.1.5 Constante nunca conta como devida: não muda "Aplicações Realizadas", não muda a cor nem o tipo do procedimento, não exige via.
12.1.6 Cálculo na LEITURA, por função pura única usada pelo Google e pela tela. Nenhuma linha é gravada, nenhum dado antigo é alterado (Regra de Ouro). Vale também para visitas já existentes.
12.1.7 Protocolo sem itens gravados: nenhuma constante e nenhuma linha de contagem; evento idêntico ao atual.
12.1.8 Substância do item sem cadastro: aparece como "Substância não cadastrada (n)", nunca bloqueia o envio.
12.1.9 A lista de sessões lê os itens uma vez por protocolo (sem repetir a consulta por visita).
12.1.10 O mesmo cálculo vale para todos os caminhos que enviam evento ao Google: envio por protocolo, atualização ao aplicar/concluir, botão "sincronizar" da sessão e da semana (rotas /google-calendar/sync-session e sync-week).
12.1.11 Isolamento: os itens só são lidos se o protocolo pertence à MESMA empresa da visita; referência inconsistente não expõe nada (lista vazia e aviso no registro do servidor).
12.1.12 Os itens do protocolo entram na conferência feita depois da reserva (como a sessão e as aplicações): se mudaram no intervalo, nada é enviado.
12.1.13 Quadrados por substância e legenda do CEO não mudam. A tela mantém os botões de aplicar só nas linhas DISP.

| ID | Falha | Gravidade | Barreira | Teste |
|---|---|---|---|---|
| F13 | Substância aparece duas vezes | Média | Constante só se não há linha na visita; itens repetidos contam uma vez | T-K7-1, T-K7-2 |
| F14 | Constante entra na conta das aplicações devidas e muda o status | Alta | Posição 0 e estado INDI já são excluídos da conta | T-K7-3 |
| F15 | Itens de outro protocolo ou outra clínica aparecem | Crítica | Itens lidos pelo protocolo da sessão já autorizada | T-K7-4 |
| F16 | Substância sem cadastro derruba o envio | Média | Texto explícito e envio segue | T-K7-5 |
| F17 | Protocolo sem itens muda o evento | Média | Sem constantes e sem linha de contagem | T-K7-1 |
| F18 | Tela e Google divergem | Média | Mesma função pura | T-K7-6 |
| F19 | Consulta repetida por visita na lista | Baixa | Memória por protocolo na chamada | revisão |
| F20 | Protocolo de outra empresa lido por referência inconsistente | Crítica | Itens só carregam se protocolo e visita têm a mesma empresa | T-K7-8 |
| F21 | Protocolo editado entre a leitura e a reserva publica composição velha | Média | Itens conferidos de novo depois da reserva | T-K7-9 |
| F22 | Botão "sincronizar" da sessão/semana apaga as constantes do evento | Alta | Mesma função nas rotas legadas | T-K7-10 |
| F23 | Escrita tardia no Google (token lento) grava descrição velha depois de uma nova | Alta | Prazo absoluto cobre token + envio; vencido, não envia | T-K1-12 |
| F25 | Leitura falha depois da reserva e antes do envio e a reserva fica presa | Alta | Reserva própria devolvida (CAS) em falha de leitura; na conferência, restaura a anterior | T-K7-11, T-K7-12 |
| F24 | Y inflado ou X maior que Y | Média | Y = itens + linhas da visita sem item | T-K7-2c, T-K7-7 |

Limite conhecido de F23: uma chamada já enviada ao Google dentro do prazo pode, em tese, chegar depois de uma atualização mais nova. A rede não permite fechar isso por completo. Até K4/K5 existirem NÃO há correção automática: o risco é conhecido e a próxima ação clínica na visita (ou o botão de sincronizar) reenvia o estado atual. Quando K4/K5 forem feitas, passam a corrigir.

Definição de PRONTO de K7: testes T-K7-1 a T-K7-10 verdes (função pura + banco isolado com Google simulado); testes existentes de agenda e Google verdes; revisão independente sem pendência; nenhuma chamada real ao Google.
