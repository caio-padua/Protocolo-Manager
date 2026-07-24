---
name: Busca de clientes — server-side obrigatório
description: useListClients() client-side falha silenciosamente com 3.591 registros; padrão correto é server-side com debounce.
---

## Regra

`useListClients()` sem params retorna TODOS os 3.591 clientes de uma vez — OK para dados, mas filtro client-side falha silenciosamente quando o estado de seleção anterior ainda está presente no componente (dropdown mostra dados antigos ou lista desatualizada).

## Padrão correto (validado em Procedência de Exames)

```tsx
const [busca, setBusca]       = useState("");
const [debouncedBusca, setDeb] = useState("");

useEffect(() => {
  const t = setTimeout(() => setDeb(busca.trim()), 300);
  return () => clearTimeout(t);
}, [busca]);

const searchParam = debouncedBusca.length >= 2 ? { search: debouncedBusca } : undefined;
const { data: clientes, isFetching } = useListClients(searchParam);
```

**Why:** A API já tem ILIKE server-side (`?search=`). Com 3.591 clientes, client-side filter é frágil — depende de cache React Query ter a lista completa e sem interferência de estado anterior.

**How to apply:** Toda tela que tem seletor de cliente com busca deve usar este padrão. Mostrar spinner (`Loader2`) enquanto `isFetching`. Exigir mínimo 2 chars antes de abrir o dropdown. Mensagem explícita de zero resultado.

## API suporta search

`GET /api/clients?search=caio` → ILIKE no `name` e `cpf` — funciona para nome parcial e CPF parcial.
