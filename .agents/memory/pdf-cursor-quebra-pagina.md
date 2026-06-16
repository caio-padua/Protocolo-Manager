---
name: Geradores de PDF precisam de um cursor de pagina unico e reapontavel
description: por que blocos com `const page` proprio + addPage manual geram paginas em branco e conteudo cortado
---

# Um cursor de pagina compartilhado, nunca `const page` por bloco

Num gerador de PDF multi-pagina (pdf-lib), use UM cursor mutavel compartilhado
(`let page` + `let y`) com helpers `newPage()` (reaponta `page` e reseta `y`) e
`ensureSpace(needed)` (quebra antes de desenhar). TODO `drawText/drawRectangle`
referencia `page` (a variavel), e todo laco de linhas/linhas-de-tabela chama
`ensureSpace` antes de desenhar.

**Why:** descoberto em 16/06/2026 no RAS assinado. Dois defeitos reais causavam
"paginas em branco" e "bloco cortado no meio" que o CEO via:
1. Secoes com seu proprio `const page = pdfDoc.addPage(...)` e, ao estourar,
   criavam uma pagina nova numa variavel LOCAL diferente mas continuavam
   desenhando na `page` antiga — conteudo ia para a pagina errada / fora da folha,
   e a pagina nova saia em branco.
2. Tabelas e blocos de assinatura sem nenhuma checagem de quebra: o `y` descia
   abaixo da margem e o pdf-lib desenhava em `y` negativo (fora da pagina) sem erro.

**How to apply:**
- Nunca declare `const page` por secao. Declare `let page`/`let y` uma vez no topo
  da funcao e mute via `newPage()`.
- Antes de cada linha de texto longo, linha de tabela, ou bloco que deve ficar
  inteiro junto (ex.: assinatura), chame `ensureSpace(altura_estimada)`.
- Para blocos "indivisiveis", `ensureSpace(altura_total_do_bloco)` antes de comecar.
- Cabecalho de tabela: extraia para uma funcao e redesenhe apos cada `newPage()`.
- pdf-lib NAO avisa quando desenha fora da pagina — a unica defesa e a guarda de `y`.
- Validar gerando com carga pesada (muitas linhas + texto longo) e conferindo a
  contagem de paginas e que nenhuma secao final sumiu.
