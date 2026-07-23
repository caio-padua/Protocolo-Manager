---
name: Cockpit Unificado — Padrão de Fusão
description: Como fundir duas telas de cliente em um único cockpit sem deletar o arquivo doador; padrões sticky nav, accordion, redirect.
---

# Cockpit Unificado — Decisões de Arquitetura

**Why:** CEO quer 1 única tela por cliente. Padrão "transplante cirúrgico" — conteúdo migra, arquivo doador fica intacto.

## Padrão do sticky header+nav
Envolver `<header>` + `<nav>` num `<div className="sticky top-0 z-50">`.
Não colocar `sticky` em cada elemento separadamente — ficam fora de sync.

## Redirect do doador
```tsx
<Route path="/clients/:id" component={({ params }) => {
  if (params?.id && /^\d+$/.test(params.id)) {
    window.location.replace(`/cockpit-cliente?cliente=${params.id}&aba=cadastro`);
  }
  return null;
}} />
```
Usar `window.location.replace` (não `useLocation` do wouter) para redirect definitivo sem histórico duplo.

## Accordion nos Protocolos
- Estado: `expandedProtocol: number | null`
- Filtrar sessões por `(s as any).protocolId === protocol.id`
- ChevronDown/ChevronRight como indicador visual
- Clicar no card inteiro expande; botão "VER" tem `e.stopPropagation()`

## Abas com scroll horizontal
10 abas não cabem em tela pequena → `overflow-x-auto` + `scrollbarWidth: none` + `shrink-0` em cada tab button.

## Mutations transplantadas
- Mutations usam `clienteId` do estado do cockpit (não `id` de useRoute)
- `queryKey: getListPaymentsQueryKey({ clientId: clienteId ?? 0 })` para invalidação correta
- `enabled: !!clienteId` em todos os hooks para não disparar sem cliente selecionado

## Regra de Ouro aplicada
- `clients/detail.tsx`: intacto (0 linhas deletadas)
- Rota `/cockpit` (formato antigo): intacto no código, apenas removido do menu
- Menu item removido: `{ name: "Cockpit (formato antigo)", ... }` em Layout.tsx
