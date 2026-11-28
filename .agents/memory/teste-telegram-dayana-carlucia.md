---
name: Teste real Telegram com Dayana e Carlúcia
description: Como enviar o primeiro contato de teste pelo sistema e quais listas de autorização existem
---
Envio de teste usa POST /api/comunicacao/enviar-teste (dono da plataforma, login normal com o login de reserva do operador) e modelo do catálogo (atendimento_menu); nada de texto escrito no código.
Três listas distintas em app_settings: comunicacao.teste.permitidos (envio padronizado), atendimento.ia.permitidos (resposta automática, modo lista), lembrete.telegram.permitidos. Estar em uma não coloca em outra.
**Why:** o envio de teste recusava clientes fora da lista própria, mesmo estando na lista da resposta automática.
**How to apply:** o envio pelo Cockpit pausa a resposta automática do cliente; para testar a resposta automática, enviar pela rota padronizada, não pelo Cockpit.
