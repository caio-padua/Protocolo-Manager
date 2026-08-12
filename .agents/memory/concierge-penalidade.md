---
name: Trava de escassez Concierge — penalidade por CPF
description: Arquitetura da proteção contra abuso do funil Concierge (Dr. Caio). Implementado em 12/08/2026.
---

# Trava de escassez Concierge — penalidade por CPF

## Regra (vinda do CEO)
| Falhas acumuladas | Efeito                                     |
|------------------:|:-------------------------------------------|
| 0                 | Sem penalidade — oferta normal             |
| 1                 | Datas mínimas afastadas +7 dias            |
| 2                 | Datas mínimas afastadas +30 dias           |
| ≥ 3               | `bloqueado_permanente = true` → via normal |

"Falha" = cobrança gerada no Asaas mas **não paga**
(status virou `expirado` via PAYMENT_OVERDUE ou `cancelado` via PAYMENT_DELETED/REFUNDED).

## Onde vive
- **Lib principal**: `artifacts/api-server/src/lib/concierge-penalidade.ts`
  - `getPenalidade(cpf)` → `{ bloqueado, penalidade_dias, tentativas }`
  - `registrarFalha(cpf)` → incrementa com UPSERT; bloqueia quando chega em 3
  - Tabela criada lazy (singleton `_tableReady`) no primeiro uso do processo
- **Tabela DB**: `concierge_penalidades` (raw SQL, sem Drizzle schema)
  - `cpf TEXT PK`, `tentativas_falha INT`, `bloqueado_permanente BOOL`, `ultima_falha_at TIMESTAMPTZ`

## Pontos de hook no backend
1. **`scheduling.ts` GET `/scheduling/concierge-offer`**: recebe `?cpf=`; aplica offset ao `earliestDate`; retorna `{ blocked, penalidade_dias, tentativas, ...offer }`
2. **`scheduling.ts` polling** (`GET /scheduling/requests/:id/payment-status`): quando `mapped` muda para `expirado`/`cancelado` E `row.path === "concierge"` E `row.entrada === "dr_caio"` → `registrarFalha(row.patientCpf)` fire-and-forget
3. **`asaas.ts` webhook**: PAYMENT_OVERDUE → `expirado`; PAYMENT_DELETED/REFUNDED → `cancelado`; mesma guarda `path=concierge && entrada=dr_caio` → `registrarFalha`

## Frontend (`agendar.tsx`)
- `useGetConciergeOffer` (gerado) foi substituído por `useQuery` direto com `fetch` para poder passar `?cpf=` sem alterar o schema OpenAPI.
- Stage `oferta`: painel vermelho de bloqueio permanente + botão "Ir para a Via Comum"; banner âmbar de penalidade com aviso progressivo.
- Botão `← Voltar` no stage `pay`: nota abaixo explicando que cobrança não paga afasta datas futuras.

**Why:** Proteger a escassez real do concierge contra leads que geram cobranças e somem, desperdiçando slots da agenda do Dr. Caio.

**How to apply:** Qualquer refatoração do fluxo de pagamento do concierge deve preservar os dois hooks (polling + webhook). A lib é pura SQL e pode ser testada unitariamente sem mock do Drizzle.

## Limitação conhecida (follow-up #145)
Na **primeira visita** ao stage `oferta`, o CPF ainda não foi coletado (só vem no stage `pay`). A verificação de penalidade não acontece nessa primeira visita — só em visitas de retorno quando o CPF state já está preenchido. Coletar CPF antecipadamente está planejado como tarefa #145.
