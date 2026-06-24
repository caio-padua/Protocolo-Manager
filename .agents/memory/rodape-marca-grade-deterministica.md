---
name: Rodapé de marca — legenda encerra nas verticais do logotipo (determinístico)
description: Como fazer uma legenda começar/terminar exatamente nas bordas do logotipo, e por que harmonizar ouro de PNGs oficiais por filtro CSS é frágil.
---

# Legenda que "encerra nas verticais" de um logotipo (símbolo + wordmark)

Pedido recorrente do CEO: a legenda em cima do logotipo deve começar na MESMA vertical do
símbolo (esquerda) e terminar na MESMA vertical do fim do wordmark (direita).

## Regra (determinística — NÃO usar largura natural)
- O bloco recebe **largura FIXA = largura natural do logotipo** (ex.: `w-[172px]`), com `shrink-0`.
- A linha do logo usa `flex w-full items-end justify-between` → símbolo encosta na vertical esquerda,
  wordmark na direita, e `items-end` põe símbolo e wordmark na MESMA base.
- A legenda usa `style={{ textAlign: "justify", textAlignLast: "justify" }}` → preenche exatamente a
  largura, encostando nas duas verticais.

**Por que:** com `inline-flex`/largura natural, o bloco pode ser ditado pelo TEXTO da legenda (não pelo
logo); aí a legenda não bate nas verticais e quebra em viewport estreito. O architect reprovou a versão
de largura natural exatamente por isso.

**How to apply:** sempre que o CEO pedir "encerrar nas verticais"/"delimitar nos limites do logo".
Escolher a largura fixa ≈ soma `símbolo + gap + wordmark` para o `justify-between` não abrir vão (gap
grande = feio). Legenda de 2 palavras (ex.: "Engineered by") NÃO justificar (vira "PALAVRA ... PALAVRA");
alinhar à direita.

## Tamanho visual de símbolos diferentes
Símbolo vazado/fino e símbolo cheio/sólido na MESMA altura NÃO parecem do mesmo tamanho (o cheio
"pesa" mais). Compensar dando ao vazado altura um pouco maior (ex.: D+P 46 vs PADCON 40).

## Ouro de PNGs oficiais — harmonizar por filtro é APROXIMAÇÃO, não equivalência
Duas artes oficiais com tons de ouro diferentes (uma fosca, outra viva) só se igualam de verdade
regerando/reprocessando a arte. `filter: saturate()/brightness()` aproxima mas varia por tela/tema/
compressão. **Why:** não fechar "ouro igual" só com filtro; o tom final é decisão de marca do CEO
(A/B/C) e deve ser congelado por decisão formal. Nunca redesenhar arte oficial sem ordem do CEO.
Peça controlável por CSS = só o símbolo D+P (gradiente); os wordmarks Pádua/PADCON são PNG fixo.

## ATUALIZACAO 24/06/2026 — CEO removeu os simbolos do rodape
O CEO depois decidiu TIRAR os simbolos (PaduaSymbol/PadconSymbol) do rodape da anamnese-v2 ("o
simbolo fica exagerado"). Ficam SO os wordmarks. Com isso o requisito "encerrar nas verticais"
deixa de valer nesse rodape (sem simbolo nao ha vertical esquerda a respeitar). Regra nova:
- As DUAS legendas (assinatura do diretor + "Engineered by") devem ter MESMA cor E MESMA fonte.
  Erro reprovado: uma branca (.footer-credit-padua) e outra cinza (text-muted-foreground). Solucao:
  .footer-credit-padua nas duas + fonte Lora italico nas duas.
- Faixa de marca = barra delimitada (bg-card + border + rounded + shadow). Nao fixar (fixed) sem
  pedido: o selo "Tudo salvo automaticamente" ja ocupa o rodape fixo.
**Why:** preferencias do CEO mudam entre rodadas; manter o historico evita reintroduzir o simbolo
ou a divergencia de cor numa proxima edicao.

## Bug "botao/chip fica branco ao clicar" no tema escuro (regra durável)
No tema escuro o token `--primary` deste app INVERTE para quase-branco. Qualquer estado
ativo/selecionado que use `hsl(var(--primary))` como fundo + texto branco some (branco-no-branco).
**Why:** primary = navy no claro, quase-branco no escuro; estilo inline que assume primary=navy quebra.
**How to apply:** estados ativos/selecionados devem ser TEMA-CONSCIENTES com cor explícita no escuro,
nunca depender de `--primary` para o fundo.

## "Mesmo tecido" entre header e corpo (regra durável)
Trocar um token sólido (`bg-card`/`bg-background`) por outro NÃO unifica textura quando o corpo usa
um DEGRADE (ex.: `.anamnese-solo`). **Why:** sólido x gradiente lêem como dois tecidos. **How to
apply:** o header deve receber a MESMA classe de fundo do corpo; a emenda fica mascarada pelo
`border-b` + painel colado logo abaixo.

## Rodapé de marca: mesma linha, relevo, faixa fixa (regra durável)
- Para duas legendas na MESMA linha horizontal acima de wordmarks de alturas diferentes, NÃO empilhar
  colunas [legenda,wordmark] com `items-end` (desnivela). Usar DUAS rows separadas (legendas /
  wordmarks); o gap entre rows também dá o respiro frase↔nome.
- "Relevo/saliente" pedido pelo CEO = classe 3D do sistema (`.bevel-3d`), nunca `bg-card + shadow`.
- Faixa fixa no rodapé: se já há outro elemento `fixed` embaixo, EMPILHAR ambos num único container
  fixed (em vez de dois concorrentes) e subir o `pb` do root para o conteúdo não ficar atrás.
