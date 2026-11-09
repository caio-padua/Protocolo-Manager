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
5. O planejador ainda NÃO está ligado a nenhuma rota: nenhuma reserva,
   sessão ou evento passa por ele. Falta a fonte de vagas (períodos adjacentes
   livres da enfermagem e cobertura do médico, lidos do motor) e a reserva
   atômica dos dois recursos.

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
