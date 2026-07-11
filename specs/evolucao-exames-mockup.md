# Spec — Aba Evolução (cockpit-cliente) fiel ao mockup

## Alvo
Reescrever `artifacts/padcom/src/pages/cockpit/panels/EvolucaoExamesPanel.tsx` para reproduzir o
mockup `artifacts/mockup-sandbox/src/components/mockups/acompanhamento/Exames.tsx`, adaptado aos
DADOS REAIS do motor `GET /api/exames-lab/evolucao/:clientId`. Nada de dado inventado (Art.47).

## Queixas do CEO (todas obrigatórias)
1. Faixas (linhas) CLICÁVEIS que abrem gráfico — comportamento do mockup: clicar EMPILHA um cartão
   de gráfico à DIREITA (não expandir inline). Pode empilhar vários; botão "Limpar".
2. Gráfico mostra SÓ os pontos que têm valor (filtrar datas sem medição), para não esticar o eixo.
3. Cabeçalho de cada coluna MOSTRA A DATA (grande), com laboratório e situação de conferência.
4. Visual bonito, tema CLARO 3D Paxter (cockpit-cliente é cream), fiel ao mockup.

## Dados reais x mockup (adaptação honesta)
- O mockup usa 5 zonas/terços cadastrados por exame; o motor real NÃO tem isso — só `status`
  (acima/abaixo/dentro/conferencia) por célula e `refLow/refHigh` por exame. Portanto:
  - Cor da célula/valor vem do `status` real (verde=dentro, vermelho=acima, âmbar=abaixo, cinza=conf).
  - Filtro "Acender faixa" acende por STATUS (Todos/Dentro/Acima/Abaixo), não por zona fictícia.
  - Banda de referência no gráfico usa refLow–refHigh (uma faixa), não 5 terços.
- Nome do exame CONGELADO à esquerda; as datas ROLAM na horizontal (cliente real tem 20+ coletas).

## Layout
- Grade `1fr / 380px` (empilha em telas estreitas).
- ESQUERDA (panel-3d): controles (toggle "Faixa de cor por valor" + filtro de status) → planilha
  com nome sticky + colunas de data roláveis → célula do valor colorida por status (concave-3d;
  última coluna com valor = screen-3d destacada) → coluna final com LED + ícone de tendência.
- DIREITA (aside sticky): "Gráficos abertos (n)" + Limpar; cartões empilhados (um por exame
  selecionado) com recharts filtrado só a pontos com valor + banda de referência + botão remover;
  estado vazio orientando a clicar.

## Tokens 3D (padcom global, tema claro)
panel-3d / panel-3d-sub / concave-3d / screen-3d / bevel-3d / paxter-led(+green/amber/red)+on.
Cores: navy #16294a, muted #647c97, ouro #b8924d/#9a7b32, nome-bg #e9ecf1, status
verde #2f8f4e / vermelho #c0392b / âmbar #e07b39 / cinza #647c97.

## Fora de escopo
- Não criar cadastro de 5 zonas por exame (não existe no motor).
- Não mexer no endpoint nem no shell do cockpit-cliente.

## Aceite
Screenshot de /cockpit-cliente?cliente=3747&aba=evolucao mostrando datas nos cabeçalhos, cores por
status, clique empilhando gráfico compacto (só pontos com valor) à direita; sem regressão de dados.
