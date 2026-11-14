---
name: Crédito pré-pago da mensageria (pay per use)
description: Regras comerciais e de integridade do saldo por clínica no Telegram; o que está ligado e o que falta.
---
Comunicação é inclusa no PaxMed; cobra-se só uso (recebida, enviada, solucionada); tempo existe desligado. Saldo por clínica, nunca negativo, idempotente por chave, Instituto (empresa 5) isento explicitamente.

**Why:** Dr. Caio cobra das clínicas licenciadas por uso e não paga o uso delas; nenhum preço pode ser inventado (sem tarifa = valor 0 marcado sem_tarifa). Uma proposta comercial não é autorização para começar a debitar.

**How to apply:**
- Todo evento tarifado passa por registrarEvento (lib/mensageria-credito) com chave estável; "enviada" só depois de envio real aceito (nunca simulado/falho).
- Tarifa proposta deve nascer inativa; só ativação explícita do CEO pode habilitar cobrança, e a ativação fica bloqueada em produção até haver autorização de entrada em operação.
- Custo de provedor de IA vai em tabela à parte, nunca no saldo; sem valor informado fica vazio.
- Recarga só credita ao confirmar; confirmação de teste não vale para recarga real.
- Auditoria: Telegram só usa 1 IA real (Anthropic, escolha de orientação aprovada); visitante e agendamento são regras fixas. ai_usage_log antigo não cobria Telegram.
- Tela da clínica deve mostrar somente contrato, saldo, tarifas vigentes, recargas e extrato; custos internos e margens ficam restritos ao CEO.
- Antes de integrar Asaas, usar chave, host e webhook próprios do sandbox; nunca reaproveitar credencial ou histórico de produção.

## Separação e recuperação financeira
Teste e operação real não podem compartilhar saldo, extrato, tarifa, franquia, custo ou pendência da mesma clínica.
Histórico sem procedência comprovada não pode ser convertido automaticamente em dinheiro real nem liberar mensagens.

**Why:** a autorização do piloto exige dados exclusivamente sintéticos e preservação dos registros; a simples marcação de uma recarga como teste não torna seu destino financeiro seguro.

**How to apply:** conferir o ambiente em todas as etapas e conciliar manualmente qualquer legado ambíguo, sem apagar, recalcular ou classificar saldos por suposição.

Confirmar o pagamento e retomar o atendimento são etapas recuperáveis separadas; a falha da segunda não exige outra compra.

**Why:** uma resposta perdida ou uma falha transitória após o crédito não pode gerar nova cobrança nem deixar a clínica dependente de intervenção no código.

**How to apply:** a reentrega válida da mesma confirmação tenta a recuperação, sem repetir crédito ou consumo; a retomada exige procedência da própria clínica e ambiente.

**Asaas produção recusa cobrança abaixo de R$ 5,00** (inclusive centavos/PIX). Teto autorizado pelo titular para testes reais é R$ 1,00: logo teste real em produção é inviável; só sandbox. Nunca subir o teto sem ordem.

**Conciliação Asaas**: cobranças do Concierge ficam em scheduling_requests, não em payments; ler as duas fontes. Webhook de produção do Asaas foi achado apontando ao domínio de desenvolvimento, desabilitado/interrompido e sem authToken: eventos de pagamento não chegam; religar pode reentregar eventos antigos, então só com ordem do titular.
