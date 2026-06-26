---
name: Cockpit da Consulta + Mensageria inteligente
description: Padrões e armadilhas do Cockpit (DTO burro) e do agendador de lembretes WhatsApp por período/dia.
---

# Cockpit da Consulta (DTO burro) + Mensageria inteligente

## Cockpit re-deriva, não toca o motor
- A tela Cockpit consolida 3 colunas (Passado/Presente/Futuro) a partir de UM endpoint que chama `computeMotor`.
- `computeMotor` devolve NOMES de doenças, não ids. Para puxar itens amarrados (item_doenca: formula/injetavel/implante) o backend RE-DERIVA os ids das doenças acesas com o MESMO `gatilhoBate` exportado do motor.
- **Why:** linha vermelha do CEO — não alterar o motor de cálculo por estética/conveniência. Re-derivar com o mesmo helper mantém DRY sem mexer no motor nem expor estado interno.
- **How to apply:** se precisar de um derivado do motor que ele não expõe, reuse os helpers puros (`gatilhoBate`, `gradeDoEscore`) num passo separado; nunca adicione campos ao retorno do motor só para a tela.
- Accordions são BURROS: só renderizam `dto.futuro.*`; nenhuma regra clínica roda no frontend.

## "Finalizar e Emitir Tudo"
- Faz 3 coisas: aprova orçamentos `presented -> accepted` (preenche acceptedAt), agenda lembretes e dispara WhatsApp (fallback link quando Twilio sem secret).
- PDF consolidado da consulta é gerado on-demand por GET `/cockpit/:id/pdf` (pdf-lib); o POST emitir retorna o `pdfUrl`, não o binário.

## Agendador de lembretes (mensageria_lembrete)
- Recorrência NATIVA sem cron externo: um worker chama POST `/mensageria/processar`; fórmula/injetável se reagendam (diário/semanal), exame é envio único (vira `enviado`).
- `proximoEnvio` ancora no fuso da clínica (BRT, UTC-3): hora local do período (manhã 8 / tarde 14 / noite 20) + 3h vira hora UTC. Para dia da semana, comparar o getUTCDay do horário deslocado -3h.
- **ARMADILHA durável:** `agendarLembretes` faz idempotência por "DELETE status=agendado + reinsert". Se outra origem (campanha, outro fluxo) também gravar lembretes `agendado` do mesmo cliente, esse delete os apaga junto.
- **How to apply:** antes de abrir o agendador a outras origens, escopar o delete por origem/campanha (ex.: coluna `origem` ou `campanhaId`), nunca apagar todo `status=agendado` do cliente.
