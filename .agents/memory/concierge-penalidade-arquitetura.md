---
name: Concierge Penalidade — arquitetura aprovada
description: Decisões arquiteturais do Dr. Claude (12/08/2026) sobre a trava de escassez do Concierge. Substituem a implementação de contador simples entregue nesta sessão.
---

# Concierge Penalidade — Arquitetura Aprovada pelo Dr. Claude

## Regra vigente (implementada em 12/08/2026 — versão 1, a substituir)

Motor simples: conta falhas como INTEGER, todos os desfechos com peso 1,0.
Tabela: `concierge_penalidades` (lazy, fora do Drizzle).
Falhas >= 3 → `bloqueado_permanente = true` (permanente, sem decaimento).

## Arquitetura aprovada (versão 2 — Dr. Claude 12/08/2026)

### Peso por desfecho

| Desfecho | Peso |
|---|---|
| Cancelamento ativo | 1,0 |
| Expiração sem ação | 0,5 |
| Cartão recusado pelo emissor | 0,25 |
| Estorno | 1,0 |
| Chargeback | 2,0 |
| Pagamento bem-sucedido | −1,0 |

**Why:** cartão recusado pelo banco (limite/antifraude) não é má-fé. Três recusas somam 0,75 e não bloqueiam. Três cancelamentos deliberados somam 3,0 e bloqueiam.

### Faixas de score

| Score | Estado | Efeito |
|---|---|---|
| 0,0 – 0,9 | Oportunidade plena | datas normais |
| 1,0 – 1,9 | Primeira quebra | +7 dias |
| 2,0 – 2,9 | Segunda quebra | +30 dias + aviso |
| ≥ 3,0 | Suspenso | 180 dias, via comum aberta |

### Suspensão em vez de bloqueio permanente

180 dias de suspensão com retorno automático ao nível 2,0.
**Why:** "permanente" numa clínica recusa atendimento a paciente que pode estar doente daqui a 2 anos.

### Decaimento

−1,0 ponto a cada 90 dias sem incidente (job mensal).

### Verificação de identidade antes de penalizar

- Camada 1 (sem identidade verificada): fricção por dispositivo/sessão. Não transferível — não vira arma.
- Camada 2 (com identidade verificada): penalidade no CPF só após confirmação via código enviado ao Telegram/WhatsApp vinculado.

**Why:** CPF é dado público no Brasil. Sem verificação, concorrente pode queimar CPF de paciente em escala.

## Decisões do CEO confirmadas nesta revisão

- **Reset ao pagar:** SIM, mas parcial — −1,0 ponto (não zera). Pagar apaga um abandono, não três.
- **Inteligência Comercial:** DEPOIS da correção da trava. Não construir painel para observar funil com trava quebrada.

## Guard #159 — já implementado (commit 1b6c747)

`POST /scheduling/requests` verifica `bloqueado_permanente` antes do INSERT quando `path === "concierge"`.
Retorna 403 com `code: "CONCIERGE_BLOCKED"`.

## Divisão de trabalho (Dr. Claude)

| Item | Responsável |
|---|---|
| #159 Guard backend | Dr. Replit ✅ FEITO |
| #158 Idempotência webhook | Dr. Replit ✅ MERGEADO |
| Peso por desfecho + decaimento | Dr. Code (tasks #170, #171) |
| Verificação por código no canal | Dr. Code (task #172) |
| Fricção por dispositivo | Dr. Manus |
| Bateria 162 casos | Dr. Manus |
| Migrar tabela para Drizzle schema | Dr. Code |

## Orquestração pendente (Dr. Claude auditou nas fontes)

- Slack #padaxor-projeto: sem postagem desde 10/08/2026 (Telegram enviado, Slack falhou em 12/08)
- Planilha: tasks #144–#167 não registradas (planilha parada na 73)
- Verbetes #95 e #96: ainda com Task #124/#127 na aba DICIONARIO
