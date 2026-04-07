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
- Tables: clients, substances, professionals, locations, protocols, protocol_items, sessions, substance_applications, ras, stock, payments
- Locations: Clínica Tatuapé, Clínica Mooca, Nurse Care Domiciliar
- `location_professionals` junction table

### Key Features
- **Lançador**: Single-page guided protocol creation with up to 10 substance slots (per-substance start date, frequency, dose)
- **Weekly consolidation**: Sessions grouped by week (Mon-Sun), one visit per week per client
- **ICS integration**: Download ICS files per session or per week; Google Calendar deep links
- **WhatsApp reminders**: Pre-formatted messages sent to client's phone
- **A1 ICP-Brasil signature**: PDF generation with PKCS#7 digital signature using clinic's A1 certificate
- **Per-substance confirmation**: Each substance in a session confirmed individually (DISP/PROX badges)
- **Color-coded UI**: TDAH-friendly with substance color pills throughout

## Working Language
- UI and user communication in Portuguese (Brazil)
- Term: "cliente" (not "paciente")

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
