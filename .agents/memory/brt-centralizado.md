---
name: BRT centralizado — fonte única de data/hora
description: lib/brt.ts é a fonte única de data/hora em BRT; rota /api/brt diagnostica ao vivo; nunca new Date() nu para nomes de arquivo ou exibição ao usuário.
---

## Regra

**`artifacts/api-server/src/lib/brt.ts`** é a ÚNICA fonte de data/hora BRT no servidor.

Funções exportadas:

| Função | Retorno | Uso |
|---|---|---|
| `brtDateStr(date?)` | "YY.MM.DD" | Prefixo de nome de arquivo |
| `brtISODate(date?)` | "YYYY-MM-DD" | Chave de data no banco (sem hora) |
| `brtDisplayDate(date?)` | "DD/MM/AAAA" | Exibição ao usuário |
| `brtDateTime(date?)` | "DD/MM/AAAA HH:MM" | Log / exibição com hora |
| `parseBrtParts(date?)` | `{ year, month, day, hour, minute, second }` | Formatos customizados |

## Por que

Brasil é UTC-3 fixo desde 2019 (sem DST — Horário de Verão). Usar `new Date()` nu gera o dia errado no período 21h-24h BRT (que é 00h-03h UTC do dia seguinte). Caso concreto: nome de arquivo de upload ficava com o dia de UTC, não o dia de Brasília.

## Implementação

Usa `Intl.DateTimeFormat` com `timeZone: "America/Sao_Paulo"` — mais semântico que offset manual e sobrevive a mudanças futuras de legislação.

## Rota de diagnóstico

`GET /api/brt` — pública, sem autenticação. Retorna UTC + todos os formatos BRT.  
Usar para confirmar que o servidor está com o fuso correto.

## Where to import

```typescript
import { brtDateStr, brtISODate, brtDisplayDate, brtDateTime } from "../lib/brt";
// ou: from "./brt"; (dentro de lib/)
```

## Arquivos que já usam brt.ts

- `routes/client-portal.ts` — upload do portal do cliente (brtDateStr)
- `lib/pharmacy-email.ts` — todayBR() para lote noturno (brtISODate)
- `lib/receituario-motor.ts` — hoje() para nome do arquivo PDF (brtISODate)
- `routes/health.ts` — endpoint /api/brt público

## Proibido

`new Date()` nu em qualquer contexto que gere nome de arquivo, data de exibição ao usuário ou chave de data no banco. Sempre importar de `lib/brt.ts`.
