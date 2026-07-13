---
name: Nome interno do exame — comparar x gerar identidade
description: Por que existem duas normalizações de nome de exame e quando usar cada uma; nome interno novo é slug fatiado, existentes nunca mudam.
---

O nome de um exame passa por DUAS normalizações com papéis diferentes; confundi-las
quebra casamento ou cria duplicata.

- `chaveFaixa` = normaliza para COMPARAR/casar grafias (tira acento + minúsculo,
  mantém espaço/pontuação). Usada em todo o matching e nas chaves de faixa.
- `slugInterno` = GERA a identidade (`code`) de exames NOVOS no formato fatiado
  (hífen, sem pontuação, forma curta da molécula colada: `25-OH`/`25 OH` → `25oh`,
  vírgula entre dígitos → hífen). Ex.: "Vitamina D 25-OH (Calcidiol)" →
  `vitamina-d-25oh-calcidiol`.

**Regra:** só aplicar `slugInterno` na GERAÇÃO de identidade de exame novo
(`createDiscoveredExam`, ponto único que serve descoberta automática e triagem
"novo"). NUNCA reescrever `code` já existente (amarra milhares de linhas em
`exam_results`/`ranges`/`units`) nem tocar a semente oficial nem `chaveFaixa`.

**Why:** o `code` é a identidade opaca e permanente (o "genótipo"); o cliente vê o
`display_name` (o "fenótipo", editável). Especificidade no code separa variantes
bioquímicas (25-OH Calcidiol x 1,25-OH Calcitriol) que colidiriam num code genérico.

**How to apply:** o casamento por nome/apelido acontece ANTES de
`createDiscoveredExam`, então só grafias genuinamente novas chegam ao gerador — por
isso o formato novo (com hífen) não duplica os exames antigos (com espaço). Ao colar
forma curta, limitar a 1-3 letras + limite de palavra, senão cola indevidamente
palavra longa ("B12 Cobalamina") ou unidade ("25 nmol").
