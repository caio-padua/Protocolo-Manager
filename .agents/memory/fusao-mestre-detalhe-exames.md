---
name: Fusão de ferramentas em tela mestre-detalhe (exames)
description: Duas gotchas ao fundir telas de admin numa única mestre-detalhe que carrega detalhe async e monta lista por merge.
---

Ao fundir duas telas de administração numa única tela mestre-detalhe (lista à esquerda,
detalhe carregado por fetch ao selecionar), dois riscos reais aparecem:

1. **Race no carregamento do detalhe.** Clique A→B rápido: a resposta lenta de A pode
   sobrescrever o estado de B (e salvar no exame errado). Blindar com um contador em
   `useRef` (`reqId = ++ref.current`) e só aplicar `setState` se `ref.current === reqId`
   nos `then/catch/finally`. Não basta checar `selecionado` — o closure pode estar stale.

2. **Merge left-join esconde linhas.** Montar a lista com `catalogo.map(...)` perde
   qualquer item que exista só na OUTRA fonte. Fazer UNIÃO: após o map, percorrer a
   segunda fonte e dar push de linha fallback para todo `code` ausente na primeira.

**Why:** a spec exigia "zero perda"; o architect reprovou a primeira versão exatamente
por esses dois pontos (race média/alta + merge com perda).

**How to apply:** qualquer tela mestre-detalhe com detalhe async + lista por merge de 2 fontes.
Preservar o componente antigo se ele estiver embutido em outra tela (ex.: DirecaoExamesTool no Cockpit).
