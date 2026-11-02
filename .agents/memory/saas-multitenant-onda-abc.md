---
name: SaaS Multi-tenant ONDA A/B/C — pirâmide PAXTER
description: Decisões e estado da migração multi-tenant (schema + middleware + UI) executada em 16/07/2026
---

## Regra central

Empresa_id em TODA tabela clínica — isolamento por tenant.
Fase atual: single-tenant (empresa_id=5 fixo), middleware pronoto para upgrade.

## Estrutura empresarial desejada pelo CEO (02/11/2026)

O modelo empresarial pretendido é de empresas independentes, com uma relação específica entre Instituto Padua e Paduzzi. A palavra “filial” ainda precisa ser confirmada contra os documentos societários; uma empresa do mesmo grupo não é automaticamente uma filial jurídica.

O CEO confirmou em 02/11/2026 que o vínculo usado no código semântico será uma classificação interna escolhida por ele. Esse vínculo não declara filial jurídica e não substitui a hierarquia de licenciamento.

Em 02/11/2026, o CEO informou que os CNPJs presentes nos cadastros de desenvolvimento são fictícios e indicou preservar como identidade canônica Instituto Padua, Paduccia Clínica Médica e Clínica Padua. A decisão não autoriza inferir quais registros excluir nem dispensa conferir dependências antes de migrar referências.

**Why:** A base de desenvolvimento mostra relações de licenciamento e empresa-mãe que não coincidem integralmente com a estrutura empresarial declarada pelo CEO. Além disso, o CNPJ cadastrado para Paduzzi tem raiz diferente do CNPJ do Instituto Padua, o que não confirma uma filial jurídica. O CEO distinguiu expressamente o vínculo interno do vínculo jurídico.

**How to apply:** Manter separados o código semântico interno, a hierarquia de licenciamento do produto e a relação societária legal. O CEO pode definir o vínculo interno no código sem alterar os outros dois. Tratar os CNPJs atuais de desenvolvimento como sintéticos, sem reutilizá-los como dados oficiais; preservar a identidade Padua/Paduccia e verificar referências antes de consolidar registros. Não reclassificar a relação jurídica sem documentos.

## Código semântico por unidade clínica

Cada unidade clínica recebe seu próprio código `BASE.VINC.CNPJ4.SEQ4`; a sequência é global, estável e nunca reutilizada. O vínculo é uma classificação interna do CEO, sem efeito jurídico ou comercial. A base, o vínculo e o CNPJ precisam ficar coerentes com o código já emitido.

**Why:** Um código por empresa não diferencia unidades distintas e não atende à rastreabilidade solicitada pelo CEO. A sequência precisa sobreviver a renomeações e não pode coincidir com o identificador técnico do banco.

**How to apply:** Gerar a sequência na criação da unidade, mas só emitir o código quando o CEO confirmar a classificação e os dados fiscais. Proteger emissão e leitura por autenticação no servidor, derivar a empresa da sessão, impedir reutilização e bloquear emissão quando o CNPJ estiver duplicado ou inválido.

## O que foi feito (ONDA A — 16/07/2026)

### Schema pirâmide (empresas)
- Campos adicionados: `tipoLicenciamento` (propria/licenciada_direta/licenciada_por_clinica/sub_unidade), `empresaMaeId`, `royaltyPercent`, `valorMensalContrato`, `isPlatformOwner`
- Locations: campo `empresaId` adicionado

### Migration SQL (35 tabelas clínicas)
- ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id)
- **NUNCA usar db push** para essa migration (causa DROP em tabelas populadas)
- Sempre SQL manual via psql

Tabelas migradas:
clients, professionals, sessions, ras, ras_evolutivo, payments, stock_items, protocols, protocol_items, substance_applications, nursing_assessments, task_cards, client_ratings, validation_codes, anamnese_sessions, anamnese_resposta, budgets, scheduling_requests, exam_results, exam_documents, prescriptions, prescription_items, recipes, referrals, medical_certificates, lembretes_prescricao, lembrete_envios, mensageria_lembrete, dispatch_log, exam_request_pdfs, dieta_prescricao, treino_prescricao, pulso_diario, whatsapp_mensagens_log, anamnese_findings

### Backfill
- Todas as linhas existentes → empresa_id = 5 (Instituto Pádua)
- Verificação: zero NULLs em clients, professionals, sessions, ras, payments, protocols

### Índices
- idx_clients_empresa, idx_professionals_empresa, idx_sessions_empresa, idx_ras_empresa, idx_payments_empresa, idx_protocols_empresa, idx_anamnese_sessions_empresa, idx_exam_results_empresa, idx_budgets_empresa

### Middleware
- `artifacts/api-server/src/middleware/tenantContext.ts`
- Registrado em `app.ts` (antes de `/api` router)
- Fase atual: empresaId=5 fixo, isPlatformOwner=true
- Função `resolveEmpresaId(req)` para query com override cross-tenant (platform_owner)
- Guard `requirePlatformOwner` para rotas CEO-only

### Dados backfill empresas
- id=5: Instituto Pádua (propria, isPlatformOwner=false, empresaMaeId=6)
- id=6: PAXTER SERVICOS LTDA (isPlatformOwner=true, topo da pirâmide)
- id=7: Instituto Barakat (licenciada_direta, R$500/mês, royalty 0%)
- id=8: Instituto Paluzze (licenciada_direta, R$500/mês, royalty 30%)
- id=3: Instituto Barros (licenciada_por_clinica sob Paluzze=8, R$300/mês)
- 17 locations → empresaId=5

### Revenue math (verificado com carta)
R$500 (Barakat) + R$500 (Paluzze) + R$90 (30% royalty de Paluzze sobre Barros R$300) = R$1.090/mês

### Drive setup
- Rota `POST /api/empresas/:id/setup-drive` usa `r.data.id!` (Drive hash string, não integer)
- Evita bug do IHE (que usava integer ID como Drive folder ID)

### UI
- `artifacts/padcom/src/pages/hierarquia.tsx` — organograma visual em árvore
- `artifacts/padcom/src/pages/cadastros/empresas-licenciadas.tsx` — Centro de Comando com KPIs + CRUD
- Rota `/hierarquia` e `/cadastros/empresas-licenciadas` registradas em App.tsx
- Página de licenciadas atrás de CollaboratorGate (correto — só CEO vê)

## ONDA B — concluída em 16/07/2026

### Schemas Drizzle (empresaId adicionado)
clients, sessions, ras, prescriptions, payments, stock, protocols, exam-results (examDocumentsTable)

### Rotas isoladas (resolveEmpresaId + WHERE empresa_id = empresaId)
- GET /clients (3 branches: status / search / all — cada um com and(tenantFilter, ...))
- GET /sessions (WHERE no DB, não JS)
- GET /ras (WHERE no DB)
- GET /prescriptions (WHERE + orderBy + limit)
- GET /payments (WHERE no DB)
- GET /stock (WHERE simples)
- GET /protocols (4 branches com and(tenantFilter, ...))
- GET /exames-lab/documentos (and(tenantFilter, clientId?, notIgnored))

### Verificação pós-deploy (curl confirmado)
Todas as 8 tabelas: linhas_fora_do_tenant = 0.
GET /clients → 5271, /sessions → 245, /payments → 12, /protocols → 24.

## ONDA C — concluída em 16/07/2026

### INSERT/POST herdam empresaId automaticamente
- POST /clients → `{ ...clientData, empresaId }`
- POST /sessions → `{ ...parsed.data, empresaId }`
- POST /protocols → `{ ...protocolData, empresaId, ... }`
- POST /payments → `{ ..., empresaId }`
- POST /stock → `{ ...parsed.data, empresaId }`
- POST /ras → `{ ..., empresaId }`
- POST /prescriptions/emit → `{ ..., empresaId }`
- POST /exames-lab/ingest → `startExamIngestion` recebe `empresaId?: number | null`

### Verificação
- POST /clients → id=5274, empresaId=5 ✅ (cliente de teste removido após)
- SELECT empresa_id FROM clients → 5 ✅

## O que NÃO foi feito (futuro)

- onboarding_steps SAGA table (não criada ainda)
- LGPD GET /empresas/:id/exportar-dados (obrigação legal)
- Auth multi-tenant completa (JWT/session com empresa_id do payload)
- Tela CEO Swipe entre clínicas (SSE tempo real)
- IA Clínica: Claude opus-4, atestado, sugestão de exames
- ElevenLabs TTS no WhatsApp por tomada de medicação
- Billing por uso (Stripe Metered ou Lago)

**Why:** Fase A = fundação (schema + middleware + UI). Fase B = ativar filtragem em rotas.

**How to apply:** Ao adicionar qualquer nova tabela clínica, ADD COLUMN empresa_id + backfill + índice. Nunca DROP. Ao escrever rotas clínicas, usar `resolveEmpresaId(req)` no WHERE.
