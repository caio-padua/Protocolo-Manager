# Spec — Ligar o Asaas (cobrança avulsa + assinatura dos Círculos PAXTER)

Status: ESPECIFICANDO (Paxter Loop, fase 1). Escopo aprovado pelo CEO em 26/06/2026: opção **B**
(cobrança avulsa PIX/boleto/cartão + assinatura mensal automática dos Círculos PAXTER).

Asaas = gateway de pagamento brasileiro (PIX, boleto, cartão). Não é integração nativa do Replit:
é integração própria via chave de API (sigla API = Interface de Programação de Aplicações, o "encaixe"
por onde dois sistemas conversam). A chave fica em cofre de segredos (`ASAAS_API_KEY`), nunca no código.

---

## 1. Objetivo (uma frase)

Permitir que o sistema gere cobranças reais (PIX, boleto, cartão) por lançamento financeiro e
assinaturas mensais automáticas para os Círculos PAXTER, com o Asaas confirmando o pagamento
sozinho (webhook) e atualizando o status no app — começando em ambiente de teste (sandbox).

---

## 2. Conceitos do Asaas (glossário — explicar toda sigla)

| Termo Asaas | O que é, em português |
|---|---|
| Customer | O cliente cadastrado no Asaas (precisa existir lá para receber cobrança) |
| Cobrança (payment) | Uma cobrança avulsa (uma vez só) — gera PIX, boleto ou cartão |
| Assinatura (subscription) | Cobrança que se repete sozinha todo mês (usada nos Círculos) |
| billingType | Forma de pagar: `PIX`, `BOLETO`, `CREDIT_CARD` |
| Webhook | O Asaas chama uma URL nossa quando o status muda (ex.: "foi pago") |
| Sandbox | Ambiente de teste com dinheiro de mentira (`https://sandbox.asaas.com`) |
| Produção | Ambiente real com dinheiro de verdade (`https://api.asaas.com`) |

---

## 3. Requisitos exatos (numerados, sem ambiguidade)

### 3.1 Configuração e segurança
1. A URL base do Asaas vem de variável de ambiente `ASAAS_BASE_URL` (default sandbox), e a chave
   de `ASAAS_API_KEY` (segredo). Trocar para produção = trocar essas variáveis, sem mexer no código.
2. O webhook valida o cabeçalho `asaas-access-token` contra o segredo `ASAAS_WEBHOOK_TOKEN`; se não
   bater, responde 401 (não confiar em chamada anônima).
3. Nenhuma chave/segredo aparece no frontend, em log, nem é commitada.
4. Cliente de API criado fresco a cada uso (sem cache de token); singleton de configuração só lê env.

### 3.2 Sincronização de cliente (Customer)
5. Antes da primeira cobrança/assinatura de um cliente, criar (ou reaproveitar) o Customer no Asaas
   a partir dos dados já existentes do `clients` (nome, CPF, e-mail, telefone).
6. Guardar o id do Customer na tabela `clients` em nova coluna `asaasCustomerId`; se já existir, não
   recriar (idempotente — repetir não duplica).

### 3.3 Cobrança avulsa (parte A) — caminho principal: PÁGINA HOSPEDADA (clica e paga)
7. Na tela de detalhe do cliente, aba Financeiro, ao criar um lançamento o operador escolhe
   **"Cobrar pelo Asaas"**. A forma de pagamento é decidida pelo CLIENTE na página segura do Asaas
   (PIX, boleto E cartão na mesma página) — não travamos uma única forma, para não perder fonte.
8. Ao cobrar: cria a cobrança no Asaas e salva no `payments` o id (`asaasChargeId`) e o LINK DA
   PÁGINA DE PAGAMENTO certificada (`asaasInvoiceUrl`).
9. O caminho principal do cliente é UM botão **"PAGAR"** que abre a página certificada do Asaas
   (`invoiceUrl`), onde ele paga cartão/PIX/boleto sem copiar e colar nada. QR Code e "copia e
   cola" do PIX são apenas alternativa secundária (guardados em `pixQrCode`/`pixCopyPaste`, exibidos
   só se o cliente pedir), NUNCA o caminho principal.
10. Cartão parcelado via Asaas: até 21x (Visa/Mastercard) e 12x demais bandeiras, conforme a
    plataforma (decisão do CEO em 26/06/2026: usar o melhor parcelamento disponível). O lançamento
    manual existente mantém seu limite atual; a regra de 21x vale só para o caminho Asaas.

### 3.4 Confirmação automática (webhook) — parte A
11. Rota `POST /api/asaas/webhook` recebe eventos do Asaas. Ao evento de pagamento confirmado
    (`PAYMENT_RECEIVED` / `PAYMENT_CONFIRMED`), encontra o `payments` pelo `asaasChargeId` e marca
    `status = "paid"` e `paidAt` = data do evento.
12. Eventos de vencido (`PAYMENT_OVERDUE`) marcam `status = "overdue"`; estorno/cancelamento marcam
    `cancelled`. Evento de cobrança desconhecida não derruba a rota (responde 200 e ignora).
13. O webhook é idempotente: receber o mesmo evento duas vezes não corrompe nada.

### 3.5 Círculos PAXTER — planos e assinatura (parte B)
14. Nova tabela `membership_plans` (planos dos Círculos): `tier` (bronze/ouro/platina/noir), `name`,
    `monthlyValue` (real), `description`, `active`. Os 4 planos são editáveis (preço definido pelo CEO).
15. Nova tabela `memberships` (assinatura de um cliente a um Círculo): `clientId`, `planId`/`tier`,
    `asaasSubscriptionId`, `monthlyValue`, `billingType`, `status` (active/overdue/cancelled),
    `nextDueDate`, `startedAt`. Um cliente tem no máximo uma assinatura ativa por vez.
16. Tela para: (a) configurar os 4 planos (valor/descrição); (b) assinar um cliente a um Círculo
    escolhendo a forma de pagamento; (c) ver/cancelar a assinatura.
17. Ao assinar: garante o Customer (req. 5-6), cria a `subscription` mensal no Asaas (cycle MONTHLY),
    salva `asaasSubscriptionId` e `nextDueDate`.
18. Cancelar a assinatura no app cancela também no Asaas.

### 3.6 Confirmação automática (webhook) — parte B
19. Quando o webhook recebe pagamento de uma cobrança gerada por assinatura, além de registrar o
    pagamento, atualiza o `memberships.status = "active"` e o `nextDueDate`. Vencido → `overdue`.

### 3.7 REGRA DE OURO (menu) — toda ferramenta tem entrada
20. Menu lateral ganha entrada **"Assinaturas (Círculos)"** levando à tela de assinaturas/planos.
21. A cobrança avulsa Asaas mora dentro do fluxo já existente de Financeiro do cliente (não precisa
    de item de menu próprio, pois é ação dentro de uma tela que já tem menu).

### 3.8 Visão do cliente (somente leitura)
22. Na Área do Cliente / portal, o cliente vê suas cobranças em aberto, cada uma com UM botão
    **"PAGAR"** que abre a página certificada do Asaas — apenas para pagar, sem criar nem editar
    nada (sem nova superfície de escrita com PII).

### 3.9 Experiência premium do cliente — "Central de Pagamentos PAXTER"
23. Caminho de UM clique: em todo lugar onde aparece uma cobrança (Área do Cliente, e-mail,
    WhatsApp), o botão **"PAGAR"** leva direto à página certificada do Asaas. O cliente NUNCA copia
    e cola, NUNCA digita chave; ele clica e paga.
24. Pagar o que está atrasado: a Central lista as cobranças em aberto E as vencidas (overdue), cada
    uma com "PAGAR". Cobrança vencida pode ser paga no cartão (parcelado) na própria página.
25. "PAGAR TUDO": opção que soma as cobranças em aberto/vencidas do cliente numa única ida à página
    de pagamento (gerando uma cobrança consolidada quando fizer sentido), para quitar de uma vez.
26. Cofre de cartão (1 clique futuro): quando o cliente já pagou de cartão uma vez, oferecer salvar
    o cartão no cofre do Asaas (tokenizado, fora do nosso servidor) para o próximo pagamento ser de
    um toque. Opcional e com consentimento.
27. Envio do link: botão para enviar o link "PAGAR" por WhatsApp e por e-mail ao cliente, com a
    marca PAXTER.
28. Certificação: o cartão é digitado SOMENTE na página certificada do Asaas (PCI DSS = Padrão de
    Segurança de Dados da Indústria de Cartões). O dado do cartão NUNCA passa pelo nosso servidor.

---

## 4. Modelo de dados (resumo das mudanças)

| Tabela | Mudança |
|---|---|
| `clients` | + coluna `asaasCustomerId` (text, opcional) |
| `payments` | + `asaasChargeId`, `asaasInvoiceUrl`, `pixQrCode`, `pixCopyPaste`, `boletoUrl`, `billingType` (todas text, opcionais) |
| `membership_plans` (nova) | `id`, `tier`, `name`, `monthlyValue`, `description`, `active`, `createdAt` |
| `memberships` (nova) | `id`, `clientId`, `tier`, `asaasSubscriptionId`, `monthlyValue`, `billingType`, `status`, `nextDueDate`, `startedAt`, `createdAt` |

Todas as colunas novas em tabela já populada entram como opcionais (nullable) para não quebrar o
push (lição de memória: notNull em tabela populada exige truncate/ALTER prévio).

---

## 5. Fluxo (blueprint)

Cobrança avulsa:
```
Operador no detalhe do cliente -> "Cobrar pelo Asaas" (PIX/boleto/cartão)
   -> garante Customer no Asaas -> cria cobrança -> salva ids/QR no payments
   -> tela mostra QR/linha/link
Cliente paga -> Asaas chama POST /api/asaas/webhook -> acha por asaasChargeId
   -> marca payments.paid + paidAt
```

Assinatura (Círculo):
```
Operador -> "Assinaturas (Círculos)" -> escolhe cliente + Círculo + forma
   -> garante Customer -> cria subscription MONTHLY no Asaas -> salva memberships
Todo mês o Asaas gera a cobrança e, ao pagar -> webhook -> atualiza membership/nextDueDate
```

---

## 6. Casos extremos a tratar

| Caso | Tratamento |
|---|---|
| Cliente sem CPF/e-mail válido | Bloquear a cobrança com mensagem clara (Asaas exige dados do Customer) |
| Asaas fora do ar / erro de rede | Não marcar como pago; mostrar erro honesto; não criar registro fantasma |
| Webhook chega antes de salvarmos o id | Responder 200 e ignorar; o Asaas reenvia (idempotência) |
| Webhook duplicado | Idempotente: status já correto, não duplica pagamento |
| Token de webhook errado | 401, não processa |
| Cobrança criada mas falha ao salvar no banco | Logar com o id retornado para conciliação manual (não perder o id) |
| Cliente já tem assinatura ativa | Não criar segunda; oferecer trocar/cancelar a atual |
| Sandbox x produção | Só variáveis de ambiente decidem; nunca hardcode de URL/chave |

---

## 7. Definição de PRONTO (qualquer um confere)

| Critério | Como conferir |
|---|---|
| Botão "PAGAR" abre a página certificada do Asaas (cliente paga cartão/PIX/boleto sem copiar e colar) | runtime + screenshot |
| Central de Pagamentos lista cobranças em aberto E vencidas, com "PAGAR" e "PAGAR TUDO" | runtime + screenshot |
| Pagamento simulado no sandbox cai via webhook e vira "paid" sozinho | runtime (log do webhook + status muda) |
| Assinatura de um Círculo criada no sandbox com cobrança mensal | runtime + registro em `memberships` |
| Entrada de menu "Assinaturas (Círculos)" existe e abre a tela (REGRA DE OURO) | abrir o menu |
| Nenhuma chave/segredo no código, log ou frontend | leitura do diff |
| Cliente vê cobrança em aberto só para pagar (sem editar) | abrir Área do Cliente |
| Revisão do architect: zero pendência | code_review |

---

## 8. Linhas vermelhas (NUNCA violar)

1. NUNCA expor `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` no frontend, em log ou no Git.
2. NUNCA marcar pagamento como "pago" sem confirmação real (webhook do Asaas) — nada de "fingir pago".
3. NUNCA começar em produção: build e teste primeiro no sandbox (dinheiro de mentira).
4. NÃO quebrar o Financeiro manual atual (continua existindo para quem paga por fora).
4-A. O caminho do cliente é SEMPRE "clicar e pagar" na página certificada; copia-e-cola/QR é só
   alternativa secundária, nunca o que se mostra primeiro (exigência do CEO em 26/06/2026).
5. NÃO regredir a regra de parcelas (1 a 12) nem o cálculo de saldo existente.
6. NÃO criar coluna `notNull` em tabela já populada sem ALTER/truncate prévio.
7. NÃO inventar tag de origem entre sistemas (conceito raiz dos primos independentes).

---

RESUMO EM 1 LINHA: especificada a ligação do Asaas em escopo B — cobrança avulsa PIX/boleto/cartão
com QR Code e confirmação automática por webhook, mais assinatura mensal dos Círculos PAXTER, tudo
começando no sandbox, com a chave em cofre e entrada de menu própria para as assinaturas.
