---
name: Cockpit sincroniza lembrete a partir da anamnese, não do protocolo
description: Por que /cockpit/:id/emitir pode devolver formulas:0/periodos:0 mesmo com protocolo ativo
---

Regra: `POST /api/cockpit/:clientId/emitir` monta os períodos do lembrete rico
(`lembretes_prescricao`) a partir do **motor de anamnese** — itens amarrados às
doenças "acesas" do cliente (`item_doenca` via `doencasAcesasIds`) + exames do
motor. Ele NÃO lê os `protocol_items` do protocolo criado.

**Consequência:** um cliente com protocolo ativo mas SEM respostas de anamnese
que acendam doenças recebe `lembretes:{formulas:0, periodos:0, ativo:false}` no
emitir, e o cron de lembrete por período não tem o que disparar. O WhatsApp de
resumo do cockpit sai mesmo assim (é texto fixo, não depende dos períodos).

**Why:** as fórmulas/injetáveis do lembrete vêm da prescrição clínica derivada da
anamnese (motor), não do agendamento de aplicações do protocolo. São dois eixos
distintos do sistema.

**How to apply:** para demonstrar/enviar os lembretes de período (fórmulas), é
preciso popular os `periodos` do lembrete — ou via anamnese real, ou via
`PATCH /api/lembretes/:clienteId` com `periodos` ricos — antes de esperar envio.
Não confundir "protocolo validado com sessões" com "lembrete de prescrição ativo".
