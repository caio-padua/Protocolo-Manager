---
name: PaxterClientSelector — seletor universal canônico
description: Componente único que substitui ClientPicker, ClientCombobox, CockpitSearch e Select nativos; padrões de migração e lições da rollout em 09/08/2026.
---

# PaxterClientSelector — seletor universal canônico

**Why:** 5 padrões diferentes de seleção de cliente existiam no sistema. Unificados em um único componente para consistência visual e semântica.

## Localização
`artifacts/padcom/src/components/PaxterClientSelector/` (4 arquivos)

## Variantes
- `variant="popover"` (padrão): trigger + popover com barra A–Z. Substitui ClientPicker e ClientCombobox.
- `variant="search"`: input sempre visível + dropdown inline. Substitui CockpitSearch no CockpitHeader.

## API obrigatória
```typescript
interface PaxterClientOption {
  id: number;
  name: string;
  cpf?: string | null;
  phone?: string | null;
  status?: string | null;
  deletedAt?: string | null;
}

// value: number | null (NUNCA string)
// onChange: (id: number | null) => void
// clientes: PaxterClientOption[]
// serverSearch?: boolean — GET /api/clients?search=...&limit=20
```

## Regras de migração
- Estado `clientId` deve ser `number | null`, NUNCA `string`. Conversão `String(c.id) === clientId` → `c.id === clientId`.
- `parseInt(clientId)` em payloads → `clientId ?? 0`
- `Number(clientId)` em POST bodies → `clientId ?? 0`
- useEffect com `setClientId(String(prop))` → `setClientId(prop)`
- Prop `triggerClassName` NÃO existe — remover do call site; provoca TypeScript silencioso no Vite.

## Backend — /api/clients search
Rota em `artifacts/api-server/src/routes/clients.ts` linhas ~104-115.
Busca por nome (ilike), CPF (ilike) e telefone (regexp_replace digits, mínimo 3 dígitos no query).

## Componentes depreciados (manter no disco — Regra de Ouro)
- `ClientPicker.tsx`: header de deprecação adicionado
- `ClientCombobox.tsx`: header de deprecação adicionado
- Spec completa: `specs/paxter-client-selector.md`

**How to apply:** Qualquer nova tela que precise selecionar cliente DEVE usar PaxterClientSelector. Nunca criar novo Select/Combobox ad-hoc para clientes.
