---
name: Concierge antecipa a janela natural
description: Regra de negócio do fluxo Dr. Caio (entrada 3) — onde o piso de 3 meses vale e onde não vale.
---

# Concierge antecipa a janela natural (piso de 3 meses)

Regra: no fluxo Dr. Caio (entrada 3), o piso de 3 meses é a "janela natural" da FILA,
não da data desejada.

- `earliestDate` (data DESEJADA do paciente) é SEMPRE livre — é só um desejo, e o
  Concierge existe justamente para atender ANTES dessa janela. Nunca aplicar piso nela.
- `path === "concierge"` é ISENTO do piso (paga a prioridade para furar a fila).
- `path === "fila"` é a janela natural: a vaga REALMENTE marcada (`chosenDate`) tem de
  cair a partir de hoje + 3 meses. `chosenDate` e `chosenTime` são OBRIGATÓRIOS no
  servidor (não confiar no cliente), senão dá para burlar o piso mandando fila sem vaga.

**Why:** o backend antigo floorava `earliestDate >= +3 meses` para todo `dr_caio`, o que
quebrava a geração da cobrança Concierge (erro 400 "A data do Dr. Caio só pode ser a
partir de 3 meses") — o paciente queria data próxima, que é exatamente o produto do
Concierge. Mover o piso para `chosenDate` da fila preserva a regra sem bloquear o produto.

**How to apply:** ao mexer na validação de `POST /scheduling/requests` (entrada dr_caio),
nunca refloorar `earliestDate`; manter chosenDate+chosenTime obrigatórios na fila e o piso
mandatório sobre a vaga marcada.

## Camada visual do fluxo Dr. Caio (farol/vias)

Regra: a página `/agendar` é TEMA por estado (`isDark`/`isLight`) e NÃO coloca a classe
`.dark` no DOM — ela tinge tudo por ternário `isDark ? ... : ...`. Logo as classes 3D da
skill (`panel-3d`/`bevel-3d`/`concave-3d`), que só viram navy dentro de um ancestral `.dark`,
ficam na variante CLARA por padrão.

- Para usar o relevo navy num bloco do tema escuro, envolver o bloco em `<div className={isDark ? "dark" : ""}>`.
  É seguro aqui porque o conteúdo usa ternário `isDark`, não utilitários `dark:` — o wrapper
  não duplica o flip de cor de texto, só resolve a variante das classes 3D.
- Espera (motor1/motor2/vias antes de liberar) deve OCUPAR a tela do celular (CEO não tolera
  "faixa inferior vazia esperando"): o `TernoFarol` tem prop `fill` → `min-h-[calc(100dvh-Nrem)]`.
  O subtraendo é calibrado a olho (frágil entre devices/safe-area); conferir em mobile real.
- As duas vias (Concierge e comum) são EQUILIBRADAS: mesmo `panel-3d` + `panel-3d-active`, sem
  star/checkmark/ícone afirmativo — qualquer sinal de "preferência" entre elas é reprovado pelo CEO.
