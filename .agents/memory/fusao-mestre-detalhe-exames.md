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

Atualização (12/07/2026): a duplicidade de ferramentas de faixas de exames FOI eliminada por
ordem do CEO. Existe UMA única ferramenta (ConsoleExamesTool), a mais completa, usada tanto na
Configuração (/cadastros/console-exames) quanto embutida no Cockpit (EvolucaoExamesPanel).
DirecaoExamesTool e PlanilhaFaixasTool foram apagados — não "preservar o componente antigo".
O rótulo de cada uma das 5 faixas é editável por exame (campo faixaName, PUT /faixas, max 40,
trim + fallback ZONE_ROTULO por direção); a COR nunca é editável (sempre ZONE_COLOR por severidade).

Nuance do reqId (13/07/2026): o guard por `useRef` protege o `then/catch` da PRÓPRIA busca, mas
há uma janela extra — trocar de item ANTES de o próximo painel disparar sua busca. A resposta
tardia do item anterior ainda casaria o reqId vigente. Correção: no `useEffect` de reset por troca
de seleção, INCREMENTAR o mesmo ref (`ref.current++`) para invalidar buscas em voo imediatamente,
mesmo que o próximo painel só carregue sob demanda (ex.: lista de laudos aberta por clique).
**Why:** o architect reprovou por vazamento entre exames num painel lazy (só carrega ao abrir).
**How to apply:** todo fetch async cujo disparo é lazy/opcional precisa que o reset da entidade-pai
bumpe o ref, não só o início da própria busca.
