# Spec — Marcação Dr. Caio (Concierge): Motor de Horários Real + Pagamento PIX Inline + Terno Claro

Data: 02/07/2026. Autor: Dr. Replit Paxter. Método: Paxter Loop (Fase 1 — ESPECIFICAR).

## Objetivo (uma frase)

No fluxo concierge do Dr. Caio, oferecer horários que CONFRONTAM a agenda real ANTES do link de
pagamento, e fazer o pagamento PIX acontecer DENTRO do Paxter (QR + copia-e-cola), sem janela nova.

---

## Contexto verificado (fonte, não palpite)

| Item | Estado real hoje | Onde |
|---|---|---|
| Horários concierge | FABRICADOS (minutos quebrados, sem olhar agenda) | agendar.tsx conciergeSlots (724-740) |
| Pagamento | `window.open(invoiceUrl)` → sai do Paxter ("tela sumiu") | agendar.tsx 617, 1218 |
| Asaas | billingType UNDEFINED (página hospedada), sem PIX inline | asaas.ts asaasCreateCharge |
| Motor real de agenda | computeResourceSlots(resourceId,date) usa ocupação REAL (sessions) | agenda-booking.ts |
| Estados do motor | "aberto" / "bloqueado" / "ocupado" (NÃO "livre") | agenda-motor.ts |
| Regra tarde-por-% | JÁ existe: sub-blocos liberam em cadeia por triggerPercent (60%) | agenda-motor.ts |
| Recursos do Dr. Caio (prof 6) | 5 São Paulo, 6 Brasília, 7 João Pessoa, 8 Online (slot 30min) | DB agenda_resources |
| Símbolo dentro do TernoFarol | tone="dark" CORRETO (painel é SEMPRE navy) | agendar.tsx TernoFarol (505) |
| Risca de giz (.leva-fabric) | Existe no CSS mas NÃO é aplicada no concierge | index.css / agendar.tsx |

---

## Requisitos exatos

### Onda A — Motor de horários REAL antes do pagamento

A1. Criar motor determinístico `computeConciergeOffer` (nova lib `agenda-concierge.ts`) que REUSA
    `computeResourceSlots` (ocupação real) — NUNCA reimplementa o motor.

A2. Recurso alvo: primeiro recurso PRESENCIAL ativo do Dr. Caio (professionalId=6, active=true,
    nome não "Online", menor id). Fallback: recurso Online ativo. Nunca hardcode fixo de id.

A3. Entradas: `preferredWeekday` (1..5, opcional), `preferredPeriod` ("manha"|"tarde", opcional),
    `earliestDate` (piso, opcional). Piso efetivo = max(hoje, earliestDate).

A4. Confronto real: para cada data candidata, chamar computeResourceSlots e usar só slots "aberto".

A5. Regra tarde-por-%: slot de tarde (>=12:00) só entra se estiver "aberto" — o motor já o mantém
    "bloqueado" (razão cadeia) até a manhã atingir triggerPercent. Não recalcular %, apenas respeitar.

A6. Contiguidade (anti-ilha): marcar `contig=true` no slot "aberto" adjacente (±slotMinutes) a um
    slot "ocupado"; priorizar contíguos na ordenação (encaixe entre compromissos do médico).

A7. Escassez: no dia primário, no máximo 2 chips (o mais perto da preferência + 1). Total no máximo
    2 dias e 3 chips na oferta inteira.

A8. Dia vizinho: além do dia primário, oferecer 1 dia vizinho com a manhã "mais completa" (maior
    ocupação relativa da manhã que ainda tenha >=1 aberto) — consolida a agenda do médico.

A9. Nunca beco sem saída: se ZERO abertos em todas as candidatas (escassez de DADO, não teatro),
    sintetizar a partir das JANELAS reais (agenda_windows) do recurso, respeitando piso e lead,
    com flag `generated=true`. Nunca inventar minuto fora das janelas reais.

A10. Endpoint público stateless: `GET /api/scheduling/concierge-offer?weekday=&period=&earliest=`
     retorna a oferta. Adicionar ao OpenAPI + rodar codegen (contrato-first → hook gerado).

A11. Reordenar o fluxo: novo estágio `oferta` ENTRE `vias` e `pay`. Sequência concierge:
     `vias → oferta (coleta dia+período, batida curta "confrontando agenda", mostra slots REAIS,
     cliente escolhe slot concreto) → pay → (pago) → confirma slot (PATCH) → sucesso`.
     Remover a tela `resultado` com slots fabricados e o `conciergeSlots` fabricado.

### Onda B — Pagamento PIX inline (matar window.open)

B1. asaas.ts: `asaasCreateCharge` aceitar billingType "PIX"; nova `asaasGetPixQrCode(paymentId)` →
    GET /payments/{id}/pixQrCode → { encodedImage(base64), payload(copia-e-cola), expirationDate }.

B2. Rota concierge-charge: criar cobrança PIX, buscar QR, retornar também `pixQrImage`,
    `pixPayload`, `pixExpiration` além de `invoiceUrl` e `status`. Estender schema
    `ConciergeChargeResult` no OpenAPI + codegen. Idempotência e advisory lock preservados.

B3. Frontend `pay`: mostrar QR (`<img data:image/png;base64,...>`) + botão "copiar código PIX"
    (copia-e-cola). REMOVER `window.open` automático. Manter `invoiceUrl` só como link secundário
    opcional ("abrir página de pagamento"), nunca automático. Polling de status permanece.

### Onda 1 — Terno claro (risca de giz)

C1. Aplicar `.leva-fabric` (risca de giz) às superfícies de painel do tema CLARO do concierge
    (cartões de form/oferta/pay sob `.dc-light`) para o tema claro ler como "terno claro com risca
    de giz". Baixo risco (CSS).

C2. NÃO alterar o `tone` dos `PaxterSymbolGlass` dentro do TernoFarol — está correto (painel navy).
    NÃO mexer no TernoFarol (é o painel-motor sempre-navy proposital).

---

## Casos extremos a tratar

| Caso | Tratamento |
|---|---|
| Agenda vazia (sem sessões) | Motor retorna abertos por janela; oferta usa contig=false, ainda real |
| Zero abertos (lead/bloqueio) | Fallback A9 por janelas reais, generated=true, nunca vazio |
| preferredPeriod=tarde sem tarde liberada | Cai para manhã graciosamente (nunca beco) |
| earliest no passado | Piso vira hoje |
| Sem preferredWeekday | Usa próximo dia útil como primário |
| PIX QR falha no Asaas | Retornar invoiceUrl como fallback + mensagem honesta (não fingir QR) |
| Corrida de slot | Concierge NÃO cria session; só grava chosenDate no request (corrida branda) |

---

## Definição de PRONTO (conferível)

| Critério | Como conferir |
|---|---|
| Oferta real ≤2 dias/≤3 chips, tarde só se liberada, contig marcado, nunca vazia | curl GET concierge-offer |
| Respeita earliest/weekday/period | curl com params variados |
| PIX charge retorna pixQrImage + pixPayload | curl POST concierge-charge (ambiente teste) |
| Sem window.open automático no concierge | leitura do diff (agendar.tsx) |
| Oferta ANTES do pagamento; slot escolhido gravado após pago (PATCH) | leitura do diff + fluxo |
| Risca de giz aplicada no tema claro | leitura do diff + screenshot landing /ln claro |
| architect aprova requisito por requisito | Fase 3 |

---

## Linhas vermelhas (NUNCA violar)

1. NUNCA tocar `/api/budgets/calculate` nem o motor de desmembramento de orçamento.
2. NUNCA tocar o fluxo do Corpo Clínico (assistente) nem `bookSession` (marcação real de sessão).
3. NUNCA reimplementar `computeAgendaSlots` — só reusar via `computeResourceSlots`.
4. NÃO corrigir o bug pré-existente de scheduling.ts (~457 checa "livre" em vez de "aberto") — fora do escopo.
5. Preservar UIDs .ics, colunas do banco, nomes de pacote e tokens.
6. Não mudar `tone` dos símbolos dentro do TernoFarol (é proposital navy).

---

RESUMO EM 1 LINHA: motor real de horários (escassez + contiguidade + tarde-por-% + dia vizinho) mostrado ANTES do pagamento, PIX QR dentro do Paxter, e risca de giz no tema claro — sem tocar orçamento nem marcação real.
