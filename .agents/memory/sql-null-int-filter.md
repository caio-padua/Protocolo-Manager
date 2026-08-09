---
name: Filtros nulos em SQL drizzle — fragmentos condicionais
description: Parâmetros JavaScript null passados como ${valor}::int no template sql`` do drizzle explodem com "invalid input syntax for type integer".
---

## Problema

```typescript
// ERRADO — explode quando faseMin = null
AND (${faseMin}::int IS NULL OR col >= ${faseMin}::int)
```

O driver Postgres recebe `''` (string vazia) ou tenta cast de null → `''::int` → ERRO.

**Por quê:** O template sql`` do drizzle serializa `null` como string vazia ou passa o valor cru; `::int` no SQL não tolera empty string.

## Solução: fragmentos condicionais

```typescript
const filtFaseMin = faseMin !== null
  ? sql`AND pr.dias_ativo >= ${faseMin}`
  : sql``;

// Na query principal:
const rows = await db.execute(sql`
  SELECT ... WHERE ...
    ${filtFaseMin}
    ${filtFaseMax}
`);
```

**Como aplicar:** Para cada filtro numérico opcional, construa um fragmento `sql\`\`` fora da query principal. Se o valor for null, retorne `sql\`\`` (fragmento vazio). Nunca use `${valorNullavel}::int` diretamente na query.

Mesma regra vale para filtros de string opcionais (IS NULL check): prefira fragmento condicional a `${null} IS NULL`.
