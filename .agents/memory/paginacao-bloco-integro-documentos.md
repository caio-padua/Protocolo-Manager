---
name: Paginação — bloco inteiro + 1 linha em branco
description: Regra do CEO para PDFs médicos: fórmula/item nunca cortado entre páginas
---
Fórmula, item de exame ou parágrafo vai inteiro (até o fim da posologia) mais 1 linha em branco; senão vai inteiro para a próxima página. Helper único: lib/pdf-bloco-integro.ts.
**Why:** CEO exigiu (06/11/2026) que nenhum documento médico corte fórmula ao meio.
**How to apply:** todo gerador novo de PDF usa blocoDeveIrParaProximaPagina antes de desenhar o bloco. Carta e RAS FAP são layouts fixos (1 bloco por página), sem fluxo; Dieta usa agruparOpcoesPorPagina. Posologia: uma tomada por linha via separarTomadas (pdf-bloco-integro); rótulos Via/Forma/Posologia em EB Garamond itálico.
