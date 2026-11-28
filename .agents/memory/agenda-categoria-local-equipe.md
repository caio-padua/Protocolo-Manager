---
name: Agenda por categoria, local polimórfico e equipe de procedimento
description: Regras duráveis do vínculo agenda-categoria-local e da reserva de equipe por procedimento
---
- Categoria da agenda nunca é inferida de nome nem do tipo antigo: sem prova = "pendente". Carga só por scripts/agenda-categoria-backfill.mjs (simulação por padrão, --apply auditado).
- `locations` é polimórfica: espaço físico (sem papel) e registros de agenda Google (agenda_papel local/remoto/externo/pessoal/geral) coexistem, às vezes no mesmo endereço. NUNCA fundir/renomear/apagar. Atendem só sem papel/local/remoto/externo; modalidade online exige remoto.
- Tabelas de equipe por procedimento (protocolo_procedimentos etc.) entram por migração explícita, não no boot; rotas devolvem 503 estrutura_pendente sem elas.
**Why:** o Dr. Caio confirmou a mistura legada e proibiu fusão; boot que escreve em dado real foi vetado.
**How to apply:** prova de boot seguro = pg_dump do dev → Postgres descartável → rodar dist com env -i (precisa dummies AI_INTEGRATIONS_*) → diff por tabela. Servidor de teste e Postgres morrem entre chamadas: tudo em UMA chamada. Teste que reserva em slot fixo pode cair em cadeia/ocupação de teste anterior: usar dia limpo.
- Marcadores C1/P1/A1/C2/L1/D1 são temporários (components/MarcadorVinculo.tsx, flag MARCADORES_ATIVOS); "pendente" quando o vínculo não é verificado.

## Agenda nova sem local, Corpo Clínico e alternativas (nov/2026)
- Causa raiz do "biomédico não aparece": o payload de integração da agenda filtrava por `location_professionals` (JOIN), enquanto a regra canônica de Corpo Clínico é `professionals.empresa_id` OU `professional_empresas` OU vínculo de local. Usar sempre `condicaoCorpoClinico` e comparar `areaId` numérico.
- Agenda nova NÃO tem registro de local: a clínica vive em `agenda_resources.empresa_id`; `location_id` é legado opcional. Consumidor que faz JOIN interno em `locations` não enxerga essas agendas (propositado); todos os novos usam LEFT JOIN + `COALESCE(r.empresa_id, l.empresa_id)`. Fluxo `/agenda/requests` e calendário Google ainda exigem local (Google fica "pendente" honesto).
- Alternativas: uma NECESSIDADE = uma pessoa, categoria principal + `alternative_category_ids` (médico OU biomédico, nunca os dois); padrão do procedimento em `procedimento_equipes_alternativas`; habilitação real = lista configurável `professional_ids`, nunca regra fixa por categoria. Implante exige medicina E enfermagem como necessidades distintas.
- Teste de slots: o motor de blocos só abre o bloco seguinte depois que o anterior enche; em teste reservar no primeiro bloco do dia (08:00-09:30) ou o horário "some". Fixtures de `agenda_resources` precisam de `empresa_id` e `external_*` porque o Drizzle seleciona todas as colunas.
**Why:** evitar repetir o diagnóstico (3 sessões) e o falso "horário indisponível" em teste.
