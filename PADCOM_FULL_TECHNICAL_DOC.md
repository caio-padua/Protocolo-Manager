# PADCOM — Documentacao Tecnica Completa

**Sistema**: PADCOM (Padcon Conect)
**Proprietario**: Dr. Padua — Clinica Padua (Medicina Estetica, Sao Paulo/SP)
**Proposito**: Gestao completa de protocolos injetaveis (IV, IM, SC, Implantes)
**Data do documento**: Abril 2026

---

## INDICE

1. [Stack e Arquitetura](#1-stack-e-arquitetura)
2. [Estrutura do Monorepo](#2-estrutura-do-monorepo)
3. [Banco de Dados — Schema Completo](#3-banco-de-dados)
4. [Agenda Semanal — Fluxo Completo](#4-agenda-semanal)
5. [Google Calendar — Sinais Pre/Pos Aplicacao](#5-google-calendar)
6. [Google Drive — Pasta por Cliente](#6-google-drive)
7. [Gmail — E-mails Pre e Pos Aplicacao](#7-gmail)
8. [Validacao de Sessao — Codigo Diario + Senha Permanente](#8-validacao)
9. [Avaliacao de Enfermagem — Formulario Completo](#9-avaliacao-enfermagem)
10. [Alertas por Cor e Task Cards](#10-alertas-cor)
11. [RAS — Registro de Administracao de Substancias](#11-ras)
12. [RAS Fisico (Grid Impresso)](#12-ras-fisico)
13. [PDF Documento Protocolar Completo (Manus V13)](#13-manus-v13)
14. [TCLE — Termo de Consentimento Livre e Esclarecido](#14-tcle)
15. [Termos de Uso de Imagem / LGPD](#15-termos-imagem-lgpd)
16. [Assinatura Digital ICP-Brasil A1](#16-assinatura-digital)
17. [Portal do Cliente (Upload)](#17-portal-cliente)
18. [Dashboard Operacional](#18-dashboard)
19. [Catalogo de Substancias](#19-catalogo-substancias)
20. [Protocolos — Validacao e Consolidacao](#20-protocolos)
21. [ICS Export (iCalendar)](#21-ics-export)
22. [Paleta de Cores e UI TDAH-Friendly](#22-paleta-cores)
23. [Preferencias do Dono / Regras de Negocio](#23-preferencias)
24. [Fases Futuras](#24-fases-futuras)
25. [Comandos Uteis](#25-comandos)

---

## 1. Stack e Arquitetura

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | Express.js + TypeScript (porta 8080) |
| Banco | PostgreSQL (Replit managed) via Drizzle ORM |
| Monorepo | pnpm workspaces |
| Google APIs | Calendar, Drive, Gmail (via Replit Integrations — OAuth automatico) |
| PDF | pdf-lib (layout) + node-forge (assinatura digital PKCS#7) |
| Build | esbuild ESM — externalize pdf-parse, tesseract.js, @napi-rs/canvas |
| Deploy | Replit Deployments |

### Dependencias Principais (API Server)
- `pdf-lib` — Criacao de PDFs programaticos (A4, landscape, multi-pagina)
- `node-forge` — Leitura de certificado .pfx, criacao de PKCS#7 signed data
- `googleapis` — Google Calendar v3, Drive v3, Gmail v1
- `drizzle-orm` + `drizzle-kit` — ORM type-safe
- `express` + `cors` + `multer` — HTTP + upload de arquivos

---

## 2. Estrutura do Monorepo

```
/
├── artifacts/
│   ├── api-server/              → Backend Express (porta 8080)
│   │   ├── src/
│   │   │   ├── routes/          → Endpoints REST
│   │   │   │   ├── clients.ts
│   │   │   │   ├── sessions.ts
│   │   │   │   ├── protocols.ts
│   │   │   │   ├── substances.ts
│   │   │   │   ├── professionals.ts
│   │   │   │   ├── locations.ts
│   │   │   │   ├── payments.ts
│   │   │   │   ├── ras.ts
│   │   │   │   ├── ras-evolutivo.ts
│   │   │   │   ├── google-calendar.ts
│   │   │   │   ├── google-drive.ts
│   │   │   │   ├── email.ts
│   │   │   │   ├── nursing-assessments.ts
│   │   │   │   ├── validation-codes.ts
│   │   │   │   ├── task-cards.ts
│   │   │   │   ├── client-portal.ts
│   │   │   │   ├── client-ratings.ts
│   │   │   │   ├── stock.ts
│   │   │   │   └── dashboard.ts
│   │   │   ├── lib/
│   │   │   │   ├── google-calendar.ts    → Criacao/atualizacao de eventos
│   │   │   │   ├── google-drive.ts       → Criacao de pastas, upload
│   │   │   │   ├── google-gmail.ts       → MIME builder + envio
│   │   │   │   ├── email-service.ts      → Templates HTML pre/pos sessao
│   │   │   │   └── pdf-signer.ts         → RAS PDF + Protocol Doc PDF + assinatura A1
│   │   │   └── index.ts                  → Express app
│   │   └── certs/
│   │       └── assinatura.pfx            → Certificado A1 ICP-Brasil
│   │
│   ├── padcom/                  → Frontend React/Vite (preview path: /)
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── dashboard.tsx
│   │       │   ├── agenda/index.tsx       → Agenda semanal principal
│   │       │   ├── clients/
│   │       │   │   ├── index.tsx
│   │       │   │   ├── detail.tsx
│   │       │   │   ├── new.tsx
│   │       │   │   └── edit.tsx
│   │       │   ├── protocols/
│   │       │   │   ├── index.tsx
│   │       │   │   ├── new.tsx
│   │       │   │   └── detail.tsx
│   │       │   ├── substances/index.tsx
│   │       │   ├── ras/
│   │       │   │   ├── index.tsx
│   │       │   │   └── detail.tsx
│   │       │   └── portal.tsx             → Portal externo do cliente
│   │       ├── components/
│   │       │   ├── nursing-assessment-form.tsx
│   │       │   └── ui/                    → shadcn/ui components
│   │       └── lib/
│   │           └── status.ts              → formatStatus, getStatusColor
│   │
│   └── mockup-sandbox/          → Sandbox de componentes (design)
│
├── lib/
│   └── db/
│       └── src/
│           └── schema/
│               ├── index.ts
│               ├── clients.ts
│               ├── sessions.ts
│               ├── protocols.ts
│               ├── protocol-items.ts
│               ├── substances.ts
│               ├── substance-applications.ts
│               ├── professionals.ts
│               ├── locations.ts
│               ├── payments.ts
│               ├── ras.ts
│               ├── ras-evolutivo.ts
│               ├── validation-codes.ts
│               ├── nursing-assessments.ts
│               ├── task-cards.ts
│               ├── client-ratings.ts
│               └── stock-items.ts
│
├── PADCOM_HANDOFF.md
├── PADCOM_TECHNICAL_BRIEFING.md
└── replit.md
```

---

## 3. Banco de Dados — Schema Completo

### 3.1 clients
```
id              serial PRIMARY KEY
name            text NOT NULL
cpf             varchar(14) NOT NULL UNIQUE
email           text
phone           text
address         text
neighborhood    text
city            text
state           text
zipCode         text
birthDate       date
status          text DEFAULT 'active'       -- active | inactive
notes           text
validationPassword  text                    -- Senha permanente do cliente (para fechar protocolo)
examRequestsFolderId  text                  -- Google Drive folder ID para pedidos de exame
driveFolderId   text                        -- Google Drive folder ID raiz do cliente
createdAt       timestamp DEFAULT now()
updatedAt       timestamp DEFAULT now()
```

### 3.2 professionals
```
id              serial PRIMARY KEY
name            text NOT NULL
specialty       text                        -- IMPORTANTE: usa "specialty", NAO "role"
email           text
phone           text
crmNumber       text                        -- CRM ou COREN
active          boolean DEFAULT true
role            text                        -- medico_01, medico_02, enfermeira_01, enfermeira_02, adm_01, adm_02, financeiro_01, financeiro_02
createdAt       timestamp DEFAULT now()
```

### 3.3 protocols
```
id              serial PRIMARY KEY
clientId        integer REFERENCES clients(id)
title           text NOT NULL
description     text
category        text                        -- longevidade, estetica, performance, etc.
status          text DEFAULT 'draft'        -- draft | validated | active | completed | cancelled
startDate       date
endDate         date
totalValue      numeric(10,2) DEFAULT 0
notes           text
createdAt       timestamp DEFAULT now()
updatedAt       timestamp DEFAULT now()
```

### 3.4 protocol_items
```
id              serial PRIMARY KEY
protocolId      integer REFERENCES protocols(id)
substanceId     integer REFERENCES substances(id)
dose            text NOT NULL
totalSessions   integer NOT NULL
intervalDays    integer DEFAULT 7
startDate       date
notes           text
```

### 3.5 substances
```
id              serial PRIMARY KEY
name            text NOT NULL
category        text                        -- antioxidante, vitamina, metabolico, etc.
procedureType   text DEFAULT 'iv'           -- iv | im | sc | implant
durationMinutes integer DEFAULT 30
color           text DEFAULT '#3B82F6'
description     text
mainFunction    text
perceivedEffects  text
timeToEffect    text
starRating      integer DEFAULT 3           -- 1 a 5 estrelas
bodySystemEffects  jsonb                    -- { "cardiovascular": 4, "neurocognicao": 3, ... }
contraindications  text
scientificEvidence text
longevityBenefit   text
qualityOfLifeImpact text
sleepBenefit       text
energyBenefit      text
libidoBenefit      text
physicalPerformance text
muscleStrength     text
mentalClarity      text
skinHairNails      text
immuneSupport      text
stockQuantity      integer DEFAULT 0
minStock           integer DEFAULT 5
unit               text DEFAULT 'ampola'
active             boolean DEFAULT true
createdAt          timestamp DEFAULT now()
```

### 3.6 sessions
```
id              serial PRIMARY KEY
protocolId      integer REFERENCES protocols(id)
clientId        integer REFERENCES clients(id)
professionalId  integer REFERENCES professionals(id)
scheduledDate   date NOT NULL
scheduledTime   text DEFAULT '09:00'
weekNumber      integer
unit            text
serviceType     text DEFAULT 'clinic'       -- clinic | homecare
status          text DEFAULT 'scheduled'    -- scheduled | confirmed | in_progress | completed | missed | cancelled
googleEventId   text                        -- ID do evento no Google Calendar
googleCalendarId text                       -- ID do calendario usado
notes           text
createdAt       timestamp DEFAULT now()
updatedAt       timestamp DEFAULT now()
```

### 3.7 substance_applications
```
id              serial PRIMARY KEY
sessionId       integer REFERENCES sessions(id)
substanceId     integer REFERENCES substances(id)
dose            text
sessionNumber   integer                     -- Sessao X de Y desta substancia
totalSessions   integer
availability    text DEFAULT 'disp'         -- disp (aplicar agora) | prox (agendada futuramente)
status          text DEFAULT 'pending'      -- pending | applied | missed
appliedAt       timestamp
lot             text                        -- Numero do lote
validity        text                        -- Data de validade
notes           text
procedureType   text                        -- iv | im | sc | implant
```

### 3.8 locations
```
id              serial PRIMARY KEY
name            text NOT NULL                -- Tatuape, Mooca, Higienopolis, etc.
address         text
neighborhood    text
city            text
state           text
zipCode         text
googleCalendarId text                        -- Calendar ID do Google
calendarType    text                         -- medico | enfermagem | domiciliar
active          boolean DEFAULT true
```

### 3.9 validation_codes
```
id              serial PRIMARY KEY
sessionId       integer REFERENCES sessions(id)
code            varchar(6) NOT NULL          -- Codigo alfanumerico 6 chars (ex: A7K3M2)
type            text DEFAULT 'daily'         -- daily (1h expiry) | permanent
expiresAt       timestamp                    -- Expira em 1h para daily
usedAt          timestamp                    -- Quando foi usado
valid           boolean DEFAULT true
createdAt       timestamp DEFAULT now()
```

### 3.10 nursing_assessments
```
id              serial PRIMARY KEY
sessionId       integer REFERENCES sessions(id)
clientId        integer REFERENCES clients(id)
professionalId  integer REFERENCES professionals(id)
bloodPressure   text                         -- PA: "120/80"
heartRate       integer                      -- FC: bpm
weight          numeric(5,1)                 -- Peso em kg
height          numeric(5,1)                 -- Altura em cm (toggle avancado)
bodyFatPercent  numeric(4,1)                 -- % gordura (toggle avancado)
fatMass         numeric(5,1)                 -- Massa gorda kg
muscleMass      numeric(5,1)                 -- Massa muscular kg
-- 7 dobras cutaneas (toggle avancado):
skinfoldTriceps     numeric(5,1)
skinfoldBiceps      numeric(5,1)
skinfoldSubscapular numeric(5,1)
skinfoldSuprailiac  numeric(5,1)
skinfoldAbdominal   numeric(5,1)
skinfoldPectoral    numeric(5,1)
skinfoldMedialThigh numeric(5,1)
-- 8 circunferencias (toggle avancado):
circumArm           numeric(5,1)
circumForearm       numeric(5,1)
circumChest         numeric(5,1)
circumWaist         numeric(5,1)
circumAbdomen       numeric(5,1)
circumHip           numeric(5,1)
circumThigh         numeric(5,1)
circumCalf          numeric(5,1)
-- Outros:
alertColor      text DEFAULT 'green'          -- green | yellow | red
observations    text
weeklyQuestion  text                          -- "Como foi sua semana?"
painLevel       integer                       -- 0-10
createdAt       timestamp DEFAULT now()
```

**Regra do formulario**:
- **SINAIS VITAIS + PESO** (sempre visivel): PA, FC, Peso
- **Avaliacao Corporal Completa** (toggle retraido, label "(adm / consultor / biomedico)"): altura, % gordura, massa gorda, massa muscular, 7 dobras, 8 circunferencias

### 3.11 ras
```
id              serial PRIMARY KEY
sessionId       integer REFERENCES sessions(id)
clientId        integer REFERENCES clients(id)
professionalId  integer REFERENCES professionals(id)
serviceDate     date
serviceType     text
unit            text
observations    text
patientSignature  boolean DEFAULT false
professionalSignature boolean DEFAULT false
pdfUrl          text
drivePdfId      text
createdAt       timestamp DEFAULT now()
```

### 3.12 ras_evolutivo
```
id              serial PRIMARY KEY
protocolId      integer REFERENCES protocols(id)
clientId        integer REFERENCES clients(id)
sessionId       integer REFERENCES sessions(id)
progressPercent integer DEFAULT 0
adherenceLevel  text
tolerance       text
weeklyObservation text
sessionHistory  jsonb                         -- Ultimas 3 sessoes
pdfUrl          text
drivePdfId      text
isAntepenultimate boolean DEFAULT false
isUltimate      boolean DEFAULT false
createdAt       timestamp DEFAULT now()
```

### 3.13 task_cards
```
id              serial PRIMARY KEY
sessionId       integer REFERENCES sessions(id)
clientId        integer REFERENCES clients(id)
assignedRole    text                          -- enfermeira_02, medico_02
title           text NOT NULL
description     text
priority        text DEFAULT 'normal'         -- normal | high | urgent
alertColor      text                          -- green | yellow | red
deadlineHours   integer                       -- 36 para yellow, 0 (imediato) para red
status          text DEFAULT 'pending'        -- pending | in_progress | completed | cancelled
completedAt     timestamp
createdAt       timestamp DEFAULT now()
```

### 3.14 client_ratings
```
id              serial PRIMARY KEY
sessionId       integer REFERENCES sessions(id)
clientId        integer REFERENCES clients(id)
professionalId  integer REFERENCES professionals(id)
rating          integer                       -- 0 a 5 estrelas
comments        text
createdAt       timestamp DEFAULT now()
```

### 3.15 payments
```
id              serial PRIMARY KEY
protocolId      integer REFERENCES protocols(id)
clientId        integer REFERENCES clients(id)
amount          numeric(10,2) NOT NULL
method          text                          -- pix | credit | debit | boleto | cash
status          text DEFAULT 'pending'        -- pending | paid | overdue | cancelled
dueDate         date
paidAt          date
description     text
installments    integer
cardLabel       text
createdAt       timestamp DEFAULT now()
```

### 3.16 stock_items
```
id              serial PRIMARY KEY
substanceId     integer REFERENCES substances(id)
quantity        integer DEFAULT 0
lot             text
validity        date
locationId      integer REFERENCES locations(id)
createdAt       timestamp DEFAULT now()
```

---

## 4. Agenda Semanal — Fluxo Completo

**Arquivo**: `artifacts/padcom/src/pages/agenda/index.tsx`

### Layout
- Navegacao semanal (seg-dom) com botoes < > e "Hoje"
- Cada dia mostra data e qtd sessoes
- Cada sessao e um card com:
  - Hora (scheduledTime)
  - Nome do cliente + CPF
  - Badge de status (cores por status)
  - Tipo de atendimento (Clinica ou Nurse Care + icone)
  - Protocolo + Semana + Tipo de procedimento
  - Nome do profissional

### Substance Pills (Bolinhas de Substancia)
Cada substancia na sessao aparece como uma "pill" arredondada com:
- **Cor de fundo**: cor da substancia (`substance.color`)
- **Dot de status** dentro da pill:
  - `🟡 DISP` (amarelo) — disponivel para aplicar
  - `🔵 APLICADA` (azul + anel brilhante) — ja aplicada (`appliedAt` preenchido)
  - `🟤 PROX` (marrom) — agendada para sessao futura
  - `🔴 MISSED` (vermelho) — nao aplicada/faltou
- **Texto**: Nome da substancia + "X/Y" (sessao atual/total)
- **Botao "confirmar"**: aparece ao lado de cada pill DISP nao confirmada
- **CheckCheck icon**: aparece quando substancia esta aplicada

### Regras Visuais do Card
```
completed   → borda esquerda verde, fundo verde suave
missed      → borda esquerda vermelha, fundo vermelho suave, opacity 0.7
cancelled   → borda esquerda cinza, opacity 0.5
parcial     → borda esquerda amarela (some confirmed, not all)
hoje        → borda esquerda azul, shadow elevada, fundo azul suave
default     → borda esquerda slate
```

### Menu Dropdown (3 pontinhos) — Acoes por Sessao
1. **Avaliacao de Enfermagem** — Abre modal NursingAssessmentForm
2. **Gerar Codigo de Validacao** — POST /api/validation-codes/generate
3. **Verificar Codigo do Cliente** — POST /api/validation-codes/verify
4. **Enviar E-mail Pre-Aplicacao** — POST /api/email/send-pre-session/:id
5. **Enviar E-mail Pos-Aplicacao (RAS)** — POST /api/email/send-post-session/:id (so aparece se status=completed)
6. **Sincronizar Google Agenda** — POST /api/google-calendar/sync-session/:id
7. **Baixar ICS desta sessao** — GET /api/sessions/:id/ics
8. **Enviar lembrete (WhatsApp)** — Abre wa.me com mensagem formatada

### Botoes Globais (topo)
- **ICS da Semana** — GET /api/sessions/ics?dateFrom=X&dateTo=Y
- **Sync Google Agenda** — POST /api/google-calendar/sync-week

### Modal: Codigo de Validacao
- Fundo escuro (slate-900), codigo em fonte mono 4xl com tracking largo
- Mostra horario de expiracao
- Botoes: Copiar Codigo | Enviar WhatsApp (com mensagem formatada)

### Modal: Verificar Codigo
- Input centralizado, fonte mono 2xl, tracking largo, maxLength=6
- Feedback visual: verde (sucesso) ou vermelho (invalido/expirado)

### WhatsApp — Mensagem de Lembrete
```
Ola [PRIMEIRO_NOME]! 👋

Lembramos que voce tem uma sessao agendada:

📅 *DD/MM/YYYY* as *HH:MM*
📍 [UNIDADE ou "Clinica PADCOM"]

Protocolo: [TITULO_PROTOCOLO]

Qualquer duvida, estamos a disposicao. ✨
```

### WhatsApp — Envio do Codigo
```
Clinica Padua | [TIPO_PROCEDIMENTO] | [CODIGO]

Ola [PRIMEIRO_NOME]!

Seu codigo de validacao para a sessao de DD/MM/YYYY e:

🔑 *[CODIGO]*

Apresente este codigo a enfermeira no momento da aplicacao.

Clinica Padua — Protocolos Injetaveis
```

---

## 5. Google Calendar — Sinais Pre/Pos Aplicacao

**Arquivo**: `artifacts/api-server/src/lib/google-calendar.ts`
**Rota**: `artifacts/api-server/src/routes/google-calendar.ts`

### Duracao por Tipo de Procedimento
| Tipo | Duracao |
|------|---------|
| IV (endovenosa) | 30 min |
| IM (intramuscular) | 15 min |
| Implante | 60 min |
| Consulta | 60 min |

### Regra de Soma
Quando a sessao tem multiplos tipos DISP:
- IV + IM = 45 min
- IV + IM + Implante = 105 min (1H45MIN)
- So IM = 15 min

### Mapeamento de Agendas (6 locais)
| Local | Agenda Google | Calendar ID |
|-------|--------------|-------------|
| Tatuape | AGENDA MEDICO TATUAPE | 146251... |
| Mooca | AGENDA GERAL | clinica.padua.agenda@gmail.com |
| Higienopolis | AGENDA MEDICO HIGIENOPOLIS | 6d8b74... |
| Nurse Care | AGENDA ENFERMAGEM DOMICILIAR | 65fbeb... |
| Enf. Bianca | AGENDA ENFERMAGEM BIANCA | 0fa070... |
| Enf. Guaxupe | AGENDA ENFERMAGEM GUAXUPE | 725448... |

### Roteamento Medico vs Enfermagem
- **Implante ou Consulta** → roteado para AGENDA MEDICO do local
- **IV ou IM** → roteado para agenda de enfermagem do local
- **Domiciliar (homecare)** → usa endereco do cliente (nao da clinica)

### Titulo do Evento
```
CLIENTNAME CPF - Atend N - PROCEDURE
```
Exemplo: `MARIA SILVA 123.456.789-00 - Atend 3 - APLICACAO ENDOVENOSA`

### Descricao do Evento (Pre-Aplicacao)
```
✅ APLICACAO ENDOVENOSA - DURACAO: 30 MINUTOS
✅ APLICACAO INTRAMUSCULAR - DURACAO: 15 MINUTOS
❌ CONSULTA
❌ IMPLANTE

DURACAO TOTAL: 45 MINUTOS

━━━━━━━━━━━━━━━━━━━━━━━━
SUBSTANCIAS DO PROTOCOLO
━━━━━━━━━━━━━━━━━━━━━━━━

🟢 DISP — Glutationa 600mg (2/10)
🟢 DISP — Vitamina C 10g (2/10)
🟤 PROX — NAD+ 250mg (agendada para 15/04)
⚫ N/A  — Complexo B (nao nesta sessao)

━━━━━━━━━━━━━━━━━━━━━━━━
LEGENDA
🟢 DISP = Disponivel para aplicacao
🔵 APLICADA = Substancia ja aplicada
🟤 PROX = Proxima sessao agendada
⚫ N/A = Nao aplicavel nesta sessao

━━━━━━━━━━━━━━━━━━━━━━━━
📍 ENDERECO
Rua Guaxupe, 327
Tatuape — Sao Paulo/SP
CEP 03416-050

🗺️ Google Maps: https://maps.google.com/...
🧭 Waze: https://waze.com/ul?...
```

### Atualizacao Pos-Aplicacao
Apos confirmar cada substancia, o sistema chama `updateCalendarEventDescription()`:
- Muda o dot de `🟢 DISP` para `🔵 APLICADA`
- Todas as substancias aplicadas ficam com `🔵`
- Mantem `🟤 PROX` e `⚫ N/A` inalterados

### Cores do Evento (colorId)
| Tipo | colorId | Cor |
|------|---------|-----|
| IV | 9 | Azul |
| IM | 6 | Laranja |
| Implante | 11 | Vermelho |
| Consulta | 1 | Lavanda |
| Misto | 10 | Verde |

### Lembretes
- 60 minutos antes (popup)
- 15 minutos antes (popup)

### Participante
- E-mail do cliente adicionado como attendee (optional)

---

## 6. Google Drive — Pasta por Cliente

**Arquivo**: `artifacts/api-server/src/lib/google-drive.ts`

### Nome da Pasta Raiz
```
NOME COMPLETO CPF 000.000.000-00
```
Exemplo: `MARIA SILVA CPF 123.456.789-00`

### Estrutura de 15 Subpastas
```
CLIENTES/
└── MARIA SILVA CPF 123.456.789-00/
    ├── CADASTRO
    ├── PATOLOGIAS
    ├── EXAMES
    ├── AVALIACOES
    ├── RECEITAS
    ├── PROTOCOLOS
    ├── FINANCEIRO
    ├── CONTRATOS
    ├── ATESTADOS
    ├── LAUDOS
    ├── TERMOS
    ├── FOTO PERFIL
    ├── IMAGENS
    ├── PESQUISA
    └── OUVIDORIA
```

### Metadados (Google Sheets)
- Cria planilha `METADADOS` dentro da pasta do cliente
- Contem: Nome, CPF, Email, Telefone, Endereco, Data de Nascimento

### Migracao Legacy
- Detecta pasta antiga nomeada como `PACIENTES` e renomeia para `CLIENTES`
- Busca pastas existentes por padrao de CPF no nome

### Upload de PDFs
- RAS assinados → pasta `PROTOCOLOS/`
- Documentos do protocolo → pasta `PROTOCOLOS/`
- Exames enviados pelo portal → pasta `EXAMES/`

---

## 7. Gmail — E-mails Pre e Pos Aplicacao

**Arquivo**: `artifacts/api-server/src/lib/email-service.ts`
**Gmail MIME**: `artifacts/api-server/src/lib/google-gmail.ts`

### 7.1 E-mail Pre-Aplicacao

**Quando**: Enfermeira_01 clica "Enviar E-mail Pre-Aplicacao" no menu da sessao
**Rota**: POST /api/email/send-pre-session/:sessionId

**Conteudo**:
1. **Header**: Gradiente azul, "CLINICA PADUA — Protocolos Injetaveis"
2. **Saudacao**: "Ola, [NOME]!"
3. **Info da sessao**: Data, hora, unidade, endereco
4. **Codigo de validacao**: Caixa destacada, codigo em fonte mono 36px, letras maiusculas com tracking largo
5. **Tabela de substancias**: Nome (com dot de cor), Dose, Sessao X/Y
6. **Se primeira sessao** (isFirstSession=true):
   - Fichas detalhadas de cada substancia com:
     - Nome + categoria badge + estrelas
     - Descricao
     - Funcao principal
     - **Tabela de Impacto por Sistema Corporal**: Barra de progresso colorida + estrelas + percentual
     - Efeitos percebidos (box verde)
     - Tempo para resultado (box amarelo)
     - Energia, sono, performance, pele/cabelo, longevidade (boxes coloridos)
   - Termos de consentimento resumidos
7. **Aviso importante**: Explicacao sobre RAS pos-aplicacao
8. **Endereco com Maps link** (se disponivel)
9. **Footer**: "Clinica Padua — Protocolos Injetaveis"

### 7.2 Tabela de Sistemas Corporais no E-mail
```
| Sistema              | Impacto (★) | Barra      | %   |
|---------------------|-------------|------------|-----|
| ● Cardiovascular     | ★★★★☆      | ████████░░ | 80% |
| ● Neurocognicao      | ★★★☆☆      | ██████░░░░ | 60% |
| ● Emagrecimento      | ★★★★★      | ██████████ | 100%|
```

### 12 Sistemas Corporais Mapeados
| Chave (key) | Label PT-BR | Cor |
|-------------|------------|-----|
| cardiovascular | Cardiovascular | #EF4444 |
| respiratorio | Respiratorio | #06B6D4 |
| muscular_hipertrofia | Muscular / Hipertrofia | #F97316 |
| emagrecimento | Emagrecimento / Sobrepeso | #84CC16 |
| neurocognicao | Neurocognicao | #8B5CF6 |
| metabolismo_tireoide | Metabolismo / Tireoide | #F59E0B |
| libido_sexual | Libido / Sexual | #EC4899 |
| performance_fisica | Performance Fisica | #14B8A6 |
| imunologico | Imunologico | #10B981 |
| dermatologico | Pele / Cabelo / Unhas | #A855F7 |
| hepatico | Hepatico / Detox | #6366F1 |
| longevidade | Longevidade | #0EA5E9 |

### 7.3 E-mail Pos-Aplicacao

**Quando**: Apos sessao completada, enfermeira clica "Enviar E-mail Pos-Aplicacao"
**Rota**: POST /api/email/send-post-session/:sessionId

**Conteudo**:
1. Header petrol-green gradient
2. Resumo da sessao (data, substancias aplicadas vs nao-aplicadas)
3. Status de cada substancia (Aplicado / Nao Aplicado)
4. **Anexo**: PDF RAS assinado digitalmente (opcional, se gerado)

### 7.4 E-mail de Protocolo
- Enviado quando protocolo e validado/consolidado
- Anexa PDF do Documento Protocolar completo (Manus V13)
- Header com gradiente petrol-green

### 7.5 Gmail MIME Builder

```typescript
function buildMimeMessage(options: {
  to: string;
  subject: string;          // Encoded UTF-8 Base64
  html: string;             // Content-Type: text/html; charset=UTF-8
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;    // application/pdf, etc.
  }>;
}): string
```

- Usa boundary para multipart/mixed quando tem anexos
- Subject encoded como `=?UTF-8?B?...?=`
- Corpo HTML em base64
- Cada anexo com Content-Disposition: attachment
- Raw message encoded como URL-safe Base64 (replace +/-/, remove =)

---

## 8. Validacao de Sessao

**Rota**: `artifacts/api-server/src/routes/validation-codes.ts`

### Modo 1: Codigo Diario (6 chars)
- Gerado por enfermeira_01 ao clicar "Gerar Codigo de Validacao"
- POST /api/validation-codes/generate → retorna `{ code: "A7K3M2", expiresAt: "..." }`
- Alfanumerico (A-Z, 0-9), 6 caracteres
- **Expira em 1 hora**
- Enviado ao cliente por WhatsApp ou e-mail pre-sessao
- Cliente apresenta o codigo; enfermeira insere no sistema
- POST /api/validation-codes/verify → retorna `{ valid: true/false }`

### Modo 2: Senha Permanente (Fechamento de Protocolo)
- Armazenada em `clients.validationPassword`
- Usada no fechamento do protocolo
- **Enfermeira_02 NUNCA ve o codigo**

### Fluxo Operacional
```
1. Enfermeira_01 gera codigo diario
2. Codigo enviado ao cliente (WhatsApp/email)
3. Cliente chega na clinica
4. Enfermeira_01 pede o codigo
5. Cliente informa verbalmente
6. Enfermeira_01 digita no sistema
7. Sistema valida (verde = ok, vermelho = invalido)
8. Substancias sao confirmadas individualmente
9. Calendario Google atualizado (🟢→🔵)
```

---

## 9. Avaliacao de Enfermagem

**Schema**: `lib/db/src/schema/nursing-assessments.ts`
**Frontend**: `artifacts/padcom/src/components/nursing-assessment-form.tsx`
**Rota**: `artifacts/api-server/src/routes/nursing-assessments.ts`

### Formulario em 2 Blocos

#### Bloco 1: SINAIS VITAIS + PESO (sempre visivel)
| Campo | Tipo | Exemplo |
|-------|------|---------|
| PA (Pressao Arterial) | text | "120/80" |
| FC (Frequencia Cardiaca) | integer (bpm) | 72 |
| Peso | numeric(5,1) kg | 75.5 |

#### Bloco 2: Avaliacao Corporal Completa (toggle retraido)
Label do toggle: *"(adm / consultor / biomedico)"*

| Campo | Tipo |
|-------|------|
| Altura | numeric cm |
| % Gordura | numeric |
| Massa Gorda | numeric kg |
| Massa Muscular | numeric kg |
| **7 Dobras Cutaneas** | |
| → Tricipital | numeric mm |
| → Bicipital | numeric mm |
| → Subescapular | numeric mm |
| → Suprailíaca | numeric mm |
| → Abdominal | numeric mm |
| → Peitoral | numeric mm |
| → Coxa Medial | numeric mm |
| **8 Circunferencias** | |
| → Braco | numeric cm |
| → Antebraco | numeric cm |
| → Torax | numeric cm |
| → Cintura | numeric cm |
| → Abdomen | numeric cm |
| → Quadril | numeric cm |
| → Coxa | numeric cm |
| → Panturrilha | numeric cm |

#### Campos Adicionais
- Cor de alerta (green/yellow/red) — SELECT
- Observacoes — TEXTAREA
- Pergunta semanal ("Como foi sua semana?") — TEXTAREA
- Nivel de dor (0-10) — SLIDER ou NUMBER

---

## 10. Alertas por Cor e Task Cards

### Regras de Cor
| Cor | Significado | Acao |
|-----|------------|------|
| **Verde** | Tudo normal | Somente historico, sem card |
| **Amarelo** | Atencao necessaria | 1 card → enfermeira_02, priority HIGH, prazo 36h |
| **Vermelho** | Urgente | 2 cards → enfermeira_02 + medico_02, priority URGENT, imediato |

### Geracao de Task Cards
Quando enfermeira_01 salva a avaliacao de enfermagem com alertColor != 'green':

**Amarelo**:
```json
{
  "assignedRole": "enfermeira_02",
  "title": "Follow-up: [NOME_CLIENTE]",
  "priority": "high",
  "alertColor": "yellow",
  "deadlineHours": 36,
  "description": "Contatar cliente dentro de 36h. Observacao: [OBS]"
}
```

**Vermelho**:
```json
// Card 1
{
  "assignedRole": "enfermeira_02",
  "title": "ALERTA: [NOME_CLIENTE]",
  "priority": "urgent",
  "alertColor": "red",
  "deadlineHours": 0,
  "description": "Contato IMEDIATO necessario. Observacao: [OBS]"
}
// Card 2
{
  "assignedRole": "medico_02",
  "title": "ALERTA MEDICO: [NOME_CLIENTE]",
  "priority": "urgent",
  "alertColor": "red",
  "deadlineHours": 0,
  "description": "Avaliacao medica imediata necessaria. Observacao: [OBS]"
}
```

### Rota dos Task Cards
**Arquivo**: `artifacts/api-server/src/routes/task-cards.ts`
- GET /api/task-cards — Lista todos (filtro por assignedRole, status, alertColor)
- POST /api/task-cards — Cria novo
- PATCH /api/task-cards/:id — Atualiza status
- DELETE /api/task-cards/:id — Remove

---

## 11. RAS — Registro de Administracao de Substancias

**Arquivo**: `artifacts/api-server/src/lib/pdf-signer.ts` → `generateSignedRASPdf()`

### Estrutura do PDF RAS (Multi-pagina)

#### Pagina 1: Documento Principal
1. **Header**: "REGISTRO DE ADMINISTRACAO DE SUBSTANCIAS" + "Protocolo de Injetaveis — Medicina Estetica"
2. **Numero RAS**: `RAS N.° 000001` + `Sessao ID: X`
3. **Dados do Cliente**: Nome completo, CPF
4. **Data/Tipo**: Data do atendimento (DD/MM/YYYY), Tipo (Clinica / Nurse Care Domiciliar)
5. **Dados do Profissional**: Nome, CRM/COREN, Unidade
6. **Tabela de Substancias**:
   | Substancia | Dose | Sessao | Via | Lote | Validade | Status |
   |-----------|------|--------|-----|------|----------|--------|
   | Glutationa | 600mg | 2/10 | IV | L001 | 12/2026 | Aplicado |
   | Vit C | 10g | 2/10 | IV | L002 | 06/2026 | Aplicado |
7. **Observacoes** (se houver)
8. **Bloco Assinatura Digital ICP-Brasil**:
   - "DOCUMENTO ASSINADO DIGITALMENTE"
   - Assinante: [Nome do CN do certificado]
   - CPF: [Extraido do CN]
   - Emissor: [CA do certificado]
   - Serial: [Numero serial truncado]
   - Validade: DD/MM/YYYY a DD/MM/YYYY
   - Assinado em: DD/MM/YYYY HH:MM:SS
9. **Linhas de Assinatura Fisica**:
   - Profissional (nome + CRM)
   - Cliente (nome)
   - Data

#### Paginas 2+: Fichas das Substancias (TDAH-Friendly)
Cada substancia com descricao/funcao gera uma pagina propria:
1. **Header escuro**: Nome da substancia em branco, tipo de procedimento em azul claro
2. **Dose + Sessao**: Info no canto superior direito
3. **O QUE E**: Descricao da substancia
4. **FUNCAO PRINCIPAL**: Box destacado com estrelas de avaliacao
5. **EFEITO POR SISTEMA DO CORPO**: Grid 2 colunas com dot colorido por sistema + descricao
6. **EFEITOS PERCEBIDOS PELO CLIENTE**: Em verde
7. **TEMPO PARA PERCEBER O EFEITO**: Em dourado

#### Ultima Pagina: TCLE (Termo de Consentimento)
10 secoes completas (ver secao 14 deste documento)

### Cores do PDF RAS
```typescript
const BLACK = rgb(0, 0, 0);
const GRAY = rgb(0.4, 0.4, 0.4);
const LIGHT_GRAY = rgb(0.92, 0.92, 0.92);
const DARK_BLUE = rgb(0.11, 0.15, 0.24);
const ACCENT_BLUE = rgb(0.15, 0.35, 0.65);
const GOLD = rgb(0.78, 0.6, 0.15);
const GREEN = rgb(0.05, 0.55, 0.25);
const LIGHT_BG = rgb(0.97, 0.98, 1);
const STAR_FILL = rgb(0.95, 0.75, 0.1);
const STAR_EMPTY = rgb(0.82, 0.82, 0.82);
```

### Assinatura PKCS#7
```typescript
const p7 = forge.pkcs7.createSignedData();
p7.content = forge.util.createBuffer(pdfBytes);
p7.addCertificate(cert);
p7.addSigner({
  key,
  certificate: cert,
  digestAlgorithm: forge.pki.oids.sha256,
  authenticatedAttributes: [
    { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
    { type: forge.pki.oids.messageDigest },
    { type: forge.pki.oids.signingTime, value: new Date() },
  ],
});
p7.sign({ detached: false });
```

---

## 12. RAS Fisico (Grid Impresso)

**Funcao**: `generatePhysicalRASPdf(data)` em pdf-signer.ts

### Layout
- **Orientacao**: Landscape (841.89 x 595.28)
- **Header**: "RAS - REGISTRO ADMINISTRACAO DE SUBSTANCIAS"
- **Campos**: Nome, CPF, Celular, Medico Responsavel, Enfermeira, Unidade, Data Atendimento
- **Info extra**: Idade, Altura, Peso (se disponivel)
- **Protocolo Medicamento**: Tabela com Numero de Aplicacoes, Frequencia, Data Inicio por substancia

### Grid Principal
| AGENDA | RUBRICA PACIENTE | RUBRICA ENF | DATA PREVISTA | DATA EFETIVA | [Subst1] | [Subst2] | ... |
|--------|-----------------|-------------|---------------|--------------|----------|----------|-----|
| 1 | ______________ | _______ | 01/04/26 | | 1/10 | 1/8 | |
| 2 | ______________ | _______ | 08/04/26 | | 2/10 | 2/8 | |

- Substancias aplicadas: fundo colorido forte (opacity 0.8), texto branco bold
- Substancias agendadas: fundo colorido leve (opacity 0.25), texto preto
- Hoje: fundo verde suave na row inteira
- Barra colorida no topo de cada coluna de substancia (cor da substancia)

### Rodape
- Assinatura Paciente (50% largura)
- Medico Resp (25% largura)
- Enfermeiro Resp (25% largura)

---

## 13. PDF Documento Protocolar Completo (Manus V13)

**Funcao**: `generateProtocolDocumentPdf(data)` em pdf-signer.ts
**Design**: V13/CHAT/MANUS — "Premium e acolhedor"

### Paleta Exclusiva do Manus
```typescript
const PETROL = rgb(0.12, 0.33, 0.33);        // Verde petroleo
const PETROL_LIGHT = rgb(0.85, 0.93, 0.93);  // Fundo claro petroleo
const PETROL_MID = rgb(0.18, 0.45, 0.45);    // Petroleo medio
const COVER_BG = rgb(0.08, 0.22, 0.22);      // Capa escura
const GOLD_ACCENT = rgb(0.82, 0.68, 0.21);   // Dourado premium
const WHITE = rgb(1, 1, 1);
```

### Pagina 1: Capa (COVER PAGE)
- Fundo: `COVER_BG` (petroleo escuro) — pagina inteira
- Linha dourada (`GOLD_ACCENT`) horizontal decorativa
- **PADCOM** em branco, 36pt bold
- **PROTOCOLOS INJETAVEIS** em dourado, 14pt
- **"PROTOCOLO MEDICO PERSONALIZADO"** em branco, 18pt
- **[TITULO DO PROTOCOLO]** em dourado, 22pt bold
- Campos: CLIENTE, CPF, E-MAIL, TELEFONE, MEDICO RESPONSAVEL, UNIDADE, ATENDIMENTO, INICIO, TOTAL DE SESSOES, SUBSTANCIAS
- **VALOR DO PROTOCOLO** em dourado, 14pt bold
- "Documento gerado pelo sistema PADCOM" + timestamp

### Pagina 2: Matriz de Beneficios
- Header petroleo: "MATRIZ DE BENEFICIOS POR SUBSTANCIA"
- Grid: Nome (com dot de cor) | Nota (estrelas) | 8 colunas de beneficio

#### 8 Colunas de Beneficio
| Coluna | Key |
|--------|-----|
| LONGEVIDADE | longevityBenefit |
| SONO | sleepBenefit |
| ENERGIA | energyBenefit |
| LIBIDO | libidoBenefit |
| CLAREZA MENTAL | mentalClarity |
| IMUNIDADE | immuneSupport |
| PELE/CABELO | skinHairNails |
| MUSCULO | muscleStrength |

### Paginas 3+: Fichas das Substancias
Para cada substancia com descricao ou funcao principal:
1. **Header petroleo**: Nome em branco + tipo de procedimento em dourado + dose/sessoes/intervalo
2. **Barra de cor**: 3px na cor da substancia
3. **O QUE E**: Descricao (PETROL_MID)
4. **FUNCAO PRINCIPAL**: Box com fundo PETROL_LIGHT, borda PETROL, estrelas
5. **EFEITOS POR SISTEMA CORPORAL**: Grid 2x com dots coloridos + texto
6. **EFEITOS PERCEBIDOS PELO CLIENTE**: Em verde
7. **CONTRAINDICACOES**: Em vermelho

### TCLE Dinamico por Tipo de Procedimento
Gera clausulas especificas dependendo dos tipos presentes no protocolo:
- Se tem IV → Clausula sobre acesso venoso, G6PD, NAD+
- Se tem IM → Clausula sobre dor local, nodulacao, lesao nervosa
- Se tem SC → Clausula sobre nodulos, eritema, absoracao gradual
- Se tem Implante → Clausula sobre procedimento cirurgico, extrusao, remocao

### Cronograma de Sessoes (Grid)
- Header petroleo: "CRONOGRAMA DE SESSOES"
- Grid: Substancia vs S1, S2, S3...
- Celula preenchida forte = aplicado
- Celula preenchida leve = agendado
- Numeros = sessao da substancia
- Legenda + periodo (data inicio a data fim)

### Resumo Financeiro
- Valor total do protocolo em petroleo 22pt
- Composicao por substancia (tabela)
- Historico de pagamentos (tabela com: Valor, Forma, Status, Vencimento, Pago em, Parcelas, Cartao)
- Total Pago (verde) vs Saldo Pendente (laranja)

### Assinatura Digital (Ultima Pagina)
- Box petroleo: "DOCUMENTO ASSINADO DIGITALMENTE"
- Detalhes do certificado A1
- 3 linhas de assinatura: Profissional | Cliente | Data
- Texto legal: "A assinatura digital ICP-Brasil confere validade juridica ao documento (MP 2.200-2/2001)"

### Rodape em Todas as Paginas (exceto capa)
```
PADCOM - Protocolos Injetaveis | Protocolo Medico Personalizado | Pagina X de Y
                                                    _________________ RUBRICA CLIENTE
                                                    [Primeiro nome]
```

---

## 14. TCLE — Termo de Consentimento Livre e Esclarecido

### 14.1 TCLE no RAS (10 Secoes Fixas)

1. **IDENTIFICACAO**: "Eu, [NOME], portador(a) do CPF [CPF], declaro que fui devidamente informado(a)..."
2. **PROCEDIMENTO**: "Autorizo a administracao das seguintes substancias: [LISTA]. Estou ciente de que os procedimentos injetaveis podem incluir aplicacoes por via endovenosa (IV), intramuscular (IM) e/ou subcutanea..."
3. **FINALIDADE TERAPEUTICA**: "...suplementacao de micronutrientes, modulacao bioquimica, terapia antioxidante..."
4. **RISCOS E EFEITOS ADVERSOS**: "...dor e/ou hematoma no local da aplicacao, reacoes alergicas, rubor facial, cefaleia, nausea, hipotensao transitoria e, em casos raros, reacoes anafilaticas..."
5. **CONTRAINDICACOES INFORMADAS**: "...gestacao ou suspeita de gravidez; amamentacao; uso de anticoagulantes; doencas renais, hepaticas ou cardiacas..."
6. **CONSENTIMENTO VITAMINA C IV (quando aplicavel)**: "...necessidade de dosagem previa de G6PD (glicose-6-fosfato desidrogenase). A deficiencia desta enzima pode causar anemia hemolitica..."
7. **NAD+ E TERAPIAS DE LONGEVIDADE (quando aplicavel)**: "...velocidade de infusao adequada, possivel desconforto toracico, nausea ou cefaleia..."
8. **LGPD**: "Em conformidade com a Lei n. 13.709/2018... autorizo a coleta, armazenamento e processamento dos meus dados pessoais e dados sensiveis de saude..."
9. **ARMAZENAMENTO DIGITAL**: "Autorizo o armazenamento digital de todos os registros de atendimento... no sistema PADCOM e, quando aplicavel, em ambiente de nuvem seguro (Google Drive), com compartilhamento exclusivo ao meu e-mail cadastrado, em modo somente leitura."
10. **DECLARACAO FINAL**: "Declaro ter lido e compreendido integralmente o presente termo..."

### 14.2 TCLE no Documento Protocolar (Dinamico por Via)

Secoes base (1-5) identicas + secoes especificas por via:

**Via Endovenosa (IV)**:
"Autorizo procedimentos por via endovenosa. Fui informado(a) que infusoes IV requerem acesso venoso periferico, podendo ocorrer dor no local da puncao, hematoma, flebite e, raramente, infiltracao. No caso de Vitamina C endovenosa em alta dose (acima de 10g), declaro ciencia da necessidade de dosagem previa de G6PD. No caso de NAD+, fui orientado(a) sobre a velocidade de infusao adequada e possiveis desconfortos."

**Via Intramuscular (IM)**:
"Autorizo procedimentos por via intramuscular. Estou ciente de que aplicacoes IM podem causar dor local, hematoma, nodulacao transitoria e, em raros casos, lesao nervosa periferica."

**Via Subcutanea (SC)**:
"Autorizo procedimentos por via subcutanea. Fui informado(a) que aplicacoes SC podem resultar em nodulos locais, eritema, prurido e dor no ponto de aplicacao. A absorcao e gradual."

**Implante**:
"Autorizo a realizacao de implante subcutaneo. Estou ciente dos riscos especificos incluindo: necessidade de pequeno procedimento cirurgico, possibilidade de infeccao local, extrusao do implante, formacao de cicatriz, e necessidade de retorno para remocao ao final do periodo terapeutico."

Seguidos por:
- **LGPD**: "...autorizo a coleta, armazenamento e processamento... sistema PADCOM e Google Drive..."
- **DECLARACAO FINAL**: "Declaro ter lido e compreendido integralmente..."
- **Linhas de assinatura**: Cliente (nome + CPF) | Data

---

## 15. Termos de Uso de Imagem / LGPD

### 15.1 LGPD no TCLE
Presente tanto no RAS quanto no Documento Protocolar:
```
Em conformidade com a Lei n. 13.709/2018 (LGPD), autorizo a coleta,
armazenamento e processamento dos meus dados pessoais e dados sensiveis
de saude para fins exclusivos de:
- execucao do protocolo terapeutico;
- emissao de documentos clinicos (RAS, receituarios);
- acompanhamento da evolucao clinica;
- comunicacao sobre agendamentos e resultados.

Autorizo o armazenamento digital no sistema PADCOM e em ambiente de nuvem
seguro (Google Drive), com compartilhamento exclusivo ao meu e-mail
cadastrado em modo somente leitura.

Tenho ciencia do meu direito de solicitar a exclusao, correcao ou
portabilidade dos meus dados a qualquer momento.
```

### 15.2 Armazenamento Digital
```
Autorizo o armazenamento digital de todos os registros de atendimento,
incluindo o presente termo, no sistema PADCOM e, quando aplicavel, em
ambiente de nuvem seguro (Google Drive), com compartilhamento exclusivo
ao meu e-mail cadastrado, em modo somente leitura.
```

### 15.3 Consentimento no E-mail Pre-Sessao
```
Ao prosseguir com o tratamento, o(a) paciente declara estar ciente dos
procedimentos a serem realizados, incluindo aplicacoes endovenosas,
intramusculares e/ou implantes subcutaneos. O paciente foi informado sobre
os beneficios esperados, possiveis efeitos colaterais e contraindicacoes
de cada substancia.
O consentimento formal sera registrado presencialmente antes da primeira
aplicacao, conforme exigencias da ANVISA e do Conselho Federal de Medicina (CFM).
O RAS (Registro de Administracao de Substancias) sera emitido e assinado
digitalmente com certificado ICP-Brasil A1 apos cada sessao.
```

### 15.4 Pasta Google Drive: TERMOS
Subpasta `TERMOS` dentro da pasta do cliente para armazenamento de:
- Termos de consentimento assinados
- Termos de uso de imagem
- Autorizacoes especificas

### 15.5 Pasta Google Drive: IMAGENS
Subpasta `IMAGENS` para fotos clinicas (antes/depois, acompanhamento)

### 15.6 Portal do Cliente — Upload de Documentos
O portal permite que o cliente envie documentos diretamente para o Google Drive:
- Tipos aceitos: PDF, JPG, JPEG, PNG, HEIC, HEIF, DOC, DOCX
- Categorias de upload: EXAME DE SANGUE, ULTRASSOM, COMPROVANTE DE PAGAMENTO, FOTO/IMAGEM, etc.
- Identificacao por CPF + Data de Nascimento

---

## 16. Assinatura Digital ICP-Brasil A1

### Certificado
- **Formato**: PKCS#12 (.pfx)
- **Caminho**: `artifacts/api-server/certs/assinatura.pfx`
- **Senhas tentadas**: array de senhas (tenta multiplas)
- **Tipo**: A1 (armazenado em software)

### Extração do Certificado
```typescript
function loadCertificate(): {
  key: forge.pki.rsa.PrivateKey;
  cert: forge.pki.Certificate;
  ca: forge.pki.Certificate[];
}
```
- Le arquivo .pfx com `fs.readFileSync`
- Converte para DER → ASN1 → PKCS12
- Extrai chave privada (pkcs8ShroudedKeyBag)
- Extrai certificado principal + CA chain (certBag)

### Extração do CPF
```typescript
const cnAttr = cert.subject.getField("CN");
const match = String(cnAttr.value).match(/\d{11}/);
cpf = match[0].replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
```

### Informações Exibidas no PDF
```
DOCUMENTO ASSINADO DIGITALMENTE
Assinante: [CN do certificado]
CPF: [extraido do CN, formatado XXX.XXX.XXX-XX]
Emissor: [CN do issuer]
Serial: [primeiros 40 chars do serial]
Valido: DD/MM/YYYY a DD/MM/YYYY
Assinado em: DD/MM/YYYY HH:MM:SS
```

### Base Legal
- MP 2.200-2/2001 — Institui a ICP-Brasil
- Certificado A1 confere validade juridica a documentos eletronicos

### Tratamento WinAnsi
Funcao `safeTxt()` remove caracteres fora do WinAnsi encoding:
```typescript
function safeTxt(text: string): string {
  return str
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")  // Remove caracteres especiais
    .replace(/[\u2018\u2019]/g, "'")           // Smart quotes → aspas simples
    .replace(/[\u201C\u201D]/g, '"')           // Smart double quotes
    .replace(/\u2014/g, "--")                  // Em dash
    .replace(/\u2013/g, "-")                   // En dash
    .replace(/\u2026/g, "...")                 // Ellipsis
}
```

---

## 17. Portal do Cliente (Upload)

**Arquivo**: `artifacts/padcom/src/pages/portal.tsx`

### Design
- Tema escuro exclusivo: fundo `#142e2e`, cards `#1a3a3a`, bordas `#1e4a4a`
- Dourado para labels e botoes: `#d4ae35`
- Header: "PADCON CONECT" em branco sobre `#0d1f1f`

### Fluxo
1. **Identificacao**: Cliente informa CPF (mascara 000.000.000-00) + Data de Nascimento
2. **Validacao**: Sistema busca cliente no banco por CPF
3. **Upload**: Seleciona tipo de arquivo + arrasta/clica para enviar
4. **Sucesso**: Confirmacao visual

### Tipos de Arquivo Aceitos
| Categoria | Destino no Drive |
|-----------|-----------------|
| EXAME DE SANGUE / BIOQUIMICA | /EXAMES |
| ULTRASSOM | /EXAMES |
| COMPROVANTE DE PAGAMENTO | /FINANCEIRO |
| FOTO / IMAGEM | /IMAGENS |
| RECEITA | /RECEITAS |
| LAUDO | /LAUDOS |
| ATESTADO | /ATESTADOS |
| CONTRATO | /CONTRATOS |
| OUTRO | /CADASTRO |

### Formatos Aceitos
PDF, JPG, JPEG, PNG, HEIC, HEIF, DOC, DOCX

---

## 18. Dashboard Operacional

**Arquivo**: `artifacts/padcom/src/pages/dashboard.tsx`

### KPIs (4 cards)
1. **Sessoes Hoje**: Count + "X esta semana" — Cor: cyan `hsl(187, 72%, 48%)`
2. **Protocolos Ativos**: Count + "Y clientes no total" — Cor: petroleo `hsl(180, 30%, 28%)`
3. **Receita do Mes**: R$ formatado + "Z pagamentos pendentes" — Cor: dourado `hsl(38, 92%, 50%)`
4. **Taxa de Conclusao**: Percentual + "W faltas recentes" — Cor: verde (>=70%) ou vermelho (<70%)

### Sessoes Agendadas
- Cards com data, hora, nome do cliente, status, tipo de atendimento
- Dots de cor para cada substancia

### Alertas Operacionais
- Severity: critical (vermelho), warning (amarelo), info (azul)
- Icones: AlertTriangle, Info

### Grafico de Receita Recente
- BarChart (Recharts) por mes
- Eixo Y formatado como "R$Xk"

---

## 19. Catalogo de Substancias

**Arquivo**: `artifacts/padcom/src/pages/substances/index.tsx`

### Layout
- Cards expandiveis com borda esquerda colorida (cor da substancia)
- Icone colorido (Beaker)
- Estrelas de avaliacao (1-5, preenchidas em amarelo)

### Categorias (Badges)
| Palavra-chave | Cor | Icone |
|--------------|-----|-------|
| antioxidante | Emerald | Shield |
| vitamina | Amber | Sparkles |
| metabol* | Violet | Activity |
| default | Slate | Beaker |

### Body System Effects (Expandido)
Barras de progresso coloridas para cada sistema corporal:
```
Score 1 → bg-red-200
Score 2 → bg-orange-300
Score 3 → bg-yellow-400
Score 4 → bg-lime-400
Score 5 → bg-emerald-500
```

Icones por sistema:
| Sistema | Icone | Cor |
|---------|-------|-----|
| cardiovascular | Heart | text-red-500 |
| neurocognicao | Brain | text-purple-500 |
| emagrecimento | TrendingUp | text-lime-600 |
| imunologico | Shield | text-blue-500 |
| metabolismo_tireoide | Zap | text-amber-500 |
| libido_sexual | Heart | text-pink-500 |
| performance_fisica | Dumbbell | text-teal-500 |
| dermatologico | Sparkles | text-violet-500 |
| hepatico | Leaf | text-indigo-500 |
| longevidade | Activity | text-sky-500 |
| muscular_hipertrofia | Dumbbell | text-orange-500 |
| respiratorio | Activity | text-cyan-500 |

---

## 20. Protocolos — Validacao e Consolidacao

**Arquivo**: `artifacts/api-server/src/routes/protocols.ts`

### Fluxo de Validacao (POST /protocols/:id/validate)

1. **Limpa dados existentes**: Deleta sessoes e substance_applications do protocolo
2. **Constroi weekMap**: Para cada protocol_item (substancia), calcula em qual semana cada aplicacao cai (baseado em startDate + intervalDays)
3. **Consolidacao semanal**: Para cada semana, elege o "melhor dia" (dia com mais aplicacoes agendadas)
4. **Cria sessoes**: Uma sessao por semana no melhor dia, horario padrao 09:00
5. **Marca disponibilidade**:
   - Substancias da semana atual → `availability: 'disp'` (disponivel para aplicar)
   - Substancias de semanas futuras → adicionadas como `availability: 'prox'` (proxima) para visibilidade

### Confirmacao de Substancia (POST /sessions/:id/confirm-substance)
```typescript
// Confirma ou marca como missed
await db.update(substanceApplicationsTable).set({
  status: body.confirmed ? "applied" : "missed",
  appliedAt: body.confirmed ? new Date().toISOString() : null,
  notes: body.notes ?? null,
});

// Auto-completa sessao quando TODAS as substancias DISP estao processadas
const dispApps = updatedApps.filter(a => a.availability === "disp");
const allDone = dispApps.every(a => a.status === "applied" || a.status === "missed");
if (allDone && dispApps.length > 0) {
  await db.update(sessionsTable).set({ status: "completed" });
}
```

---

## 21. ICS Export (iCalendar)

### ICS por Sessao (GET /sessions/:id/ics)
```ics
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//PADCOM//Protocolos//PT
BEGIN:VEVENT
UID:padcom-session-{id}@padcom
DTSTART:{scheduledDate}T{scheduledTime}00
DTEND:{+1h}
SUMMARY:{clientName} - {cpf}
DESCRIPTION:Substancias: {lista com DISP/PROX}
LOCATION:{unit}
STATUS:{completed ? COMPLETED : CONFIRMED}
END:VEVENT
END:VCALENDAR
```

### ICS Semanal (GET /sessions/ics?dateFrom=X&dateTo=Y)
- Multiplos VEVENTs no mesmo arquivo

### ICS do Protocolo (POST /protocols/:id/generate-ics)
- SUMMARY: `[ClientName] - [CPF] | Semana [N]`
- DESCRIPTION: Lista substancias DISP + PROX
- Duracao: 1 hora
- Location: unit da sessao

---

## 22. Paleta de Cores e UI TDAH-Friendly

### Paleta CSS (HSL)
```css
--sidebar: 180 30% 28%          /* Petroleo principal */
--sidebar-primary: 187 72% 56%  /* Cyan-dourado accent */
--radius: 0.375rem              /* Bordas suaves */
```

### Fonte
- Inter (Google Font)
- Labels em UPPERCASE com letter-spacing

### Principios TDAH-Friendly
1. **Alto contraste**: Textos escuros em fundo claro, textos claros em fundo escuro
2. **Cores fortes e distintas**: Cada substancia tem cor propria
3. **Hierarquia visual**: Headers em petroleo, badges coloridos, dots de status
4. **Cards com borda esquerda colorida**: Indica status imediato
5. **Icones consistentes**: Lucide React icons em todo o sistema
6. **Foco visual**: Cards do dia atual com shadow e borda mais forte
7. **Feedback imediato**: Toasts, badges, animacoes fade-in/slide-up

---

## 23. Preferencias do Dono / Regras de Negocio

1. **Falar "cliente"** — NUNCA "paciente" na UI e documentacao
2. **Tudo em MAIUSCULO** nos eventos de calendario e descricoes
3. **UI TDAH-friendly** com cores fortes e contrastantes
4. **Professionals usam campo `specialty`** (campo `role` para permissoes internas)
5. **Nao existe coluna `coren` isolada** na tabela professionals (usa `crmNumber` para CRM ou COREN)
6. **Endereco de referencia**: Rua Guaxupe, 327, Tatuape, SP, CEP 03416-050
7. **Nome do sistema**: PADCOM (Padcon Conect — com 1 N, deliberado)
8. **E-mail do calendario**: clinica.padua.agenda@gmail.com
9. **PDF caracteres WinAnsi safe** — sem ★ ✓ ⏱ ◉, usa alternativas ASCII e formas geometricas (drawCircle, drawRectangle)
10. **Roles do sistema**: medico_01, medico_02, enfermeira_01, enfermeira_02, adm_01, adm_02, financeiro_01, financeiro_02
11. **enfermeira_02 NUNCA ve o codigo de validacao** — so recebe task cards
12. **Consolidacao semanal**: Uma visita por semana por cliente (melhor dia eleito automaticamente)

---

## 24. Fases Futuras

| Fase | Descricao | Status |
|------|-----------|--------|
| 3 | RAS Evolutivo PDF (4 paginas Manus): capa, resumo sessao, pergunta semanal, matriz tracking | Em desenvolvimento |
| 4 | Painel de task cards interno (kanban por role) | Planejado |
| 5 | Avaliacao do cliente (0-5 estrelas para enfermeira) apos sessao | Planejado |
| 6 | Dashboard de avaliacao de funcionarios (media, historico, ranking) | Planejado |
| 7 | Auto-triggers 30 dias (protocolo vencendo, estoque baixo, follow-up) | Planejado |
| 8 | WhatsApp API (envio automatico de lembretes, codigos, RAS) | Planejado |

### RAS Evolutivo — Conceito V13/CHAT
1. **PDF direto e focado** na sessao atual
2. **Pergunta semanal**: "Como foi sua semana?" — registrada pela enfermeira
3. **Alertas por cor**: Verde (ok), Amarelo (follow-up 36h), Vermelho (imediato)
4. **Progresso %**: Quanto do protocolo foi completado
5. **Historico**: Ultimas 3 sessoes em JSONB
6. **Flags**: isAntepenultimate (penultima), isUltimate (ultima) para preparacao clinica

---

## 25. Comandos Uteis

```bash
# Push schema para banco
pnpm --filter @workspace/db run push

# SQL direto
psql "$DATABASE_URL" -c 'SELECT ...'

# Testar endpoint
curl -s http://localhost:8080/api/clients | jq

# Testar sync Google Calendar
curl -s -X POST http://localhost:8080/api/google-calendar/sync-session/123

# Testar envio de e-mail
curl -s -X POST http://localhost:8080/api/email/send-pre-session/123

# Gerar ICS
curl -s http://localhost:8080/api/sessions/ics?dateFrom=2026-04-06&dateTo=2026-04-12

# Build API (esbuild)
pnpm --filter @workspace/api-server run build
```

### Externas de Build (esbuild)
Externalizados no build.mjs para nao serem empacotados:
- `pdf-parse`
- `tesseract.js`
- `@napi-rs/canvas`

---

## Integracoes Replit Configuradas

| Integracao | Connector | Uso |
|------------|-----------|-----|
| google-calendar | google-calendar | Agendamento automatico de sessoes |
| google-drive | google-drive | Pasta por cliente com documentos |
| google-mail | google-mail | Emails pre/pos sessao com anexos |

Todas usam OAuth via Replit Integrations — token renovado automaticamente.

### Fluxo de Autenticacao Google (Exemplo Gmail)
```typescript
async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    { headers: { 'Accept': 'application/json', 'X-Replit-Token': xReplitToken } }
  ).then(res => res.json()).then(data => data.items?.[0]);

  return connectionSettings.settings.access_token;
}
```

---

*Documento gerado automaticamente pelo PADCOM Agent — Abril 2026*
*Para replicacao em projeto paralelo Replit*
