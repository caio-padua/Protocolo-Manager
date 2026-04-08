# Padcon Conect — Motor Clinico | Protocolos Injetaveis

## Overview

Sistema completo (SaaS) para gerenciamento de protocolos injetaveis em clinica de medicina estetica (Brasil). Monorepo pnpm com TypeScript. Marca: **Padcon Conect** (com 1 N). Tagline: "Motor Clinico | Protocolos Injetaveis".

## Branding

- **Nome**: Padcon Conect (1 N — decisao de marca)
- **Paleta principal**: Verde-petroleo (#3D7A7A / hsl(180,30%,28%)), Ciano (#45B8CC / hsl(187,72%,48%)), Branco
- **Estilo visual**: Bordas quadradas (radius 6px), cards com borda lateral colorida, MAIUSCULO nos labels KPI, elegante/empirico, sem infantilidades
- **Logo**: SVG no sidebar (PadconLogo component) — "Pad" branco + "con" ciano + "CONECT" subtitulo
- **Sidebar**: Verde-petroleo escuro, menu com bordas finas, item ativo com destaque ciano
- **TDAH-friendly**: Cores fortes e contrastantes, labels em uppercase com tracking expandido, hierarquia visual clara

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)
- **PDF**: pdf-lib (generation) + node-forge (A1 ICP-Brasil digital signature)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Project Structure

### Frontend (`artifacts/padcom`)
- **Dashboard** — overview
- **Clientes** — CRUD de clientes with Google Drive folder setup button
- **Protocolos** — lista + detalhe + **Lançador** (guided single-page protocol creation)
- **Agenda** — weekly session view with ICS download, Google Calendar sync, WhatsApp reminders, color-coded status cards
- **RAS** — Registro de Administração de Substâncias with A1 ICP-Brasil digital signature PDF download
- **Estoque** — stock management with critical/low alerts
- **Financeiro** — payments tracking
- **Profissionais** — staff management
- **Substâncias** — comprehensive substance catalog with expandable detail cards showing health benefits, body system impact bars, longevity/sleep/energy/performance info

### API Server (`artifacts/api-server`)
- All routes under `/api/` prefix
- Vite proxy configured in padcom: `/api` → port 8080
- Digital signature: A1 certificate at `certs/assinatura.pfx` (CPF 293.274.948-06)

### Database (`lib/db`)
- Tables: clients, substances, professionals, locations, protocols, protocol_items, sessions, substance_applications, ras, stock, payments, validation_codes
- Locations: Clínica Tatuapé, Clínica Mooca, Nurse Care Domiciliar
- `location_professionals` junction table

### Substances Schema
- `procedureType`: "iv" (endovenoso, 30min), "im" (intramuscular, 15min), "implant" (implante, 1h)
- `durationMinutes`: default duration per procedure type
- `description`, `mainFunction`, `perceivedEffects`, `timeToEffect`: clinical info
- `starRating`: 1-5 efficacy rating
- `bodySystemEffects`: JSON with effects per body system (cardiovascular, neurologico, metabolismo, hepatico, imunologico, dermatologico, muscular, endocrino, longevidade, etc.)
- Health/Wellness fields: `longevityBenefit`, `qualityOfLifeImpact`, `sleepBenefit`, `energyBenefit`, `libidoBenefit`, `physicalPerformance`, `muscleStrength`, `mentalClarity`, `skinHairNails`, `immuneSupport`, `contraindications`, `scientificEvidence`, `categoryType`

### Key Features
- **Lançador**: Single-page guided protocol creation with up to 10 substance slots (per-substance start date, frequency, dose)
- **Weekly consolidation**: Sessions grouped by week (Mon-Sun), one visit per week per client
- **ICS integration**: Download ICS files per session or per week; Google Calendar deep links
- **WhatsApp reminders**: Pre-formatted messages sent to client's phone
- **A1 ICP-Brasil signature**: Multi-page PDF with RAS + substance info sheets + consent terms, digitally signed with PKCS#7
- **Per-substance confirmation**: Each substance in a session confirmed individually (DISP/PROX badges)
- **Color-coded session cards**: Green=completed, Amber=partially confirmed, Blue=today, Red=missed, Gray=cancelled
- **Substance pills with visual state**: Applied substances show green ring + checkmark; pending show DISP/PROX badge
- **TDAH-friendly UI**: Color-coded, high contrast, clear visual hierarchy throughout
- **Validation codes**: 6-digit alphanumeric codes for client identity verification
- **Procedure types**: IM (15min), IV (30min), Implant (1h)
- **Automated emails via Gmail API** (Replit Google Integration — OAuth):
  - Subject format: `Clinica Padua | Aplicacao Endovenosa | A7K3M2`
  - Pre-session: validation code, substance list, schedule info (HTML template)
  - First-session emails: Include detailed substance benefit info (longevity, sleep, energy, performance, etc.)
  - Post-session: completed substances + signed RAS PDF attachment via MIME multipart
  - Weekly batch: `/api/email/send-weekly-reminders`
  - Uses `google-gmail` connector via Replit integrations
- **Google Calendar sync** (Replit Google Integration — OAuth):
  - Per-session: `/api/google-calendar/sync-session/:id`
  - Per-week: `/api/google-calendar/sync-week`
  - Duration auto-set: IV=30min, IM=15min, Implant=60min
  - Connected calendars include: AGENDA GERAL, AGENDA MEDICO, AGENDA ENFERMAGEM
- **Google Drive integration** (Replit Google Integration — OAuth):
  - Client folder structure: `PACIENTES/[CLIENT NAME] [CPF]/` with 15 subfolders
  - Subfolders: CADASTRO (with CADASTROS ANTIGOS), PATOLOGIAS, EXAMES, AVALIACOES, RECEITAS, PROTOCOLOS, FINANCEIRO, CONTRATOS, ATESTADOS, LAUDOS, TERMOS, FOTO PERFIL, IMAGENS, PESQUISA, OUVIDORIA
  - Protocol PDF naming: `YY.MM.DD PROTOCOLO NOME DO CLIENTE.pdf`
  - RAS PDF naming: `DD.MM.YY RAS NOME DO CLIENTE CPF.pdf`
  - Idempotent: won't recreate existing folders
  - Auto-share view-only with client email
  - Setup per-client: `/api/google-drive/setup-client/:clientId`
  - Upload protocol/RAS to Drive: `/api/google-drive/upload-protocol/:clientId`, `/api/google-drive/upload-ras/:clientId`

## Working Language
- UI and user communication in Portuguese (Brazil)
- Term: "cliente" (not "paciente")

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
