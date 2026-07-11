---
name: Cockpit por telas-fonte-única embutidas
description: Padrão para consolidar telas dentro de um cockpit sem duplicar UI — refatorar a tela ORIGINAL com props opcionais e embutir, mais o guard de navegação em modo embutido.
---

# Cockpit da Consulta — telas-fonte-única embutidas

Regra: para embutir uma tela existente dentro de um cockpit/aba, NÃO recriar um painel paralelo.
Refatorar a tela ORIGINAL para aceitar props opcionais `{ embedded?: boolean; clientId?: number }`,
manter a rota standalone via wrapper (`component={() => <Tela/>}` no App.tsx) e o cockpit renderiza a
mesma tela com `embedded`. Fonte única = zero divergência entre a tela solta e a embutida.

**Guard de navegação em modo embutido:** ações que normalmente navegam (ex.: criar protocolo →
`setLocation(detalhe)`) precisam de um desvio: em `embedded` NÃO navegar (invalidar queries +
callback opcional `onCreated`), senão o médico é expulso do cockpit. Fora do cockpit, mantém o
`setLocation` original.

**Why:** o CEO pediu telas idênticas mas inline no /cockpit-cliente; painéis paralelos divergiam da
tela real (bug histórico). Fonte única elimina o retrabalho de manter duas UIs.

**How to apply:** ao consolidar qualquer tela num cockpit, torne as props embedded/clientId
OPCIONAIS (rota solta continua sem elas), e proteja toda navegação de sucesso com o guard embedded.

**Armadilha de revisão:** um requisito específico do CEO pode sobrepor a regra geral. Ex.: a aba
Exames deve mostrar os blocos EM COLUNAS (bifurcação intencional por `embedded`) — o architect
sinalizou isso como "não idêntico" e pediu unificar, mas isso CONTRADIZ o pedido explícito. Antes de
aceitar recomendação de revisão, confira se ela não reverte uma decisão-raiz do CEO (Art.50).
