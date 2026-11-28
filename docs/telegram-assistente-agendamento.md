# Assistente virtual de agendamento no Telegram

Estado em 14/11/2026. Ambiente de desenvolvimento apenas. Nada publicado, nenhum envio em massa.

## O que funciona (provado)
- Cliente cadastrado e autorizado (ids 44 e 1924): conversa em etapas (online ou presencial, dias, período), oferece só horários livres do motor da agenda e grava a reserva real. Prova: reserva criada e cancelada no banco de desenvolvimento (cancelamento pelo próprio motor).
- Visitante sem cadastro: nunca recebe reserva. Gera "pedido de agendamento" (tabela telegram_pedidos_agendamento) e avisa a equipe. Prova: conversa completa simulada com transporte simulado.
- Queixa de saúde: nunca tratada pela assistente; vai para a equipe.
- Central Telegram: seção "Quem ainda não é cliente" (rota GET /api/telegram-inbox/visitantes, 200 com token e 401 sem).
- Guia Digital: botão "Somente Telegram" na tela Guia Digital (independe de telefone e WhatsApp).
- Lembretes por Telegram: motor existente, modo "lista" para 44 e 1924; versículo só aos sábados (regra existente em mensageria-paxmed).

## Configuração (app_settings, desenvolvimento)
- atendimento.ia.modo = lista; atendimento.ia.permitidos = [44,1924]
- atendimento.visitantes.permitidos = lista de chat ids de visitantes (vazia: visitante recebe o comportamento antigo)
- lembrete.telegram.modo = lista; lembrete.telegram.permitidos = [44,1924]

## Como testar de verdade
1. Do celular autorizado, escrever "quero marcar uma consulta" para @paduaclinica_bot.
2. A resposta chega em até 1 minuto (o api-worker envia).
3. Conferir em Agenda e na Central Telegram.
Depende de: webhook apontando para este ambiente (um webhook por ambiente) e api-worker ligado.

## Não provado
- Ida e volta real no Telegram (precisa de pessoa).
- Instalação do aplicativo no iPhone.
- Publicação: endereço público devolve 404 (hasSuccessfulBuild=false). Correção preparada em .replitignore, falta publicar.
