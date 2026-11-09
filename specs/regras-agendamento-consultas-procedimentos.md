# Regras de agendamento de consultas e procedimentos

## Estado

EM ESPECIFICAÇÃO. Este documento registra o inventário e os critérios para
unificar o comportamento solicitado. Ele não afirma que o motor unificado,
a sincronização, as reservas ou os documentos já estejam concluídos.

### Subunidades verificadas em ambiente isolado

- O cadastro de preferências registra dias e horários, e a marcação destaca
  apenas horários retornados como disponíveis. A interface autenticada real
  ainda precisa de conferência visual.
- O registro de aplicações exige acesso e vínculo clínico, identifica a
  ocorrência, preserva a autoria e impede alteração contraditória silenciosa.
- A sincronização manual exige vínculo com o local cadastral e o local
  operacional. Reserva o identificador antes da chamada externa, impede
  duplicação e mantém resultado incerto bloqueado para conferência. Os testes
  não chamaram o Google real.
- A confirmação da aplicação, a agenda e a carta distinguem aplicação
  comprovada de aplicação não realizada. A projeção para o Google usa o mesmo
  estado, mas atualização automática, todas as substâncias e reconciliação de
  pendências ainda não estão concluídas.
- A limpeza de simulações oculta somente registros da empresa selecionada,
  sem apagar os registros nem eventos do Google.
- Revisão independente aprovou exclusivamente as subunidades acima.

### Dimensionamento da visita e participação médica (09/11/2026)

Decisão do responsável: na via endovenosa o médico não participa. Regra
completa: intramuscular, subcutânea e endovenosa não reservam o médico;
implantes e procedimentos estéticos reservam. Cada substância continua
editável pelo controle sim/não do cadastro.

1. Dado: no banco de desenvolvimento, as 213 substâncias com participação
   médica indefinida receberam o valor da regra acima (163 intramusculares,
   1 subcutânea e 16 endovenosas = não; 33 implantes = sim). Os 4 registros
   que já tinham valor (intramusculares = não) foram preservados: 213 + 4 = 217.
   Contagens lidas no banco antes e depois, na mesma transação (213 e 4 antes;
   0 e 217 depois). Para desfazer: devolver a indefinição a todos, exceto esses
   4. Outros ambientes não foram alterados e exigem a mesma conferência antes
   de publicar.
2. Código: `lib/protocol-visit-sizing.ts` converte tempos em períodos de
   enfermagem. Cada período de 20 minutos guarda 5 de organização e comporta
   900 segundos de procedimento. Seis aplicações de 150 segundos = 1 período;
   sete = 2; implante de 1.800 segundos = 2 períodos (40 minutos) e médico.
   Participação médica indefinida é recusada, nunca presumida.
3. Consequência da regra, a ser lembrada ao reservar: implante mais uma
   aplicação comum na mesma visita soma 1.950 segundos e pede 3 períodos.
4. O planejador já existente (`planProtocolWithAvailableSlots`, com 26 testes
   anteriores) passou a aceitar o modo por tempo: cada vaga informa quantos
   períodos de 20 minutos a enfermagem tem livres e quantos o médico cobre ao
   mesmo tempo. A unidade é o tempo RESERVADO, não o clínico: se alguma
   aplicação da visita exige o médico, ele precisa cobrir todos os períodos que
   a visita reserva (implante sozinho = 2; implante mais uma aplicação = 3), e
   vale o menor entre enfermagem e médico, qualquer que seja a ordem em que as
   aplicações entram na visita. Compatibilidade: vagas só com
   `maxApplications` e substâncias sem duração seguem o comportamento antigo;
   informar capacidade em períodos sem duração nas substâncias, ou duração em
   apenas parte delas, é recusado como entrada ambígua. Cada visita planejada
   no modo por tempo devolve o dimensionamento (períodos e médico) para a
   reserva e para o evento do Google.
5. O planejador ainda NÃO está ligado a nenhuma rota: nenhuma sessão ou
   evento passa por ele. A fonte de vagas (item 6) e a reserva atômica só da
   enfermagem local (item 7) já existem como bibliotecas, sem rota. Falta a
   rota única que une leitura de vagas, planejamento e reserva (etapa 4) e a
   reserva conjunta com o médico (depende de expediente das agendas médicas,
   que só o responsável pode informar).
6. Fonte de vagas (etapa 2 de 7, 09/11/2026): `lib/protocol-slot-source.ts`
   lê o motor de agenda existente, dia a dia, e entrega ao planejador as vagas
   em períodos. Cada horário livre da enfermagem informa quantos períodos
   livres e consecutivos existem a partir dele; horário ocupado, bloqueado ou
   ainda não liberado pela cadeia, e o intervalo do almoço, interrompem a
   sequência. A cobertura do médico é a união dos horários abertos da agenda
   médica (grade de 60 minutos); sem agenda médica informada a cobertura fica
   ausente, com agenda informada e sem horário fica zero. A leitura só
   fotografa: não reserva nada, e quem reservar (etapa 3) confere de novo
   sob bloqueio.
   Decisão do responsável (09/11/2026): duas infusões endovenosas de 30
   minutos na mesma visita contam uma depois da outra (3.600 segundos = 4
   períodos = 80 minutos).
   Honestidade do diagnóstico: "sem expediente", "exceção" (feriado) e "agenda
   do Google desatualizada" são devolvidos à parte, para a enfermagem e para o
   médico, e nunca viram "sem vaga"; motivo desconhecido do motor falha em vez
   de ser tratado como ausência. A agenda precisa pertencer à empresa
   informada, ter local ativo e (enfermagem) horários de 20 minutos; a
   recusa tem a mesma mensagem para inexistente, de outra empresa e inativa.
   Limites: o custo medido é de 73 a 130 ms por dia e por agenda (é
   processamento; ler dias em paralelo não ganhou tempo). Orçamento de 240
   agenda-dias: 200 dias só com enfermagem, 120 com enfermagem e médico
   (cerca de 30 s no pior caso). Teto de 5.000 vagas, o mesmo do planejador:
   a leitura recusa assim que o teto é ultrapassado, em vez de entregar algo
   que o planejador rejeitaria.
   Estado dos dados em desenvolvimento: só a Enfermagem Local tem expediente;
   as 6 agendas médicas e a Enfermagem Remoto não têm janelas, então
   implante, médico e remoto não geram vaga até o expediente ser cadastrado.
7. Reserva atômica por períodos (etapa 3 de 7, 09/11/2026), só enfermagem local:
   `lib/protocol-visit-reservation.ts`, função `reserveProtocolVisits`. Recebe
   o plano (datas, horários e quais aplicações de cada visita) e grava tudo ou
   nada, numa única transação, sob o MESMO bloqueio por empresa que a marcação
   avulsa já usa (`lockAgendaResource`); assim reserva de protocolo e marcação
   avulsa não disputam o mesmo horário.
   Dentro do bloqueio a função refaz tudo por conta própria, sem confiar no
   que o chamador diz: a empresa da agenda, o cliente (da empresa) e o
   protocolo (do cliente e da empresa) são lidos do banco; as doses, as
   quantidades e as durações vêm do protocolo e do catálogo de substâncias,
   nunca do plano recebido; o plano precisa cobrir exatamente as aplicações
   do protocolo (nenhuma a mais, nenhuma a menos, nenhuma repetida, cada
   substância em ordem cronológica e no máximo uma vez por visita); cada
   visita é dimensionada de novo (`sizeVisit`) e o horário é relido pelo motor
   verdadeiro (`loadProtocolSlots` sobre a transação), exigindo períodos livres
   e seguidos suficientes a partir do horário pedido.
   Recusas explícitas (nunca silenciosas, nunca gravação parcial): dia sem
   expediente, dia com exceção, Google desatualizado, horário sem períodos
   suficientes (sobreposição parcial incluída), visita que exija médico
   ("reserva com médico ainda não habilitada": não existe fonte de ocupação do
   médico nesta etapa e ela não será inventada), participação médica ou
   duração indefinida, cliente que já tem outra visita no mesmo dia, protocolo
   de outra empresa ou de outro cliente, protocolo que não esteja "suggested"
   ou que já tenha qualquer sessão (mesma regra do `validate` antigo).
   Gravação: uma sessão por visita, com `resource_id` da enfermagem,
   `duration_minutes` = períodos x 20 (tempo RESERVADO, não clínico),
   `weekNumber` sequencial, aplicações "disp" da visita e "prox" das
   substâncias que ainda voltam em visita posterior (convenção já usada pelo
   `validate`), e o protocolo passa a "validated" na mesma transação.
   NÃO faz nesta etapa: Google Agenda (etapa 5), rota e botão (etapa 4),
   reavaliação de intervalos e tolerância (é do planejador; a rota da etapa 4
   deve rodar o planejador no servidor e nunca aceitar plano vindo do
   navegador), reagendamento de protocolo que já tenha sessões legadas
   (etapas 4 e 6).
   Modalidade: só a agenda de enfermagem LOCAL é aceita. Enfermagem
   domiciliar ou online, mesmo com expediente e horários de 20 minutos, é
   recusada (`agenda_invalida`), porque deslocamento e expediente remotos têm
   outras regras ainda não definidas.
   Custo: medido em banco de ensaio, 10 visitas levam 0,25 s, 40 levam 0,63 s e
   80 (o teto) levam 1,15 s, com o bloqueio da empresa preso durante toda a
   reserva. Em dados reais, com mais janelas e sessões, a leitura do motor
   custou de 73 a 130 ms por dia na etapa 2: o teto de 80 visitas pode
   prender o bloqueio por 6 a 10 segundos; é o motivo do teto.
   Falhas previstas: duas reservas simultâneas no mesmo horário ou em
   horários sobrepostos (uma só vence); falha no meio da gravação (volta tudo);
   resposta perdida após gravar (a nova tentativa recebe "já agendado", não
   duplica); plano adulterado (dose, total, substância de outro protocolo).
8. Prévia e confirmação do agendamento do protocolo (etapa 4 de 7, 09/11/2026), só
   enfermagem local: `lib/protocol-scheduling.ts` (cálculo), `routes/protocol-scheduling.ts`
   (rotas) e `components/ProtocolSchedulingDialog.tsx` (botão "Agendar protocolo" no
   detalhe do protocolo, só para protocolo sugerido e sem sessões).
   Rotas: `POST /protocols/:id/scheduling/preview` (calcula e mostra; não grava nada) e
   `POST /protocols/:id/scheduling/confirm`. O navegador NUNCA envia o plano: a prévia só
   aceita a agenda (opcional) e a confirmação só aceita a impressão digital da prévia
   (campo extra no pedido = 400). O servidor lê do banco cliente, protocolo, itens e
   catálogo, roda o planejador (margem de 4 dias; intervalo mínimo = frequência menos 4
   dias), recalcula tudo na confirmação e só reserva se a impressão digital for igual.
   Se não for, responde 409 `plano_mudou` com a prévia nova e não grava.
   A impressão digital cobre agenda, datas, horários, períodos, minutos reservados,
   doses, totais, datas nominais e uma fotografia do protocolo (data de início, dose,
   total, intervalo, data de cada item, duração e exigência de médico de cada substância).
   A mesma fotografia vai para `reserveProtocolVisits` (`expectedSnapshot`), que a confere
   de novo SOB o bloqueio da empresa: edição feita entre o recálculo e o bloqueio também
   recusa com `plano_mudou`. O acesso clínico é reconferido imediatamente antes de reservar
   (409 `acesso_alterado`).
   Agenda de enfermagem: a escolhida, senão a padrão do cliente, senão a primeira
   preferencial; precisa ser da empresa, de enfermagem e LOCAL. A preferência do cliente
   (dia, horário, ordem) só ORDENA as vagas; nunca exclui nenhuma.
   Recusas explícitas (nada gravado): protocolo que já tem qualquer sessão (legado
   incluído) ou não sugerido; participação médica ou duração indefinida; substância que
   exige médico ("ainda não há agenda médica com expediente"); período maior que o teto de
   leitura da agenda; datas que já passaram; protocolo grande demais; sem combinação
   (`sem_plano`, com o texto listando separadamente exceção, sem expediente, sem horário
   livre); Google desatualizado tem código próprio (`agenda_desatualizada`) e nunca é
   tratado como "ocupado".
   NÃO faz nesta etapa: evento no Google Agenda (etapa 5), e-mail ou convite ao cliente,
   cancelamento e reagendamento (etapa 6). A validação antiga (`POST /protocols/:id/validate`)
   e o botão "Validar e Gerar Sessões" continuam intactos.
   Custo medido em banco de ensaio: prévia de 3 substâncias semanais por 12 semanas
   (36 aplicações, 82 dias de agenda) = 5,9 s. Em dados reais a leitura do motor custou
   73 a 130 ms por dia, então a mesma prévia pode levar 6 a 11 s; a confirmação repete o
   cálculo (mais 6 a 11 s) antes de reservar. Protocolos de 4 aplicações ou mais já podam a
   busca (acima de 1.000 candidatas por etapa) e a prévia avisa que pode existir plano melhor.
   Não ligado ainda: restrições por substância e data da última aplicação (`lastAppliedDate`)
   do planejador.
9. Envio das visitas ao Google Agenda (etapa 5 de 7, 09/11/2026): `lib/session-google-sync.ts`,
   rota `POST /protocols/:id/scheduling/google-sync` (corpo opcional `{ refresh: true }`; campo
   extra = 400) e `components/ProtocolGoogleSyncDialog.tsx` (abre sozinho depois de confirmar o
   agendamento e pelo botão "Enviar ao Google Agenda" do detalhe do protocolo validado).
   Regras: UM evento por visita (sessão), com todas as substâncias, doses e posição "n/total" na
   descrição; sem participante e sem convite (`sendUpdates: none`); o sistema é a fonte da
   verdade e falha do Google NUNCA desfaz a reserva. O identificador do evento é reservado no
   banco antes do envio e o MESMO evento é atualizado depois (`refresh`). Resultado incerto
   (queda, resposta perdida, reinício) fica marcado e a repetição faz a conferência com o
   identificador já reservado: se o evento existe, atualiza; se não existe, cria com o mesmo
   identificador; erro do Google na própria conferência mantém a visita incerta. Nunca se gera
   identificador novo. Destino por visita (recusa com motivo, nada enviado): agenda ativa, com
   calendário Google, local ativo da empresa e profissional logado vinculado ao local (mesma regra
   do envio avulso); visita sem agenda (formato antigo) é informada, não enviada; visita já
   ligada a outra agenda Google não é movida. Conta Google não confirmada = 503 e nada é
   alterado. Limite de 40 visitas por chamada (o restante volta como `nao_processada` e
   `remaining`); o acesso clínico é reconferido antes de cada visita. As rotas antigas
   `sync-session` e `sync-week` seguem iguais (só passaram a importar os auxiliares do novo arquivo).
   Não verificado: comportamento do Google ao atualizar evento que foi apagado lá (conta como
   existente); corrida em que a visita muda entre a leitura e a reserva é protegida por
   comparação sob reserva, mas só foi provada pelo caminho de cancelamento durante o envio.

10. Remarcar e cancelar visita de protocolo (etapa 6 de 7, 09/11/2026): `lib/agenda-booking.ts`
   (`rescheduleSession`, `cancelBooking`), `routes/sessions.ts` (`PUT /sessions/:id`),
   `routes/area-paciente.ts` (remarcação pela cliente), `routes/agenda.ts` (`DELETE /agenda/book/:id`)
   e auxiliares em `lib/session-google-sync.ts`.
   Remarcar: a visita mantém os minutos reservados (arredondados para cima em períodos da agenda; nunca
   encolhem para um período) e o trecho inteiro precisa estar livre no novo dia, senão 409 com o
   horário que falhou e nada muda. Na mesma agenda ficam o profissional, a unidade e o tipo gravados na
   reserva (a agenda de enfermagem não tem profissional próprio); em outra agenda valem os da nova.
   Sessão avulsa de um período remarca exatamente como antes.
   Google na remarcação: visita de protocolo (com aplicações) que já está no Google, na MESMA agenda
   Google, tem o MESMO evento atualizado depois de gravar (mesmo identificador, descrição completa,
   novo dia e horário; `refreshAfterReschedule`). Falha vira `googleSyncWarning` na resposta, nunca
   desfaz a remarcação; resultado incerto fica marcado e o botão "Enviar ao Google Agenda" repete com o
   mesmo identificador. Sessão avulsa (sem aplicações) ou troca para agenda com outro calendário Google
   seguem o caminho antigo (apagar e criar evento genérico).
   Cancelar (pelas duas rotas): o evento sai do Google; 404/410 conta como já removido; falha real do
   Google MANTÉM o ponteiro do evento (nunca se perde o rastro) e devolve aviso; o cancelamento no
   sistema vale sempre e as aplicações da visita cancelada ficam gravadas (nada é apagado).
   Numeração na descrição: "Agendamento Número n/total" usa a posição cronológica entre as visitas
   ativas, então cancelamento e remarcação nunca produzem "3/2". O número gravado na sessão
   (`weekNumber`) não foi alterado (a grade do RAS e os PDFs continuam lendo o mesmo valor).
   O botão "Enviar ao Google Agenda" agora também atualiza o que já está no Google (primeira chamada
   de cada abertura com `refresh: true`; reenvios só tratam o que ficou pendente).
   Revisão independente (09/11/2026) e correções: a atualização do evento depois de remarcar e a remoção
   depois de cancelar só agem se a conta Google da clínica for confirmada (conta errada enxerga 404
   num calendário alheio, e 404 não prova remoção); repetir o cancelamento de visita cujo evento ficou
   no Google tenta remover de novo; remarcação pela rota de edição de visita que não pode seguir no
   mesmo evento (calendário diferente ou sem aplicações) avisa que o evento ficou no dia antigo;
   `GET /sessions/:id` passou a filtrar pela empresa do acesso (antes devolvia sessão de qualquer
   clínica pelo número; falha anterior a estas etapas).
   Limites conhecidos, anteriores a estas etapas e NÃO alterados: o caminho antigo de visita avulsa
   (sem aplicações) apaga e recria o evento Google dentro da transação e ignora falha da exclusão
   (pode deixar evento duplicado ou órfão); as leituras `GET /sessions` não exigem login de
   colaborador (política antiga do sistema: leituras livres, escritas protegidas).
   Não verificado: remarcação pela Área do Cliente (fio ligado e compilado, sem teste de rota);
   documentos em PDF que listam todas as sessões continuam mostrando as canceladas com o estado delas
   (não foi alterado); evento cancelado cujo ponteiro foi mantido não é limpo automaticamente depois.
11. Aviso antes de agendar (etapa 7 de 7, 09/11/2026): `googleReadinessWarning` em
   `lib/session-google-sync.ts`, devolvido como `googleWarning` fora da prévia (não entra na
   impressão digital) em `preview` e em `confirm` quando o plano mudou. Usa a mesma regra do envio ao
   Google (agenda ativa, calendário Google, local ativo da empresa, profissional logado vinculado ao
   local), só lê e nunca chama o Google. Falha ao verificar vira aviso `verificacao_indisponivel`,
   nunca "pronto". O aviso não bloqueia: a reserva no sistema continua valendo.
   Licenciamento para outras clínicas: toda leitura e escrita desta cadeia filtra pela empresa do
   acesso clínico (protocolo, cliente, agenda, local, sessão, evento); outra clínica recebe recusa
   sem dados, sem aviso e sem chamar o Google (provado nos testes das etapas 4 a 7). Pendente do lado
   comercial: cadastro de expediente das agendas, calendário Google por agenda e vínculo dos
   profissionais ao local (o aviso passa a mostrar quando falta).

### Impedimentos reais encontrados no desenvolvimento

- A validação atual de protocolo grava sessões com horário padrão sem reservar
  recursos nem comprovar disponibilidade. Não usar para agendar o protocolo
  real antes de corrigir esse fluxo.
- O recurso presencial de enfermagem foi configurado com períodos de vinte
  minutos e o expediente autorizado, confirmado no motor em 08/11/2026.
  Os demais recursos de enfermagem e médico consultados ainda registravam
  períodos de trinta minutos e não tinham janelas ativas. A grade médica de
  sessenta minutos ainda não foi configurada ou conferida nesta operação.
- Em 08/11/2026, o motor bloqueou o horário de 09/11/2026 às 10h pela regra
  de antecedência mínima existente. Preferência cadastrada não equivale à
  liberação ou reserva deste horário.
- O médico confirmou que a via da PQQ é intramuscular. Em desenvolvimento,
  os três registros de catálogo foram corrigidos e auditados sem alterar dose
  ou preço; o ensaio em banco isolado confirmou a preservação diante de
  reimportação da fonte autenticada. A origem pública padrão de transmutação
  respondeu 404 e continua sem comprovação de funcionamento pelo sistema.
- Não foram criados os atendimentos reais solicitados, gerado o RAS/FAP real,
  nem emitidos ou enviados documentos reais assinados nesta etapa.

### Conferência matemática da distribuição solicitada

Foi examinada, sem reservar horários, a hipótese de primeira coenzima em
09/11/2026, cinco aplicações semanais, margem de quatro dias e uma visita por
semana. Para três aplicações em sábados alternados, iniciar em 21/11 ou
05/12 não produz solução nessas condições. Iniciar em 19/12 produz soluções
matemáticas; por exemplo, manter as cinco aplicações semanais às segundas.
Essa análise não consulta ocupação, feriados, disponibilidade de profissionais
ou autorização de exceção à antecedência e não é um planejamento homologado.

## Objetivo e nomes

O nome deve revelar a função: regras de agendamento de consultas médicas e
procedimentos de enfermagem. O componente de apresentação deve ter nome
igualmente descritivo, distinto do planejamento e da reserva de recursos.
Não confundir o nome com um código semântico já cadastrado sem comprovar que
exista registro oficial para ele.

Fluxo previsto:

Protocolo e agenda reais → planejamento único → reserva validada →
sessão persistida → descrição compartilhada → agenda interna e Google.

## Referência visual das quatro imagens

O evento apresenta nome e identificação do cliente, número sequencial de
agendamento, unidade, procedimentos, duração, situação e substâncias com
contadores e legenda. A informação deve ser clara, ordenada e consistente nas
duas agendas. As durações das capturas são históricas e não substituem as
regras posteriores do médico: por exemplo, implante requer trinta minutos de
procedimento e reserva de dois períodos de vinte minutos na enfermagem.

Todas as substâncias do protocolo devem aparecer em cada apresentação, com
posição, dose, quantidade e estado derivados de dados reais. A descrição deve
distinguir programação, aplicação realizada, remarcação e falta sem inferir
eventos que não tenham sido registrados. A legislação de acesso e a
privacidade das agendas pessoais precisam continuar valendo.

## Fontes encontradas e diferenças comprovadas

| Fonte | Comportamento verificado | Risco |
|---|---|---|
| `routes/protocols.ts`, validação semanal | Agrupa em blocos de sete dias a partir do início e escolhe a data com mais aplicações. | Pode reunir ocorrências de frequência menor que sete dias; não consulta a disponibilidade dos recursos; não aplica a margem de quatro dias. |
| `lib/protocol-exact-schedule.ts` | Mantém os intervalos e início individuais e agrupa datas iguais. | Não consolida datas próximas nem reserva recursos. |
| `lib/ras-fap.ts`, grade antiga | Agrupa por semana de segunda a domingo e usa a primeira data prevista. | Pode divergir das sessões efetivamente gravadas, inclusive em intervalos menores que sete dias. |
| `lib/protocol-ras-grid.ts` | Para o modo exato, utiliza as sessões persistidas; o modo antigo mantém a grade legada. | Dois caminhos podem mostrar resultados diferentes. |
| `routes/google-calendar.ts` | Monta dados de eventos a partir das aplicações persistidas e calcula duração por tipos distintos. | Duração não conta aplicações individualmente; procedimentos subcutâneos e novos limites precisam ser revistos. |
| `lib/google-calendar.ts` | Monta a descrição detalhada e é usado para criar e atualizar o evento. | Recalcula duração por tipo; falta e cancelamento são apresentados juntos; não há situação específica de remarcação nessa função. |
| `lib/ics.ts`, `lib/session-ics.ts`, `routes/sessions.ts` e `lib/email-service.ts` | Convites usam outro cálculo de duração por tipos. | Pode divergir da agenda e do tempo efetivamente reservado. |
| `routes/agenda-google-compromissos.ts` | Retorna horários, títulos e agendas dos compromissos importados. | A consulta examinada não devolve a descrição completa para a agenda interna. |
| `routes/sessions.ts` e `routes/google-calendar.ts` | A falta individual é gravada no estado da aplicação, enquanto a classificação do evento consulta prioritariamente a disponibilidade e o horário de aplicação. | Uma falta pode não ser refletida corretamente no texto. |

Este inventário cobre os caminhos encontrados nas buscas e leituras indicadas.
Não certifica que todos os arquivos do repositório tenham sido auditados.

## Regras confirmadas pelo responsável

1. Uma a seis aplicações intramusculares ou subcutâneas somadas ocupam um
   período de vinte minutos; cada aplicação tem duração clínica de 2,5 minutos.
2. Ao ultrapassar seis aplicações, reservar outro período livre e adjacente.
   O período de organização da enfermagem está incluído em cada bloco reservado.
3. Implantes e procedimentos estéticos ocupam trinta minutos clínicos e dois
   períodos consecutivos de enfermagem, com reserva simultânea do médico.
4. A grade médica usa períodos de sessenta minutos; a de enfermagem, vinte.
5. Agrupar quando possível para uma visita semanal, exceto frequências
   inferiores a sete dias; a margem autorizada é de até quatro dias. Em
   08/11/2026, o médico escolheu proteger cada intervalo consecutivo com o
   mínimo da frequência cadastrada menos quatro dias. O resultado deve ser
   positivo: para frequências cadastradas de um a quatro dias, o médico decidiu
   preservar a própria frequência cadastrada como intervalo mínimo.
6. O PQQ utilizado pelo consultório é intramuscular, nunca endovenoso.
7. O conteúdo do Google e da agenda interna deve vir dos mesmos dados reais,
   incluindo todas as substâncias e os estados efetivamente registrados.
8. Quando o planejamento exigir duas ou mais visitas na mesma semana, consultar
   as preferências de enfermagem do cadastro, mantendo a associação entre cada
   dia e seus horários. Mostrar as opções cadastradas por clique, inclusive
   três ou mais dias quando existirem, sem inventar preferências ausentes.
9. Nessa situação, confirmar com o cliente os dias, o horário de cada dia e a
   repetição desejada. A equipe pode registrar no sistema a confirmação obtida
   na conversa; um aceite direto do cliente pelo sistema ou e-mail é outra
   possibilidade. Preferência salva não equivale a aceite da programação.
10. Permitir uma rotina fixa, por exemplo segunda e quinta com horários
    diferentes, e também escolha não fixa quando o cliente preferir. O desenho
    da alternativa não fixa e seu alcance ainda dependem de implementação e
    validação; não se deve assumir que uma lista de preferências é um acordo.
11. Calcular e mostrar as datas concretas decorrentes da repetição. Antes de
    confirmar e reservar, conferir em cada data a frequência e o intervalo
    mínimo, a margem autorizada, o expediente, as exceções, as vagas e todos os
    recursos necessários. A escolha do cliente não autoriza mudar a prescrição
    ou ignorar indisponibilidade clínica.
12. A rotina fica vinculada ao cliente, ao protocolo e à empresa corretos.
    Qualquer alteração da programação após o aceite exige nova confirmação;
    alterações de expediente ou ocupação exigem nova conferência de vaga.
    Impedir gravação parcial ou repetida em falha, concorrência e reconexão.

### Avaliação independente das preferências e da nova solicitação

Em 08/11/2026, revisão independente conferiu o cadastro de dias e horários,
controle de versão, isolamento entre empresas e destaque na marcação interna.
O cadastro já permite múltiplos dias e múltiplos horários por dia e categoria.
As opções do cadastro representam a grade recorrente da empresa, não garantem
vagas em uma data. As preferências aparecem na marcação somente entre horários
consultados como abertos, sem que a simulação de ocupação determine as vagas.

A revisão não encontrou confirmação de rotina fixa ou flexível do cliente,
nem reserva integral de recursos para protocolo. A validação semanal anterior
pode reunir aplicações de intervalo inferior a sete dias na mesma sessão; o
modo exato não verifica as vagas necessárias. Assim, a nova jornada completa
está BLOQUEADA e não pode ser apresentada como funcional ou homologada.
As funções de confirmação, repetição e reserva precisam ser integradas ao
mesmo motor clínico, não acrescentadas como demonstração paralela.

## Falhas previstas e barreiras

1. Não atribuir automaticamente status de aplicação, falta ou remarcação.
2. Não usar a margem de quatro dias sem respeitar o mínimo escolhido pelo
   médico entre aplicações consecutivas. Para frequências de um a quatro dias,
   preservar a própria frequência cadastrada como intervalo mínimo.
3. Não criar sessão parcial, sobreposta ou vinculada à empresa errada.
4. Não apagar dados históricos, agendas ou eventos externos. Remover código
   substituído somente depois de provar seus consumidores e a equivalência
   segura; preservar o histórico de versões.
5. Não apresentar a duração clínica como duração de reserva, nem o contrário.
6. Preservar o mesmo evento do Google em atualizações e informar falhas reais.
7. Não oferecer descrições pessoais ou clínicas a quem não tenha acesso.
8. Antes de criar a jornada real solicitada, resolver eventual conflito de
   datas entre as regras, conferir dose, via, profissional e recursos reais.

### Descoberta impeditiva: confirmação clínica da aplicação

Gravidade alta na implementação anterior. A operação não exigia explicitamente
colaborador e não verificava o vínculo clínico nem a empresa da sessão. Além
disso, identificava a aplicação apenas pela substância, embora possa existir
mais de uma ocorrência dessa mesma substância na sessão. A correção e sua
revisão estão descritas nas subunidades verificadas acima.

Correção planejada: exigir sessão profissional ativa e vínculo clínico
existente, conferir empresa, cliente e protocolo, serializar confirmação por
sessão e identificar a ocorrência. Chamadas antigas sem identificação da
ocorrência só serão aceitas se houver uma única aplicação correspondente;
ambiguidade deve ser recusada. Não sobrescrever confirmação anterior por outra
situação sem fluxo de retificação rastreável. A interface deve enviar o
identificador real da aplicação, não criar identificação artificial.

A sessão marcada como `completed` significa que suas aplicações previstas
foram encerradas, e pode incluir aplicações não realizadas. Não concluir por
isso que todas foram aplicadas nem que o cliente faltou: cada situação deve
vir do registro próprio. Ainda é necessário atualizar a apresentação nas
agendas e sincronizar estados com segurança.

## Prova obrigatória

Testes isolados devem cobrir sessões com uma, seis e sete aplicações; mistura
intramuscular e subcutânea; implante; ocupação; almoço; concorrência; frequência
menor que sete dias; margem; eventos alterados; falta; remarcação; aplicação;
exceções; privacidade; consistência entre agenda interna, Google e formulário.
Revisão independente, captura e prova externa autorizada são necessárias antes
de declarar o conjunto homologado.
