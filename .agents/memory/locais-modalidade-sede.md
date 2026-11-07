---
name: Locais de atendimento — modalidade e sede
description: Como locations guarda presencial/online e "mesmo endereco da empresa"; regra do CEO sobre LOCAL x REMOTO
---
Local tem `modalidade` (presencial|online|NULL=a definir) e `mesmo_endereco_empresa`. Agenda "LOCAL" = atende na sede (endereco da empresa); "REMOTO" = online OU outro endereco, NUNCA presumir.
**Why:** o CEO pediu "nao suponha nada"; clinicas alugam salas por hora em outras cidades.
**How to apply:** GET /locations sobrepoe o endereco da empresa nas sedes e o POST/PUT copia para as colunas; nova coluna so por ADD COLUMN; selos em locais/locais-modo.ts (Padrao 25 do skill-layout-paxter). Limite conhecido: editar o endereco da empresa nao atualiza as colunas gravadas das sedes (a leitura da API e a tela ja mostram o atual).
