# Preferências do cliente e reserva de recursos por procedimento

## Estado

PARCIALMENTE IMPLEMENTADO NO DESENVOLVIMENTO. O responsável reiterou que já
havia definido a reserva: uma a seis aplicações ocupam um período de vinte
minutos; a partir da sétima, é necessário outro período adjacente e livre.
A reserva com essas regras ainda não foi implementada ou homologada. As
subunidades concluídas e seus limites estão descritos abaixo. Nenhum
agendamento, documento ou evento externo foi criado por este trabalho.

## Objetivo

Utilizar o motor de agenda existente para considerar preferências dos clientes,
calcular o tempo ocupado pelos procedimentos e reservar todos os profissionais
necessários, sem produzir agendas ou descrições divergentes.

### Subunidade solicitada: ordem explícita de preferência

1. Registrar separadamente para consulta e enfermagem uma lista ordenada de
   pares dia e horário já selecionados; o primeiro par é a primeira escolha.
2. A tela permite selecionar e reordenar escolhas por clique, indica a posição
   em texto e preserva a associação entre dia e horário. Remover uma escolha
   da ordem não remove o horário preferido; remover o horário ou dia remove
   apenas as respectivas posições na ordem.
3. Escolhas anteriores sem ordem explícita permanecem sem ordem: não interpretar
   a ordenação antiga por dia como a preferência do cliente.
4. A omissão da lista de ordem por uma versão antiga da tela preserva as
   posições existentes dos horários que continuam selecionados. Lista vazia
   enviada explicitamente significa limpar a ordem. Não alterar preferências de
   outro cliente, empresa ou versão concorrente.
5. Recusar posições repetidas ou horários que não pertençam às escolhas do
   cadastro. Manter revisão e histórico já existentes, sem migração destrutiva.
6. Na marcação interna, mostrar a posição somente junto ao horário realmente
   aberto da mesma data e categoria. Ordem não é confirmação do cliente,
   disponibilidade futura, autorização clínica nem reserva.
7. Testar gravação e releitura de três pares em ordem diferente da semana,
   reordenação, dados legados, alterações concorrentes, dados inconsistentes,
   falha de rede e destaque apenas em vagas abertas. Conferir computador e
   celular, com dados fictícios, e realizar revisão independente.
8. Esta subunidade não implementa escolha recorrente confirmada, planejamento
   clínico nem reserva conjunta. A jornada permanece bloqueada até essas
   dependências serem efetivamente construídas e verificadas.

Evidência em 08/11/2026: a revisão independente aprovou a lógica restrita da
ordem, sem homologar a jornada de agendamento. Quatorze testes de servidor
passaram em banco isolado, incluindo gravação, releitura, histórico, concorrência
e compatibilidade com dados sem ordem; testes de interface com serviços
interceptados cobriram seleção, reordenação e exibição em computador e celular.
Uma sobreposição visual no celular foi corrigida e recebeu teste geométrico.
O serviço iniciou e a rota de saúde respondeu, mas não foi possível observar
essa tela com uma sessão profissional autenticada na captura disponível.
A conferência geral de tipos da interface e do servidor ainda apresenta erros
preexistentes; essa verificação global não foi aprovada.

Na consulta inicial ao banco de desenvolvimento, as agendas de enfermagem
estavam com intervalos de trinta minutos e sem janelas de expediente ativas.
Depois da autorização expressa do responsável, o recurso presencial de
enfermagem recebeu intervalos de vinte minutos e dez janelas de expediente;
as preferências escolhidas foram registradas na ficha autorizada. A releitura
do banco e do motor confirmou a ordem e os sábados alternados. Nenhum
agendamento, documento ou evento externo foi criado por esta operação.
A captura disponível não possuía sessão profissional; a tela autenticada
real continua sem verificação visual.

Na validação posterior à operação, vinte e cinco testes dos três conjuntos
de preferências, operação delegada e motor de janelas passaram em bancos
isolados. O motor real confirmou expediente em 21/11 e 05/12, sem expediente
em 28/11. A consulta real para 09/11 às 10h foi bloqueada pela antecedência
mínima vigente; não se deve apresentar esse horário como agendamento criado.

### Operação administrativa expressamente autorizada

O responsável autorizou diretamente a configuração do expediente informado e
o preenchimento de preferências de uma cliente específica no ambiente de
desenvolvimento, sem envio externo. É uma operação de dados supervisionada,
não um teste agressivo no prontuário.

1. Identificar cliente, empresa, recurso presencial e profissional responsável
   nos registros existentes, sem inferir identidade apenas pelo primeiro nome.
2. Preservar dados clínicos, preferências médicas e janelas anteriores;
   interromper se o estado observado divergir do esperado, em vez de sobrescrever.
3. Efetuar a alteração em transação com o bloqueio usado pelo motor; usar as
   validações de repetição e a gravação de preferências existentes no sistema.
4. Não falsificar uma sessão profissional: registrar que a operação foi
   executada pelo agente de manutenção sob solicitação do proprietário.
   O profissional indicado na revisão é o autorizador da operação delegada.
5. Não criar reserva, prescrição, envio ou evento externo nesta operação.
6. Antes de escrever dados reais, revisar a operação e executá-la em banco
   isolado com identidades sintéticas; depois reler o estado real e conferir
   a oferta com o motor, sem declarar que a jornada clínica está homologada.
7. A revisão deve identificar na própria linha o executor agente e o
   profissional que autorizou; manter `created_by` como autorizador legado
   apenas quando o executor for explicitamente um agente. Nenhum leitor pode
   apresentar `created_by` isoladamente como executor em revisões delegadas.
   Para revisões normais, `created_by` continua identificando o executor.
8. A conexão deve coincidir com a identidade do banco de desenvolvimento
   obtida separadamente pela ferramenta de banco e recusar execução em
   ambiente publicado. Estado preexistente, inclusive ordem órfã, bloqueia.

## Regras informadas pelo responsável

1. No cadastro do cliente, permitir informar dias da semana e horários
   preferenciais para consultas e aplicações de protocolos injetáveis.
2. Apresentar dias e horários como seletores claros, capazes de registrar
   múltiplas preferências, distinguindo consulta médica e enfermagem.
   As opções de horário devem corresponder à grade e ao expediente real do
   recurso: intervalos de sessenta minutos para o médico e vinte minutos para
   a enfermagem, sem fabricar disponibilidade.
3. Preferência é orientação, não reserva nem autorização clínica; a oferta
   continua sujeita ao motor existente, expediente, ocupação, percentual de
   liberação e bloqueios. Caso não haja opção preferida, informar a situação
   e permitir examinar outras vagas realmente disponíveis.
4. Cada aplicação intramuscular ou subcutânea tem duração clínica de 2,5
   minutos. A cada grupo de até seis aplicações, contam-se até quinze minutos
   de procedimento. Uma até seis aplicações ocupam um horário de vinte minutos.
   Cada horário de vinte minutos da enfermagem deve preservar cinco minutos para
   organização. Contar aplicações efetivas, não presumir que cada componente de
   uma fórmula corresponde a uma aplicação separada.
5. Ao passar de seis aplicações, um novo horário de vinte minutos da
   enfermagem deve ser reservado. O horário adicional precisa estar livre e ser
   adjacente, podendo ser anterior ou posterior, sem atravessar indisponibilidade.
   Sete aplicações exigem ao menos quarenta minutos de agenda. Se a única
   combinação disponível começar no horário anterior, comunicar e persistir o
   início efetivo do atendimento, inclusive no calendário externo. A necessidade
   adicional aplica-se à aplicação excedente ao grupo de seis.
6. Implantes hormonais e procedimentos estéticos têm trinta minutos de
   procedimento, conforme nova instrução do responsável. Ocupam dois horários
   consecutivos de vinte minutos da enfermagem e também requerem o médico.
   Verificar e reservar os dois recursos durante todo o atendimento; na
   grade médica, impedir qualquer sobreposição com os horários reservados
   de sessenta minutos, inclusive quando o atendimento atravessar um limite.
7. Aplicações intramusculares e subcutâneas comuns não reservam agenda médica
   apenas por sua via. A participação médica deve ser configurável no
   cadastro de procedimentos e de substâncias por controle sim/não.
   Valor desconhecido em cadastros existentes não pode ser tratado
   silenciosamente como autorização para dispensar o médico.
8. Manter individualmente as aplicações, doses, início e intervalos; não
   deduzir que as substâncias são clinicamente compatíveis apenas por serem
   agrupadas. A tolerância escolhida de quatro dias é limite de planejamento,
   não um intervalo clínico mínimo ou máximo.
9. Sessão, formulário de administração e agenda interna devem refletir a
   mesma informação persistida. O evento do Google deve preservar o formato
   detalhado existente e apresentar duração e reserva efetivas, com
   substâncias e situação correspondentes à sessão, sem inventar dados.
10. Preservar protocolos, sessões, eventos e cadastros históricos. Não
    alterar dados do Google nesta etapa nem recriar agendas por estética.

## Inventário verificado no código

| Ponto | Fonte examinada | Comportamento identificado |
|---|---|---|
| Agenda preferencial no cliente | `clients.ts`, `clientPreferredAgendasTable` e `PreferredAgendasField` | Seleciona recursos, não dias e horários; o próprio campo informa que não altera o motor. |
| Gravação da preferência existente | `routes/clients.ts` | Criação chama `setPreferredAgendas`; atualizações `PUT` e `PATCH` consultadas não a chamam. A tela de edição envia a preferência, mas este caminho precisa ser corrigido e testado antes de prometer persistência. |
| Preferência na solicitação de consulta | `scheduling.ts` e `agendar.tsx` | Existe escolha de dia e período em solicitações específicas; não equivale ao novo cadastro com horários por categoria. |
| Ocupação do motor | `agenda-booking.ts`, `agenda-motor.ts`, `agenda-occupancy.ts` | Há expediente, percentual de liberação, sobreposição e bloqueios vindos de sessões e compromissos. A reserva examinada recebe um recurso e grava a duração de um intervalo desse recurso. |
| Duração de substância | `schema/substances.ts`, `SubstanceEditForm.tsx`, `openapi.yaml` e banco de desenvolvimento | O campo é inteiro no modelo, no contrato e no banco: não representa 2,5 minutos. A edição não explicita passo decimal; a mudança precisa preservar duração histórica e funcionar em todos os caminhos de gravação e leitura. |
| Importação de substâncias | `scripts/import-catalogo-substances.ts` | A importação determina quinze minutos para intramuscular e subcutânea e sessenta para implantes; no conflito atualiza esses tempos. Uma correção somente na tela ou no banco seria sobrescrita por nova importação. |
| Duração de convite de calendário | `ics.ts` e seus consumidores | Soma tipos únicos; uma intramuscular mais uma subcutânea somam trinta minutos, em desacordo com a reserva conjunta solicitada. |
| Duração e descrição do Google | `routes/google-calendar.ts` e `lib/google-calendar.ts` | Há dois cálculos por tipos; a lista de procedimentos da descrição não contém a via subcutânea e o cálculo interno pode substituir a duração recebida. O implante aparece com sessenta minutos no modelo atual, diferente dos quarenta minutos de enfermagem solicitados. |
| Catálogo e termo de implante | `SubstanceEditForm.tsx`, `scripts/import-catalogo-substances.ts` e `routes/cadernos-juridicos.ts` | O formulário e o importador apresentam sessenta minutos para implante, e um termo jurídico descreve aproximadamente sessenta minutos de procedimento. A nova instrução fixa trinta minutos clínicos e dois intervalos de enfermagem; avaliar a divergência do termo sem alterar documentos jurídicos ou clínicos históricos. |
| Gravação pelo motor de agenda | `agenda-booking.ts` | Ao criar evento, usa duração do recurso e pode enviar lista vazia de substâncias; o gerador do evento recalcula a duração com os tipos ativos. O caminho examinado não comprova reserva simultânea de dois recursos. |
| Intervalos de aplicação | `protocols.ts`, `protocol-exact-schedule.ts`, `budget.ts` e `orcamentos/novo.tsx` | A validação possui modos semanal e exato distintos. No semanal, as semanas contam blocos de sete dias a partir do início do protocolo e o dia é escolhido pela maior quantidade de aplicações. O exato preserva a data de início de cada item. No orçamento existem limites mensais e alertas que estimam dias pela relação trinta dividido pelo limite. A existência desses campos não comprova que sejam limites individuais autorizados entre doses nem que protejam o agendamento. |
| Formulário de administração | `ras-fap.ts` e `protocol-ras-grid.ts` | A grade semanal antiga agrupa ocorrências de segunda a domingo e escolhe o primeiro dia previsto; a grade do modo exato lê as sessões persistidas. O agrupamento semanal do formulário não é o mesmo bloco de sete dias iniciado no protocolo e não usa necessariamente o mesmo critério de eleição. São caminhos diferentes que precisam convergir para as mesmas visitas efetivas. |
| Participação do médico | `substances.ts`, `google-calendar.ts` | O cadastro de substâncias possui tipo e duração; no caminho examinado, o destino de agenda usa uma classificação por tipo. Não foi encontrada ali uma configuração de participação médica por substância, nem uma reserva simultânea comprovada. |

O inventário acima é delimitado aos caminhos examinados; não afirma que o
repositório inteiro tenha sido auditado. Antes de alterar o cadastro de
procedimentos, identificar qual catálogo existente é a fonte correta e seus
consumidores. Não criar outro catálogo por conveniência.

Em consulta somente de leitura ao banco de desenvolvimento, havia 167
substâncias classificadas como intramusculares com duração de quinze minutos,
uma subcutânea com quinze minutos e 33 implantes com sessenta minutos.
Estas quantidades descrevem o cadastro consultado, não provam o alcance de
outras tabelas, o número de aplicações ou o estado de outro ambiente. A
alteração dos tempos existentes deve ser rastreável e preservar os valores
históricos; não alterar registros clínicos já emitidos.

## Verificações desta investigação

Em execução isolada da função atual que calcula duração para convites de
calendário, uma e seis aplicações intramusculares retornaram quinze minutos;
quatro intramusculares com duas subcutâneas retornaram trinta; sete
intramusculares retornaram quinze; implante retornou sessenta. A função calcula
duração, não a reserva de enfermagem: os resultados demonstram divergência de
cálculo, mas não comprovam por si só quantos horários ficaram ocupados.

Os dois arquivos de testes existentes de análise de tolerância e datas exatas
passaram: 24 testes. Eles não comprovam a implementação das regras novas,
reserva simultânea, persistência de preferências ou emissão real. Testes da
jornada futura e revisão independente ainda são necessários.

## Unidades sequenciais

| Unidade | Entrega | Dependência e evidência de conclusão |
|---|---|---|
| 1 | Dias e horários preferenciais, separados por tipo de atendimento | Contrato de gravação e leitura, edição persistente, uso real na busca, empresa correta, tela em computador e celular; corrigir o caminho de edição da preferência de agenda existente. |
| 2 | Participação do médico nos cadastros existentes | Identificar fonte de procedimentos, controle sim/não, persistência, permissões, dados antigos sem inferência e testes de contrato. |
| 3 | Tempo de procedimento e ocupação | Uma fonte compartilhada com precisão de 2,5 minutos, catálogo e importação coerentes, contagem efetiva de aplicações, distinção entre duração clínica e tempo reservado, cobertura de limites e combinações. |
| 4 | Reserva conjunta de recursos | Motor existente, vagas consecutivas, médico e enfermagem da mesma clínica, transação e prevenção de corrida, cancelamento e remarcação preservando a integridade. |
| 5 | Protocolo, formulário e Google | Dados reais da sessão, descrição detalhada consistente com os tempos reservados, criação e atualização compartilhadas, tratamento explícito de falha de sincronização. |
| 6 | Jornada autorizada e documentos | Somente após as dependências anteriores e confirmação de identidade, profissional, datas e destino; conferir persistência, assinatura digital e entrega efetiva, sem usar dados reais para testes agressivos. |

Uma implementação por vez; interromper para revisão independente e testes.
Não iniciar a próxima unidade sem aceite. Nenhuma unidade acima está
homologada apenas pela existência desta tabela.

### Detalhamento da primeira unidade: preferência do cliente

1. Registrar conjuntos separados para consulta médica e enfermagem. Para
   cada categoria, permitir escolher um ou mais dias e os horários
   correspondentes, sem perder a associação entre dia e horário. Dias e
   horários não escolhidos não devem ser convertidos em indisponibilidade
   absoluta.
2. A lista de horários de referência deve ser formada pelas janelas e grades
   dos recursos ativos autorizados para a empresa, não por uma lista fixa de
   relógios. Se a configuração real divergir dos sessenta ou vinte minutos
   informados pelo responsável, mostrar a divergência; não alterar expediente
   automaticamente nem fingir que a configuração já está correta.
3. Permitir registrar, consultar, editar e limpar a preferência de forma
   explícita, sem apagar ou sobrescrever os demais dados do cliente. A leitura
   após recarregar deve devolver exatamente o que foi salvo. Atualização sem
   o campo significa preservar o valor; limpeza deve ser uma escolha explícita.
4. No fluxo interno de marcação, destacar as opções preferidas dentro dos
   horários realmente abertos do motor. Não esconder uma vaga aberta apenas
   por não ser preferida; não mostrar preferência como vaga disponível.
5. A página pública de marcação não deve acessar preferências de cadastro por
   nome, documento ou dado fornecido pelo navegador. Integrar esse fluxo apenas
   onde a identidade do cliente estiver autenticada e autorizada; caso
   contrário manter a preferência solicitada na própria jornada pública.
6. Garantir isolamento entre empresas, validação no servidor, normalização de
   horários, acessibilidade, estados vazios e falhas de carregamento.
7. O atual seletor de agendas preferenciais é relacionado, mas separado dos
   novos dias e horários. Sua criação e edição precisam ter persistência
   consistente; corrigir o caminho já identificado sem apagar preferências
   existentes por falha de validação ou mudança incidental de clínica.

Este detalhamento é um alvo de implementação, não representa criação de
campos, execução de migração ou conclusão de tela.

### Subunidade: preservar as agendas preferenciais já existentes

O seletor atual de agendas é diferente dos novos dias e horários. Antes de
acrescentar estes últimos, corrigir a edição do conjunto já existente.

1. Preservar as linhas antigas por meio de estado ativo/inativo, sem apagar
   registros; escolhas retiradas pelo usuário podem ser reativadas.
2. Validar integralmente as agendas escolhidas, a empresa e o local antes
   de gravar qualquer alteração. Uma falha não pode limpar escolhas anteriores.
3. Tratar ausência do campo como preservação; lista vazia, quando enviada
   explicitamente, como remoção da seleção. Efetuar a edição do cliente e da
   preferência na mesma transação.
4. Impedir que erro ao carregar agendas, troca de local ou dados não
   disponíveis apaguem uma seleção sem uma ação explícita do usuário.
5. As escritas da preferência precisam de acesso profissional ativo e do
   mesmo contexto empresarial; nunca confiar em empresa informada pela tela.
6. Testar criação, edição, limpeza, reativação, concorrência e rejeição de
   agenda de outra empresa, sem dados de clientes reais.

### Subunidade em teste: dias e horários preferenciais

1. Guardar revisões das preferências no cadastro existente do cliente, sem
   apagar versões anteriores. Cada versão contém duas categorias independentes:
   consulta médica e enfermagem, com dias e horários associados a cada dia.
2. A lista de escolhas deve vir das janelas e grades ativas da própria empresa.
   As grades esperadas são de sessenta minutos para consultas e vinte minutos
   para enfermagem. Divergências devem ser mostradas, não corrigidas em silêncio.
3. Preferência é uma orientação recorrente, não uma vaga confirmada. Sábados
   alternados e exceções precisam ser conferidos pelo motor na data concreta.
4. Falhas na consulta de horários não podem limpar valores já salvos. Remoção
   de dia ou horário deve decorrer de ação explícita. A omissão da preferência
   em uma edição preserva o conjunto anterior.
5. Ao gravar, conferir empresa, formato e a versão originalmente carregada.
   Uma edição antiga não pode sobrescrever uma alteração mais recente.
6. Testar persistência, histórico, autenticação, empresas diferentes, dados
   inválidos, edição concorrente, indisponibilidade e interface; validar também
   a integração na marcação antes de considerar o pedido completo.

Evidências em 08/11/2026: revisão independente aprovou o cadastro e o destaque
das preferências após corrigir a geometria de horários e isolar a simulação.
Doze testes do servidor e treze testes de navegador passaram; também passaram
dois testes visuais sintéticos em computador e celular e um teste adicional de
recusa de acesso. A tabela aditiva foi criada no banco de desenvolvimento.
As preferências aparecem apenas junto às vagas abertas consultadas pelo motor.
A captura com sessão profissional real não foi possível neste ambiente;
as capturas disponíveis usam dados sintéticos. Não homologar o fluxo clínico
completo, nem a reserva simultânea de recursos, com base nesta subunidade.

### Unidade de precisão do cadastro de substâncias

1. Adicionar uma duração em segundos ao cadastro existente, sem alterar ou
   remover o campo inteiro antigo. O novo campo é a fonte preferencial;
   enquanto não preenchido, leituras usam a duração antiga convertida.
2. Gravações aceitam minutos positivos representáveis em segundos; 2,5
   minutos são armazenados como 150 segundos. Respostas ao cadastro e ao
   documento traduzem a mesma fonte de volta para minutos.
3. Na base de desenvolvimento, preencher apenas o campo novo vazio:
   intramuscular e subcutânea com 150 segundos; implantes com 1.800 segundos;
   demais tipos preservam o tempo anterior convertido. O campo antigo não é
   sobrescrito. Não alterar sessões históricas, medicamentos, doses ou eventos.
4. A importação de novas substâncias lê as durações padrão configuradas no
   cadastro de configurações existente; se o padrão necessário não existir ou
   for inválido, interromper com erro. Reimportação não sobrescreve a duração
   precisa anteriormente editada.
5. O contrato, edição, lista, exportação clínica e campos dos caminhos de
   criação e alteração devem preservar e devolver a duração precisa. Valores
   inválidos são recusados; o formulário não troca um valor vazio por trinta
   minutos sem avisar.
6. A unidade não prova reserva de recursos nem altera, isoladamente, a lógica
   de agendamento. Não prometer que os horários estão bloqueados ao concluí-la.
7. Testar com dados sintéticos isolados: conversão, criação, alteração, leitura
   após edição, reimportação, valores inválidos e compatibilidade com valor
   antigo. Conferir a base real apenas por leitura após a atualização autorizada.
8. O catálogo de substâncias é compartilhado entre empresas. Suas escritas
   exigem identidade profissional validada e proprietário da plataforma, até
   existir concessão explícita e segura para o catálogo global. As leituras
   permanecem inalteradas; a tela envia o acesso profissional também na edição
   de componentes.
9. A migração e o preenchimento executados neste trabalho atingem somente o
   banco de desenvolvimento. Outros ambientes não estão automaticamente
   certificados; publicação exige verificar coluna, padrões e preenchimento no
   destino correto, sem executar alterações em produção sem autorização.
   A migração automática de desenvolvimento é apenas estrutural: não cadastra
   padrões nem altera tempos em nenhuma base por conta própria.

### Revisão independente da unidade de precisão

Revisão inicial: BLOQUEADA. A revisão apontou ausência de migração registrada e
padrões para outros ambientes, divergência entre prévia e emissão, necessidade
de autorização nas escritas do catálogo global e risco de consumidores legados.
Correções e novas evidências devem ser avaliadas antes de qualquer homologação.

### Situação verificada das duas primeiras subunidades

1. A duração precisa das substâncias foi revisada independentemente e aprovada
   somente para desenvolvimento; isso não comprova a reserva de horários.
2. A preservação e a edição das agendas preferenciais existentes receberam
   revisão independente aprovada após correções de isolamento, autenticação,
   concorrência e preservação dos vínculos. O banco de desenvolvimento recebeu
   a coluna aditiva; outros ambientes ainda precisam de aplicação verificada.
3. Os testes de integração usam um banco descartável. A interface foi testada
   com requisições interceptadas, sem clientes ou serviços externos reais.
4. A lista de clientes e suas alterações agora exigem acesso profissional
   autenticado. Clientes externos que consultavam ou alteravam esses dados sem
   acesso autorizado precisarão se adequar.
5. Permanecem pendentes: preferências de dias e horários; duração e participação
   médica nos procedimentos; consolidação clínica; reserva simultânea de todos
   os recursos; sincronização e descrição do Google; execução real solicitada,
   emissão, assinatura digital e entrega. Nenhum desses itens está homologado.

### Próxima subunidade: expediente quinzenal

1. O cadastro de janelas deve permitir repetição semanal ou a cada duas
   semanas, com uma data inicial informada para a repetição quinzenal.
2. Datas anteriores à data inicial não são abertas por essa janela.
3. Janelas existentes permanecem semanais até serem expressamente alteradas.
4. A atualização deve preservar o histórico das janelas, sem apagar registros.
5. Leituras, cálculo de disponibilidade e fluxo concierge devem interpretar a
   repetição da mesma forma; exceções e ocupações continuam prevalecendo.
6. Uma tela antiga não pode substituir silenciosamente janelas quinzenais por
   janelas semanais; alterações de expediente continuam sujeitas à governança
   do responsável técnico ou administrador autorizado.
7. Testar sábado de referência, sábado fechado seguinte, sábado aberto
   subsequente, datas anteriores, mudança de ano, permissões e compatibilidade.
8. Não aplicar o expediente da clínica nem prometer horário real antes da
   revisão independente e da confirmação da disponibilidade e das integrações.

Resultado: APROVADA por revisão independente para o desenvolvimento. A
migração estrutural foi aplicada nesse ambiente. Os testes em banco descartável
e com o motor real verificaram os sábados de 21/11 e 05/12/2026, a folga de
28/11, bloqueio por exceção, ocupação e oferta concierge. Outros testes
verificaram isolamento de empresa, acesso, concorrência e preservação de
janelas antigas; testes de interface usaram serviços interceptados. Isso não
configura o expediente da clínica, nem comprova sincronização Google,
agendamentos clínicos ou implantação em outro ambiente.

### Subunidade cadastral: participação médica em substâncias

O catálogo de substâncias existente possui classificação por procedimento.
Foi encontrado também um catálogo separado de implantes; sua relação com o
cadastro e com a marcação ainda precisa ser investigada. A tela de substâncias
permite sim, não e não definido, sem converter silenciosamente os registros
existentes para não. A migração acrescenta uma coluna anulável e foi aplicada
somente ao desenvolvimento. A revisão independente aprovou esta subunidade
cadastral. Foram testados sessão profissional assinada, autorização e
persistência em banco descartável, preservação de valores omitidos e mensagens
da tela quando o cadastro é salvo, mas sua composição não é confirmada.
Os testes de tela interceptam os serviços e não provam uso clínico real.

Antes de conectar a participação à reserva é necessário identificar também
a fonte de procedimentos estéticos e implantes e provar o bloqueio simultâneo
das duas agendas. O campo isolado não autoriza a marcação nem completa a
solicitação referente ao cadastro separado de procedimentos.

Revisão posterior: BLOQUEADA. A migração automática continha atualização de
dados e foi separada: agora apenas acrescenta a coluna. Também faltam provas
com a cadeia real de autenticação em ambiente sintético, banco isolado para
reimportação e comparação entre prévia e emissão. Após a revisão, foram
acrescentados testes com sessão assinada e os controladores reais de acesso;
uma instância de banco descartável e sem acesso de rede para a reimportação;
e comparação da prévia com a emissão em chamadas sem entrega externa. Também
foi gerado um documento sintético e verificado o texto da duração nele.
Essas provas não incluem emissão assinada nem funcionamento da tela com uma
sessão real. A agenda ainda não usa a duração precisa para reservar recursos.

Revisão final desta unidade: APROVADA para o cadastro no ambiente de
desenvolvimento, sem homologar agendamentos, operação clínica, outros ambientes
ou entrega externa. A evidência inclui autenticação, migração em banco
descartável, reimportação, conteúdo do documento e comparação entre os dados
de prévia e emissão. A verificação autenticada da tela ainda não foi realizada.

Ambiente: o desenvolvimento já tem as configurações e os tempos atualizados.
Em outro ambiente, a coluna estrutural não preenche configurações nem tempos;
é necessário identificar o banco, aprovar e conferir a etapa de dados antes de
considerar esse ambiente pronto. A migração estrutural sozinha não é suficiente.

## Falhas e testes obrigatórios

| Falha | Gravidade | Barreira ou verificação |
|---|---|---|
| Preferência apresentada como vaga livre | Alta | Buscar disponibilidade real e distinguir preferência de reserva. |
| Edição não persiste após recarregar | Alta | Testar gravação, retorno e nova leitura nas telas de criação e edição. |
| Uma, seis e sete aplicações | Alta | Verificar respectivamente vinte, vinte e quarenta minutos reservados. Seis mistas têm quinze minutos clínicos; sete requerem dois horários de enfermagem adjacentes e livres. Verificar dois minutos e meio por aplicação e cinco minutos de organização por horário. |
| Perda da fração de minuto | Alta | Gravar e reler 2,5 sem arredondamento; verificar cadastro, contratos, banco, importação e consumidores de documentos e agenda. |
| Reimportação sobrescreve tempos ajustados | Alta | Testar reimportação de cadastro existente e evitar regressão para quinze ou sessenta minutos antigos; preservar alterações legítimas e histórico. |
| Horário adjacente antes ou depois | Alta | Procurar horário realmente livre e contíguo, sem ultrapassar expediente, almoço, bloqueio ou disponibilidade; não confirmar parcialmente. |
| Horário anterior muda início real | Alta | A agenda interna e o evento externo devem mostrar o horário efetivamente reservado; não reservar antes em segredo e comunicar outro início. |
| Dezesseis horas de expediente ou almoço ultrapassados | Alta | Validar toda a duração da reserva contra cada janela efetiva e exceção. |
| Segunda vaga ocupada ou não liberada | Alta | Não confirmar só porque o primeiro horário está livre. |
| Médico ocupado ou de outra empresa | Crítica | Resolver profissional correto, validar todos os intervalos e recusar sem gravar qualquer metade. |
| Duração de implante diverge entre termo e agendas | Alta | Distinguir duração do procedimento, presença de cada profissional e tempo reservado; esclarecer a divergência antes de prometer equivalência ou alterar o termo. |
| Duas pessoas reservam o mesmo horário | Crítica | Concorrência com banco isolado, trava compartilhada e nenhuma reserva parcial. |
| Cancelamento ou remarcação deixa bloqueio órfão | Alta | Validar as duas agendas e preservar o histórico em transação. |
| Campo médico não preenchido no legado | Crítica | Estado desconhecido explícito; não presumir que o médico é dispensável. |
| Evento no Google com tempo ou itens divergentes | Alta | Testes de criação e atualização com os mesmos dados e duração; falha externa não vira sucesso falso. |
| Aplicações próximas demais após ajuste | Crítica | Validar limites clínicos autorizados entre doses, inclusive histórico real e tolerância máxima de quatro dias. |
| Frequência menor que sete dias | Alta | Não fundir aplicações prescritas em dias diferentes em uma visita apenas por ocorrerem na mesma semana. |
| Clínica, profissional ou cliente incorreto | Crítica | Autorização e isolamento no servidor, com testes para cada identidade incorreta. |
| Falha de rede, banco ou sessão expirada | Alta | Sem perda de dados, sem confirmação parcial enganosa e com recuperação explícita. |

## Definição de pronto

Cada unidade precisa de requisitos e dependências satisfeitos, revisão
independente sequencial, testes determinísticos e semânticos proporcionais ao
risco, evidência de persistência, execução, registros e captura para telas.
Testes de regressão, concorrência e segurança usam dados sintéticos isolados.
Somente operação real expressamente autorizada e supervisionada pode provar
entrega externa real. Compilação, simulação ou documentação isoladas não
significam homologação.

## Restrições

Não alterar o motor de cálculo de orçamento nem o desmembramento; não apagar
registros existentes; não forjar autenticação, assinatura ou resultado
externo; não substituir a tela de marcação já existente por outra ferramenta.
