# Onda 3 — Cadastro de Bancos + Transferencias (Asaas)

Spec do Paxter Loop. Status: EM CONSTRUCAO. Autor: Dr. Replit Paxter. Data: 28/06/2026.

## 1. Objetivo

Dar ao Manager duas telas no menu Financeiro:

1. **Cadastro de Bancos** — CRUD das contas autorizadas a RECEBER transferencias (whitelist).
2. **Transferencias** — mover saldo da conta Asaas da clinica para UMA conta autorizada, via Pix, com confirmacao na tela e auditoria.

Regra de ouro: so e possivel transferir para uma conta que esta cadastrada e ativa (whitelist). Nunca para um destino digitado na hora.

## 2. Contas semeadas (whitelist inicial — 4 contas do CEO)

A chave Pix de cada conta e o proprio CPF/CNPJ (decisao do CEO).

| Titular | Tipo | Documento | Banco | Agencia | Conta | Chave Pix |
|---|---|---|---|---|---|---|
| Caio Henrique Fernandes Padua | PF | 293.274.948-06 | Mercado Pago | 0001 | 566938369-7 | CPF |
| Carlucia Santos Fernandes | PF | 024.862.801-11 | Bradesco | 7204 | 409460-3 | CPF |
| Paduccia Clinica Medica | PJ | 63.865.940/0001-63 | Santander | 3989 | 130062254 | CNPJ |
| Paluzze Medicina | PJ | 13.584.113/0001-23 | Bradesco (CloudWalk/InfinitPay) | 0001 | 227025280 | CNPJ |

## 3. Banco de dados — tabela `bank_accounts`

| Coluna | Tipo | Regra |
|---|---|---|
| id | serial PK | — |
| holder_name | text NOT NULL | titular da conta |
| person_type | text NOT NULL | "PF" ou "PJ" |
| document | text NOT NULL | CPF/CNPJ so digitos (unico) |
| bank_name | text NOT NULL | nome do banco |
| bank_code | text | COMPE 3 digitos (opcional) |
| agency | text NOT NULL | agencia |
| account | text NOT NULL | numero da conta |
| account_type | text NOT NULL default CONTA_CORRENTE | CONTA_CORRENTE / CONTA_POUPANCA |
| pix_key | text | chave Pix (default = documento) |
| pix_key_type | text | CPF / CNPJ / EMAIL / PHONE / EVP |
| active | boolean NOT NULL default true | inativa = fora da whitelist |
| note | text | observacao livre |
| created_at | timestamptz NOT NULL default now | — |

Deduplicacao por `document` (chave natural). Nao usa id de origem (nao vem do IHE).

## 4. Backend — lib `asaas.ts`

- `asaasCreateTransfer(input)` — POST /transfers no Asaas, operationType **PIX** (chave = documento).
  - Body: `{ value, operationType: "PIX", pixAddressKey, pixAddressKeyType, description? }`.
  - Retorna status REAL do Asaas (PENDING / BANK_PROCESSING / DONE / FAILED / CANCELLED / etc.). Nunca simula.
- `asaasListTransfers(max)` — lista transferencias (paginado) para o historico.

## 5. Backend — rotas `routes/asaas.ts` (todas `requireCollaborator`)

| Metodo + rota | Funcao |
|---|---|
| GET /asaas/bank-accounts | lista contas (whitelist) |
| POST /asaas/bank-accounts | cria conta |
| PUT /asaas/bank-accounts/:id | edita conta |
| DELETE /asaas/bank-accounts/:id | desativa conta (soft delete: active=false) |
| POST /asaas/transfer | transfere para conta autorizada |
| GET /asaas/transfers | historico de transferencias (Asaas) |

### Travas do POST /asaas/transfer (em ordem, ANTES de chamar o Asaas)

1. **Confirmacao**: corpo deve trazer `confirm === true` (a UI so envia apos o passo de confirmacao). Sem isso -> 400.
2. **Whitelist**: `bankAccountId` deve existir e estar `active`. Senao -> 404.
3. **Valor**: numero positivo, minimo R$ 1,00. Senao -> 400.
4. **Limite por transferencia**: maximo R$ 5.000,00 por operacao (trava de seguranca). Acima -> 400 com mensagem clara.
5. So depois chama `asaasCreateTransfer`.
6. **Auditoria**: registra na `collaborator_audit` (action "write") QUEM transferiu, valor e a conta destino MASCARADA (nunca o documento inteiro nem chave completa).

## 6. Frontend — telas (design Paxter: navy/ouro/vidro/3D, todos os campos visiveis)

### 6.1 Cadastro de Bancos (`/financeiro/bancos`)
- Lista das contas (cards 3D) com badge PF/PJ e badge ATIVA/INATIVA.
- Botao "Nova conta" abre formulario (titular, tipo, documento, banco, agencia, conta, tipo de conta, chave Pix, observacao).
- Editar e desativar por conta.

### 6.2 Transferencias (`/financeiro/transferencias`)
- Selecionar conta autorizada (so ativas), valor, descricao.
- Resumo data-bound da conta escolhida (titular, banco, agencia/conta, chave Pix mascarada).
- Botao "Revisar transferencia" -> abre **passo de confirmacao** (mostra destino + valor por extenso) -> botao final "Confirmar e transferir".
- Resultado mostra STATUS REAL do Asaas (honesto). Erro do provedor aparece como veio.

## 7. Acceptance (Definicao de PRONTO)

1. 4 contas semeadas e listadas na tela.
2. CRUD de bancos funciona (criar/editar/desativar).
3. Tela de transferencia com passo de confirmacao.
4. Travas testadas por curl: whitelist (404), limite (400), sem confirmacao (400) — todas retornam ANTES de tocar o Asaas, sem mover dinheiro.
5. NAO disparar transferencia real de dinheiro irreversivel em teste automatico.
6. Architect PASS.
7. Screenshot das duas telas + relatorio Densidade B ao CEO.

## 8. Decisoes travadas

- Transferencia so para whitelist (conta cadastrada e ativa).
- Pix com chave = documento (CPF/CNPJ).
- Limite de R$ 5.000,00 por transferencia (trava de seguranca; ajustavel depois pelo CEO).
- Confirmacao obrigatoria na UI e no backend (`confirm: true`).
- Auditoria com destino mascarado.
