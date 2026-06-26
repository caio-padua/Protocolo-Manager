---
name: Asaas integration quirks
description: Regras finas da API do Asaas descobertas ao ligar pagamentos no Manager; evita reaprender no build.
---

# Asaas — armadilhas da API (gateway de pagamento do Manager)

Regras descobertas ligando o gateway Asaas (cobranca avulsa + assinatura). Valem para o build do
"Provedor de Pagamento" (asaasProvider) e para qualquer teste futuro.

- **Autenticacao**: header `access_token: <chave>` (NAO e `Authorization: Bearer`). User-Agent ajuda.
- **Base URL por ambiente** (diferem no caminho):
  - Producao: `https://api.asaas.com/v3`
  - Sandbox: `https://sandbox.asaas.com/api/v3`  (repare no `/api/` extra)
- **Tipo da chave amarra o ambiente**: chave de producao responde 200 so na base de producao e 401
  na de sandbox (e vice-versa). Um 401 cruzado NAO e chave invalida — e ambiente errado.
- **Ordem obrigatoria**: criar `POST /customers` (exige `cpfCnpj` valido) ANTES de `POST /payments`
  (o payment referencia o `customer` id). Sem cliente nao ha cobranca.
- **billingType `UNDEFINED`** ("Pergunte ao Cliente" = pagina com PIX+boleto+cartao) tem valor minimo
  **R$ 5,00**. Para valores menores usar billingType especifico (ex.: PIX).
- **Pagina "clica e paga"**: o campo `invoiceUrl` da resposta do payment e a pagina hospedada do Asaas
  (sem copia-e-cola); e o link que vai pro cliente.

**Why**: cada um desses ja custou uma tentativa (401 cruzado parece chave ruim; UNDEFINED < R$5 da erro
`invalid_value`). **How to apply**: usar no asaasProvider e em scripts de teste; escolher a base URL
pela origem da chave, nao por flag solta.

## Build no Manager (Onda A — cobranca avulsa)

- **Webhook do Asaas**: valida header `asaas-access-token` contra `ASAAS_WEBHOOK_TOKEN`; responde **200**
  quando a cobranca e desconhecida (ignora, sem derrubar) e **500** em erro real de processamento — o Asaas
  reenvia. So 401 sem token. Eventos uteis: PAYMENT_RECEIVED/CONFIRMED->paid, OVERDUE->overdue,
  DELETED/REFUNDED/CHARGEBACK->cancelled.
- **Rota do webhook fica ANTES do `collaboratorGuard`** em routes/index.ts (chamada externa nao tem sessao de
  colaborador; senao seria bloqueada).
- **Sem OpenAPI nesta onda**: a tela de pagamentos JA usa `fetch` cru + `(payment as any).campo`; a Onda A
  seguiu esse mesmo padrao de proposito (nao mexer no openapi.yaml de ~5300 linhas). Formalizar o contrato
  de payments e divida tecnica de onda futura, nao defeito.
- **Anti-duplicidade**: indice unico em `payments.asaas_charge_id` (NULL nao colide -> nao atrapalha
  pagamentos manuais). **Why**: retry/concorrencia do webhook ou do botao nao podem duplicar a linha.
- **Dividas registradas (revisao do architect, escala)**: `ensureCustomer` nao e atomico sob concorrencia
  (2 cliques simultaneos no mesmo cliente novo podem criar 2 customers no Asaas); falta job de reconciliacao
  por `charge.id` quando o Asaas cria a cobranca mas o insert local falha. NAO construir sem ordem do CEO.
