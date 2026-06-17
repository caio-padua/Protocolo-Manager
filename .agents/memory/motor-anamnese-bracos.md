---
name: Motor da anamnese - bracos exames/formulas/injetaveis
description: Estado dos bracos do motor (anamnese -> exames/formulas/injetaveis) e pre-requisito antes de ativar formulas/injetaveis
---

Hoje o motor (computeMotor, no anamnese-portal submit) gera EXAMES sozinho. FORMULAS e INJETAVEIS ficam PRE-CABEADOS: as tabelas e chaves existem (item_doenca: doenca_id_ihe -> item_ref) mas o motor ainda nao faz o join no submit.

Decisao do CEO (Dr. Caio): manter pre-cabeado; ativar em onda futura, nao agora.

**Pre-requisito antes de ligar a chave (gotcha):** item_doenca.item_ref e GENERICO. Antes de o motor rotear para o catalogo certo, e preciso saber se o ref e formula, injetavel ou implante (catalogo_formulas / catalogo_injetaveis / catalogo_implantes). Sem o tipo do item, o motor erra de catalogo.

**Why:** sem distinguir o tipo, um unico item_ref nao tem como mapear ao catalogo correto, e a sugestao sairia errada em producao.

**How to apply:** quando for ativar os bracos laranja, primeiro adicionar/definir o tipo do item em item_doenca; e (divida ja conhecida) migrar a ligacao doenca->exame de TEXTO (bloco_motor "B1/B2") para id.
