# Spec — PaxterClientSelector (Seletor Universal de Cliente)

**Data:** 09/08/2026
**Autor:** Dr. Replit Paxter
**Status:** APROVADA — pronta para construção

---

## Objetivo

Substituir todos os seletores de cliente/paciente do sistema por um único componente
canônico `PaxterClientSelector` que reúna o melhor de todos os padrões encontrados,
com barra A–Z em estilo "iconezinhos" (badge 3D keycap), busca por nome + CPF + telefone
e CPF sempre visível ao lado do nome para evitar seleção de homônimos.

---

## Contexto — padrões existentes que serão substituídos

| Componente antigo | Arquivos que usam | Total |
|---|---|---|
| `ClientPicker` | atestados, encaminhamentos, cockpit, cockpit-anamnese, cockpit-cliente, consulta, exames-cliente, experiencia-cliente, prescricao, receituario-automatico | 10 |
| `ClientCombobox` | protocols/new, exames/index | 2 |
| `CockpitSearch` | cockpit-cliente/CockpitHeader (via CockpitSearch) | 1 |
| Radix `<Select>` com lista de clientes | treino, dieta, financeiro/nfse | 3 |
| `<select>` nativo HTML | padteam/nova-demanda | 1 |
| **Total** | | **17** |

---

## Requisitos obrigatórios

### R1 — Busca por nome, CPF e telefone
- Nome: sem acento, sem maiúsculas/minúsculas (normalização NFD).
- CPF: somente dígitos, mínimo 3 dígitos digitados para ativar filtro.
- Telefone: somente dígitos, mínimo 3 dígitos para ativar filtro.
- Busca combina os três campos em OR (qualquer um que casar exibe o cliente).

### R2 — Barra A–Z em estilo "iconezinhos"
- 26 botões de letra + 1 botão "TODOS" antes das letras.
- Cada botão: aparência de keycap 3D (usar classes Paxter: `bevel-3d` para inativo, destaque navy/ouro para ativo).
- Dimensões: `h-7 w-7`, `rounded-[4px]`, letra `font-black text-[11px]`.
- Letras sem nenhum cliente: `opacity-20 cursor-not-allowed`, não clicáveis.
- Clicar letra ativa → filtra a lista por aquela letra; clicar de novo → deseleciona (TODOS).
- Digitar no campo de busca → limpa a letra selecionada (as duas não se acumulam).

### R3 — CPF sempre visível ao lado do nome
- Em cada linha da lista: `<nome> · <cpf formatado>` na mesma linha.
- No botão trigger (quando um cliente está selecionado): mostrar `<nome> · <cpf>`.
- Se o cliente não tem CPF cadastrado: mostrar apenas o nome.

### R4 — Duas variantes de uso
- **`variant="popover"` (padrão):** trigger button + popover. Substitui ClientPicker e ClientCombobox.
- **`variant="search"` :** campo de busca sempre visível (sem trigger) + dropdown inline. Substitui CockpitSearch.

### R5 — Dois modos de dados
- **Modo local (padrão):** recebe `clientes: PaxterClientOption[]`, filtra em memória.
- **Modo server-side:** prop `serverSearch?: boolean`. Busca GET `/api/clients?search=<query>&limit=20` com debounce 300 ms e mínimo 2 caracteres.

### R6 — Exclusão automática de clientes inválidos
- Excluir automaticamente do modo local quando: `deletedAt != null` OU `status != null && status !== "active"`.

### R7 — API unificada (contrato)
```typescript
interface PaxterClientOption {
  id: number;
  name: string;
  cpf?: string | null;
  phone?: string | null;
  status?: string | null;
  deletedAt?: string | null;
}

interface PaxterClientSelectorProps {
  // Dados (local ou server-side)
  clientes?: PaxterClientOption[];
  serverSearch?: boolean;

  // Seleção
  value: number | null;
  onChange: (id: number | null) => void;

  // Apresentação
  variant?: "popover" | "search";
  placeholder?: string;
  allOptionLabel?: string;     // Se fornecido, adiciona opção "todos" (value=null)
  disabled?: boolean;
  className?: string;
}
```

### R8 — Migração das páginas com string clientId
- Páginas `protocols/new`, `exames/index`, `treino`, `dieta`, `financeiro/nfse`, `padteam/nova-demanda`
  usam `clientId: string`. Converter estado para `clientId: number | null` e adaptar as chamadas de API
  para usar `Number(clientId)` onde necessário.

### R9 — Substituição completa: NENHUM uso dos componentes antigos pode sobrar
- Após a migração, nenhum arquivo pode importar `ClientPicker`, `ClientCombobox` ou `CockpitSearch`.
- `ClientPicker.tsx` e `ClientCombobox.tsx` devem ser mantidos no disco com comentário de deprecação
  (não apagar — Regra de Ouro: nunca DROP sem ordem dupla do CEO).

### R10 — Nenhuma funcionalidade existente pode ser quebrada
- Cada página deve continuar funcionando exatamente igual após a substituição.
- A única diferença visível ao médico é a nova barra A–Z em estilo keycap e o CPF ao lado do nome.

---

## Casos extremos a tratar

| Caso | Comportamento esperado |
|---|---|
| Lista vazia | "Nenhum cliente encontrado." centralizado |
| Busca sem resultado | "Nenhum cliente encontrado." |
| Mais de 300 clientes no local mode | Truncar em 300; mostrar aviso "Refine a busca" |
| CPF null/undefined | Mostrar só o nome, sem "·" |
| Letra selecionada + busca digitada | Busca limpa letra (não acumulam) |
| Radix onValueChange("") no mount | Ignorar string vazia na conversão para number |
| CockpitSearch: não tem `value` prop (uncontrolled) | variant="search" exibe `currentName` como placeholder |

---

## Definição de PRONTO

1. Compilação: nenhum erro TypeScript em runtime (Vite HMR sem erros).
2. Funcional: busca por nome, CPF e telefone retorna clientes corretos.
3. Visual: barra A–Z com estilo keycap 3D; CPF visível na lista e no trigger.
4. Cobertura: todos os 17 arquivos migrados; zero imports de ClientPicker/ClientCombobox.
5. Não-regressão: screenshot do Cockpit Cliente e do Radar mostrando o componente funcional.

---

## Linhas vermelhas

- NÃO tocar no motor de cálculo de orçamentos.
- NÃO tocar em nenhum endpoint de API (backend).
- NÃO fazer DROP ou DELETE de dado real.
- NÃO apagar `ClientPicker.tsx` nem `ClientCombobox.tsx` (deixar com header de deprecação).
- NÃO renomear a prop `empresa_id` ou `location_id` em nenhuma query.
