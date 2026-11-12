# Referência permanente — Empresa, Local, Profissional, Agenda e Pit Stop

Criado em 12/11/2026 por ordem do Dr. Caio (CEO). Fonte única para qualquer pessoa ou agente que mexer em agenda, equipe de procedimento, local ou Pit Stop. Ler ANTES de alterar o assunto.
Rótulos: FATO CONFIRMADO (verificado no código ou no teste), REGRA APROVADA (decisão escrita do CEO), REGRA NÃO DECIDIDA (aguarda o CEO).

## 1. Glossário

| Termo | Significa | Onde mora |
|---|---|---|
| Empresa | Clínica ou razão social que contrata (tenant). Todo dado clínico é isolado por ela. | tabela `empresas` |
| Local (endereço) | Lugar físico da empresa ou local externo cadastrado. | `locations` (legado, mistura espaço físico e agenda Google) e `locais externos` |
| Profissional | Pessoa do corpo clínico, com categoria (Medicina, Enfermagem, Biomedicina etc.). | `professionals`, `professional_areas` |
| Agenda | Calendário de atendimento com janelas, categoria gravada, modalidade (Sede, Online, Outro local) e calendário Google. | `agenda_resources` |
| Procedimento | Ato do catálogo da clínica, com duração e equipe padrão. | `procedimentos_clinicos` |
| Equipe padrão | Até 3 necessidades (individual ou conjunta) por procedimento. | `procedimento_equipes` (+ coluna `origem`) |
| Plano de agendamento | Proposta compartilhada de datas, equipe e agendas, sem reserva. | `agendamento_planos`, `agendamento_plano_ocorrencias` |
| Pit Stop | Fila e tela onde recepção, enfermagem e médico veem e confirmam o MESMO plano. | rota `/pit-stop` |

## 2. Mapa de vínculos (quem aponta para quem)

1. Empresa 1 — N Agendas (por `empresa_id` direto ou pelo local da agenda).
2. Agenda N — 1 Categoria profissional (`category_id` gravado) e 0 ou 1 Profissional (`professional_id`; vazio = agenda compartilhada da categoria).
3. Agenda 0..1 — 1 registro de `locations` (necessário para enviar ao Google; agenda online sem registro falha com código explícito, não em silêncio).
4. Procedimento 1 — N Necessidades (`procedimento_equipes`), cada uma com categoria e, no protocolo, modalidade e agenda.
5. Protocolo 1 — 0..1 Plano vivo (índice único parcial). Plano 1 — N Ocorrências propostas. Confirmação gera Sessões (uma por agenda da equipe) no mesmo Caminho B.
6. Sessão não tem coluna de local; `unit` guarda o nome da agenda.

## 3. Momento da escolha

| Quando | Quem | O que escolhe |
|---|---|---|
| Cadastro do procedimento | Gestão | Equipe padrão (categorias) |
| Lançamento do protocolo | Médico (prescritor) | Procedimentos reais; equipe padrão herdada, editável (até 3) |
| Tela do plano (logo após lançar ou na fila) | Médico, recepção ou enfermagem | Modalidade, agenda, profissional, datas e horários |
| Confirmação explícita | Quem assumiu a revisão | Reserva interna e envio ao Google |

## 4. Nomes: tela x tabela x campo

| Na tela | Tabela | Campo |
|---|---|---|
| Sede / Online / Outro local | `protocolo_procedimento_equipe` | `modalidade` = local / online / externo |
| Agenda (sugerida ou escolhida) | `protocolo_procedimento_equipe` | `agenda_id`, `agenda_origem` |
| Equipe herdada de | `procedimento_equipes` | `origem` (NULL = não registrada; nada é presumido) |
| Pendente / Em revisão / Confirmado / Cancelado | `agendamento_planos` | `estado` |
| Google: não enviado / sincronizado / parcial / erro | `agendamento_planos` | `sync_estado`, `sync_detalhe` |
| Data e hora propostas | `agendamento_plano_ocorrencias` | `data`, `hora`, `origem`, `motivo` |

## 5. Regras aprovadas (FATO CONFIRMADO por teste em banco isolado)

1. Empresa, local, profissional e agenda são entidades diferentes; nenhuma é inferida da outra.
2. Nunca usar `sort_order` ou ordem de exibição como critério silencioso. Mais de uma agenda elegível sem padrão inequívoco = "escolha pendente" (HTTP 409 `escolha_agenda_pendente`), inclusive para procedimento sem substância.
3. Sugestão só quando há uma única candidata ou o padrão da clínica (`client_clinic_agenda_defaults`); fica marcada como "sugerida" e é editável.
4. Nunca sugerir agenda de outra empresa ou de outra modalidade.
5. Prescritor não é executor automático.
6. Confirmar é tudo-ou-nada, com revalidação, trava de linha e versão vista; duas pessoas não confirmam o mesmo plano (um revisor por vez, concessão de 15 minutos reassumível).
7. Plano e Caminho A (agendar por períodos) são mutuamente exclusivos por protocolo (`plano_pit_stop_ativo`): uma reserva só.
8. Google Agenda (não Drive): um evento por visita com identificador reservado; reprocessar nunca duplica; `sincronizado` só se TODAS as visitas foram confirmadas pelo Google. Falha deixa a reserva interna valendo e mostra erro e botão de reenvio.
9. Agenda online não exige endereço físico; sede e externo seguem as regras existentes.
10. A mesma profissional em duas agendas não atende dois clientes no mesmo horário.

## 6. Dúvidas abertas (REGRA NÃO DECIDIDA)

1. A substância só tem "participação médica" (`doctor_participation`); não existe campo próprio de "profissionais necessários" por substância.
2. Padrão de agenda por cliente x por clínica: hoje só existe o padrão por clínica.
3. Horário preferido do cliente não é modelado.
4. Quem confirma precisa ser vinculado ao local da agenda para o envio ao Google (`location_professionals`); recepção sem vínculo recebe erro explícito de envio.
5. A tela de lançamento `pages/protocols/new.tsx` ainda segue só o Caminho A; o Caminho B está no lançador do Cockpit.

## 7. Proibições

1. Exigir local físico para TODA agenda: NÃO aprovado.
2. Misturar `locations` legados com endereços, fundir ou apagar registros (Regra de Ouro).
3. Usar ordem de exibição como desempate; indicar "sincronizado" com falha externa; criar eventos ou mensagens reais em teste.
4. Publicar em produção sem ordem escrita; as migrações 20261116 a 20261121 só existem no desenvolvimento.

## 8. Provas

Testes (banco isolado, dados sintéticos): `artifacts/api-server/src/tests/pit-stop-postgres.test.ts` e `protocolo-procedimentos-equipe-postgres.test.ts`.
