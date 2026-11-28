# WhatsApp por QR Code (Evolution API) — provisório

Canal NÃO oficial. Convive com o Twilio oficial e o Telegram (nenhum foi alterado).

## O que existe
- Configuração por clínica (endereço https, nome da instância, chave). A chave e o token do webhook ficam no cofre cifrado, com o id da clínica na chave. A tela nunca recebe a chave.
- Anti-SSRF: endereço interno ou que resolva para IP privado é recusado.
- Conexão consultada ao vivo; estados: não configurado, sem chave, servidor inacessível, chave recusada, instância inexistente, resposta inesperada, desconectado, conectando, conectado.
- QR Code só aparece se o servidor o entregar.
- Webhook público `/api/evolution/webhook/:empresaId/:token`: token por clínica (403 sem efeito se errado); instância do evento precisa ser a da clínica; só registra texto recebido (grupos, mídia e mensagens do próprio celular ignorados); NUNCA responde nem espelha.
- Envio só por ação humana, um destinatário por vez, só com celular conectado, máx. 10/min por clínica. Resposta só a quem já escreveu. Teste isolado: administrador, número único, confirmação explícita.
- Status: aceito (servidor recebeu) → enviado → entregue → lido; falha não apaga entrega. "Entregue" só vem do webhook.
- Tela: Comunicação > WhatsApp por QR Code.

## Dependências reais (nada disso foi contratado)
1. Servidor Evolution já existente, com https e a instância criada.
2. Chave de acesso da instância, digitada na tela.
3. Endereço público da API (REPLIT_DOMAINS ou PUBLIC_API_BASE_URL) para o webhook; botão "Registrar webhook no servidor".
4. Celular lendo o QR Code.

## Limites
- Testado só com simulação (sem servidor Evolution disponível). Formato das respostas do Evolution (v2) foi implementado conforme a documentação e precisa ser confirmado no primeiro teste real.
- Risco de banimento do número (uso não oficial). Sem mídia, sem grupos.
