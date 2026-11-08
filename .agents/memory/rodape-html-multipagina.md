---
name: Rodapé fixo em impressão de várias páginas
description: Limitação observada ao imprimir receita com navegador.
---

Posicionar o rodapé com CSS fixo dentro do contêiner da receita, mesmo
reservando margem de impressão, pode colocá-lo por cima do corpo em páginas
posteriores. Passar em teste de texto ou posição da assinatura não prova que
o rodapé esteja no lugar correto.

**Why:** Em uma receita sintética de duas páginas, duas tentativas de
posicionamento fixo imprimiram o rodapé no meio do conteúdo.

**How to apply:** Validar visualmente todas as páginas e conferir coordenadas
de corpo, assinatura e rodapé. Uma alternativa é reservar espaço e inserir
rodapé e assinatura no documento antes da assinatura digital; ela exige
validação própria, não deve ser presumida funcional.
