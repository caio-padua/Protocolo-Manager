# Regra da ajuda "?" da antropometria — referências obrigatórias

Decisão do Dr. Caio em 22/11/2026.

## Regra
Todo botão "?" do gráfico de antropometria deve mostrar, nesta ordem:

1. O que o gráfico mostra e como medir (mesma técnica em cada avaliação).
2. As faixas coloridas do gráfico e de onde vêm (ou o motivo de não haver faixa).
3. Referências NACIONAIS: as mais importantes, com a mais recente marcada.
4. Referências INTERNACIONAIS: as mais importantes, com a mais recente marcada.
5. Limites: não é diagnóstico; gestação, amamentação, menores de 18 anos e idosos exigem avaliação individual.

## Onde mora o conteúdo
- Lista única: `artifacts/padcom/src/pages/cockpit-cliente/avaliacoes/referenciasAntropometria.ts`
- Tela: `AjudaAntropometria.tsx` (só lê a lista; nunca escreve referência solta).

## Como atualizar
1. Procurar a edição mais recente nacional e internacional.
2. Abrir o endereço e conferir título, órgão e ano. Não citar de memória.
3. Editar a lista e a constante `CONFERIDO_EM`.
4. Número (ponto de corte) só entra na tela se estiver conferido na fonte.

## Pendências conhecidas
- Faixas do gráfico usam pontos de corte gerais de adultos. Para idosos (60 anos ou mais) o Ministério da Saúde adota pontos de corte próprios (SISVAN); a tela ainda não os aplica e avisa na ajuda.
- Cintura, quadril, dobras e relação cintura/quadril ainda não têm faixa colorida no gráfico.

## Molde visual (22/11/2026)
O layout da janela é o do "?" do Pulso Diário, copiado igual. Molde escrito em
`.agents/skills/skill-layout-paxter/references/botao-ajuda-interrogacao.md`. Não criar layout próprio.
