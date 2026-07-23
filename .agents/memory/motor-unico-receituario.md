---
name: Motor Único de Receituário
description: Arquitetura do motor único que unifica 4 motores de PDF de receituário num ponto de entrada; tabela receituario_modelos governa qual motor está ativo. TODAS as rotas de emissão redirecionadas (Passo 4 completo em 23/07/2026).
---

# Motor Único de Receituário

## A regra

Todas as emissões de receituário passam pela função `emitirReceituarioPdf()` em `lib/receituario-motor.ts`.
O modelo ativo na tabela `receituario_modelos` determina qual motor interno é usado.

**Why:** O sistema tinha 4 motores independentes (M1=legacy, M2=ANVISA V2, M3=prescriptions, M4=Puppeteer+HTML). Isso causava inconsistência visual e de assinatura. O motor único resolve com um único ponto de dispatch.

## Tipos de modelo disponíveis

| tipo           | Motor interno                          | Assinatura |
|----------------|----------------------------------------|------------|
| faixas_paxter  | buildPrescricaoHtml + Puppeteer + PAdES | Sim        |
| classico_anvisa| generateReceituarioPdfV2 (pdf-lib)      | Sim        |

## Passo 4 — Rotas legacy redirecionadas (completo em 23/07/2026)

| Rota                              | Antes (motor direto) | Depois (motor único) |
|-----------------------------------|----------------------|----------------------|
| POST /receituario/gerar-demo      | M1 (generateReceituarioPdf) | emitirReceituarioPdf() |
| POST /receituario/emitir-prescricao | M2 (generateReceituarioPdfV2) | emitirReceituarioPdf() |
| POST /receituario/emitir-cliente  | M4 raw (Puppeteer direto) | emitirReceituarioPdf() |
| POST /receituario/assinar-imagem-pdf | mantido (propósito diferente: assina PNG pré-capturado) | — |

**emitir-cliente** agora aceita `clientId` OU `patient` direto (compatibilidade mantida).

## Farmácia — Dupla saída (implementado em 23/07/2026)

`POST /api/prescriptions/emit` gera DOIS outputs:
- **M3 (regulatório)** → farmácia: PDFs por cor ANVISA, SNCR numerado, upload Drive da farmácia, WhatsApp
- **Motor único (visual)** → paciente: step 2.5 best-effort, campo `pacientePdfMotorUnico` na resposta

**Why:** a farmácia precisa do PDF regulatório M3 (cor, SNCR). O paciente precisa da receita visual bela e assinada via motor único. Separar as duas saídas resolve o layout hardcoded sem quebrar a regulação ANVISA.

Falha no motor único NÃO cancela o M3 (try/catch isolado, log warn).

## Tabela DB: receituario_modelos

Criada via raw SQL (`db.execute(sql\`...\`)`), nunca via db push.
Seed automático no primeiro boot: 2 modelos padrão (Faixas Paxter = ativo, Clássico ANVISA = inativo).
Apenas 1 modelo pode estar ativo (garantido via UPDATE receituario_modelos SET ativo=FALSE antes do SET ativo=TRUE).

## Arquivos

- `artifacts/api-server/src/lib/receituario-motor.ts` — motor único + CRUD de modelos
- `artifacts/api-server/src/routes/receituario.ts` — rotas legacy (todas redirecionadas)
- `artifacts/api-server/src/routes/prescriptions.ts` — farmácia (step 2.5 = motor único)
- `artifacts/api-server/src/routes/receituario-modelos.ts` — rotas REST CRUD
- `artifacts/padcom/src/pages/modelo-receituario/index.tsx` — tela de seleção
- `artifacts/padcom/src/pages/prescricao/index.tsx` — bloco ciano pacientePdfMotorUnico

## certMeta no HTML

`buildPrescricaoHtml()` aceita `certMeta?: CertMetaHtml | null`.
O bloco de certificado no HTML usa os dados reais do PFX quando disponíveis, com fallback para dados do médico.
