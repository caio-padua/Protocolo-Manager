---
name: Direção do exame (fonte de verdade)
description: Onde mora "o que é bom" em cada exame e a regra de espelho front/back das faixas.
---

A direção favorável de um exame ("quanto maior melhor" / "quanto menor melhor" / "meio é o bom")
mora em `direcao_favoravel_exame`, casada por NOME NORMALIZADO (sem acento, trim, upper), NÃO em
`exam_analyte_catalog` (esse ficou como compat legado, frequentemente vazio).

**Vocabulário duplo:** a tabela guarda no dialeto IHE (`SUBIR_BOM|DESCER_BOM|ALVO`); `zones.ts`
`resolveDirection` também aceita os sinônimos `SUPERIOR/INFERIOR/MEDIO/TARGET/higher_better/...`.

**Espelho obrigatório:** o rótulo das 5 faixas existe em DOIS lugares que precisam bater —
`LABELS_BY_DIRECTION` (backend, `zones.ts`) e `FAIXAS_POR_DIRECAO` (front, `DirecaoExamesTool.tsx`).
Mexeu num, mexa no outro. Rótulo canônico da faixa "meio-baixo saudável" = **ACEITÁVEL** (era
"SUFICIENTE" antes de 11/07/2026).

**Why:** o motor de evolução (5 faixas) lê a direção de `direcao_favoravel_exame`; gravar só no
catálogo não muda nada na tela. E rótulo divergente entre front/back confunde o CEO na conferência.

**How to apply:** ao editar direção, use `PUT /exames-lab/faixas` (upsert por nome normalizado) e
confirme por `GET /exames-lab/direcoes`. A ferramenta de edição é o componente compartilhado
`DirecaoExamesTool`, usado no menu Cadastros (`/cadastros/direcao-exames`) e embutido no Cockpit.
