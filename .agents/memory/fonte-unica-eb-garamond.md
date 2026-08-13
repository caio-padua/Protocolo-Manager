---
name: Fonte unica do sistema — EB Garamond (Cormorant aposentado)
description: Decisao do CEO de 13/08/2026 sobre a serifa unica do Paxter/PADCOM, por que o Cormorant saiu, e as duas armadilhas tecnicas da troca (gaveta de numerais e subset no PDF).
---

# EB Garamond e a fonte serifada UNICA do sistema

Titulos, nomes de paciente, valores financeiros e algarismos saem todos em **EB Garamond**.
**Cormorant Garamond esta APOSENTADO** (tela e PDF). Playfair Display e Marcellus tambem nao
sao serifa de titulo — sobrevivem apenas dentro de peles decorativas ja travadas.

**Why:** o Cormorant faz algarismo old-style (baixo, com descida abaixo da linha). Para o numero
sair alto era preciso operar o arquivo `.woff` a mao com `fontTools`. O CEO vetou a solucao com um
argumento de arquitetura, nao de gosto: fonte adaptada a mao nao e recuperavel — num documento novo
ninguem lembraria de usar a versao remendada, e viraria uma coisa diferente a cada vez.
Comparando 54 arquivos de fonte medidos direto no arquivo: o Cormorant tinha o **pior** algarismo
dos 54 (0,4477 em, 60,7% da altura do do Inter) e variacao de 0,2752 em entre os dez digitos.

**How to apply:** ao criar qualquer tela ou documento novo, usar EB Garamond direto. Nunca
reintroduzir Cormorant. Nunca pedir peso 900 — **800 e o peso mais pesado que existe de verdade**
no EB Garamond; acima disso o navegador falsifica.

## Criterio que elegeu o EB Garamond (util se a fonte for reavaliada)

O `pdf-lib` **nao aplica nenhum recurso OpenType**: no PDF nao existe como pedir `tabular-nums`.
Entao a fonte precisa alinhar numero em coluna **sozinha**, de fabrica. Das candidatas medidas,
so **EB Garamond** e **Cardo** alinham. Crimson Text e Libre Caslon Display nao alinham, e a
Libre Caslon Display ainda tem um unico estilo (sem negrito e sem italico).
Desempate entre as duas: o Cardo so tem os pesos 400 e 700, o que obrigaria a falsificar o peso
pesado — exatamente o remendo que motivou a troca.

## Armadilha 1 — a gaveta de numerais "PaxmedNum"

`PaxmedNum` e uma familia CSS com `unicode-range` so de digitos (U+0030-0039). Ela existe para o
algarismo do texto **sans (Inter)** sair serifado sem tocar em nenhum componente.

- Pilha **sans**: leva a gaveta, com `size-adjust: 115.1%` (medido: digito do EB Garamond 0,6323 em,
  digito do Inter 0,7275 em).
- Pilha **serif/display**: **NAO** leva a gaveta. Ela ja E EB Garamond, entao o digito e nativo e no
  tamanho certo; a gaveta deixaria o numero cerca de 15% maior que a letra ao lado.

Trocar a fonte dos numeros custa 3 linhas no CSS e 3 no gerador de PDF, e **zero** arquivos de tela.

## Armadilha 2 — `subset` no PDF: duas regras OPOSTAS

As fontes do EB Garamond do projeto sao **instancias de uma fonte variavel**. O recorte do
`fontkit` dentro do `pdf-lib` **corrompe** essas instancias: o PDF abre com metade das letras
faltando. Comprovado em 13/08/2026 tanto em `.woff` quanto em `.ttf`.

| Fonte | Formato embutido | `subset` | Motivo |
|---|---|---|---|
| Manrope | `.woff` | **true** | Sem o recorte o `.woff` entra comprimido cru e o PDF sai em quadradinhos |
| EB Garamond | `.ttf` | **false** | Instancia de fonte variavel; o recorte do fontkit a corrompe |

O recorte do EB Garamond ja foi feito **antes**, com `fontTools` (charset latino), direto no arquivo
em `assets/fonts`. Por isso ele ja e pequeno e nao precisa que o `pdf-lib` recorte de novo.
Os `.woff` da gaveta foram recortados so aos digitos: cerca de 2,6 KB cada, contra 240 KB inteiros.

**Regra geral que vale alem deste caso:** HTTP 200 e "fonte embutida" no `pdffonts` **nao provam
nada**. So vale renderizar com `pdftoppm` e OLHAR a imagem.
