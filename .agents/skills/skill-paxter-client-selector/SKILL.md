---
name: skill-paxter-client-selector
description: "PaxterClientSelector — seletor universal de cliente/paciente. Regras de uso, contrato de props, placeholder canônico, como montar o array de opções (cpf + phone + photoUrl obrigatórios). Ler ANTES de criar ou modificar qualquer seletor de cliente no sistema Paxter."
---

# Skill — PaxterClientSelector

Seletor universal de cliente/paciente do sistema Paxter (Padcon Conect).
Substitui ClientPicker, ClientCombobox, CockpitSearch e qualquer Select nativo de clientes.

## 1. Regra de ouro

**ONE COMPONENT, ONE RULE:** todo lugar que seleciona um cliente usa `PaxterClientSelector`.
Nunca criar outro seletor. Se a tela precisar de comportamento novo, acrescentar PROP ao componente.

## 2. Localização

`artifacts/padcom/src/components/PaxterClientSelector/index.tsx`

Exporta: `PaxterClientSelector`, `PaxterClientOption`, `PaxterClientSelectorProps`

## 3. Contrato de props

| Prop | Tipo | Padrão | Descrição |
|---|---|---|---|
| `clientes` | `PaxterClientOption[]` | `[]` | Lista de clientes (modo local) |
| `value` | `number \| null` | — | ID selecionado — obrigatório |
| `onChange` | `(id: number \| null) => void` | — | Callback — obrigatório |
| `placeholder` | `string` | `"Selecionar cliente…"` | Texto quando vazio |
| `variant` | `"popover" \| "search"` | `"popover"` | Visual do trigger |
| `allOptionLabel` | `string` | — | Habilita opção "Todos" para telas de filtro |
| `serverSearch` | `boolean` | `false` | Busca server-side (debounce 300 ms, mín. 2 chars) |
| `disabled` | `boolean` | `false` | Desabilita o seletor |
| `className` | `string` | — | CSS extra no elemento raiz |

## 4. PaxterClientOption — campos obrigatórios ao montar

```ts
interface PaxterClientOption {
  id: number;
  name: string;
  cpf?: string | null;      // busca local por CPF + exibido na linha
  phone?: string | null;    // busca local por telefone
  photoUrl?: string | null; // mini-avatar no trigger e na lista
  status?: string | null;
  deletedAt?: string | null;
}
```

**Regra:** ao montar o array `clientes`, SEMPRE incluir `cpf`, `phone` e `photoUrl`.
Omitir `cpf`/`phone` torna a busca por esses campos impossível.
Omitir `photoUrl` exibe apenas as iniciais (graceful — não quebra, mas perde a foto).

## 5. Padrão de montagem do array

### Com useListClients() — preferido (usa cache React Query)

```tsx
import { useListClients } from "@workspace/api-client-react";

const { data: clients } = useListClients();
const opcoes = useMemo(
  () =>
    (clients ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      cpf: c.cpf,
      phone: c.phone,
      photoUrl: c.photoUrl,
    })),
  [clients],
);
```

### Com fetch manual (fallback quando useListClients não está disponível)

```tsx
fetch(`${BASE}/api/clients?limit=5000`)
  .then((r) => r.json())
  .then((d) => {
    const arr = Array.isArray(d) ? d : (d.clients ?? []);
    setClientes(
      arr.map((c: any) => ({
        id: c.id,
        name: c.name ?? "",
        cpf: c.cpf ?? null,
        phone: c.phone ?? null,
        photoUrl: c.photoUrl ?? null,
        status: c.status ?? "active",
        deletedAt: c.deletedAt ?? null,
      }))
    );
  });
```

## 6. Placeholder canônico

| Contexto | Texto correto |
|---|---|
| Seleção normal (qualquer tela) | `"Selecionar cliente…"` (reticências tipográficas …) |
| CockpitHeader — cliente já selecionado | `` `Trocar: ${client.name.split(" ")[0]}…` `` |
| Tela de filtro com opção "todos" | `allOptionLabel="Todos os clientes (filtro)"` + placeholder padrão |

**Palavra-chave obrigatória:** "cliente" — nunca "paciente" (vocabulário do produto).

## 7. Variant a usar

`variant="popover"` — padrão em TODAS as telas.
`variant="search"` — SOMENTE em headers navy compactos onde não há espaço para o trigger button.

## 8. Exceção conhecida

`/exames-cliente` usa `allOptionLabel="Todos os clientes (filtro)"`.
Esse seletor é um filtro opcional (pode ficar em "Todos"), não seleção obrigatória.

## 9. Onde o componente é usado (mapa — 17 telas + 1 exceção)

| Tela | Arquivo | Modo |
|---|---|---|
| Cockpit da Consulta (header) | `pages/cockpit-cliente/CockpitHeader.tsx` | useListClients() |
| Cockpit da Anamnese | `pages/cockpit-anamnese/index.tsx` | useListClients() |
| Cockpit v1 (CockpitHeader interno) | `pages/cockpit/index.tsx` | fetch manual |
| Prescrição de Fórmulas | `pages/prescricao/index.tsx` | fetch manual |
| Exames do Cliente (exceção filtro) | `pages/exames-cliente/index.tsx` | fetch manual |
| Experiência do Cliente | `pages/experiencia-cliente/index.tsx` | useListClients() |
| Atestados | `pages/arsenal/atestados/index.tsx` | useListClients() |
| Encaminhamentos | `pages/arsenal/encaminhamentos/index.tsx` | fetch manual |
| Novo Protocolo | `pages/protocols/new.tsx` | useListClients() |
| Prescritor de Exames | `pages/exames/index.tsx` | useListClients() |
| Cockpit da Consulta (/consulta) | `pages/consulta/index.tsx` | useListClients() |
| Dieta | `pages/dieta/index.tsx` | useListClients() |
| Treino | `pages/treino/index.tsx` | useListClients() |
| NFSe | `pages/financeiro/nfse.tsx` | useListClients() |
| PADTEAM — Nova Demanda | `pages/padteam/nova-demanda.tsx` | useListClients() |
| Receituário Automático | `pages/receituario-automatico/index.tsx` | fetch manual |

## 10. Visual do avatar

O componente exibe um mini-avatar em cada linha da lista e no trigger quando há cliente selecionado:

- **Com foto:** `<img src={photoUrl} className="object-cover" />`
- **Sem foto:** iniciais (primeira letra do primeiro nome + primeira letra do último nome) sobre fundo `bg-primary/12`
- **Tamanho na lista:** 28×28 px, `rounded-[4px]` (quadrado Paxter — nunca pill)
- **Tamanho no trigger:** 20×20 px, `rounded-[3px]`

## 11. Histórico de decisões

| Data | Decisão |
|---|---|
| Ago/2026 | Componente unificou 17 telas — placeholder canonizado para "Selecionar cliente…" |
| Ago/2026 | Foto adicionada ao tipo e ao visual (trigger + lista) |
| Ago/2026 | CockpitHeader migrado de `variant="search"` para `variant="popover"` com useListClients() |
| Jul/2026 | Barra A–Z e busca por CPF/telefone implementadas |
