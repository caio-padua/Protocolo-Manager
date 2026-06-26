---
name: Motor da anamnese - bracos exames/formulas/injetaveis
description: Estado dos bracos do motor (anamnese -> exames/formulas/injetaveis) e pre-requisito antes de ativar formulas/injetaveis
---

Hoje o motor (computeMotor, no anamnese-portal submit) gera EXAMES sozinho. FORMULAS e INJETAVEIS ficam PRE-CABEADOS: as tabelas e chaves existem (item_doenca: doenca_id_ihe -> item_ref) mas o motor ainda nao faz o join no submit.

Decisao do CEO (Dr. Caio): manter pre-cabeado; ativar em onda futura, nao agora.

**Correcao (26/06/2026 - confiar no codigo, nao na nota antiga):** o campo `item_doenca.item_tipo` JA EXISTE (valores hoje: formula | injetavel | implante | substance) ao lado de `item_ref`. A nota antiga dizia "falta o tipo" - estava desatualizada. O tipo esta la; quem roteia ao catalogo certo e o item_tipo.

**O que realmente falta para ligar a chave:** (1) o motor fazer o JOIN no submit (anamnese-portal computeMotor so gera EXAMES hoje; nao consulta item_doenca para formula/injetavel/implante); (2) estender os valores de `item_tipo` (e de `motor_sugestao_item.tipo` e `motor_regras.segmento`, todos `text` livre) para incluir dieta/treino quando esses orgaos nascerem.

**Why:** o roteamento por catalogo depende do item_tipo (ja presente); o que impede a sugestao sair e a ausencia do join no submit, nao a ausencia do campo.

**How to apply:** ao ativar os bracos, implementar o join por item_tipo no computeMotor; e (divida ja conhecida) migrar a ligacao doenca->exame de TEXTO (bloco_motor "B1/B2") para id.
