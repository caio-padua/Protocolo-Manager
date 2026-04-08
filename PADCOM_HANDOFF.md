# PADCOM - Handoff Tecnico para Projeto Paralelo

## Quem Sou
Sou a IA (Replit Agent) responsavel pelo desenvolvimento do **PADCOM** — sistema de gestao de protocolos injetaveis para a Clinica Padua (medicina estetica, Sao Paulo/SP).

O dono do sistema e o Dr. Padua, que e gerente e medico da clinica. Ele pediu para eu gerar este documento para facilitar a continuidade do trabalho por outra IA em um projeto paralelo.

---

## O Que e o PADCOM

Sistema web completo (React + Vite frontend, Express + Node backend, PostgreSQL) para gerenciamento de:
- **Clientes** (pacientes da clinica) com CPF, endereco, email
- **Protocolos injetaveis** (IV, IM, implantes, consultas) com substancias e dosagens
- **Sessoes semanais** com agendamento, validacao por senha (paciente + enfermeira), e confirmacao de aplicacao
- **Google Calendar** com eventos automaticos, cores por tipo, duracao calculada, descricao rica
- **Google Drive** com pasta por cliente para documentos
- **Gmail** para emails pre/pos sessao com informacoes das substancias
- **RAS (Relatorio de Atendimento de Saude)** em PDF com assinatura digital A1 ICP-Brasil
- **UI com cores TDAH-friendly** para facilitar a leitura rapida

---

## Stack Tecnica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui |
| Backend | Express.js + TypeScript (porta 8080) |
| Banco | PostgreSQL (Replit managed) via Drizzle ORM |
| Monorepo | pnpm workspaces |
| Google APIs | Calendar, Drive, Gmail (via Replit Integrations — OAuth automatico) |
| PDF | pdf-lib + node-forge (assinatura digital A1) |
| Deploy | Replit Deployments |

---

## Estrutura do Projeto

```
/artifacts
  /api-server          → Backend Express (porta 8080)
    /src
      /routes          → Endpoints REST (clients, sessions, substances, google-calendar, etc.)
      /lib             → Servicos (google-calendar.ts, email-service.ts, pdf-signer.ts, google-drive.ts)
    /certs             → Certificado A1 (assinatura.pfx, senha: Padua4321@, CPF: 293.274.948-06)
  /padcom              → Frontend React/Vite (preview path: /)
    /src/pages         → Paginas React (clients, sessions, protocols, etc.)
/lib
  /db/src/schema       → Schemas Drizzle (clients, sessions, substances, professionals, locations, etc.)
```

---

## Banco de Dados (Tabelas Principais)

| Tabela | Descricao |
|--------|-----------|
| `clients` | Clientes com name, cpf, email, phone, address, birthDate |
| `protocols` | Protocolos injetaveis com nome, descricao, categoria |
| `sessions` | Sessoes agendadas: client_id, professional_id, protocol_id, scheduled_date/time, unit, week_number, status |
| `substances` | Substancias com name, procedure_type (iv/im/implant), duration_minutes, category, color, stock_quantity |
| `substance_applications` | Aplicacoes por sessao: session_id, substance_id, dose, availability (disp/prox), status, applied_at |
| `professionals` | Profissionais com name, specialty (nao role), email |
| `locations` | Unidades com name, address, google_calendar_id |
| `validation_codes` | Codigos de validacao (paciente + enfermeira) para confirmar aplicacao |
| `stock` | Controle de estoque |
| `ras` | Relatorios de Atendimento de Saude |
| `payments` | Pagamentos |

---

## Google Calendar — Logica de Agendamento

### Duracao por Tipo de Procedimento
| Tipo | Duracao |
|------|---------|
| IV (endovenosa) | 30 min |
| IM (intramuscular) | 15 min |
| Implante | 60 min |
| Consulta | 60 min |

### Regra de Soma
Quando a sessao tem multiplos tipos DISP (disponivel para aplicacao), **soma-se os tempos**:
- IV + IM = 45 min
- IV + IM + Implante = 105 min (1H45MIN)
- So IM = 15 min

### Mapeamento de Agendas (6 locais → clinica.padua.agenda@gmail.com)
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
- **Domiciliar** → usa endereco do cliente (nao da clinica)

### Descricao do Evento
O evento contem:
1. **Checklist de procedimentos** com check/X e duracao individual:
   ```
   ✅ APLICACAO ENDOVENOSA - DURACAO: 30 MINUTOS
   ✅ APLICACAO INTRAMUSCULAR - DURACAO: 15 MINUTOS
   ❌ CONSULTA
   ❌ IMPLANTE

   DURACAO TOTAL: 45 MINUTOS
   ```
2. **Lista de substancias** com status colorido (🟢 DISP, 🔵 APLICADA, 🟤 PROX, ⚫ N/A)
3. **Bloco de endereco** (📍 ENDERECO com rua/bairro/CEP)
4. **Links de navegacao** (Google Maps + Waze)

### Atualizacao Pos-Aplicacao
Apos validacao paciente+enfermeira, chama `updateCalendarEventDescription()` para mudar dots de 🟢→🔵 (DISP→APLICADA)

---

## Validacao de Sessao

Fluxo dupla confirmacao:
1. **Paciente** insere codigo de validacao pessoal
2. **Enfermeira** insere codigo de validacao profissional
3. Sistema confirma cada substancia individualmente (por-substancia)
4. Atualiza `substance_applications.applied_at` e `status`
5. Atualiza descricao do evento no Google Calendar

---

## PDF RAS com Assinatura Digital

- Gera PDF do Relatorio de Atendimento de Saude
- Assina com certificado A1 ICP-Brasil (PFX)
- CPF do assinante: 293.274.948-06
- Caracteres WinAnsi safe (sem ★ ✓ ⏱ ◉ — usa alternativas ASCII)

---

## Preferencias do Dono

- Falar "cliente" e nao "paciente"
- Tudo em MAIUSCULO nos eventos e descricoes
- UI com cores fortes e contrastantes (TDAH-friendly)
- Professionals usam campo `specialty` (nao `role`)
- Nao existe coluna `coren` na tabela professionals
- Endereco CEP de referencia: Rua Guaxupe, 327, Tatuape, SP, CEP 03416-050

---

## Integrações Replit Configuradas

| Integracao | Uso |
|------------|-----|
| google-calendar | Agendamento automatico de sessoes |
| google-drive | Pasta por cliente com documentos |
| google-mail | Emails pre/pos sessao |

Todas usam OAuth via Replit Integrations — o token e renovado automaticamente. Nao precisa de API key manual.

---

## Comandos Uteis

```bash
# Reiniciar API server
# Via workflow: "artifacts/api-server: API Server"
# Ou: fuser -k 8080/tcp && pnpm --filter @workspace/api-server run dev

# Push schema para banco
pnpm --filter @workspace/db run push

# SQL direto
psql "$DATABASE_URL" -c 'SELECT ...'

# Testar endpoint
curl -s -X POST http://localhost:8080/api/google-calendar/sync-session/123
```

---

## Funcionalidades Pendentes / Em Progresso

1. **Email semanal para o cliente** no inicio da semana com info completa do protocolo
2. **Consolidacao semanal** de sessoes
3. **Google Drive** — estrutura de pastas por cliente (implementacao existe, precisa validar)

---

## Arquivos-Chave para Referencia

| Arquivo | Descricao |
|---------|-----------|
| `artifacts/api-server/src/lib/google-calendar.ts` | Toda a logica de criacao/atualizacao de eventos |
| `artifacts/api-server/src/routes/google-calendar.ts` | Endpoints REST para sync de sessoes |
| `artifacts/api-server/src/routes/clients.ts` | CRUD de clientes |
| `artifacts/api-server/src/lib/email-service.ts` | Servico de email (Gmail) |
| `artifacts/api-server/src/lib/pdf-signer.ts` | Geracao e assinatura de PDF RAS |
| `lib/db/src/schema/sessions.ts` | Schema de sessoes |
| `lib/db/src/schema/substances.ts` | Schema de substancias |
| `lib/db/src/schema/locations.ts` | Schema de locais com calendar IDs |

---

*Documento gerado em 08/04/2026 pelo Replit Agent trabalhando no projeto PADCOM.*
