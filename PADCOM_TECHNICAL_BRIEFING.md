# PADCOM — Briefing Tecnico Completo para Projeto Paralelo

## 1. VISAO GERAL

Sistema completo para gerenciamento de protocolos injetaveis em clinica de medicina estetica (Brasil).
Monorepo pnpm com TypeScript. Frontend React+Vite, API Express, DB PostgreSQL+Drizzle ORM.

---

## 2. ARQUITETURA DO MONOREPO

```
/
├── artifacts/
│   ├── padcom/              # Frontend React + Vite + TailwindCSS + shadcn/ui
│   ├── api-server/          # API Express 5 (porta 8080)
│   └── mockup-sandbox/      # Preview de componentes (dev only)
├── lib/
│   ├── db/                  # Drizzle ORM schema + push
│   ├── api-spec/            # OpenAPI spec (openapi.yaml)
│   ├── api-zod/             # Zod schemas gerados via Orval
│   └── api-client-react/    # React Query hooks gerados via Orval
├── package.json             # Monorepo root
├── pnpm-workspace.yaml      # Workspace config
└── replit.md                # Documentacao do projeto
```

---

## 3. BANCO DE DADOS — SCHEMA COMPLETO

### 3.1 clients
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| name | text | NOT NULL |
| cpf | text | NOT NULL, UNIQUE |
| email | text | NOT NULL |
| phone | text | NOT NULL |
| birthDate | text | |
| address | text | |
| status | text | NOT NULL, default "active" |
| notes | text | |
| createdAt | timestamp(tz) | default now |
| updatedAt | timestamp(tz) | default now, auto-update |

### 3.2 substances
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| name | text | NOT NULL |
| category | text | NOT NULL |
| color | text | NOT NULL (hex color para UI) |
| defaultDose | text | |
| unit | text | |
| maxSessionsPerWeek | integer | |
| intervalDays | integer | |
| notes | text | |
| stockQuantity | real | NOT NULL, default 0 |
| stockUnit | text | |
| procedureType | text | NOT NULL, default "iv" ("iv"=endovenoso 30min, "im"=intramuscular 15min, "implant"=implante 60min) |
| durationMinutes | integer | NOT NULL, default 30 |
| description | text | Descricao cientifica da substancia |
| mainFunction | text | Funcao principal no organismo |
| perceivedEffects | text | Efeitos que o cliente percebe |
| timeToEffect | text | Tempo medio para resultado |
| starRating | integer | NOT NULL, default 5 (1-5 estrelas) |
| bodySystemEffects | jsonb | default {} — Ex: {"cardiovascular":4,"neurologico":5,"metabolismo":5} |
| longevityBenefit | text | Beneficio para longevidade |
| qualityOfLifeImpact | text | Impacto na qualidade de vida |
| sleepBenefit | text | Beneficio para sono |
| energyBenefit | text | Beneficio para energia |
| libidoBenefit | text | Beneficio para libido |
| physicalPerformance | text | Performance fisica |
| muscleStrength | text | Forca muscular |
| mentalClarity | text | Clareza mental |
| skinHairNails | text | Pele, cabelo e unhas |
| immuneSupport | text | Suporte imunologico |
| contraindications | text | Contraindicacoes |
| scientificEvidence | text | Nivel de evidencia cientifica |
| categoryType | text | Tipo de categoria (Antioxidante, Vitamina, Mineral, Metabolico, Lipolitico, Terapia Oxidativa) |
| createdAt | timestamp(tz) | default now |

### 3.3 professionals
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| name | text | NOT NULL |
| crm | text | |
| specialty | text | (enfermeiro, medico, etc.) |
| email | text | |
| phone | text | |
| unit | text | |
| serviceTypes | text[] | NOT NULL, default ["clinic"] |
| createdAt | timestamp(tz) | default now |

### 3.4 locations
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| name | text | NOT NULL |
| address | text | Endereco completo |
| type | text | NOT NULL, default "clinic" |
| googleCalendarId | text | ID da agenda Google Calendar correspondente |
| color | text | NOT NULL, default "#3B82F6" |
| active | text | NOT NULL, default "true" |
| createdAt | timestamp(tz) | default now |

**Locais cadastrados:**
- id=1: Clinica Tatuape (#3B82F6)
- id=2: Clinica Mooca (#10B981)
- id=3: Nurse Care Domiciliar (#8B5CF6)

### 3.5 location_professionals (tabela de juncao)
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| locationId | integer | NOT NULL, FK -> locations.id |
| professionalId | integer | NOT NULL, FK -> professionals.id |
| role | text | NOT NULL, default "executor" |
| createdAt | timestamp(tz) | default now |

### 3.6 protocols
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| clientId | integer | NOT NULL, FK -> clients.id |
| professionalId | integer | FK -> professionals.id |
| title | text | NOT NULL |
| status | text | NOT NULL, default "suggested" (suggested/active/completed/cancelled) |
| startDate | text | NOT NULL (YYYY-MM-DD) |
| endDate | text | |
| unit | text | Nome da unidade |
| serviceType | text | NOT NULL, default "clinic" |
| totalSessions | integer | NOT NULL, default 0 |
| completedSessions | integer | NOT NULL, default 0 |
| totalValue | real | NOT NULL, default 0 |
| notes | text | |
| createdAt | timestamp(tz) | default now |
| updatedAt | timestamp(tz) | auto-update |

### 3.7 protocol_items
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| protocolId | integer | NOT NULL, FK -> protocols.id |
| substanceId | integer | NOT NULL, FK -> substances.id |
| dose | text | NOT NULL |
| totalSessions | integer | NOT NULL |
| completedSessions | integer | NOT NULL, default 0 |
| intervalDays | integer | NOT NULL, default 7 |
| startDate | text | NOT NULL |
| frequency | text | NOT NULL, default "weekly" |
| createdAt | timestamp(tz) | default now |

### 3.8 sessions
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| protocolId | integer | NOT NULL, FK -> protocols.id |
| clientId | integer | NOT NULL, FK -> clients.id |
| professionalId | integer | FK -> professionals.id |
| scheduledDate | text | NOT NULL (YYYY-MM-DD) |
| scheduledTime | text | NOT NULL (HH:mm) |
| status | text | NOT NULL, default "scheduled" (scheduled/completed/missed/cancelled) |
| unit | text | Nome da unidade |
| serviceType | text | NOT NULL, default "clinic" |
| weekNumber | integer | NOT NULL, default 1 |
| notes | text | |
| createdAt | timestamp(tz) | default now |

### 3.9 substance_applications
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| sessionId | integer | NOT NULL, FK -> sessions.id |
| substanceId | integer | NOT NULL, FK -> substances.id |
| dose | text | NOT NULL |
| sessionNumber | integer | NOT NULL (ex: 3 de 10) |
| totalSessions | integer | NOT NULL |
| status | text | NOT NULL, default "pending" (pending/applied/missed) |
| availability | text | NOT NULL, default "disp" ("disp"=disponivel para aplicar, "prox"=proximo agendamento) |
| appliedAt | text | Timestamp de quando foi aplicado (null=pendente) |
| notes | text | |
| createdAt | timestamp(tz) | default now |

### 3.10 ras (Registro de Administracao de Substancias)
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| sessionId | integer | NOT NULL, FK -> sessions.id |
| protocolId | integer | NOT NULL, FK -> protocols.id |
| clientId | integer | NOT NULL, FK -> clients.id |
| clientName | text | NOT NULL (snapshot) |
| clientCpf | text | NOT NULL (snapshot) |
| professionalName | text | NOT NULL (snapshot) |
| professionalCrm | text | |
| unit | text | NOT NULL |
| serviceDate | text | NOT NULL |
| serviceType | text | NOT NULL |
| substances | jsonb | NOT NULL, default [] — array de {substanceName, dose, route, sessionNumber, totalSessions, lot, validity, status} |
| observations | text | |
| patientSignature | boolean | NOT NULL, default false |
| professionalSignature | boolean | NOT NULL, default false |
| createdAt | timestamp(tz) | default now |

### 3.11 stock_items
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| substanceId | integer | NOT NULL, FK -> substances.id |
| quantity | real | NOT NULL, default 0 |
| unit | text | NOT NULL |
| minimumStock | real | NOT NULL, default 0 |
| lot | text | |
| expirationDate | text | |
| supplier | text | |
| unitCost | real | |
| updatedAt | timestamp(tz) | auto-update |

### 3.12 payments
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| clientId | integer | NOT NULL, FK -> clients.id |
| protocolId | integer | FK -> protocols.id |
| amount | real | NOT NULL |
| method | text | NOT NULL |
| status | text | NOT NULL, default "pending" |
| dueDate | text | |
| paidAt | text | |
| description | text | |
| createdAt | timestamp(tz) | default now |

### 3.13 validation_codes
| Coluna | Tipo | Restricao |
|--------|------|-----------|
| id | serial | PK |
| sessionId | integer | NOT NULL, FK -> sessions.id |
| clientId | integer | NOT NULL, FK -> clients.id |
| code | text | NOT NULL (6 chars alfanumerico: A7K3M2) |
| expiresAt | timestamp(tz) | NOT NULL |
| used | boolean | NOT NULL, default false |
| usedAt | timestamp(tz) | |
| createdAt | timestamp(tz) | default now |

---

## 4. API — ENDPOINTS COMPLETOS

Base: `/api/`

### 4.1 Clientes
- `GET /clients` — query: search, status
- `POST /clients` — body: CreateClientBody
- `GET /clients/:id`
- `PUT /clients/:id` — body: UpdateClientBody

### 4.2 Substancias
- `GET /substances` — lista todas
- `POST /substances` — body: CreateSubstanceBody
- `PUT /substances/:id` — substituicao completa
- `PATCH /substances/:id` — atualizacao parcial (30+ campos, com allowlist)

### 4.3 Protocolos
- `GET /protocols` — query: clientId, status
- `POST /protocols` — body com items[]
- `GET /protocols/:id` — retorna protocolo + items + sessoes
- `PUT /protocols/:id`
- `POST /protocols/:id/validate` — valida e gera sessoes semanais consolidadas automaticamente
- `POST /protocols/:id/generate-ics` — gera arquivo ICS do protocolo

### 4.4 Sessoes
- `GET /sessions` — query: clientId, protocolId, status, professionalId, dateFrom, dateTo
- `POST /sessions` — criacao manual
- `GET /sessions/ics` — download ICS multiplas sessoes
- `GET /sessions/:id` — com substance_applications
- `GET /sessions/:id/ics` — ICS de uma sessao
- `PUT /sessions/:id` — atualiza status, data, hora
- `POST /sessions/:id/confirm-substance` — body: {substanceId, confirmed, notes} — confirma aplicacao individual

### 4.5 RAS
- `GET /ras` — query: clientId, protocolId
- `POST /ras` — body: {sessionId, observations} — gera RAS a partir da sessao
- `GET /ras/certificate-info` — info do certificado A1 (IMPORTANTE: esta rota DEVE vir antes de /ras/:id)
- `GET /ras/:id`
- `GET /ras/:id/pdf` — gera PDF assinado digitalmente (A1 ICP-Brasil PKCS#7)

### 4.6 Email (Gmail API via Replit Integration)
- `GET /email/status` — verifica se Gmail esta conectado
- `POST /email/send-pre-session/:sessionId` — gera codigo de validacao + envia e-mail pre-sessao
- `POST /email/send-post-session/:sessionId` — envia e-mail pos-sessao com RAS PDF anexo
- `POST /email/send-weekly-reminders` — envia lembretes para todas as sessoes da proxima semana

### 4.7 Google Calendar (via Replit Integration)
- `GET /google-calendar/status` — status + lista de calendarios disponiveis
- `POST /google-calendar/sync-session/:sessionId` — sincroniza uma sessao
- `POST /google-calendar/sync-week` — body: {dateFrom, dateTo} — sincroniza semana inteira

### 4.8 Google Drive (via Replit Integration)
- `GET /google-drive/status` — verifica conexao
- `POST /google-drive/setup-client/:clientId` — cria estrutura de pastas do cliente
- `POST /google-drive/setup-all-clients` — cria pastas para todos os clientes
- `POST /google-drive/upload-protocol/:clientId` — body: {pdfBase64, protocolDate}
- `POST /google-drive/upload-ras/:clientId` — body: {pdfBase64, rasDate}

### 4.9 Outros
- `GET /health` — healthcheck
- `GET /stock`, `POST /stock`, etc. — gerenciamento de estoque
- `GET /payments`, `POST /payments`, etc. — financeiro
- `GET /professionals`, `POST /professionals`, etc. — profissionais
- `GET /locations`, `POST /locations`, etc. — locais/unidades
- `GET /validation-codes`, `POST /validation-codes/verify` — codigos de validacao
- `GET /dashboard/summary` — resumo operacional

---

## 5. INTEGRACOES GOOGLE (via Replit Connectors)

### 5.1 Padrao de Autenticacao
Todas usam o mesmo padrao:
```typescript
const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
const xReplitToken = process.env.REPL_IDENTITY
  ? "repl " + process.env.REPL_IDENTITY
  : process.env.WEB_REPL_RENEWAL
  ? "depl " + process.env.WEB_REPL_RENEWAL
  : null;

connectionSettings = await fetch(
  "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=CONNECTOR_NAME",
  { headers: { Accept: "application/json", "X-Replit-Token": xReplitToken } }
).then(res => res.json()).then(data => data.items?.[0]);

const accessToken = connectionSettings?.settings?.access_token
  || connectionSettings?.settings?.oauth?.credentials?.access_token;
```

### 5.2 Gmail (connector: google-mail)
- Arquivo: `artifacts/api-server/src/lib/google-gmail.ts`
- Usa googleapis v148 com OAuth2
- Funcao principal: `sendGmailMessage({to, subject, html, attachments?})`
- Attachments via MIME multipart manual (para PDF do RAS)
- IMPORTANTE: `getUncachableGmailClient()` — nao cachear o cliente

### 5.3 Google Calendar (connector: google-calendar)
- Arquivo: `artifacts/api-server/src/lib/google-calendar.ts`
- Funcoes: `listCalendars()`, `createCalendarEvent({calendarId, summary, description, start, end, reminders})`
- Duracao auto: IV=30min, IM=15min, Implant=60min
- Calendarios disponiveis: AGENDA GERAL, AGENDA MEDICO - TATUAPE, AGENDA ENFERMAGEM, etc.

### 5.4 Google Drive (connector: google-drive)
- Arquivo: `artifacts/api-server/src/lib/google-drive.ts`
- Estrutura de pastas por cliente:
```
PACIENTES/
└── [NOME COMPLETO SEM ACENTO] [CPF]/
    ├── CADASTRO/
    │   └── CADASTROS ANTIGOS/
    ├── PATOLOGIAS/
    ├── EXAMES/
    ├── AVALIACOES/
    ├── RECEITAS/
    ├── PROTOCOLOS/
    ├── FINANCEIRO/
    ├── CONTRATOS/
    ├── ATESTADOS/
    ├── LAUDOS/
    ├── TERMOS/
    ├── FOTO PERFIL/
    ├── IMAGENS/
    ├── PESQUISA/
    └── OUVIDORIA/
```
- Nomenclatura de protocolo PDF: `YY.MM.DD PROTOCOLO NOME DO CLIENTE.pdf`
- Nomenclatura de RAS PDF: `DD.MM.YY RAS NOME DO CLIENTE CPF.pdf`
- Idempotente: nao recria pastas existentes
- Auto-compartilha com e-mail do cliente (view-only)

---

## 6. ASSINATURA DIGITAL A1 ICP-BRASIL

- Certificado: `artifacts/api-server/certs/assinatura.pfx`
- Senha: `Padua4321@`
- CPF vinculado: 293.274.948-06
- Validade: ate 2026-09-22
- Biblioteca: `pdf-lib` (geracao) + `node-forge` (assinatura PKCS#7)
- Arquivo: `artifacts/api-server/src/lib/pdf-signer.ts`
- PDF multi-pagina: pagina 1 RAS, pagina 2+ fichas de substancias, ultima pagina termos de consentimento

---

## 7. FRONTEND — PAGINAS E ROTAS

### 7.1 Rotas (wouter)
| Path | Componente | Descricao |
|------|------------|-----------|
| / | Dashboard | Resumo operacional |
| /clients | Clients | Lista de clientes |
| /clients/new | NewClient | Cadastro de cliente |
| /clients/:id | ClientDetail | Ficha do cliente (com botao Google Drive) |
| /substances | Substances | Catalogo expandivel com info de saude |
| /protocols | Protocols | Lista de protocolos |
| /protocols/new | NewProtocol | Lancador guiado (ate 10 substancias) |
| /protocols/:id | ProtocolDetail | Detalhe + validacao + geracao de sessoes |
| /agenda | Agenda | Visao semanal consolidada |
| /ras | RAS | Lista de registros |
| /ras/:id | RASDetail | Detalhe + download PDF assinado |
| /stock | Stock | Estoque com alertas |
| /payments | Payments | Financeiro |
| /professionals | Professionals | Profissionais |

### 7.2 Agenda — Sistema de Cores dos Cards
```
Verde (border-l-green-500, bg-green-50) = Sessao concluida
Ambar (border-l-amber-500, bg-amber-50) = Parcialmente confirmada (alguma substancia aplicada)
Azul (border-l-blue-500, bg-blue-50) = Agendada para hoje
Cinza claro (border-l-slate-300) = Agendada para outro dia
Vermelho (border-l-red-500, bg-red-50) = Sessao perdida
Cinza (border-l-gray-400, opacity-50) = Cancelada
```

### 7.3 Substancias — Badges de Status
```
DISP = Disponivel para aplicar nesta sessao (cor da substancia)
PROX = Programada para proximo agendamento (cinza)
Aplicada = Anel verde + icone CheckCheck + cor solida
Pendente = Cor com opacidade CC + badge DISP/PROX
```

### 7.4 Substancias — Catalogo com Info de Saude
Cards expansiveis mostrando:
- Funcao principal
- Barras de impacto por sistema corporal (cardiovascular, neurologico, metabolismo, hepatico, imunologico, dermatologico, muscular, endocrino, longevidade)
- Cards coloridos: Longevidade, Qualidade de Vida, Sono, Energia, Libido, Performance Fisica, Forca Muscular, Clareza Mental, Pele/Cabelo/Unhas, Imunidade
- Efeitos percebidos, tempo para resultado
- Contraindicacoes, evidencia cientifica

---

## 8. E-MAIL — TEMPLATES HTML

### 8.1 Pre-sessao
- Subject: `Clinica Padua | Aplicacao Endovenosa | [CODIGO]`
- Header azul gradiente com logo
- Saudacao + data + hora + unidade
- Caixa de codigo de validacao (6 digitos, fonte grande)
- Tabela de substancias (nome, dose, sessao X/Y)
- **Primeira sessao**: bloco extra com detalhes de cada substancia (descricao, funcao, efeitos, energia, sono, performance, longevidade, pele)
- Rodape com aviso sobre RAS pos-aplicacao

### 8.2 Pos-sessao
- Subject: `Clinica Padua | Sessao Concluida | DD/MM/YYYY`
- Header verde gradiente
- Tabela de substancias com status (Aplicado/Nao aplicado)
- RAS PDF assinado em anexo (MIME multipart)

---

## 9. DADOS SEED — 8 SUBSTANCIAS

| ID | Nome | Categoria | Cor | Tipo | Rating |
|----|------|-----------|-----|------|--------|
| 1 | Glutationa | Antioxidante | #10B981 | IV | 5 |
| 2 | Vitamina C Endovenosa | Vitamina | #F59E0B | IV | 5 |
| 3 | Fosfatidilcolina | Lipolitico | #EF4444 | IV | 4 |
| 4 | NAD+ | Metabolico | #8B5CF6 | IV | 5 |
| 5 | Ozone Terapia | Terapia Oxidativa | #06B6D4 | IV | 4 |
| 6 | Vitamina D3 + K2 | Vitamina | #F97316 | IV | 4 |
| 7 | Complexo B | Vitamina | #3B82F6 | IV | 5 |
| 8 | Zinco + Selenio | Mineral | #14B8A6 | IM | 4 |

Todas com campos completos: description, mainFunction, perceivedEffects, timeToEffect, longevityBenefit, qualityOfLifeImpact, sleepBenefit, energyBenefit, libidoBenefit, physicalPerformance, muscleStrength, mentalClarity, skinHairNails, immuneSupport, contraindications, scientificEvidence, bodySystemEffects (JSON com scores 1-5 por sistema).

---

## 10. REGRAS DE NEGOCIO IMPORTANTES

1. **Consolidacao semanal**: Sessoes agrupadas por semana (seg-dom), uma visita por semana por cliente
2. **DISP vs PROX**: Cada substancia em uma sessao e marcada como "disp" (aplicar agora) ou "prox" (proximo)
3. **Confirmacao individual**: Cada substancia e confirmada separadamente via `POST /sessions/:id/confirm-substance`
4. **Codigo de validacao**: 6 caracteres alfanumericos (sem 0, O, I, 1 ambiguos), gerado na hora do envio do e-mail
5. **Procedure types**: "iv"=30min, "im"=15min, "implant"=60min
6. **PDF assinado**: A1 ICP-Brasil com PKCS#7 via node-forge
7. **Drive idempotente**: Nao recria pastas existentes, so acrescenta arquivos
8. **E-mail primeira sessao**: Inclui detalhes completos das substancias (longevidade, sono, energia, etc.)
9. **E-mail sessoes subsequentes**: Apenas codigo + substancias + dose (sem repetir info detalhada)
10. **Nomenclatura Drive**: Nome sempre MAIUSCULO SEM ACENTO + CPF

---

## 11. TECH STACK DETALHADA

- Node.js 24
- pnpm workspaces
- TypeScript 5.9
- React + Vite + TailwindCSS + shadcn/ui (Radix UI)
- Express 5
- PostgreSQL + Drizzle ORM + drizzle-kit
- Zod v4 + drizzle-zod
- Orval (codegen OpenAPI -> React Query hooks)
- @tanstack/react-query
- wouter (routing)
- pdf-lib + node-forge (PDF + assinatura digital)
- googleapis v148 (Gmail, Calendar, Drive)
- lucide-react (icones)
- date-fns + ptBR locale
- pino + pino-http (logging)
- esbuild (build do API server)

---

## 12. COMANDOS ESSENCIAIS

```bash
# Schema
pnpm --filter @workspace/db run push

# Codegen API
pnpm --filter @workspace/api-spec run codegen

# Dev
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/padcom run dev

# Build
pnpm run build

# Se porta 8080 travada
fuser -k 8080/tcp
```

---

## 13. VARIAVEIS DE AMBIENTE

- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — segredo de sessao
- `PORT` — porta do servidor (8080)
- Google integrations: via Replit Connectors (google-mail, google-calendar, google-drive) — OAuth automatico

---

## 14. FUNCIONALIDADES JA IMPLEMENTADAS (ULTIMA ATUALIZACAO)

- Bolinhas coloridas de status ao lado das substancias na agenda:
  - Verde com glow = aplicada (substancia confirmada)
  - Amarela com glow = DISP (disponivel para aplicar nesta sessao)
  - Marrom com glow = PROX (programada para proximo agendamento)
  - Vermelha com glow = nao aplicada / missed
- Cada location tem campo `address` e `googleCalendarId` mapeados
- Mapeamento atual:
  - Clinica Tatuape -> AGENDA MEDICO - TATUAPE (146251b9...)
  - Clinica Mooca -> AGENDA GERAL (clinica.padua.agenda@gmail.com)
  - Nurse Care -> AGENDA ENFERMAGEM - DOMICILIAR (65fbeb90...)
- Titulo do evento Calendar: `NOME COMPLETO SEM ACENTO CPF - Sem X - Aplicacao Endovenosa`
- Endereco da unidade no campo `location` do evento + no final da descricao
- PUT /locations/:id — permite atualizar googleCalendarId, address, color, etc.
- Eventos sao criados no calendario especifico da unidade (nao mais no "primary")

## 15. PROXIMAS IMPLEMENTACOES PENDENTES

- Compartilhamento do agendamento via Google Drive do cliente
- "Lancador" — fluxo guiado de criacao de protocolo com ate 10 substancias
- Pagina de gerenciamento de locais/agendas (frontend)
- Filtros avancados na agenda (por profissional, por unidade)
- Notificacoes push / WhatsApp
- Relatorios financeiros consolidados
