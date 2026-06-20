# Spec — Motor de Agenda (F2.1 + F2.2)

Status: em construcao | Autor: Dr. Replit Paxter | Data: 20/06/2026 | Metodo: Paxter Loop

## Objetivo (uma frase)

Construir a fundacao da agenda do Padcon Conect: o cadastro editavel de recursos agendaveis, suas janelas de horario (com almoco e feriados) e um motor de liberacao progressiva de horarios (anti-ilha) que so abre blocos novos conforme os anteriores enchem.

## Escopo

DENTRO (esta spec):
- F2.1 — Recursos agendaveis, janelas semanais, almoco, duracao do slot, feriados/excecoes; tela 3D editavel.
- F2.2 — Motor anti-ilha: dado um recurso + data, calcular quais horarios estao ABERTOS, BLOQUEADOS ou OCUPADOS, abrindo blocos em cadeia conforme a ocupacao.

FORA (proximas specs):
- F2.3 — Tela de marcacao real do cliente em um horario (apenas a base de dados e o calculo de slots ficam prontos aqui; marcar de fato vem depois).
- F3 — Login/governanca da secretaria.
- F4 — Autoagendamento do paciente + termo juridico.

## Vocabulario

| Termo | Significado |
|---|---|
| Recurso agendavel | Quem atende, em qual modalidade: enfermeira domiciliar, enfermeira local, medico local, medico online |
| Janela | Bloco continuo de funcionamento de um recurso num dia (ex.: 08:00-12:00) |
| Almoco | Ausencia de janela entre a janela da manha e a da tarde (modelado como duas janelas no mesmo dia) |
| Slot | Horario candidato a marcacao, gerado pela duracao base dentro de uma janela (ex.: 08:00, 08:30, 09:00...) |
| Sub-bloco | Fatia de uma janela usada pelo motor anti-ilha para liberar horarios em cadeia |
| Excecao | Feriado ou bloqueio pontual de uma data (global ou de um recurso) |

## Modelo de dados (tabelas novas em lib/db/src/schema/agenda-motor.ts)

1. `agenda_resources` — recurso agendavel
   - id serial pk
   - name text notNull (ex.: "Enfermeira Domiciliar")
   - kind text notNull (enum logico: "enfermagem" | "medico")
   - modality text notNull (enum logico: "domiciliar" | "local" | "online")
   - color text notNull default "#3D7A7A"
   - slotMinutes integer notNull default 30 (duracao base do slot)
   - professionalId integer (opcional, vinculo informativo a professionals.id)
   - locationId integer (opcional, vinculo informativo a locations.id)
   - active boolean notNull default true
   - sortOrder integer notNull default 0
   - createdAt timestamptz notNull defaultNow

2. `agenda_windows` — janela semanal de um recurso
   - id serial pk
   - resourceId integer notNull (-> agenda_resources.id)
   - weekday integer notNull (0=domingo ... 6=sabado)
   - startTime text notNull ("HH:mm")
   - endTime text notNull ("HH:mm")
   - createdAt timestamptz notNull defaultNow
   - Observacao: o almoco e a LACUNA entre duas janelas do mesmo weekday (ex.: 08:00-12:00 e 14:00-20:00).

3. `agenda_exceptions` — feriado/bloqueio
   - id serial pk
   - resourceId integer (NULL = vale para todos os recursos)
   - date text notNull ("YYYY-MM-DD")
   - kind text notNull ("feriado" | "bloqueio")
   - description text
   - createdAt timestamptz notNull defaultNow

4. `agenda_settings` — parametros do motor anti-ilha (linha unica, singleton)
   - id serial pk
   - blockMinutes integer notNull default 120 (tamanho do sub-bloco do motor)
   - triggerPercent integer notNull default 60 (percentual de ocupacao do sub-bloco que libera o proximo)
   - minLeadHours integer notNull default 24 (antecedencia minima ja decidida pelo CEO; usada na geracao de slots)
   - updatedAt timestamptz notNull defaultNow

Exportar tudo em lib/db/src/schema/index.ts. Cada tabela com createInsertSchema (drizzle-zod) + tipos inferidos, no padrao dos arquivos vizinhos.

## Motor anti-ilha (regra precisa — F2.2)

Entrada: resourceId, date (YYYY-MM-DD), e o estado atual de ocupacao (sessoes ja marcadas naquele recurso+data).
Saida: lista ordenada de slots, cada um com state = "aberto" | "bloqueado" | "ocupado".

Algoritmo (determinista):
1. Buscar o recurso e suas janelas do weekday da data. Se houver excecao (feriado/bloqueio) para a data (global ou do recurso), retornar lista vazia com motivo "excecao".
2. Concatenar as janelas do dia em ordem cronologica e fatiar em SUB-BLOCOS de `blockMinutes` (ex.: 120 min). O almoco (lacuna entre janelas) nunca vira slot.
3. Dentro de cada sub-bloco, gerar os slots de `slotMinutes` em `slotMinutes`.
4. Marcar como "ocupado" todo slot que ja tem sessao marcada (mesmo recurso+data+hora).
5. Liberacao em cadeia (anti-ilha):
   - O 1o sub-bloco do dia esta SEMPRE aberto.
   - Um sub-bloco N>1 so abre quando o sub-bloco N-1 atingiu `triggerPercent`% de ocupacao (ocupados / total de slots do sub-bloco N-1 >= gatilho).
   - Sub-bloco ainda nao liberado: todos os seus slots ficam "bloqueado".
6. Antecedencia: slots cujo horario seja antes de agora + `minLeadHours` ficam "bloqueado" (motivo "antecedencia"), independentemente da cadeia.
7. Slots ocupados contam para o gatilho mesmo estando no passado.

Exemplo (blockMinutes 120, triggerPercent 60, slotMinutes 30, janela 08:00-12:00 e 14:00-20:00):
- Sub-blocos: 08-10, 10-12, 14-16, 16-18, 18-20 (5 sub-blocos; cada um com 4 slots).
- Inicio do dia: so 08-10 aberto; o resto bloqueado.
- Ao ocupar 3 dos 4 slots de 08-10 (75% >= 60%), abre 10-12. E assim por diante.
- Efeito: a clinica enche da manha para a tarde, sem ilhas (nao abre 18-20 com a manha vazia).

## Requisitos exatos

1. Criar as 4 tabelas acima e empurrar para o banco (push), idempotente (rodar de novo nao quebra).
2. API REST sob /api, declarada no contrato OpenAPI (lib/api-spec) + hooks gerados via Orval:
   2.1 CRUD de recursos: listar, criar, atualizar, desativar (soft via active=false).
   2.2 CRUD de janelas por recurso: listar, substituir o conjunto de janelas de um recurso (salvar a grade semanal inteira de uma vez).
   2.3 CRUD de excecoes: listar, criar, excluir.
   2.4 Ler/atualizar settings (singleton): GET e PUT.
   2.5 Motor: GET /api/agenda/slots?resourceId=&date= retornando os slots com state e motivo.
3. Validacao de entrada/saida por zod (zod/v4) conforme contrato; PUT/PATCH so persiste campos do contrato (Art. 48 do Codigo Paxter).
4. Tela nova "Motor de Agenda" no app padcom, com item no sidebar, em design 3D Paxter (skill-layout-paxter), clonando o vocabulario do Console de Orcamento:
   4.1 Sub-painel RECURSOS: lista/edicao dos recursos (nome, tipo, modalidade, cor, duracao do slot, ativo). Pre-carregar os 4 recursos do CEO se a tabela estiver vazia (seed).
   4.2 Sub-painel JANELAS: por recurso selecionado, grade semanal (7 dias) com janela da manha e da tarde editaveis (almoco = lacuna). Salvar a grade inteira.
   4.3 Sub-painel EXCECOES/FERIADOS: adicionar/remover datas (feriado/bloqueio), global ou por recurso.
   4.4 Sub-painel PARAMETROS DO MOTOR: editar blockMinutes, triggerPercent, minLeadHours em controles 3D (ToggleWell/insert concavo/stepper).
   4.5 Visualizacao PROVA VIVA: escolher recurso + data e ver a regua de slots pintada por estado (aberto = saliente claro; bloqueado = esmaecido; ocupado = preenchido primary), demonstrando o anti-ilha. So apresentacao; usa o endpoint do motor.
5. Toda a comunicacao final ao CEO em Densidade B.

## Casos extremos a tratar

| Caso | Tratamento |
|---|---|
| Recurso sem janela no weekday | Slots vazios, mensagem "sem expediente neste dia" |
| Data e feriado/bloqueio | Slots vazios, motivo "excecao" |
| Janela com fim <= inicio | Rejeitar no salvar (validacao) |
| Janelas sobrepostas no mesmo dia | Rejeitar no salvar (validacao) |
| slotMinutes nao divide a janela exatamente | Gera os slots cabiveis; sobra menor que um slot e ignorada |
| triggerPercent 0 | Todos os sub-blocos abertos (motor desligado de fato) — permitido |
| Horario no passado / dentro da antecedencia | "bloqueado" com motivo "antecedencia" |
| Tabela settings vazia | Criar a linha singleton com defaults no primeiro acesso |

## Definicao de PRONTO

| Criterio | Como conferir |
|---|---|
| 4 tabelas criadas e no banco | push roda; SELECT nas tabelas funciona |
| Endpoints respondem (curl via localhost:80/api) | GET recursos/janelas/excecoes/settings/slots retornam JSON valido |
| Motor anti-ilha correto | curl no exemplo da spec devolve os estados esperados (so 1o sub-bloco aberto; abre o proximo ao bater o gatilho) |
| Tela carrega e edita | screenshot desktop + mobile; criar recurso, editar janela, adicionar feriado, mudar parametro e ver a regua mudar |
| Design 3D fiel | paineis/sub-paineis 3D, cantos quadrados, cores da marca; sem estilo inventado |
| Revisao architect | requisito por requisito, zero pendencia |

## Linhas vermelhas

- Nao tocar /api/budgets/calculate nem o motor de desmembramento (Art. 39).
- Nao truncar a tabela clients nem nenhuma tabela populada.
- Nao mudar motor de calculo/payload existente por estetica.
- Nao remover o relevo 3D dos paineis (essencia do design).
- Esta entrega NAO cria login/auth (isso e F3); a tela fica sob o admin atual.

## Decisoes que tomei (defaults, por "maximo de trabalho ja")

| Decisao | Valor adotado | Reversivel? |
|---|---|---|
| Recurso e entidade propria (nao reusa professionals) | tabela agenda_resources com vinculo opcional | sim |
| Almoco modelado como lacuna entre janelas | sem campo proprio de almoco | sim |
| Sub-bloco padrao | 120 min | sim (editavel) |
| Gatilho de liberacao padrao | 60% | sim (editavel) |
| Antecedencia minima | 24 h (decisao previa do CEO) | sim (editavel) |
| 4 recursos seed | Enf. Domiciliar, Enf. Local, Medico Local, Medico Online | sim |
| Rota da tela | /agenda/motor, item no sidebar "Motor de Agenda" | sim |
