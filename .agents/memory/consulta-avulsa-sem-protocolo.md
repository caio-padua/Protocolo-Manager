---
name: Consulta avulsa (sessão sem protocolo)
description: Como a agenda marca consulta sem protocolo e quais consumidores de sessions.protocol_id precisam tolerar NULL.
---
Consulta avulsa = linha em `sessions` com `protocol_id` NULL, criada só por caminho explícito (`bookSession` com `consultaAvulsa:true`, rota `POST /agenda/book-avulsa`). Nunca inferir avulsa da falta de protocolId (área do paciente continua exigindo protocolo ativo).

**Why:** o CEO pediu marcação independente de protocolo sem inventar substâncias nem mexer em regras clínicas; sobreposição fica BLOQUEADA até existir política de compartilhamento.

**How to apply:**
- Todo código novo que leia `sessions.protocolId` deve tratar NULL (sem protocolo, sem itens constantes, sem substâncias). Consumidores com INNER JOIN em protocols (aviso de aplicação) ou exigência de protocolo (confirmação do cliente, avaliação de enfermagem, RAS, envio manual ao Google) recusam avulsa de propósito.
- Guarda de escrita da agenda (`agendaWriteGuard`) usa regex de caminho: rota nova de marcação precisa entrar nela, senão fica sem autenticação.
- Remarcar avulsa mantém a duração exata; visita de protocolo continua arredondada por períodos.
- Migração do NOT NULL é só desenvolvimento (arquivo em scripts/migrations, fora de scripts/migrations.sql) até ordem escrita.
