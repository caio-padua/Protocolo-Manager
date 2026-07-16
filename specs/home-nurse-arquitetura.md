# Spec: Home Nurse — Arquitetura Completa

**Status:** ESPECIFICADO — aguardando aprovação do CEO para BUILD  
**Data:** 16/07/2026  
**Autor:** Dr. Replit Paxter  
**Paxter Loop:** Onda 1 — Especificar

---

## 1. PROBLEMA RAIZ

O sistema hoje não distingue **enfermeira de clínica** (CLT/PJ, fixada num local) de **home nurse**
(MEI, vai até o cliente, serve múltiplas clínicas, cobra taxa de deslocamento).
Falta também o conceito de **endereço de serviço do cliente** — onde ele quer ser atendido em
cada sessão.

---

## 2. ATORES E REGRAS DE NEGÓCIO

| Ator | Tipo contratual | Locais | Taxa extra | Quem seleciona |
|---|---|---|---|---|
| Enfermeira Física | CLT ou PJ fixo | 1 clínica apenas | Não | Sistema (automático pela clínica) |
| Home Nurse (MEI) | Contrato MEI | 1+ clínicas | Sim — por visita | Médico no Lançador |

**Regras:**
1. Quando `serviceType = "homecare"`, uma Home Nurse deve ser selecionada no protocolo.
2. Uma Home Nurse pode estar vinculada a N clínicas (é o braço da empresa a distância).
3. A taxa da Home Nurse (`homeServiceFeePerVisit`) × número de sessões é somada ao `totalValue`.
4. O cliente tem 1 endereço principal (já no cadastro) + 0..N endereços de serviço adicionais.
5. Em cada sessão, o sistema confirma: "mesmo endereço?" — se não, cadastra um novo e salva.
6. A clínica pode oferecer a mão de obra das Home Nurses para outras clínicas parceiras
   (base para expansão SaaS multi-clínicas no futuro).

---

## 3. MUDANÇAS NO BANCO (Drizzle — `lib/db`)

### 3.1 Tabela `professionals` — colunas novas

```
nurseType          TEXT  NULL   -- 'fisica' | 'home' | NULL (para não-enfermeiros)
homeServiceFeePerVisit  DECIMAL(10,2)  NULL   -- só para home nurses, ex.: 150.00
```

### 3.2 Tabela `location_professionals` — coluna nova

```
nurseRole  TEXT  NULL   -- 'fisica' | 'home' (null para médicos/admin)
```

Regra: um profissional com `nurseType='home'` pode ter N linhas aqui (1 por clínica que serve).

### 3.3 Nova tabela `client_service_addresses`

```sql
id           SERIAL PRIMARY KEY
clientId     INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE
label        TEXT NOT NULL          -- "Casa", "Escritório Paulista", "Apartamento BSB"
cep          TEXT NOT NULL
logradouro   TEXT NOT NULL
numero       TEXT NOT NULL
complemento  TEXT NULL
bairro       TEXT NOT NULL
cidade       TEXT NOT NULL
estado       TEXT NOT NULL
isDefault    BOOLEAN NOT NULL DEFAULT false
createdAt    TIMESTAMP DEFAULT now()
```

### 3.4 Tabela `protocols` — colunas novas

```
nurseId           INTEGER NULL REFERENCES professionals(id)
homeServiceFee    DECIMAL(10,2) NOT NULL DEFAULT 0
```

### 3.5 Tabela `sessions` — colunas novas

```
serviceAddressId  INTEGER NULL REFERENCES client_service_addresses(id)
nurseId           INTEGER NULL REFERENCES professionals(id)   -- pode diferir do protocolo
```

---

## 4. SEED FICCIONAL (dados de teste — CEO substituirá depois)

### 4.1 Enfermeiras Físicas

| Nome | COREN-SP | Clínica | Tipo |
|---|---|---|---|
| Ana Beatriz Santos Rodrigues | 123.456 | Clínica Tatuapé | fisica |
| Carla Menezes Ramos | 234.567 | Clínica Mooca | fisica |

### 4.2 Home Nurses (MEI)

| Nome | COREN-SP | Taxa/visita | Clínicas vinculadas |
|---|---|---|---|
| Fernanda Lima Oliveira | 345.678 | R$ 150,00 | Tatuapé + Mooca |
| Juliana Torres Costa | 456.789 | R$ 180,00 | Tatuapé |

### 4.3 Endereços de Serviço (clientes já existentes)

| Cliente | Rótulo | Endereço |
|---|---|---|
| Ricardo Almeida Ferreira | Escritório Paulista | Av. Paulista 1500, Bela Vista, SP |
| Isabela Torres Santos | Casa | R. da Consolação 456, Consolação, SP |

---

## 5. NOVAS ROTAS DE API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/professionals/home-nurses?locationId=X` | Home nurses disponíveis para uma clínica |
| GET | `/api/clients/:id/service-addresses` | Lista endereços de serviço do cliente |
| POST | `/api/clients/:id/service-addresses` | Adiciona novo endereço de serviço |
| PATCH | `/api/clients/:id/service-addresses/:addrId` | Atualiza rótulo / marca como padrão |
| DELETE | `/api/clients/:id/service-addresses/:addrId` | Remove endereço de serviço |
| PATCH | `/api/sessions/:id/confirm-address` | Confirma ou troca o endereço de uma sessão |

**Mudanças em rotas existentes:**
- `GET /api/protocols` → `buildProtocolResponse` inclui `nurseName` + `homeServiceFee`
- `POST /api/protocols` → aceita `nurseId`, calcula `homeServiceFee = feePerVisit × totalSessions`
- `GET /api/protocols/:id` → inclui informações completas da home nurse
- `GET /api/professionals` → inclui `nurseType`, `homeServiceFeePerVisit`
- `POST /api/professionals` → aceita `nurseType`, `homeServiceFeePerVisit`

---

## 6. MUDANÇAS DE TELA (UX)

### 6.1 Tela de Profissionais (`/professionals`)

Campos novos no formulário de cadastro:

```
Tipo de Enfermagem  [Física — CLT/PJ clínica]  [Home Nurse — MEI]  (só aparece se especialidade contém "enf")
Taxa por Visita     [R$ ___]  (só aparece se Home Nurse)
Clínicas Atendidas  [Tatuapé ✓]  [Mooca ✓]  [Nurse Care]  (multi-select, só para Home Nurse)
```

### 6.2 Lançador de Protocolos (`/protocols/new`) — etapa de Resumo

Quando `serviceType = "homecare"`:

```
┌─ ENFERMEIRA HOME ──────────────────────────────────────────────────┐
│  [▼ Selecione a home nurse]                                        │
│                                                                    │
│  ◉ Fernanda Lima Oliveira   COREN 345.678   R$ 150,00/visita      │
│    Tatuapé · Mooca                                                  │
│                                                                    │
│  ◯ Juliana Torres Costa     COREN 456.789   R$ 180,00/visita      │
│    Tatuapé                                                          │
│                                                                    │
│  Taxa de deslocamento (8 sessões × R$ 150,00): R$ 1.200,00 →     │
│  incluída no valor total do protocolo                              │
└────────────────────────────────────────────────────────────────────┘
```

### 6.3 Tela do Cliente (`/clients/:id`) — nova aba "Endereços"

```
┌─ ENDEREÇOS DE SERVIÇO ─────────────────────────────────────────────┐
│  [PADRÃO]  Casa                                                    │
│            R. das Flores 123, Apto 42, Pinheiros, SP — 05422-010  │
│                                                                    │
│  Escritório Paulista                                               │
│  Av. Paulista 1500, Bela Vista, SP — 01310-100                    │
│                                                                    │
│  [+ Adicionar Endereço]                                            │
└────────────────────────────────────────────────────────────────────┘
```

### 6.4 Card de sessão na Agenda — confirmação de endereço

Quando `serviceType = "homecare"`:

```
┌── SESSÃO 3 — 22/07 · 09:00 ──────────────────────────────────────┐
│  🏠 [Casa — R. das Flores 123, Apto 42]    [✓ Confirmar]         │
│     Enfermeira: Fernanda Lima                                      │
│     [Trocar endereço]                                              │
└────────────────────────────────────────────────────────────────────┘
```

Ao clicar "Trocar endereço":
- Abre modal com endereços salvos do cliente
- Opção "Novo endereço" → formulário inline com CEP auto-fill
- Salva o novo endereço em `client_service_addresses`
- Atualiza o `serviceAddressId` da sessão

### 6.5 Card de protocolo na lista (`/protocols`)

Meta chip adicionado (já previsto pelo CEO como pedido 6):

```
[🏥 NURSE CARE]  [👤 DR. HENRIQUE]  [💊 ENF. FERNANDA]  [📅 10/03]
```

---

## 7. FLUXO COMPLETO — BLUEPRINT

```
CRIAR PROTOCOLO (homecare)
  → Selecionar cliente
  → Montar substâncias + sessões
  → Marcar serviceType = "homecare"
  → Sistema carrega: home nurses disponíveis para a clínica base
  → Médico seleciona Home Nurse (ex.: Fernanda Lima, R$ 150/visita)
  → Sistema calcula: totalValue + (feePerVisit × totalSessions)
  → Confirmar e Lançar
      ↓
  SESSÃO GERADA (cada uma)
    → serviceAddressId = endereço padrão do cliente
    → nurseId = home nurse do protocolo
      ↓
  NA AGENDA (dia da sessão)
    → Card mostra: endereço + enfermeira
    → Botão "Confirmar Endereço"
      → Sim: marca sessão endereço confirmado
      → Não: modal de seleção/cadastro de endereço
```

---

## 8. O QUE NÃO ESTÁ NO ESCOPO DESTA ONDA

| Item | Motivo | Quando |
|---|---|---|
| Pagamento da taxa da Home Nurse (repasse MEI) | Financeiro separado | Futura onda financeira |
| App/portal da Home Nurse | Sistema externo | MVP SaaS multi-clínicas (governança pausada) |
| Histórico de endereços por sessão no PDF do RAS | Minor — pode ser adicionado | Onda de RAS |
| Rating da Home Nurse pelo cliente | Sistema de avaliação existente (`client_ratings`) | Vincular depois |

---

## 9. ORDEM DE BUILD (dependências)

```
FASE A (banco + seed)
  → migrations: nurseType, homeServiceFeePerVisit em professionals
  → migrations: nurseRole em location_professionals
  → migrations: tabela client_service_addresses (nova)
  → migrations: nurseId + homeServiceFee em protocols
  → migrations: serviceAddressId + nurseId em sessions
  → seed ficcional das 4 enfermeiras + endereços
      ↓
FASE B (API)
  → buildProtocolResponse inclui nurseName + homeServiceFee
  → POST /protocols aceita nurseId, calcula homeServiceFee
  → GET /professionals/home-nurses?locationId=X
  → CRUD /clients/:id/service-addresses
  → PATCH /sessions/:id/confirm-address
  → codegen (Orval) para regenerar hooks
      ↓
FASE C (telas)
  → Profissionais: formulário com nurseType + taxa + clínicas
  → Lançador: bloco de seleção de Home Nurse (quando homecare)
  → Clientes: aba "Endereços de Serviço"
  → Agenda: confirmação de endereço por sessão
  → Lista de Protocolos: chip de enfermeira
      ↓
FASE D (testes)
  → Criar protocolo homecare com Fernanda Lima
  → Verificar cálculo do totalValue com taxa
  → Confirmar e trocar endereço na agenda
  → Verificar que enfermeira aparece no card da lista
```

---

## 10. CRITÉRIO DE ACEITE (Definition of Done)

- [ ] Seed: 4 enfermeiras cadastradas (2 físicas + 2 home), com vínculos de clínica corretos
- [ ] Lançador mostra o bloco de Home Nurse quando serviceType=homecare
- [ ] Taxa de deslocamento é somada automaticamente ao totalValue
- [ ] Card do protocolo mostra chip com nome da enfermeira
- [ ] Cliente tem aba "Endereços de Serviço" com CRUD funcional
- [ ] Card de sessão na Agenda mostra endereço e botão "Confirmar Endereço"
- [ ] Trocar endereço salva em client_service_addresses e atualiza a sessão
- [ ] Typecheck (parcial — exceto stubs de codegen) limpo
