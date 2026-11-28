---
name: Filtro único de agendas — chaves compartilhadas
description: Sessão e Google da mesma agenda usam a mesma chave r{id}; calendário só do Google usa g{id}
---
Dia, Semana, Mês e Lista usam um único conjunto de agendas ocultas no `index.tsx`. Não recriar filtros locais nas views (antes eram três: chips da linha do tempo, "Minhas agendas" do mês e seleção do painel Google).

**Why:** o CEO exigiu o mesmo filtro para eventos internos e do Google, e que as telas se comuniquem.
**How to apply:** nova visão da agenda recebe a prop `ocultas` e filtra com `chaveDaSessao` / `chaveDoCompromisso`; o painel `FiltroAgendas` lista TODA agenda ativa (de `/api/agenda/resources`), mesmo sem item no período.
