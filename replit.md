# PADCOM — Protocolos Injetáveis

## Overview

Sistema completo para gerenciamento de protocolos injetáveis em clínica de medicina estética (Brasil). Monorepo pnpm com TypeScript.

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
- **Clientes** — CRUD de clientes
- **Protocolos** — lista + detalhe + **Lançador** (guided single-page protocol creation)
- **Agenda** — weekly session view with ICS download, Google Calendar deep links, WhatsApp reminders
- **RAS** — Registro de Administração de Substâncias with A1 ICP-Brasil digital signature PDF download
- **Estoque** — stock management with critical/low alerts
- **Financeiro** — payments tracking
- **Profissionais** — staff management
- **Substâncias** — substance catalog

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
- `description`, `mainFunction`, `perceivedEffects`, `timeToEffect`: clinical info displayed on substance cards and included in PDF
- `starRating`: 1-5 efficacy rating
- `bodySystemEffects`: JSON with effects per body system (Pele, Cardiovascular, Neurológico, etc.)

### Key Features
- **Lançador**: Single-page guided protocol creation with up to 10 substance slots (per-substance start date, frequency, dose)
- **Weekly consolidation**: Sessions grouped by week (Mon-Sun), one visit per week per client
- **ICS integration**: Download ICS files per session or per week; Google Calendar deep links
- **WhatsApp reminders**: Pre-formatted messages sent to client's phone
- **A1 ICP-Brasil signature**: Multi-page PDF with RAS + substance info sheets + consent terms, digitally signed with PKCS#7
- **Per-substance confirmation**: Each substance in a session confirmed individually (DISP/PROX badges)
- **Color-coded UI**: TDAH-friendly with substance color pills throughout
- **Validation codes**: 6-digit alphanumeric codes for client identity verification (generate, verify, WhatsApp delivery)
- **Procedure types**: IM (15min), IV (30min), Implant (1h) — each substance categorized with default duration
- **Automated emails via Gmail API** (Replit Google Integration — OAuth, no app password needed):
  - Subject format: `Clinica Padua | Aplicacao Endovenosa | A7K3M2`
  - Pre-session: validation code, substance list, schedule info (HTML template)
  - Post-session: completed substances + signed RAS PDF attachment via MIME multipart
  - Weekly batch: `/api/email/send-weekly-reminders` sends to all upcoming sessions
  - Uses `google-gmail` connector via Replit integrations
- **Google Calendar sync** (Replit Google Integration — OAuth):
  - Per-session: `/api/google-calendar/sync-session/:id` creates event with substances, duration, reminders
  - Per-week: `/api/google-calendar/sync-week` batch creates all sessions of the week
  - Duration auto-set: IV=30min, IM=15min, Implant=60min
  - Connected calendars include: AGENDA GERAL, AGENDA MEDICO, AGENDA ENFERMAGEM
  - Uses `google-calendar` connector via Replit integrations

## Working Language
- UI and user communication in Portuguese (Brazil)
- Term: "cliente" (not "paciente")

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
