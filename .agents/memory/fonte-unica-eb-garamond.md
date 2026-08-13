---
name: Lei das 4 fontes do Paxter — EB Garamond principal, Cardo secundaria
description: Decisao do CEO de 13/08/2026 sobre o elenco de fontes do Paxter/PADCOM, por que o Cormorant saiu, e as duas armadilhas tecnicas da troca (gaveta de numerais e subset no PDF).
---

# Lei das 4 fontes (CEO, 13/08/2026)

Quatro fontes, quatro trabalhos, sem sobreposicao. O quadro normativo completo, com as proibicoes,
esta na secao "LEI DAS 4 FONTES" de `.agents/skills/skill-layout-paxter/SKILL.md`.

| Fonte | Trabalho unico |
|---|---|
| **EB Garamond** (principal) | Titulo, nome de paciente, algarismo, valor financeiro — tela e PDF |
| **Inter** (operacional) | UI funcional: botao, rotulo, dado de tabela |
| **Lora** (leitura na tela) | Pergunta da anamnese do cliente — **PERMANENTE**, o CEO reafirmou em 13/08/2026 |
| **Cardo** (secundaria) | Paragrafo de leitura corrida dentro de documento em PDF |

**Cormorant Garamond esta APOSENTADO.** Escopo real, verificado por `grep` em 13/08/2026:
zero ocorrencias no codigo-fonte de `artifacts/padcom`, nos dois geradores de PDF e — depois
da segunda ordem do CEO no mesmo dia — tambem nas vitrines `parxis-site` e `vitrine-demo`.
Ainda sobrevive de proposito em `mockup-sandbox` (arquivo de mockups) e nos `.woff` guardados
em `assets/fonts` (Regra de Ouro: nao apagar). Playfair Display e Marcellus tambem nao sao
serifa de titulo — sobrevivem apenas dentro de peles decorativas ja travadas.

**Cardo:** adotado na doutrina, mas de proposito ainda **nao montado em nenhum arquivo** — entra
no primeiro documento que precisar de leitura corrida serifada. Nunca em numero, nunca em titulo
pesado (so tem 400 e 700), nunca em tela do aplicativo, nunca escrito a mao num componente.

**Why (a divisao Lora x Cardo):** o CEO cogitou o Cardo para leitura longa; a vaga de leitura na
TELA ja e da Lora desde 24/06/2026. Em vez de duas serifadas disputando o mesmo trabalho, a
fronteira ficou sendo o SUPORTE: Lora le na tela, Cardo le no papel/PDF.

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

Larguras dos dez digitos, medidas direto no arquivo (em `em`; variacao = mais largo menos mais
estreito; zero significa coluna alinhada de fabrica):

| Fonte | Largura | Variacao | Alinha sozinha |
|---|---|---|---|
| Cardo (Regular e Bold) | 0,5122 | 0,0000 | sim |
| EB Garamond | 0,4800 | 0,0000 | sim |
| Cormorant Garamond | — | 0,1570 | nao |
| Inter | — | 0,2393 | nao |
| Lora | — | 0,2570 | nao |

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
