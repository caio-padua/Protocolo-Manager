---
name: Lei do Numeral — conceito "O Mostrador"
description: Por que toda expressao numerica do Paxter nasce de um componente unico, e o limite duro da gaveta de numerais que obriga isso.
---

# A Lei do Numeral — "O Mostrador"

**A regra:** numero nao e digito, e uma EXPRESSAO com anatomia — simbolo de moeda, parte inteira,
separador, centavos, unidade. Todas as partes saem do mesmo material, com hierarquia interna.
Toda expressao numerica visivel nasce de uma peca unica, nunca de `Intl.NumberFormat` jogado
direto no JSX.

**Why:** a "gaveta" `PaxmedNum` (`unicode-range: U+0030-0039`) so alcanca os dez algarismos. O
**"R" de "R$" e letra** — colocar letra na gaveta serifaria o menu, os botoes e as tabelas do
sistema inteiro. Logo a gaveta **nunca** vai consertar dinheiro, e nao adianta tentar: o defeito
que o CEO viu no Painel de Controle em 13/08/2026 (cifrao em Inter, algarismo em EB Garamond, na
mesma peca) e o limite estrutural dessa tecnica, nao descuido. A gaveta segue valendo como rede
de seguranca para numero solto dentro de frase.

**How to apply:** ao exibir valor, taxa, dose ou contagem, usar as pecas de `components/numeral/`.
Nunca formatar moeda ou porcentagem a mao. Nunca usar `toFixed()` para EXIBIR — ele produz ponto
decimal americano ("17.0%"), contra o padrao brasileiro.

## Tres armadilhas que ja custaram retrabalho

1. **Nao aplicar a gaveta dentro da peca.** A pilha display **ja e** EB Garamond; somar a gaveta
   (que carrega `size-adjust: 115.1%`, calibrado para casar com o Inter) deixaria o algarismo
   cerca de 15% maior que o simbolo ao lado.
2. **Dado ausente nao pode virar zero.** `Math.abs(null)` da 0 em silencio, e "R$ 0,00" numa tela
   de receita e mentira contabil. Valor nao finito tem de mostrar travessao.
3. **Espacamento por margem de CSS quebra o texto.** Numero montado com varios elementos precisa
   de espaco inquebravel DE VERDADE entre simbolo e algarismo; so com margem, o copiar-e-colar
   entrega "R$3.385,00" grudado e o Ctrl+F por "R$ 3.385" nao acha.

## Tres moldes

Pleno (padrao) · Alto (centavos elevados, peca de vitrine) · Tecnico (tudo na linha de base).
A tela viva que compara os tres, com o defeito antigo lado a lado, e a rota `/lei-do-numeral`.
