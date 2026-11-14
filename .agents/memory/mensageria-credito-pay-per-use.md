---
name: Crédito pré-pago da mensageria (pay per use)
description: Regras comerciais e de integridade do saldo por clínica no Telegram; o que está ligado e o que falta.
---
Comunicação é inclusa no PaxMed; cobra-se só uso (recebida, enviada, solucionada); tempo existe desligado. Saldo por clínica, nunca negativo, idempotente por chave, Instituto (empresa 5) isento explicitamente.

**Why:** Dr. Caio cobra das clínicas licenciadas por uso e não paga o uso delas; nenhum preço pode ser inventado (sem tarifa = valor 0 marcado sem_tarifa).

**How to apply:**
- Todo evento tarifado passa por registrarEvento (lib/mensageria-credito) com chave estável; "enviada" só depois de envio real aceito (nunca simulado/falho).
- Custo de provedor de IA vai em tabela à parte, nunca no saldo; sem valor informado fica vazio.
- Recarga só credita ao confirmar; confirmação de teste não vale para recarga real.
- Auditoria: Telegram só usa 1 IA real (Anthropic, escolha de orientação aprovada); visitante e agendamento são regras fixas. ai_usage_log antigo não cobria Telegram.
- Pendente: tela da clínica, gateway de pagamento real, tarifas, roteamento de canal/bot por clínica (visitante ainda cai na empresa 5 fixa).
