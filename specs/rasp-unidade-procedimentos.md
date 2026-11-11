# Spec — RASP com unidade correta, procedimentos gerados das substâncias e lançador por procedimento

Data: 11/11/2026. Origem: erro "A unidade salva no protocolo não corresponde à clínica vinculada ao cliente." ao reenviar o RASP FAP do protocolo 74 (cliente 4040).

## 1. Causa raiz (verificada no banco de desenvolvimento)

1. `protocols.unit` e `sessions.unit` guardam o nome da AGENDA/LOCAL onde a visita acontece (ex.: "AGENDA ENFERMAGEM - LOCAL").
2. `clinical-emitter.resolveClinicalMember` devolve `clinic.name = locations.name` do local de agenda do cliente (todos os 3.684 clientes têm `location_id=30`, "AGENDA GERAL").
3. As rotas de RASP, PDF do protocolo e Carta comparam os dois textos. Conceitos diferentes (agenda x clínica) nunca coincidem, então a emissão é recusada para todo protocolo criado pelo lançador atual.
4. A clínica real do cliente é a empresa (`empresas.nome` = "Instituto Padua", id 5, `clients.clinica_origem_empresa_id`).

## 2. Requisitos

R1. A identidade da clínica nos documentos do protocolo (RASP, PDF do protocolo, Carta, RAS gravado) vem de `empresas.nome` da empresa do cliente, nunca do nome de uma agenda.
R2. `protocols.unit` / `sessions.unit` continuam sendo o local operacional. Passam a ser validados contra a clínica: aceitos se vazios, iguais ao nome da clínica ou ao nome de um local cadastrado da MESMA empresa. Nome de local de outra empresa continua recusado (isolamento).
R3. Dados existentes: protocolos/sessões com unidade de outra empresa (legado) e `empresa_id` nulo são religados à clínica Instituto Padua (empresa 5), guardando o valor anterior em tabela de auditoria. Nada é apagado, `locations` não é tocada.
R4. Gerar um procedimento para cada substância (217): nome = nome limpo + dose (ex.: "COENZIMA Q10 100MG", "GESTRINONA 50MG"); aplicação = Enfermagem; implante = Medicina + Enfermagem; local da equipe = local da agenda padrão da clínica (tabela `client_clinic_agenda_defaults`). Idempotente, sem apagar. Dose do procedimento só quando a regra segura aceita; nenhuma dose inventada.
R5. O seletor do lançador de protocolo ("Novo protocolo") lista PROCEDIMENTOS, não substâncias. Cada procedimento aponta para sua substância (cadastro interno), mantendo preço, estoque, RASP e agenda.
R6. A agenda de cada sessão segue a substância do procedimento: só enfermagem -> agenda de enfermagem local; implante -> médico + enfermagem (motor existente por `doctor_participation`).

## 3. Falhas previstas

| Falha | Tratamento |
|---|---|
| Empresa sem nome | 409 explícito, sem cair em nome de agenda |
| Homônimos (PROGESTERONA 50 MG injetável x implante) | sufixo de via só quando colidir |
| BLEND sem nome distinto | nome com a composição cadastrada |
| Reexecução da geração | pula substância já ligada a procedimento da empresa |
| Teste com banco simulado sem tabela empresas | fixture com a empresa |

## 4. PRONTO quando

- RASP do protocolo 74 passa da checagem de unidade (prova: chamada real autenticada, sem envio).
- 217 substâncias com procedimento ativo e equipe; implantes com 2 equipes.
- Lançador lista procedimentos (captura de tela do componente ou teste).
- Testes do api-server verdes nas áreas afetadas; revisão independente.
