# Spec — Pagamento Concierge real (Asaas) com confirmação automática

Data: 30/06/2026. Autor: Dr. Replit Paxter. Decisão do CEO Dr. Caio:
"ligar o pagamento real no caminho Concierge do Dr. Caio, com confirmação automática
pelas nossas ferramentas (consulta ao Asaas em tempo real + webhook), no melhor padrão".

## Objetivo

No caminho Concierge (Entrada 3 — Dr. Caio, path=concierge), gerar uma cobrança REAL
de R$ 150,00 por paciente no Asaas (página hospedada: PIX, cartão e boleto) e só liberar
"O Encaixe" (Ato VI / horários da Helena) DEPOIS que o sistema CONFIRMAR o pagamento.
A confirmação é automática: polling da cobrança no Asaas (tempo real) + webhook quando
o segredo estiver configurado. Nunca "no fiado".

## Fora de escopo (não tocar)

- Motor de injetáveis, demais entradas (estético, assistente), fila (gratuita) do Dr. Caio.
- Telas internas de Financeiro / lançador de cobrança (já existem, requireCollaborator).
- Saques/transferências.

## Regras de negócio

1. CPF é OBRIGATÓRIO no caminho Concierge (o Asaas exige CPF para emitir cobrança).
   Se o paciente não informou no formulário, pedir o CPF na tela de pagamento antes de gerar.
2. Valor: R$ 150,00 (configurável por `getSetting("pay.conciergeValue")`, padrão 150; mínimo R$ 5,00).
3. Página de pagamento: billingType UNDEFINED (hospedada, todas as formas — máximo de recursos).
4. A cobrança fica AMARRADA à solicitação de agendamento (scheduling_requests), não polui a
   tabela de clientes (lead ainda não é cliente). Reconciliação posterior fica para outra onda.
5. Confirmação automática:
   - Polling: GET status chama `asaasGetCharge` em tempo real, mapeia e persiste em paymentStatus.
   - Webhook `/asaas/webhook` (já existe) passa a atualizar TAMBÉM scheduling_requests por charge id.
6. paymentStatus (texto): `nao_aplicavel` (default) -> `aguardando` (cobrança criada) ->
   `pago` (confirmado) | `expirado` | `cancelado`. "pago" já conta como pago no Financeiro.
7. Idempotência: gerar a cobrança uma única vez por solicitação (reusa a existente).
8. Honestidade: nunca marcar `pago` sem o Asaas confirmar. PATCH público NÃO pode alterar paymentStatus.

## Mapa de status (Asaas -> nosso)

| Asaas | Nosso |
|---|---|
| PENDING, AWAITING_RISK_ANALYSIS | aguardando |
| RECEIVED, CONFIRMED, RECEIVED_IN_CASH | pago |
| OVERDUE | expirado |
| REFUNDED, CHARGEBACK_*, DELETED | cancelado |
| (outros) | aguardando |

## Banco (lib/db scheduling_requests) — ADICIONAR colunas (zero perda)

- asaas_customer_id text
- asaas_charge_id text
- asaas_invoice_url text
- payment_amount real
- paid_at text

## Backend (artifacts/api-server, rotas públicas — fluxo /agendar é público)

1. POST /scheduling/requests/{id}/concierge-charge
   - Carrega a solicitação. Exige entrada=dr_caio, path=concierge e patientCpf (senão 400).
   - Idempotente: se já tem asaas_charge_id, devolve a cobrança existente.
   - Garante customer no Asaas (grava asaas_customer_id), cria a cobrança (valor da config),
     grava asaas_charge_id/asaas_invoice_url/payment_amount, paymentStatus="aguardando".
   - Resposta: { requestId, chargeId, invoiceUrl, amount, status }.
2. GET /scheduling/requests/{id}/payment-status
   - Sem charge: devolve { status: paymentStatus, invoiceUrl: null }.
   - Com charge: consulta `asaasGetCharge`, mapeia, persiste se mudou (paidAt quando pago),
     devolve { status, invoiceUrl, asaasStatus }.
3. Webhook: além de payments, atualiza scheduling_requests por asaas_charge_id (mesmo mapa).
4. PATCH /scheduling/requests/{id}: liberar chosenDate/chosenTime no corpo (para o confirm
   do Concierge gravar o horário no fim). paymentStatus continua server-only.

## Contrato (lib/api-spec/openapi.yaml) + codegen

- Estender schema SchedulingRequest com os 5 campos novos.
- Adicionar os 2 endpoints novos (concierge-charge, payment-status) + schemas de resposta.
- Estender UpdateSchedulingRequestBody com chosenDate/chosenTime.
- Rodar `pnpm --filter @workspace/api-spec run codegen`.

## Frontend (artifacts/padcom/src/pages/agendar.tsx — DrCaioFlow)

Fluxo Concierge: vias(verde) -> pay -> motor2 -> resultado.

1. Ao entrar em `pay` (concierge): se faltar CPF, mostrar campo CPF (obrigatório).
2. Botão "Gerar cobrança PIX de R$ 150,00": cria a solicitação (POST /scheduling/requests,
   guarda o id) e gera a cobrança (POST concierge-charge). Guardar requestId+invoiceUrl;
   rodar só uma vez.
3. Mostrar "Pagar agora" (abre invoiceUrl — página hospedada PIX/cartão/boleto) + painel de
   status AO VIVO que faz polling de /payment-status a cada ~4s.
   - aguardando: âmbar, spinner "Aguardando pagamento...".
   - pago: verde "Pagamento confirmado!" e AVANÇA sozinho para motor2.
   - Botão discreto "Já paguei, verificar agora" força um poll (não falsifica).
4. resultado: escolher horário -> "Confirmar meu horário" faz PATCH na solicitação existente
   (chosenDate/chosenTime, status="agendado"). A via fila/comum continua criando no fim (POST).

## Verificação

- typecheck por pacote (typecheck global é pré-quebrado — ver memória).
- curl dos endpoints novos (criação idempotente, status).
- screenshot da tela de pagamento (painel ao vivo).
- Ressalva honesta ao CEO: a chave Asaas é de PRODUÇÃO e só confirma PIX real no app
  PUBLICADO; no preview valida-se a montagem (estrutura/idempotência/erros), o teste de
  ponta a ponta com PIX de verdade é após publicar.

RESUMO EM 1 LINHA: cobrança PIX real amarrada à solicitação + confirmação automática
(polling Asaas + webhook), liberando o Encaixe só com pagamento confirmado.
