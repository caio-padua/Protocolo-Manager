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

## Regra visual aprovada para o Cockpit

A tela autônoma de Prescrição é a referência para tipografia, contraste, cores e componentes visuais do Cockpit. Cada ferramenta mantém a própria organização funcional; só a mesma ferramenta deve manter paridade estrutural entre as versões autônoma e embutida. O seletor de cliente e sua busca atual não devem ser alterados durante a harmonização visual.

**Why:** em 01/11/2026, o CEO aprovou a Prescrição como modelo visual, mas escolheu explicitamente “tipografia comum, layout próprio” para evitar que ferramentas com fluxos diferentes recebam a mesma disposição de campos.

**How to apply:** herdar o vocabulário visual Paxter no conteúdo do Cockpit e reutilizar a tela original quando isso não remover validações nem mudar contratos clínicos.

**Armadilha de revisão:** um requisito específico do CEO pode sobrepor a regra geral. Ex.: a aba
Exames deve mostrar os blocos EM COLUNAS (bifurcação intencional por `embedded`) — o architect
sinalizou isso como "não idêntico" e pediu unificar, mas isso CONTRADIZ o pedido explícito. Antes de
aceitar recomendação de revisão, confira se ela não reverte uma decisão-raiz do CEO (Art.50).
