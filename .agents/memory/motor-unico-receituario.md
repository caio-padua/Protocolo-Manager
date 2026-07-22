---
name: Motor Único de Receituário
description: Arquitetura do motor único que unifica 4 motores de PDF de receituário num ponto de entrada; tabela receituario_modelos governa qual motor está ativo.
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

## Tabela DB: receituario_modelos

Criada via raw SQL (`db.execute(sql`...`)`), nunca via db push.
Seed automático no primeiro boot: 2 modelos padrão (Faixas Paxter = ativo, Clássico ANVISA = inativo).
Apenas 1 modelo pode estar ativo (garantido via UPDATE receituario_modelos SET ativo=FALSE antes do SET ativo=TRUE).

## Arquivos

- `artifacts/api-server/src/lib/receituario-motor.ts` — motor único + CRUD de modelos
- `artifacts/api-server/src/routes/receituario-modelos.ts` — rotas REST CRUD
- `artifacts/padcom/src/pages/modelo-receituario/index.tsx` — tela de seleção
- `scripts/test-receituario-motor.sh` — suite de testes determinística (16 testes, 0 falhas)

## certMeta no HTML

`buildPrescricaoHtml()` aceita `certMeta?: CertMetaHtml | null` (adicionado em 22/07/2026).
O bloco de certificado no HTML usa os dados reais do PFX quando disponíveis, com fallback para dados do médico.

## Rota frontend

`/modelo-receituario` — adicionada no App.tsx no nível raiz do Switch (fora de qualquer path prefix).
Entrada no sidebar: seção "Configurações" → "Modelo de Receituários".

## Testes

`bash scripts/test-receituario-motor.sh` — verifica: listagem, modelo ativo, ativar, emitir demo (ambos os motores), e restaura estado original (modelo 1 ativo ao final).
