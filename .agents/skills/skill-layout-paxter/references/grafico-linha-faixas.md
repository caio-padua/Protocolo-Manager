# Gráfico de linha com faixas coloridas — padrão único (referência: Pulso Diário)

Regra do Dr. Caio (22/11/2026): todo gráfico de linha do PaxMed segue o do Pulso Diário. Copiar, não inventar.
Gráfico sem cor e sem faixa não é gráfico: só entra sem faixa quando a fonte oficial não define faixa, e a tela diz isso por escrito.

## Fonte única dos números
`artifacts/padcom/src/pages/cockpit-cliente/graficoPadrao.ts` (constante `GRAFICO`). Proibido escrever espessura, opacidade ou tamanho de marcador solto na tela.

| Item | Valor | Constante |
|---|---|---|
| Linha de dados | 1,25 px, junção `miter`, ponta `butt`, tipo `linear` | `linhaPrincipal` |
| Extensão tracejada das pontas | 1 px, tracejado 4 4, opacidade 0,35, cor azul-marinho | `linhaFantasma` |
| Faixa colorida (fundo) | preenchimento 0,18; contorno 0,25 | `faixaPreenchimento`, `faixaContorno` |
| Altura | 240 px | `alturaPx` |
| Largura por ponto | 56 px (rola na horizontal, termina no último ponto) | `larguraPorPonto` |
| Ponto-fantasma das pontas | quadradinho tracejado 8 px | `fantasmaLado` |
| Ponto ativo | quadradinho VAZADO PRETO, 10 px, contorno 1,5 px | `ativoLado`, `ativoContorno`, `ativoCor` |

## Formação do gráfico (nesta ordem)
1. Tela rebaixada (`screen-tv-3d`) com grade tracejada fraca.
2. Faixas coloridas oficiais ao fundo (`ReferenceArea`), com legenda de cores embaixo.
3. Linha azul-marinho fina por cima.
4. Etiqueta de valor em cada ponto, na cor da faixa (branca ou azul-marinho conforme o contraste).
5. Eixos sem traço de marca, números pequenos; largura do eixo Y medida pelo maior rótulo.
6. Caixas de resumo (mínimo, máximo, média, variação, anterior) e rodapé vivo (última, data, tendência, situação).

## Como o ponto ativo é movido (todos os modos)
| Entrada | Efeito |
|---|---|
| Mouse sobre o gráfico | quadradinho preto vazado no ponto, linha-guia dourada tracejada, rodapé mostra "no ponto" |
| Dedo ou touchpad deslizando | igual ao mouse (evento de ponteiro do gráfico) |
| Seta esquerda / direita (gráfico com foco) | anda um ponto; primeira vez parte do último ponto |
| Esc | limpa o ponto ativo |
| Sem tooltip em janelinha | proibido; o valor aparece no rodapé |
O contêiner de rolagem tem `tabIndex=0`, `role="group"` e aria-label explicando as setas.

## Onde vale
- `cockpit-cliente/GraficoZonas.tsx` (Pulso do cockpit, Pulso da Área do Cliente, antropometria com faixa).
- `cockpit/panels/EvolucaoExamesPanel.tsx` (evolução de exames no cockpit E na Área do Cliente: mesmo painel).
- `avaliacoes/EvolucaoMedicoes.tsx` (medidas sem faixa e miniaturas): mesma espessura e mesmo ponto ativo.
- Gráficos novos: usar `GraficoZonas`; não criar outro.

## Checklist
- [ ] Nenhum número de espessura, opacidade ou tamanho fora de `GRAFICO`.
- [ ] Medido no navegador: `path.recharts-line-curve` com stroke-width 1,25 (dados) e 1 (extensão).
- [ ] Faixas coloridas presentes; sem faixa só com aviso escrito.
- [ ] Setas esquerda/direita e mouse acendem o quadradinho preto vazado.
- [ ] Conferido no cockpit e na Área do Cliente.
