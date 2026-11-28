---
name: Biblioteca de orientações — categorias, tom de voz, variáveis
description: Decisões da tela Dúvidas e Orientações (categorias, prévia, tom por clínica, marcadores)
---
Categoria/subcategoria são colunas aditivas (nulo = "Sem categoria"); o catálogo fixo vive no servidor e é espelhado na tela. Tom de voz é tabela própria por clínica (rascunho/aprovada).
**Why:** preservar registros antigos e manter o texto aprovado igual ao enviado; o tom é guia da equipe, a IA nunca redige texto ao paciente.
**How to apply:** mudar só a categoria NÃO derruba aprovação, mudar o texto derruba; campo ausente no PUT mantém o valor; marcadores `[x]`/`{{x}}` bloqueiam aprovação até existir troca por dado real no envio (ainda não existe); o envio escapa <, > e & (Telegram em HTML). "Categoria do ensaio" não foi tratada como categoria: aguarda esclarecimento do Dr. Caio.
