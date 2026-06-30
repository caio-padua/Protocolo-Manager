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
