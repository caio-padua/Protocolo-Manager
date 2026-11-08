# Preferências do cliente e reserva de recursos por procedimento

## Estado

EM ESPECIFICAÇÃO. A quantidade de horários para uma única aplicação está
BLOQUEADA para esclarecimento: a instrução anterior indicava um horário de
vinte minutos, e a instrução posterior pode exigir outro horário adjacente
mesmo para uma única aplicação. Não implementar essa decisão por suposição.
Este documento não demonstra alteração no funcionamento, revisão independente
ou homologação. Nenhum agendamento, documento ou evento externo foi criado
por esta investigação.

## Objetivo

Utilizar o motor de agenda existente para considerar preferências dos clientes,
calcular o tempo ocupado pelos procedimentos e reservar todos os profissionais
necessários, sem produzir agendas ou descrições divergentes.

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
   de procedimento. Cada horário de vinte minutos da enfermagem deve preservar
   cinco minutos para organização. Contar aplicações efetivas, não presumir que
   cada componente de uma fórmula corresponde a uma aplicação separada.
5. Ao passar de seis aplicações, um novo horário de vinte minutos da
   enfermagem deve ser reservado. O horário adicional precisa estar livre e ser
   adjacente, podendo ser anterior ou posterior, sem atravessar indisponibilidade.
   Sete aplicações exigem ao menos quarenta minutos de agenda. Se a única
   combinação disponível começar no horário anterior, comunicar e persistir o
   início efetivo do atendimento, inclusive no calendário externo. O responsável
   também mencionou um horário adicional para uma única aplicação; confirmar
   se se referia à sétima aplicação ou a uma aplicação isolada. Não afirmar
   que a regra de vinte minutos para uma aplicação isolada está resolvida.
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
| 3 | Tempo de procedimento e ocupação | Uma fonte compartilhada com precisão de 2,5 minutos, catálogo e importação coerentes, contagem efetiva de aplicações, distinção entre duração clínica e tempo reservado, cobertura de limites e combinações. A reserva para aplicação isolada depende da resposta pendente. |
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

## Falhas e testes obrigatórios

| Falha | Gravidade | Barreira ou verificação |
|---|---|---|
| Preferência apresentada como vaga livre | Alta | Buscar disponibilidade real e distinguir preferência de reserva. |
| Edição não persiste após recarregar | Alta | Testar gravação, retorno e nova leitura nas telas de criação e edição. |
| Uma, seis e sete aplicações | Alta | Confirmar a quantidade de horários para uma aplicação isolada. Seis mistas têm quinze minutos clínicos; sete requerem pelo menos dois horários de enfermagem adjacentes e livres. Verificar dois minutos e meio por aplicação e cinco minutos de organização por horário. |
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
