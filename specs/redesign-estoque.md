# Spec — Redesenho da tela de Estoque (Padcon Conect)

## Objetivo
Levar o modelo Paxter (linguagem 3D + lei Art. 53 "posição fixa") para a tela de Estoque (`artifacts/padcom/src/pages/stock/index.tsx`), deixando o nome do produto com espaço para ser longo e o número da quantidade côncavo e compacto.

## Decisão do CEO (19/06/2026)
Opção A escolhida: número da quantidade em insert CÔNCAVO COMPACTO à direita, ao lado do botão "Ajustar"; toda a esquerda fica para o nome (que pode ser longo) + os dados empilhados um embaixo do outro.

## Fato verificado na fonte (Art. 47)
A tabela `stock_items` e a resposta da API NÃO têm campo "dose". Campos reais disponíveis por item: `substanceName`, `substanceColor`, `quantity`, `unit`, `minimumStock`, `lot`, `expirationDate`, `supplier`, `unitCost`, `status`. Portanto o "descritivo da dose" citado pelo CEO é atendido pelos descritores reais empilhados (denominação, mínimo, lote, validade).

## Requisitos exatos
1. Cada cartão de item de estoque tem a estrutura, da esquerda para a direita: (a) barra de cor da substância (mantida — "denominação da cor está perfeita"); (b) coluna central com o NOME em cima e os dados empilhados embaixo; (c) bloco à direita com a quantidade côncava compacta + botão "Ajustar".
2. NOME do produto: posição fixa no topo da coluna central, fonte MAIOR que a atual, podendo quebrar em mais de uma linha (nunca cortar informação) — recebe o espaço liberado pela quantidade compacta.
3. Dados empilhados (um embaixo do outro), em SLOTS FIXOS com rótulo MAIÚSCULO, usando o helper `MetaField` (mesmo da Agenda): DENOMINAÇÃO (status: NORMAL / BAIXO / SEM ESTOQUE), MÍNIMO, LOTE, VALIDADE. Campo vazio NUNCA some: mostra "—" no lugar do valor.
4. DENOMINAÇÃO (status) fica sempre no MESMO lugar (primeiro slot abaixo do nome), conforme pedido do CEO ("a denominação tem que estar sempre no mesmo local abaixo do nome").
5. Número da quantidade: deixa de ser saliente/grande (`screen-3d text-xl`) e passa a CÔNCAVO compacto (`concave-3d`), menos destacado, largura enxuta — para sobrar espaço ao nome.
6. Botão "Ajustar" mantido ao lado da quantidade (caixinha lateral aprovada pelo CEO), mesmo estilo `btn-3d-soft`.
7. Modo de edição (ao clicar "Ajustar"): mantém Input `field-engraved` + "Salvar" (`btn-3d`) + "Cancelar" (`btn-3d-soft`); comportamento e mutation inalterados.
8. Linguagem 3D Paxter mantida: `panel-3d` no cartão-mãe, `panel-3d-sub` em cada linha, `concave-3d` nos campos gravados.
9. Alertas do topo (crítico/baixo) preservados como estão.

## Casos extremos a tratar
- Nome muito longo: deve quebrar/ocupar várias linhas sem empurrar a quantidade para fora; o bloco direito (quantidade + Ajustar) alinha ao TOPO (`items-start`).
- Lote e Validade nulos: mostram "—" (slot presente), nunca somem.
- Quantidade fracionada (campo é `real`): exibir o número como vem (sem forçar inteiro na exibição).
- Mobile (≈400px): nome + dados empilhados legíveis; quantidade côncava + Ajustar cabendo na largura sem cortar.

## Definição de PRONTO
- Build sem erro de runtime; tela renderiza no celular (≈400px) e no desktop (≈1280px), conferido por screenshot.
- Quantidade côncava compacta à direita ao lado de "Ajustar"; nome grande com espaço; denominação/mínimo/lote/validade empilhados em slots fixos com "—" quando vazio.
- Edição (Ajustar → Salvar) continua funcionando (mutation `useUpdateStockItem` intacta).
- architect (code_review) aprova requisito por requisito, zero pendência.
- CEO recebe Densidade B com RESUMO EM 1 LINHA.

## Linhas vermelhas
- NÃO alterar a API de estoque nem o payload de salvar (`{ id, data: { quantity } }`); mudança é só de APRESENTAÇÃO.
- NÃO inventar campo "dose" inexistente; usar só os campos reais da resposta.
- NÃO mexer em outras telas nem no motor de cálculo.
