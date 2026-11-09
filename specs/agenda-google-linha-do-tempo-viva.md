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

## 13. K8 — Chave por visita e rubrica do cliente (CONSTRUÍDA e testada em 09/11/2026; resposta do CEO em 09/11/2026)

### 13.1 O que o CEO decidiu (palavras dele resumidas)

13.1.1 A enfermeira REALIZA e registra a aplicação sempre. A falta da chave do cliente NUNCA bloqueia o registro.
13.1.2 A coluna da ENFERMEIRA no RAS FAP é completada na hora, com ou sem a confirmação do cliente.
13.1.3 Quando o cliente não valida na hora, a enfermeira aperta um botão (nome a escolher: sugestão "Cliente confirma depois"). Isso liga a "engrenagem":
  a) e-mail ao cliente com confirmação de UM clique; ao clicar, a parte do cliente no RAS FAP é completada;
  b) e-mail ao gestor administrador e ao responsável técnico da clínica (podem ser a mesma pessoa ou não);
  c) um e-mail por dia, no total de 3, até o cliente validar.
13.1.4 Segunda tela ("desafio presencial"), para resolver no local: campo 1 = os 6 dígitos enviados ao cliente; campo 2 = 6 posições em duas metades de 3, sorteadas, com uma legenda que "respira" (LED digital, piscar lento e contínuo) sob cada metade dizendo qual dado do cadastro o cliente deve informar (exemplos do CEO: 3 últimos ou 3 primeiros do CPF; número da casa completado com zero à esquerda; últimos números do ano de nascimento; 3 primeiras letras da rua). Mesmo resolvendo assim, o e-mail de confirmação continua sendo enviado.
13.1.5 Palavra-chave aleatória que só o cliente sabe, registrada e trocada a cada semana, para validação. DECISÃO DO CEO (09/11/2026): DESCARTADA (não entra na K8 nem em unidade futura).
13.1.6 O CEO deu autonomia para escolher os dados do cadastro usados nas legendas.

### 13.2 Verdades verificadas na fonte (09/11/2026)

13.2.1 As rotas atuais /validation-codes/generate, /verify e GET /validation-codes/session/:id NÃO exigem login de profissional (o portão de colaborador só cobre /site-content e /cadastros), geram o código com Math.random (previsível), guardam e devolvem o código em texto puro (inclusive a lista por sessão) e não limitam tentativas. O e-mail pré-sessão também usa o mesmo gerador. Por isso o código atual NÃO serve como rubrica.
13.2.2 Decisão de engenharia: K8 usa tabelas e rotas NOVAS; as rotas e o e-mail atuais ficam como estão (Regra de Ouro) e o código antigo não conta como rubrica. Fechar ou trocar as rotas antigas é decisão separada do CEO (achado registrado, ver 13.7).
13.2.3 Gestor administrador e responsável técnico já existem como marcas por clínica na tabela clinical_access_grants (is_clinic_admin e is_responsible_doctor, por local e profissional); o profissional tem e-mail cadastrado.
13.2.4 A mensageria já tem e-mail, WhatsApp (janela de 24 h) e Telegram; SMS não existe no Manager.

### 13.3 Estados da confirmação do cliente (por visita)

| Estado | Significa | RAS FAP, coluna do cliente |
|---|---|---|
| sem_pedido | Nenhuma chave foi pedida | vazia |
| chave_enviada | Chave enviada, aguardando a enfermeira digitar | vazia |
| rubrica_chave | Enfermeira digitou a chave correta | completa (prova plena) |
| rubrica_desafio | Desafio presencial acertado | completa, marcada como "por dados do cadastro" até o clique do e-mail |
| pendente | Enfermeira apertou "Cliente confirma depois" | vazia, marcada "aguardando" |
| confirmada_email | Cliente clicou no e-mail | completa (confirmação remota) |
| nao_confirmada | Os 3 e-mails saíram e o cliente não confirmou | vazia, marcada "NÃO CONFIRMADA" (nunca apagada) |

A coluna da enfermeira não depende de nenhum desses estados.

### 13.4 Requisitos de segurança da chave (Código Paxter + IHE)

13.4.1 Chave de 6 dígitos gerada com sorteio criptográfico (crypto.randomInt), nunca Math.random.
13.4.2 Guardada só como hash com segredo do servidor, amarrada à visita, ao cliente e à empresa. Nunca em texto puro no banco, no log nem na resposta da rota que envia (a tela da enfermeira nunca recebe a chave).
13.4.3 Validade 10 minutos; uso único; 5 tentativas por chave; após 5 erros a chave morre e exige novo envio; reenvio no mínimo 60 segundos depois; nova chave invalida a anterior.
13.4.4 Duplo clique, duas enfermeiras ou duas abas: só uma validação vale (reserva atômica no banco).
13.4.5 Canais: e-mail, WhatsApp e Telegram prontos do cliente; status honesto por canal (enviado não é entregue). SMS fora até haver número Twilio com SMS. Falha de canal nunca bloqueia o registro.

### 13.5 Requisitos do caminho "Cliente confirma depois"

13.5.1 O botão só aparece para quem pode registrar a aplicação daquela visita e grava quem apertou, quando (horário de Brasília) e o motivo escolhido.
13.5.2 E-mail ao cliente com um link de assinatura HMAC de 256 bits recalculável a partir de um nonce aleatório de 32 bytes guardado na visita (o token em si não é gravado), uso único, validade de 7 dias (13.5.5). O link abre uma página com UM botão de confirmar; quem só abre o link (antivírus, pré-visualização do e-mail) NÃO confirma. A confirmação grava data, hora e uma impressão do aparelho (sem dado pessoal extra).
13.5.3 Gestão (gestor administrador e responsável técnico do local da visita, sem repetir pessoa que acumula as duas funções) recebe 2 e-mails por visita pendente: um no ato do botão e um aviso final se o prazo dos 3 e-mails passar sem confirmação. DECISÃO DO CEO (09/11/2026, opção A). Se nenhum tiver e-mail, a tela da enfermeira avisa e o fato fica registrado; nunca bloqueia.
13.5.4 Cliente recebe 3 e-mails ao todo, um por dia (o primeiro no ato; depois +24 h e +48 h), parando na hora em que confirma. O aviso final à gestão sai 24 h depois do 3º e-mail do cliente, se não houve confirmação; nesse instante o estado vira nao_confirmada (quando a visita estava só em "pendente"; se já havia rubrica por desafio, o estado continua rubrica_desafio e apenas o aviso final é registrado). O aviso final diz quantos e-mails o provedor aceitou e quantos recusou; nunca afirma que "saíram" se foram recusados. Rotina diária idempotente (reinício do servidor não duplica; confere o estado no instante do envio).
13.5.5 Decidido por mim e avisado ao CEO: o link do e-mail continua valendo por 7 dias. Clique depois do aviso final muda nao_confirmada para confirmada_email com a marca "confirmada com atraso"; o histórico do atraso nunca é apagado.

### 13.6 Desafio presencial

13.6.0 DECISÃO DO CEO (09/11/2026, opção B): as duas metades do desafio saem só de dados do cadastro, sorteados. A palavra-chave semanal NÃO entra no desafio. O CEO foi avisado de que a prova é fraca (13.6.3) e manteve a opção B. Consequências aceitas: o desafio sempre fica marcado "por dados do cadastro" e o e-mail de confirmação de um clique continua sendo enviado e exigido para a parte do cliente ficar completa.

13.6.0b DECISÃO DO CEO (09/11/2026, opção C): 3 respostas erradas encerram a rodada; o sistema sorteia um desafio novo (outras legendas) com mais 3 tentativas, no máximo 2 vezes. São no máximo 3 rodadas (a inicial e 2 novas), 9 tentativas ao todo. Depois disso o desafio trava na visita e o caminho "Cliente confirma depois" liga sozinho (e-mail de um clique ao cliente e e-mail à gestão). Decidido por mim e avisado: o mesmo par de dados nunca se repete na mesma visita; se não houver par novo possível, trava antes. Nada disso bloqueia o registro da enfermeira.
13.6.1 O servidor sorteia as duas metades e guarda o sorteio; o navegador só recebe as legendas, nunca o valor esperado.
13.6.2 Só entram no sorteio dados que o cliente tem cadastrados; com menos de duas opções válidas o desafio fica indisponível, com mensagem clara.
13.6.3 Alerta de honestidade: a enfermeira enxerga CPF, endereço e nascimento no sistema, então esses dados NÃO provam que quem respondeu é o cliente. Só a palavra-chave semanal (que a enfermeira nunca vê) prova. Por isso o desafio por dados do cadastro, sozinho, vale menos que a chave e é sempre marcado como tal.
P1 RESOLVIDO (opção B). P1b RESOLVIDO (palavra-chave semanal descartada). P2 RESOLVIDO (gestão recebe 2). P3 RESOLVIDO (opção C). P4 RESOLVIDO (estado "não confirmada", 13.5.4). P5 RESOLVIDO por aviso (botão "Cliente confirma depois"). Nenhum ponto de decisão do CEO em aberto na especificação.

### 13.7 Achados independentes (Art. 76), fora do escopo de K8

13.7.1 Rotas antigas de código expostas sem login de profissional e com código em texto puro (gravidade alta). Recomendação: decisão própria do CEO para proteger ou desligar; não será mexido sem autorização.

### 13.7b Divisão da construção (proposta; uma parte por vez, revisão e aceite entre elas)

| Parte | Entrega | Depende de |
|---|---|---|
| K8a | Tabelas novas; chave segura por visita; envio aos canais; digitação pela enfermeira; rubrica gravada; botão e tela da chave | Nada |
| K8b | Botão "Cliente confirma depois"; e-mail de um clique; página pública de confirmação; e-mail à gestão; lembretes diários; estados "pendente" e "não confirmada" | K8a |
| K8c | Desafio presencial (2 metades sorteadas, legenda que respira, 3 rodadas); trava e entrada automática em K8b | K8a e K8b |

### 13.7c Estado de engenharia (09/11/2026)

13.7c.1 Construído: tabelas visit_confirmations e visit_confirmation_events (SQL bruto, criadas no boot da API e também pelo worker); rotas autenticadas e públicas; núcleo com chave HMAC, link de um clique, desafio, lembretes; job do api-worker a cada 10 minutos (Job 10); componente da tela na agenda (painel "Confirmação do cliente" dentro de cada visita).
13.7c.2 Pré-condição adicionada na revisão independente: chave, "Cliente confirma depois" e desafio só são aceitos depois de a enfermagem registrar ao menos uma aplicação da visita (a confirmação diz "a aplicação aconteceu"). Isso NÃO condiciona o registro da aplicação à confirmação; é o contrário.
13.7c.3 O módulo Agenda é aplicado explicitamente às rotas da confirmação. Falha ao criar as tabelas no boot não derruba a API (registra erro; a confirmação fica indisponível).
13.7c.4 Limite honesto: o corpo da mensagem WhatsApp com a chave é mascarado no log do Manager (corpoParaLog), mas o provedor (Twilio) e a caixa de Enviados do Gmail retêm a mensagem. A chave vale 10 minutos e é de uso único.
13.7c.5 Não verificado em ambiente real: envio de e-mail, WhatsApp e Telegram reais (só simulados); execução do worker com os crons ligados; a tela logada com dados reais de uma visita com aplicação (a tela foi vista com respostas simuladas; a rota real respondeu 200 com login de teste).

### 13.8 Falhas previstas

| ID | Falha | Gravidade | Barreira | Teste |
|---|---|---|---|---|
| F26 | Chave previsível | Crítica | Sorteio criptográfico | T-K8-1 |
| F27 | Chave em texto puro (banco, log, resposta) | Crítica | Só hash; a rota de envio não devolve a chave | T-K8-2 |
| F28 | Força bruta | Crítica | 5 tentativas, morte da chave, 60 s entre envios | T-K8-3 |
| F29 | Chave de outra visita, cliente ou empresa aceita | Crítica | Amarrada a visita+cliente+empresa | T-K8-4 |
| F30 | Reuso da mesma chave | Alta | Uso único atômico | T-K8-5 |
| F31 | Duas validações simultâneas | Alta | Reserva atômica | T-K8-6 |
| F32 | Link confirmado por antivírus ou pré-visualização | Alta | Abrir não confirma; só o botão confirma | T-K8-7 |
| F33 | Link reutilizado, expirado ou adivinhado | Alta | 32 bytes, hash, expira, uso único, resposta neutra | T-K8-8 |
| F34 | Gestor ou responsável técnico sem e-mail | Média | Aviso explícito e registro; nunca bloqueia | T-K8-9 |
| F35 | Lembrete duplicado após reinício | Média | Reserva atômica do próximo envio | T-K8-10 |
| F36 | Lembrete enviado depois da confirmação | Média | Estado conferido no instante do envio | T-K8-11 |
| F37 | Aplicação bloqueada por falha de canal | Crítica | Registro independente do envio | T-K8-12 |
| F38 | Canal falha em silêncio | Alta | Status por canal honesto | T-K8-13 |
| F39 | Desafio tratado como prova plena | Alta | Marcado e nunca sozinho como rubrica plena | T-K8-14 |
| F40 | Legenda vaza o valor do cadastro | Crítica | Só o rótulo; valor só no servidor | T-K8-15 |
| F41 | Cliente sem dados para o desafio | Média | Sorteio só entre dados existentes; indisponível com aviso | T-K8-16 |
| F42 | Hora em UTC | Média | lib/brt | T-K8-17 |
| F43 | Enfermeira de outra clínica valida | Crítica | Mesma guarda de empresa e vínculo da aplicação | T-K8-18 |
| F44 | Sorteio do desafio previsível ou repetido entre rodadas | Alta | crypto.randomInt; par nunca repete; sorteio guardado no servidor | T-K8-19 |
| F45 | Rodadas do desafio passam do limite (3 rodadas, 9 tentativas) | Alta | Contadores no banco, reserva atômica | T-K8-20 |
| F46 | Desafio travado deixa a visita sem encaminhamento | Alta | Trava liga sozinha o "Cliente confirma depois" | T-K8-21 |

Definição de PRONTO de K8: T-K8-1 a T-K8-18 verdes em banco isolado com canais simulados; regressão das unidades K1 e K7 verde; revisão independente sem pendência; tela vista em captura quando for possível (a captura automática não entra em telas com login; o que não for visto será dito).
