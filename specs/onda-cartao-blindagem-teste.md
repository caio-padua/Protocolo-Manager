# Spec — Onda "Cartão + Blindagem + Teste" (A + B + C)

Status: EM APROVAÇÃO (Fase 1 do Paxter Loop). Data: 03/07/2026.
Decisão do CEO: cartão pela FATURA HOSPEDADA do Asaas (nunca coletar cartão na nossa tela).

## Objetivo (uma frase)
Dar ao cliente pagamento no cartão (via fatura hospedada do Asaas), blindar o caso "cliente fechou tudo depois de pagar" com aviso por WhatsApp, e cobrir o fluxo de recuperação com verificação real.

---

## Contexto do que JÁ EXISTE (não refazer)
- A lib `asaasCreateCharge` já aceita `billingType: "PIX" | "UNDEFINED"`; `"UNDEFINED"` abre a fatura hospedada (cliente escolhe PIX/cartão/boleto).
- O e-mail de chegada (Bloco C) já leva o link da página de status (`statusUrl` → `agendar/status/:id?t=`).
- A confirmação server-side (webhook Asaas → finalize) já é idempotente (advisory lock + `finalizedAt`) e vale para qualquer meio de pagamento.
- A tela de pagamento já tem os estados honestos R1/R2/R4 (pago/confirmando, botão Recuperar, sucesso com tabela) e R9 (status expirado + fallback).

---

## BLOCO A — Cartão de crédito via fatura hospedada do Asaas

Requisitos:
- R-A1: Na tela de pagamento do agendamento, ANTES de gerar a cobrança, o cliente escolhe o meio: "PIX" ou "Cartão de crédito".
- R-A2: PIX mantém EXATAMENTE o fluxo atual — QR embutido dentro do Paxter + copia-e-cola. Nada muda no PIX.
- R-A3: "Cartão de crédito" cria a cobrança com `billingType: "UNDEFINED"` e abre a fatura hospedada do Asaas (`invoiceUrl`) em nova aba. Nunca coletamos número de cartão na nossa tela.
- R-A4: A rota `POST /scheduling/requests/:id/concierge-charge` passa a aceitar o meio escolhido (campo `method: "pix" | "card"`, validado por Zod) e repassa o `billingType` correto ao Asaas. Default seguro = PIX (mantém compatibilidade com quem já chama sem o campo).
- R-A5: Depois de abrir a fatura de cartão, a tela do Paxter mostra o estado honesto "Aguardando a confirmação do pagamento..." e faz o mesmo polling; ao confirmar, segue para o sucesso (reaproveita R1/R4). Botão "Já paguei, verificar agora" continua disponível.
- R-A6: O webhook + finalize confirmam cartão igual ao PIX — nenhuma mudança no motor de confirmação.
- R-A7: Parcelamento fica a cargo da fatura hospedada do Asaas conforme a configuração da conta. A UI NÃO promete um número fixo de parcelas; texto honesto do tipo "PIX ou cartão de crédito (parcelamento na página segura do Asaas)".

---

## BLOCO B — Blindar "cliente fechou tudo" (WhatsApp de chegada)

Requisitos:
- R-B1: No finalize (quando o pagamento é confirmado), além do e-mail de chegada, enviar WhatsApp ao telefone do cliente com o mesmo link da página de status (`statusUrl`).
- R-B2: Usar o Twilio já configurado. Respeitar a janela de 24 horas do WhatsApp: se o envio não for entregue por estar fora da janela, registrar honestamente (não marcar como entregue) e não quebrar o finalize.
- R-B3: Best-effort: falha de WhatsApp NÃO derruba o finalize nem o e-mail (mesma política do e-mail de chegada). Erro registrado em coluna e/ou log.
- R-B4: Idempotência: finalize repetido NÃO reenvia WhatsApp — guardar marca de envio (coluna `arrivalWhatsappSentAt` + `arrivalWhatsappError`, espelhando `arrivalEmailSentAt`/`arrivalEmailError`).

---

## BLOCO C — Verificação real do fluxo de recuperação

Requisitos:
- R-C1: Verificar, com execução real (ferramenta de teste + screenshot), a página de status honesto (`agendar/status`) em cada estado: pago, aguardando, expirado, cancelado e fallback (status fora do mapa) — nenhuma tela em branco.
- R-C2: Verificar, com execução real, a tela de pagamento no estado "pago + falha na confirmação" mostrando o botão "Recuperar meu agendamento" (R2) e que, ao acionar, dispara nova confirmação.
- R-C3 (honestidade): NÃO existe cartão/pagamento real em teste. A verificação usa estados controlados (token de status válido para um agendamento de teste e/ou mock de resposta). Se forçar a FALHA do PATCH exigir alterar o backend, C2 reduz-se a verificação visual do botão + acionamento manual, documentado — sem inventar cobertura que não existe.

---

## Casos extremos a tratar
- Cartão: cliente abre a fatura e não paga → estado "aguardando" (polling segue); a cobrança vence → estado "expirado" (R9).
- Cartão: cliente fecha tudo após pagar → webhook confirma + e-mail (Bloco C) + WhatsApp (Bloco B).
- WhatsApp: telefone ausente/inválido ou fora da janela 24h → registrar erro, seguir sem quebrar.
- `billingType: "UNDEFINED"` tem mínimo de R$ 5,00 no Asaas — o sinal Concierge (R$ 150) está acima; ainda assim, guardar contra valor abaixo do mínimo.
- Concorrência webhook × polling → já coberto pelo advisory lock + `finalizedAt`; não regredir.

## Linhas vermelhas (NUNCA violar)
- NUNCA coletar número de cartão na tela do Paxter (evitar obrigação PCI).
- NÃO quebrar o fluxo PIX embutido existente.
- NÃO alterar o motor de confirmação idempotente (advisory lock / `finalizedAt`) além do estritamente necessário.
- Envio de e-mail e WhatsApp SEMPRE best-effort — nunca derruba o finalize.
- Em teste, NUNCA disparar cobrança, WhatsApp de produção enganoso ou transferência real.

## Definição de PRONTO
- Seletor "PIX / Cartão" na tela; cartão abre a fatura hospedada; PIX intacto (screenshot dos dois).
- Rota `concierge-charge` aceita `method` e repassa `billingType` certo (verificado por execução).
- WhatsApp de chegada com link de status enviado (best-effort, idempotente); coluna de marca criada e migrada.
- Página de status cobre todos os estados sem tela em branco (screenshot).
- Botão "Recuperar meu agendamento" aparece e aciona a reconfirmação (verificado).
- `architect` aprova requisito por requisito, zero pendência.
- Comunicação final ao CEO em Densidade B com "RESUMO EM 1 LINHA".
