---
name: Modelos de orientação carregados como dado, nunca como código
description: Como os modelos de mensagem da clínica foram carregados e o que ainda não está ligado ao envio
---
Os 28 modelos (apresentação, médico, cadastro, agenda, documentos, orçamento, dúvidas) foram gravados em orientacoes_aprovadas da clínica pela API (POST), sempre como rascunho; o catálogo de categorias é aditivo e espelhado em servidor e tela.
**Why:** o Dr. Caio exige nada hardcoded, tudo editável na tela, e aprovação clínica só pelo médico.
**How to apply:** nunca criar texto de mensagem em arquivo de código nem aprovar por script. Marcadores [x] bloqueiam aprovação; a troca por dado real (nome, horários da agenda, cadastro) no envio ainda NÃO está ligada. Em teste por API, o id vem como texto (bigint): comparar com String, e não rodar PUT de teste sobre modelo real sem restaurar.
Envio pelo cockpit pausa a IA no cliente; devolver-ia restaura. Aceite do Telegram (sent:true) não prova leitura.
