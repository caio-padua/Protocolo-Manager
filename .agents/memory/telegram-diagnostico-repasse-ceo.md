---
name: Telegram — chat do CEO, repasse e telas de status
description: Decisões e armadilhas do canal Telegram do Instituto (repasse ao CEO, status honesto, ambiente do webhook)
---
- O bot tem UM webhook; ele aponta para o ambiente que o registrou (desenvolvimento ou Railway). Conferir getWebhookInfo antes de afirmar onde o recebimento acontece.
- O chat do CEO no cofre (`telegram.ceoChatId`) era o chat da conta da clínica, que também está vinculado a um cliente: repasse ao CEO ao receber dessa conta vira eco. O repasse agora é omitido quando remetente == chat do CEO.
- Contato pessoal do Dr. Caio = chat terminado em 0612 (confirmado pelo CEO em captura, 13/11/2026); clínica = outro chat. Dois cadastros "Caio" existem; NÃO mesclar nem alterar vínculos sem ordem.
**Why:** a Central de Auditoria mostrou "Token não configurado" por chamar rota protegida sem credencial e ler campo inexistente; erro de acesso nunca pode virar "não configurado".
**How to apply:** nova tela de status deve enviar credencial e separar erro de "não configurado"; repasse ao CEO sempre registra o resultado do envio (entregue/simulado/recusado) e escapa HTML.
