# PADAXOR — Linha de Produção
**Versão:** 30/07/2026 05:15 BRT | **Fonte de verdade visual:** Google Drive → pasta PADAXOR PROJETO → `PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx`

---

## 📬 CAIXA DE RECADOS — leia antes de começar qualquer tarefa

> **Para: Dr. Code** — de: Dr. Replit — 30/07/2026 00:12 BRT
>
> Itens 11 e 15 entregues e na `main` (commit `3a38349`).
>
> - **Item 11** (`/login` dedicado): `artifacts/padcom/src/pages/login/index.tsx` criado.
>   `CollaboratorGate` agora faz redirect para `/login?returnTo=<rota>` em vez de renderizar inline.
>   Dr. Lovable pode começar o item 12 — a tela que ele esperava está disponível.
>
> - **Item 15** (rebrand título): `artifacts/padcom/index.html` corrigido —
>   aba do browser e PWA agora dizem "PADAXOR — Motor Clínico".
>
> - **Linha de produção**: `docs/LINHA_DE_PRODUCAO/README.md` criado nesta pasta — estados atualizados abaixo.
>
> Próximos itens liberados para você (sem dependência pendente): **9** (tenant filter) e **11** (RBAC).
> Itens 18, 23, 28 continuam travados — dependências listadas na tabela abaixo.

---

> **Para: Dr. Code** — de: Dr. Replit — 30/07/2026 04:03 BRT
>
> **KAIZEN — Cloudflare como camada de execução da monetização**
> Documento completo em: `docs/dr-replit/KAIZEN_CLOUDFLARE_MONETIZACAO_26.07.30.md`
>
> CEO criou o token Cloudflare hoje com: R2 Write, DNS Write, AI Gateway, Workers AI,
> Account Analytics, Account Logs, Email Routing.
>
> Resumo do que o documento propõe (você numera e inclui na fila):
>
> - **Item A** (P1, M) — AI Gateway como proxy único de toda IA + injeção de x-tenant-id
>   → bloqueia todos os itens de medição; deve entrar antes do primeiro licenciado
> - **Item B** (P1, M) — Ledger append-only: as 3 colunas de Dr. Claude alimentadas pelo Gateway
>   → job noturno lê logs do AI Gateway e insere em billing_events
> - **Item C** (P2, M) — Circuit breaker: Workers bloqueia tenant com saldo zero antes do OpenAI
> - **Item D** (P0, G) — Extração da Central de IA para fora do clone
>   → sem este item o primeiro clone leva a IA por inércia e o modelo de negócio não fecha. Bloqueia o CLONE 1.
> - **Item E** (P2, M) — Fatura mensal automática via Asaas com descrição itemizada
> - **Item F** (P1, P) — Painel de prova de valor (dados já existem no banco — é leitura)
> - **Item G** (P2, P) — Royalty travado em 1 nível no código (assert na função calcularRoyalty)
>
> Há 4 perguntas diretas para você no final do documento (Q1–Q4).

---

> **Para: Dr. Code** — de: Dr. Replit — 30/07/2026 05:15 BRT
>
> **Item 40 — COFRE DE EXAMES: CLOUDFLARE R2 REAL CONECTADO**
> Commit: `eaca200b2f50ca0c6b7e410de6505107f2c072d0`
> Carta técnica completa: `docs/dr-replit/CARTA_DR_CODE_CLOUDFLARE_R2_26.07.30.md`
>
> O que mudou:
> - `artifacts/api-server/src/lib/examR2Storage.ts` migrado de Replit GCS para Cloudflare R2 REST API v4
> - Token: `CF_API_TOKEN` (Replit Secrets, já presente)
> - Account ID: `c68f93d5feb576ea2862974ec3564c48` (gravado como default no código)
> - Bucket: `institutopadua-exames-padaxor` (criado hoje, vazio, custo $0,00)
>
> Teste de ponta a ponta executado e aprovado (05:07 UTC):
> - PUT  → 200 OK (etag confirmado, tamanho 31 bytes)
> - HEAD → 200 EXISTE
> - DEL  → 200 OK (bucket voltou limpo)
>
> Interface pública não mudou — zero breaking change nos callers.
>
> **O que falta no Cloudflare para bilhetagem (você NÃO precisa fazer — é CEO + Dr. Replit):**
>
> | Passo | Recurso Cloudflare | Para qual Item | Estado |
> |---|---|---|---|
> | 1 | Criar AI Gateway "padaxor-central" | Item A (P1) | ❌ Não criado |
> | 2 | Criar D1 database "padaxor-billing" | Item C (P2) | ❌ Não criado |
> | 3 | Workers Script proxy + circuit breaker | Item C (P2) | ❌ Não criado |
> | 4 | Cron Trigger noturno (02h BRT) | Item B (P1) | ❌ Não criado |
> | 5 | DNS padaxor.com.br → Cloudflare NS | Item 12 (P1) | ⏳ Aguarda CEO |
>
> Sua frente agora (sem precisar de nada novo no Cloudflare):
> - **Item D** — Extração da Central de IA (P0, bloqueia CLONE 1)
> - **Item G** — calcularRoyalty() com assert de profundidade = 1 (P, pequeno)
> - **Responder Q1–Q4** do Kaizen para desbloquear os itens seguintes
>
> Dr. Replit

---

## Regra de uso

| Quem | O que faz aqui |
|---|---|
| Dr. Caio (CEO) | Marca **Estado** e **Prioridade** na planilha do Drive; responde **Decisões** |
| Dr. Code | Lê este .md antes de cada tarefa; atualiza após entregar |
| Dr. Replit | Lê este .md antes de cada tarefa; atualiza após entregar |
| Dr. Lovable | Lê este .md antes de cada tarefa; atualiza após entregar |
| Dr. Manus | Candidato para itens 34–35 quando desbloqueados |

---

## Linha de Produção (43 itens)

| Nº | Título | Responsável | Depende de | Estado | Prioridade | Esforço |
|---|---|---|---|---|---|---|
| 1 | Banco PostgreSQL Railway | Dr. Code | — | ✅ Concluído | P0 | P |
| 2 | API Server deployado no Railway | Dr. Code | 1 | ✅ Concluído | P0 | M |
| 3 | Token de colaborador no perímetro (Bearer) | Dr. Code | 2 | ✅ Concluído | P0 | P |
| 4 | Site/vitrine pública (parxis-site) | Dr. Replit | — | ✅ Concluído | P1 | M |
| 5 | Portão de captação da vitrine | Dr. Replit | 4 | ✅ Concluído | P1 | P |
| 6 | Login do Padaxor sem segunda senha | Dr. Code / Dr. Replit | 3 | ✅ Concluído | P0 | P |
| 7 | Backup automático do banco | Dr. Code | 1 | ✅ Concluído | P0 | P |
| 8 | Linha de produção sincronizada entre agentes | Dr. Replit | — | ✅ Concluído | P1 | P |
| 11 | Login dedicado PADAXOR (/login) | Dr. Replit | — | ✅ Concluído 30/07 | P1 | M |
| 15 | Rebrand título: PADAXOR — Motor Clínico | Dr. Replit | — | ✅ Concluído 30/07 | P1 | P |
| 40 | Cofre de exames Cloudflare R2 | Dr. Replit | — | ✅ Concluído 30/07 — commit eaca200 | P1 | M |
| **9** | **Isolamento multi-tenant entre clínicas** | **Dr. Code** | 1 | 🔴 Aberto | **P0** | G |
| **10** | **Auditoria de rotas: vazamento entre empresas** | **Dr. Replit** | 9 | 🔴 Aberto | **P0** | M |
| **41** | **Item D — Extração da Central de IA para fora do clone** | **Dr. Code** | — | 🔴 Aberto | **P0** | G |
| 12 | DNS padaxor.com.br → Cloudflare | Dr. Caio | — | ⏳ Aguarda CEO | P1 | P |
| 13 | Domínio próprio configurado no Railway | Dr. Code | 12 | ⏳ Aguarda 12 | P1 | P |
| 14 | Login do licenciado (separado do CEO) | Dr. Replit | 9 | 🔴 Aberto | P1 | M |
| 16 | Catálogo de módulos com preços | Dr. Replit | CEO | ⏳ Aguarda CEO | P2 | M |
| 17 | Cadeado nos módulos (moduleGuard por plano) | Dr. Replit | 16 | 🔴 Aberto | P2 | G |
| 18 | Mensagem de desejo / upsell | Dr. Replit | 16 | 🔴 Aberto | P2 | M |
| 19 | Bilhetagem de uso por clínica | Dr. Code | 17 | 🔴 Aberto | P2 | G |
| 20 | Onboarding automático ao fechar contrato | Dr. Replit | 17 | 🔴 Aberto | P2 | G |
| 21 | Painel de domínios: credenciais Zoho | Dr. Caio | — | ⏳ Aguarda CEO | P2 | P |
| 22 | E-mail transacional via Zoho por clínica | Dr. Replit | 21 | ⏳ Aguarda 21 | P2 | M |
| 23 | ZapSign em produção (assinatura digital) | Dr. Code | — | ⏳ Aguarda CEO | P2 | P |
| 24 | Portal do paciente (Área do Cliente) | Dr. Replit | 17 | 🔴 Aberto | P2 | G |
| 25 | Versão mobile PWA do Portal do Paciente | Dr. Lovable | 24 | ⏳ Aguarda 24 | P2 | G |
| 26 | Notificações WhatsApp pós-consulta | Dr. Replit | 24 | 🔴 Aberto | P2 | M |
| 27 | Dashboard SaaS CEO (receita, MRR) | Dr. Replit | 19 | 🔴 Aberto | P3 | G |
| 28 | CI/CD automático (GitHub Actions) | Dr. Code | — | 🔴 Aberto | P3 | G |
| 29 | Suíte de testes end-to-end (Playwright) | Dr. Replit | 28 | 🔴 Aberto | P3 | G |
| 30 | Renomear artifact padcom → padaxor | Dr. Replit | — | 🔴 Aberto | P3 | P |
| 31 | Planos do paciente (assinatura recorrente) | Dr. Lovable | 24 | ⏳ Aguarda 24 | P3 | G |
| 32 | Cockpit CEO v3 (SSE real-time) | Dr. Replit | 27 | 🔴 Aberto | P3 | M |
| 33 | Documentação técnica viva (CODIGO-PAXTER.md) | Dr. Replit | — | 🔴 Aberto | P3 | P |
| 34 | Dr. Manus: varredura autônoma de tenant filter | Dr. Manus | 28 | ⏳ Sem frente | P3 | G |
| 35 | Dr. Manus: testes de carga (10 clínicas) | Dr. Manus | 28 | ⏳ Sem frente | P3 | G |
| 36 | Integração Telegram (canal alternativo) | Dr. Replit | 26 | 🔴 Aberto | P3 | M |
| **42** | **Item A — AI Gateway como proxy único de IA** | **Dr. Replit** | CEO criar gateway | ⏳ Aguarda CEO | **P1** | M |
| **43** | **Item B — Ledger billing_events (3 colunas + job noturno)** | **Dr. Code + Dr. Replit** | 42 | ⏳ Aguarda 42 | **P1** | M |
| **44** | **Item C — Circuit breaker Workers + D1** | **Dr. Code + Dr. Replit** | 42, 43, CEO criar D1 | ⏳ Aguarda CEO | **P2** | M |
| **45** | **Item E — Fatura mensal automática Asaas** | **Dr. Replit** | 43 | 🔴 Aberto | **P2** | M |
| **46** | **Item F — Painel de prova de valor CEO** | **Dr. Replit** | — | 🔴 Aberto | **P1** | P |
| **47** | **Item G — calcularRoyalty() assert 1 nível** | **Dr. Code** | — | 🔴 Aberto | **P2** | P |

---

## Resumo por prioridade

| Prioridade | Total | Concluídos | Abertos | Aguardando CEO |
|---|---|---|---|---|
| P0 — Incêndio | 7 | 4 | 3 (itens 9, 10, 41) | — |
| P0 — Infra | 2 | 2 | — | — |
| P1 — Urgente | 9 | 5 | 2 (14, 46) | 3 (12, 42, DNS) |
| P2 — Importante | 14 | 0 | 7 | 5 (16, 21, 23, 44, +1) |
| P3 — Pode esperar | 10 | 0 | 8 | — |

---

## O que falta criar no Cloudflare (roteiro para o CEO)

| Passo | O que criar | Onde no painel | Desbloqueia |
|---|---|---|---|
| 1 | AI Gateway "padaxor-central" | dash.cloudflare.com → IA → AI Gateway → Criar gateway | Item 42 (P1) |
| 2 | D1 database "padaxor-billing" | dash.cloudflare.com → Workers e Pages → D1 → Criar banco | Item 44 (P2) |
| 3 | Worker "padaxor-gateway-worker" | dash.cloudflare.com → Workers e Pages → Criar Worker | Item 44 (P2) |
| 4 | Cron Trigger no Worker (02:00 BRT) | Mesma tela do Worker → aba Triggers | Item 43 (P1) |
| 5 | DNS padaxor.com.br no Cloudflare | dash.cloudflare.com → Adicionar site | Itens 12, 13 |

Detalhes técnicos de cada passo estão em:
`docs/dr-replit/CARTA_DR_CODE_CLOUDFLARE_R2_26.07.30.md` (seção 2.2)

---

## Matriz da Equipe

| Membro | Território principal | Nunca toca sem avisar | Fase atual |
|---|---|---|---|
| Dr. Caio (CEO) | Decisões de produto, preços, DNS, aprovações | Nenhum código | Criar AI Gateway + D1 no Cloudflare; responder decisões |
| Dr. Code | Infraestrutura Railway, CI/CD, migrations SQL, jobs, banco, deploy | Telas React e UX visual | P0: Extração da Central de IA (item 41) + responder Q1–Q4 do Kaizen |
| Dr. Replit | API routes, lógica de negócio, telas React, módulos clínicos | Infra Railway, CI config, banco em produção | Aguarda CEO criar AI Gateway para iniciar item 42 |
| Dr. Lovable | UI mobile (PWA), telas do paciente, design system do front | Rotas de API, banco, jobs, deploy | Aguarda Portal do Paciente (item 24) |
| Dr. Manus | Missões autônomas de análise, varredura, testes de carga | Deploy e banco em produção diretamente | Sem frente nesta fase; candidato itens 34–35 |

---

## Decisões do CEO (11 pendentes)

> Cada decisão está numerada. Responda **uma por vez** — cada resposta destrava os itens indicados.

| Nº | Decisão | Destrava |
|---|---|---|
| 1 | Migrar DNS para Cloudflare (trocar NS no Registro.br) | 12, 13 |
| **2** | **Valores em reais de cada módulo (ex: Agenda R$X/mês)** | **16, 17, 18** |
| 3 | Credenciais Zoho (ZOHO_ORG_ID + ZOHO_ADMIN_TOKEN) | 21, 22 |
| 4 | Token ZapSign de produção | 23 |
| 5 | Aprovar rebrand PAXTER → PADAXOR nas telas internas | 15 |
| 6 | Módulos incluídos no plano básico vs premium | 17 |
| 7 | Política de multi-local para médicos (quantas clínicas por médico?) | 14, 20 |
| 8 | Portal do paciente: login por CPF ou por convite com link? | 24, 25 |
| 9 | MRR mínimo para onboarding automático (abaixo = manual) | 20 |
| 10 | Regra de isolamento entre repositórios (Padaxor vs Parlegis) | Todos |
| **11** | **Criar AI Gateway "padaxor-central" no Cloudflare** | **42, 43, 44** |

---

> **Para: Dr. Code** — de: Dr. Replit — 30/07/2026 05:40 BRT
>
> **Simulação a seco do loop de provisionamento — commit `80077ea`**
>
> Rota disponível (sem token, pública):
> ```
> GET /api/provisionamento/dry-run?nome=CLINICA+FICTICIA&cnpj=00.000.000%2F0001-00
> ```
>
> O que a rota mostra:
>
> | Passo | Existe hoje | O que seria criado | O que falta |
> |---|---|---|---|
> | 1 Gatilho contrato/pagamento | ❌ NÃO EXISTE | — | Webhook Asaas + item 19 |
> | 2 Pasta raiz no Drive | ✅ EXISTE | `CLINICA FICTICIA 00.000.000/0001-00` | — |
> | 3 Subpastas da empresa (7) | ✅ EXISTE (7) | CLIENTES, CONTRATOS, CERTIFICADOS… | As 15 subpastas existem só para PACIENTE |
> | 4 E-mail @padaxor.com.br | ❌ NÃO EXISTE | — | Zoho (Decisão 3) + DNS (Decisão 1) |
> | 5 Subdomínio clinica.padaxor.com.br | ❌ NÃO EXISTE | — | DNS Cloudflare (Decisão 1 do CEO) |
> | 6 Linha na tabela de empresas | ✅ EXISTE | JSON com todos os campos | — |
>
> Arquivo: `artifacts/api-server/src/routes/provisionamento.ts`
> Nota: NUNCA cria nada. Dry-run puro, Art. 58 da Bíblia.
>
> Dr. Replit

---

*Atualizado por Dr. Replit em 30/07/2026 05:40 BRT.*
*Documentação completa do R2: `docs/dr-replit/CARTA_DR_CODE_CLOUDFLARE_R2_26.07.30.md`*
*Kaizen Cloudflare: `docs/dr-replit/KAIZEN_CLOUDFLARE_MONETIZACAO_26.07.30.md`*
