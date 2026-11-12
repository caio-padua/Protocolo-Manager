---
name: Pit Stop — plano de agendamento compartilhado
description: Decisões e armadilhas do Pit Stop (Caminho B de agendamento) e onde está a referência permanente
---
Referência permanente: `docs/REFERENCIA-AGENDA-PROFISSIONAL-LOCAL.md` (glossário, vínculos, regras, dúvidas, proibições).
**Why:** o CEO exigiu que empresa/local/profissional/agenda nunca sejam inferidos uns dos outros e que ordem de exibição jamais desempate agendas.
**How to apply:** ambiguidade de agenda = "escolha pendente"; plano e Caminho A são exclusivos por protocolo; "sincronizado" só com TODAS as visitas confirmadas no Google.
- Testes antigos que fixavam o desempate por sort_order foram reescritos de propósito; não restaurar.
- Suíte `protocol-google-sync-postgres` falhava por banco montado à mão sem `empresas` nem `clinica_origem_empresa_id`; corrigido no fixture (23/23).
- `LancadorInline` usava `getCollabToken` sem importar (quebrava o lançador); corrigido.
- Teste de banco isolado do Pit Stop precisa de tabela `substance_applications` e colunas completas de `location_professionals` (consultas drizzle selecionam tudo).
- Home Care = 4ª forma (`home_care`), sem local fixo, endereço por visita; nível exigido (técnica ≠ enfermeira) e situação do registro vivem em colunas fora do Drizzle (migração SQL). **Why:** CEO 22/11/2026. **How to apply:** nunca presumir habilitação/ativa de profissional cadastrado por documento; dado lido de documento é sugestão até aceite humano.
- Documentos de profissional e conferência Google por id do calendário: ver seção 6A da referência permanente; recepção e Documentos nascem DESLIGADOS na Governança.

## Regras de distribuição e Home Care (atualizado)
- Distribuição automática usa janela nominal ±4 dias e intervalo mínimo (freq−4; freq 1–4 = a própria freq); preferência do paciente ORDENA, nunca exclui; módulos puros `pit-stop-regras.ts` e `pit-stop-busca.ts`.
- Recepção/Documentos: padrão DESLIGADO até liberar na Governança (decisão A confirmada pelo CEO).
- Fábia (profissional 26, Home Nurse) é a preferida da agenda "AGENDA ENFERMAGEM - HOME CARE" (agenda sem local, modalidade home_care, sem janelas de horário — CEO define em Agenda Configuração). Não criar calendário Google manualmente.
- Fixture do teste pit-stop precisa da tabela client_visit_preference_revisions (proporDatas e detalharPlano leem preferências).
**Why:** Home Care exige agenda de categoria enfermagem modalidade home_care ativa; sem ela dá "sem_agenda_da_categoria".
- CEO mandou tratar a Fábia (Home Nurse) como técnica E enfermeira: habilitacao_nivel gravado = 'enfermeiro' (campo aceita um valor só); exigeNivel='enfermeiro' do Pit Stop compara esse campo.
- Mês da Agenda (padcom) = GradeMesGoogle: lista "Minhas agendas" + eventos dentro do dia; Google somente leitura (cadeado).

## Gerenciamento, encaixe e linha do tempo (12/11/2026)
- Encaixe: a isenção do prazo mínimo só vale por motivo definido no servidor; nunca por pedido do navegador. Agendas 27–29 sem janelas: marcar só depois que o CEO definir horários.
- Dia e Semana da Agenda abrem em "Linha do tempo" (GradeTimeline); "Lista" guarda os cartões antigos (Regra de Ouro). `?visao=lista` força a lista: os e2e antigos da Agenda usam isso.
- Resposta de sessão carrega agenda (id, nome, cor) e duração; sessão sem agenda = cinza "Sem agenda ligada", nunca palpite.
- Link `/agenda?data=AAAA-MM-DD&modo=dia|semana|mes&visao=...` é lido pela Agenda; valor inválido é ignorado.
- Aviso sonoro nasce DESLIGADO (navegador bloqueia som sem gesto); animação de aproximação respeita prefers-reduced-motion.
- **Armadilha:** o codegen do OpenAPI reescreve `lib/api-zod/src/index.ts` com export extra de types (TS2308); restaurar para a linha única `export * from "./generated/api";`.
- **Armadilha:** teste de toque do dnd-kit precisa de alvo centralizado (autoscroll); dnd-kit desabilitado põe aria-disabled e o clique do Playwright trava.
- Risco aberto: Google pode reimportar evento criado pelo PAXTER e duplicar na linha do tempo (dev: 0 ecoados de 7; sem dado real).
- Playwright com relógio fixo: `page.clock.setFixedTime` basta para testar "agora" sem travar os timers do React.
