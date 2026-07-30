# PADAXOR — Linha de Produção
**Versão:** 29/07/2026 | **Fonte de verdade visual:** Google Drive → pasta PADAXOR PROJETO → `PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx`

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

## Linha de Produção (36 itens)

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
| **9** | **Isolamento multi-tenant entre clínicas** | **Dr. Replit** | 1 | 🔴 Aberto | **P0** | G |
| **10** | **Auditoria de rotas: vazamento entre empresas** | **Dr. Replit** | 9 | 🔴 Aberto | **P0** | M |
| **11** | **RBAC por empresa (licenciado só vê a própria)** | **Dr. Code** | 9 | 🔴 Aberto | **P0** | G |
| 12 | DNS padaxor.com.br → Cloudflare | Dr. Caio | — | ⏳ Aguarda CEO | P1 | P |
| 13 | Domínio próprio configurado no Railway | Dr. Code | 12 | ⏳ Aguarda 12 | P1 | P |
| 14 | Login do licenciado (separado do CEO) | Dr. Replit | 11 | 🔴 Aberto | P1 | M |
| 15 | Rebrand PAXTER → PADAXOR (telas internas) | Dr. Replit | — | ⏳ Aguarda CEO | P1 | M |
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

---

## Resumo por prioridade

| Prioridade | Total | Concluídos | Abertos | Aguardando CEO |
|---|---|---|---|---|
| P0 — Incêndio | 6 | 4 | 2 (itens 9–10) | — |
| P0 — Infra | 2 | 2 | — | — |
| P1 — Urgente | 5 | 3 | 1 (item 14) | 2 (12, 15) |
| P2 — Importante | 11 | 0 | 5 | 4 (16, 21, 23, +1) |
| P3 — Pode esperar | 10 | 0 | 8 | — |

---

## Matriz da Equipe

| Membro | Território principal | Nunca toca sem avisar | Fase atual |
|---|---|---|---|
| Dr. Caio (CEO) | Decisões de produto, preços, DNS, aprovações | Nenhum código | Desbloqueia a fila respondendo decisões |
| Dr. Code | Infraestrutura Railway, CI/CD, migrations SQL, jobs, banco, deploy | Telas React e UX visual | P0 infra + banco (itens 9–11, 13, 19, 23, 28) |
| Dr. Replit | API routes, lógica de negócio, telas React, módulos clínicos | Infra Railway, CI config, banco em produção | P0 isolamento multi-tenant + P1 login licenciado |
| Dr. Lovable | UI mobile (PWA), telas do paciente, design system do front | Rotas de API, banco, jobs, deploy | Aguarda Portal do Paciente (item 24) |
| Dr. Manus | Missões autônomas de análise, varredura, testes de carga | Deploy e banco em produção diretamente | Sem frente nesta fase; candidato itens 34–35 |

---

## Decisões do CEO (10 pendentes)

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

---

*Atualizado por Dr. Replit em 29/07/2026. Fonte de verdade visual: Drive → PADAXOR PROJETO → PADAXOR_LINHA_DE_PRODUCAO_26.07.29.xlsx*
