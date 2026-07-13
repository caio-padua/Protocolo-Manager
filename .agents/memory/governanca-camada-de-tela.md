---
name: Governança por camada de tela (matriz Ferramenta × Papel)
description: Como a permissão por papel é aplicada no front do Manager e as armadilhas de rota/menu.
---

A matriz Ferramenta × Papel (fonte única em app_settings, só CEO edita) é obedecida na
CAMADA DE TELA, não na auth de servidor (app single-tenant, routers admin sem authz —
ver `admin-api-sem-auth`). `usePermissoes()` no front resolve `pode(ferramentaId)`.

**Regras que reprovam no architect se violadas:**
- Governança é VISÍVEL em leitura para não-CEO — portanto NÃO entra no mapa de filtro de
  menu (`HREF_FERRAMENTA` em Layout.tsx). Ferramenta que deve sumir por papel (ex.:
  `exames_config`, reservada ao CEO) SIM entra no mapa. Ausência do href no mapa = item
  nunca some por permissão.
- Rota que deve ser gateada precisa ficar DENTRO do `<CollaboratorGate>`. Uma rota legada
  duplicada fora do gate (ex.: `/governanca` solta) é brecha: sem token o hook cai em
  `acessoTotal` e mostra a matriz editável. Remover a rota legada e reapontar o menu para
  a rota sob gate.
- Tela reservada precisa de guarda própria: `pode("exames_config")` — quando false,
  renderiza bloqueio ("Acesso reservado ao CEO") e NÃO renderiza os controles. Filtrar só
  do menu não basta (URL direta continua acessível).

**Why:** a revisão anterior reprovou exatamente por (a) tela sem guarda, (b) rota legada
fora do gate, (c) mapa de menu incompleto, (d) governança sumindo do menu.

**How to apply:** ao adicionar ferramenta gateável, decidir 1) some do menu? → href no
`HREF_FERRAMENTA`; 2) tela reservada? → guarda `pode(...)` no corpo; 3) rota única sob gate.
`usePermissoes`: sem token OU isPrimaryDoctor → acessoTotal (não trava operador legítimo).
