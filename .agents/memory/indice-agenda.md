---
name: Índice Agenda
description: Índice de decisões agrupadas para preservar referências e reduzir o índice principal.
---

- [Motor de Agenda — fuso e fonte](motor-agenda-fuso-fonte.md) — horario ancora no fuso da clinica (BRT UTC-3, sufixo -03:00); nao inventar fonte de ocupacao de fase futura, usar entrada explicita.
- [Reagendamento e fuso da sessao](reagendamento-fuso-sessao.md) — scheduled_date/time sao BRT em texto; ancorar -03:00 ao comparar com now(); Google mover=delete+create (best-effort, zerar id em falh
- [Cadastro empresarial separado da agenda](cadastro-empresa-vs-local-agenda.md) — dados legais ficam em Empresas; locais e agendas são camada operacional, sem criar hierarquia por inferência.
- [Google Agenda — resultado incerto](google-evento-resultado-incerto-conferencia.md) — conferência reaproveita o id reservado; id novo duplica; só 404 é "não existe".
- [Evento Google — comparação com o IHE](google-evento-ihe-comparacao.md) — IHE atualizava o evento ao aplicar (Manager perdeu); cor do print é renderização do Google, não divergência de código.
- [Ação clínica que atualiza o Google — reserva e prazo](google-evento-acao-clinica-reserva.md) — nunca reivindicar reserva alheia; prazo próprio na chamada; teste sem timer curto.
- [Agenda por categoria, local polimórfico, equipe](agenda-categoria-local-equipe.md) — categoria pendente≠inferida; locations mistura espaço físico e agenda Google (não fundir); tabelas de equipe por
- [Clínica x unidade da agenda nos documentos](clinica-vs-unidade-agenda-documentos.md) — unit é local de agenda; documentos usam empresas.nome; lançador escolhe procedimentos (217 gerados das substân
- [Agenda Configuração — códigos de repetição](agenda-repeticao-codigos.md) — repeat_weeks: 1, 2/3/4/6/8 semanas, 101–105 mensal; "recurso" vira "agenda de atendimento"; tela = Agenda Configuração.
- [Agenda e cadastro profissional — formas de atendimento](agenda-forma-vocabulario.md) — Sede, Local externo, Online e Home Care; disponibilidade do profissional no mesmo bloco, sem ativar a empresa.
- [Protocolo: dois fluxos de agenda e local sobrecarregado](protocolo-dois-fluxos-agenda-local.md) — location_id do procedimento aponta para agenda; fluxo por períodos só enfermagem Sede.
- [Pit Stop + referência agenda/profissional/local](pit-stop-agendamento.md) — plano compartilhado (Caminho B); ler docs/REFERENCIA-AGENDA-PROFISSIONAL-LOCAL.md antes de mexer em agenda/equipe/local.
