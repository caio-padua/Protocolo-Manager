---
name: ICS motor único + feed assinado + timestamp Drizzle
description: Regras duráveis da geração de .ics no PADCOM (motor único, convite, feed HMAC) e o gotcha de coluna timestamp modo Date no Drizzle.
---

# Um formato, um motor (.ics) + feed iCal assinado

**Regra:** todo formato de serialização (`.ics`, PDF) tem UM motor compartilhado.
Rotas que produzem o formato CHAMAM o motor, nunca remontam o formato à mão.

**Why:** um gerador paralelo gera drift silencioso — durante a SUB-04 a rota
`POST /protocols/:id/generate-ics` montava VCALENDAR à mão (sem `VTIMEZONE`/`SEQUENCE`)
enquanto o motor oficial já produzia esses campos. O architect reprovou até unificar.

**How to apply:** ao criar qualquer rota que devolva `.ics`, importar o helper de
eventos + `buildVCalendar`; nunca escrever `BEGIN:VCALENDAR` à mão.

## Convite ao cliente
- `.ics` com `METHOD:PUBLISH` e `UID` ESTÁVEL por sessão → reimportar não duplica.
- Reenvio manual REUSA o código de validação ainda válido (idempotente); só gera
  código novo se o anterior expirou.
- Onboarding (ao validar protocolo) é best-effort `try/catch`: cliente sem e-mail
  ou falha no envio NÃO pode quebrar a validação do protocolo.

## Feed iCal privado
- URL assinada por HMAC (mesmo segredo do portal), escopo próprio "ical".
- Responde **401 genérico** tanto para token inválido quanto para cliente
  inexistente (anti-enumeração — não confirmar existência de cliente).
- O feed leva apenas sessões FUTURAS (`scheduledDate >= hoje`).

## Gotcha — coluna timestamp Drizzle modo Date
Coluna `timestamp(...)` sem `mode` é modo Date: EXIGE objeto `Date` no insert e no
`where`/`gte`. Passar `.toISOString()` (string) estoura
`value.toISOString is not a function` em runtime.

**Why:** o `tsc` global do repo é pré-quebrado (codegen stale), então esse erro só
aparece rodando — não no typecheck. Já existiam 3 inserts com `.toISOString()`.

**How to apply:** sempre passar `new Date(...)` para colunas timestamp; ao ler,
o select já devolve `Date` (ordenar por `.getTime()`, não `.localeCompare`).

## Defer honesto
Subitem que exige cron/scheduler + coluna nova (ex.: reforço mensal recorrente)
defere-se EXPLICITAMENTE — nunca criar coluna morta nem anunciar como pronto (Art. 47).
