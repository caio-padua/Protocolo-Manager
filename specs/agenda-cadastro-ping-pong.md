# Cadastro do profissional x Agenda Configuração (via de mão dupla)

Data: 12/11/2026. Estado: implementado no desenvolvimento, nada publicado, nada enviado ao Git.

## 1. Pedido do CEO

1.1. Aba VÍNCULOS do profissional não listava a agenda Home Care; a Fábia (profissional 26) não podia ser ligada a "AGENDA ENFERMAGEM - HOME CARE".
1.2. Tipos de atendimento mostravam só Presencial e Online; todo profissional precisa dos três: Presencial, Home Care e Online.
1.3. Mudou a configuração, a mudança vale em todas as telas.
1.4. Agenda Configuração tem de puxar o profissional ligado no cadastro.

## 2. Causa verificada

2.1. `GET /api/agenda/integration` respondia 500: a validação de resposta rejeitava `locationId` nulo (agendas 27, 28 e 29 não têm local).
2.2. Sem essa resposta, a tela dizia "não identificada" e "Você não administra a sede ou a clínica desta agenda" para todos.
2.3. O cadastro só listava agendas por local; agenda sem local nunca aparecia.

## 3. Decisões

| Tema | Decisão | Motivo |
| --- | --- | --- |
| Vínculo de agenda sem local | `agenda_profissionais_preferidos` | efeito real no Pit Stop, sem local falso e sem acesso clínico |
| Vínculo de agenda com local | `location_professionals`, pelo cadastro do local | não ampliar acesso entre empresas |
| Agenda individual | somente leitura no cadastro | titular se define em Agenda Configuração |
| Compatibilidade | área do profissional = categoria da agenda, ativo, corpo clínico | regra existente do Pit Stop |
| Tipos de atendimento | 3 interruptores; valor antigo traduzido na leitura | Regra de Ouro: sem migração destrutiva |
| Propagação | lista única de prefixos + refazer consulta ao voltar à janela | sem cache de agenda no servidor |

## 4. Rotas novas

4.1. `GET /api/agenda/resources/:id/profissionais-vinculados`.
4.2. `GET /api/professionals/:id/agendas`.
4.3. `PUT /api/professionals/:id/agendas/:agendaId/preferencia` com `{ "vinculado": true|false }`. Erros: 400 corpo inválido, 401 sem sessão, 409 `agenda_individual` ou `agenda_com_local`.

## 5. Provas

5.1. Banco isolado: `artifacts/api-server/src/tests/agenda-vinculos-postgres.test.ts` (14), `agenda-integration-contrato.test.ts`.
5.2. Unitários: `artifacts/padcom/src/lib/agenda-propagacao.test.ts`, `tipos-atendimento.test.ts`.
5.3. Interface: `e2e/agenda-vinculos-cadastro.spec.ts` (8 cenários, rotas simuladas, dados sintéticos; capturas em `generated-artifacts/`).
5.4. Servidor real (curl, 12/11/2026): 200, ligar e desligar nos dois lados, 409 e 401 conferidos; estado final restaurado (único vínculo: agenda 27 e Fábia).

## 6. Pendências

6.1. CEO define as janelas de horário das agendas 27 a 29 em Agenda Configuração.
6.2. `seed-team.ts` ainda grava valores antigos de tipo de atendimento; a leitura os traduz.
6.3. `e2e/home-care-documentos-reconciliacao.spec.ts` (2 cenários do Pit Stop) está desatualizado: o painel de cada ocorrência agora nasce fechado. Não relacionado a esta entrega.
