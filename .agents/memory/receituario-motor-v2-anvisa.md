---
name: Motor de Receituário V2 (ANVISA 4 boxes)
description: generateReceituarioPdfV2 no receituario-pdf.ts — interface, rota e botão frontend validados em produção.
---

# Motor de Receituário V2 — ANVISA 4 Boxes

## Regra

`generateReceituarioPdfV2(data: ReceituarioDataV2)` é o motor único para TODA prescrição magistral.
Zero `window.print()`, zero modelo hardcoded — qualquer tela de prescrição chama o backend.

**Why:** CEO determinou que todas as prescrições usem o motor real com ICP-Brasil.

## Como aplicar

- Backend auto-carrega: médico=professionals id=6, clínica=locations id=8 (Instituto Padua)
- Rota: `POST /api/receituario/emitir-prescricao`
- Body: `{ patient: {nome, cpf, dataNascimento, telefone}, formulas: [{nome, ativos, posologia, via, forma}], tipoReceita }`
- Drive folder fixo: `1v1eNJeRUBSR5wBucuBLnzkpGKHsrlnep`
- E-mail destino fixo: `drcaiohenriquepadua@gmail.com`
- PDF anexado ao e-mail via `sendGmailMessage` (com `attachments[]`)

## Dados confirmados (20/07/2026)

| Campo | Valor |
|---|---|
| `medico.name` | Dr. Caio Henrique Fernandes Pádua |
| `medico.crm` | CRM SP 123456 (DB) |
| `clinica.name` | Instituto Padua |
| `clinica.address` | Rua Guaxupé, 327 - Tatuapé - São Paulo - SP |
| `clinica.phone` | +5511977154000 |
| `locationsTable.nome_fantasia` | coluna snake_case no DB; acesso via `(clinica as any).nome_fantasia` |

## Layout do PDF

4 boxes ANVISA:
- Box 1 (EMITENTE): sempre preenchido (médico + clínica)
- Box 2 (PACIENTE): preenchido com dados reais do paciente
- Box 3 (COMPRADOR): linhas pontilhadas em branco (farmácia preenche)
- Box 4 (FORNECEDOR): linhas pontilhadas em branco (apenas para "especial")

## Frontend (prescricao/index.tsx)

- Botão "Gerar Receituário Assinado" chama `handleGerarReceituario()`
- `gerandoPdf` state controla spinner
- Toast de sucesso abre Drive URL automaticamente
- `tomadaToText(t)` converte cada Tomada em linha de posologia
