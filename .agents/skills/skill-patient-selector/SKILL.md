# Skill: Seletor de Paciente — Guia Canônico Unificado

**Leia este arquivo ANTES de criar qualquer busca, filtro ou seleção de paciente/cliente no sistema.**
Existem quatro padrões distintos no codebase. Usar o padrão errado gera inconsistência visual e de UX.

---

## 1. Os quatro padrões do sistema

| Padrão | Arquivo principal | Quando usar |
|---|---|---|
| **A — Grade com A–Z** | `components/patients/PatientSelectorBar.tsx` | Tela operacional: médico vê TODOS os pacientes, filtra, age sobre cada um. Exemplo: Radar Clínico. |
| **B — Picker (seleção única)** | `components/ClientPicker.tsx` | Formulário ou cockpit: usuário escolhe UM cliente e o sistema carrega dados desse cliente. Exemplo: cockpit, receituário. |
| **C — Busca server-side (dropdown)** | `components/cockpit-cliente/CockpitSearch.tsx` | Dataset grande: não carrega tudo, busca enquanto digita, retorna top 20. Exemplo: Cockpit Cliente. |
| **D — Select simples** | Radix `<Select>` inline | Lista pequena e fixa (<30 clientes); não precisa de busca. Exemplo: Motor de Agenda. |

---

## 2. Árvore de decisão: qual padrão escolher?

```
Quantos clientes podem aparecer?
│
├── Centenas (carregados todos de uma vez)
│   │
│   ├── Usuário ESCOLHE UM e segue para outra coisa?
│   │   └── Padrão B — ClientPicker (popover, seleção única)
│   │
│   └── Usuário VÊ TODOS e age sobre vários?
│       └── Padrão A — PatientSelectorBar + grade de cards
│
├── Milhares (impossível carregar todos)
│   └── Padrão C — CockpitSearch (server-side, debounce)
│
└── Menos de 30 (lista fixa e pequena)
    └── Padrão D — Select simples Radix
```

---

## 3. Padrão A — Grade com A–Z (`PatientSelectorBar`)

**Onde vive:**
```
artifacts/padcom/src/components/patients/PatientSelectorBar.tsx
```

**Exportações do arquivo:**

| Exportação | Papel |
|---|---|
| `usePatientFilter(pacientes, extraFilter?)` | Hook: gerencia busca + letra + grupos |
| `PatientSelectorBar` | Componente visual (busca + barra A–Z) |
| `PatientGroupDivider` | Separador de grupo com a letra |
| `normPatient(s)` | Normaliza string: sem acentos, maiúsculas |
| `LETRAS_AZ` | `["A","B",...,"Z"]` |

**O que `usePatientFilter` retorna:**

| Campo | Tipo | Descrição |
|---|---|---|
| `busca` | `string` | Texto atual da busca |
| `setBusca(q)` | função | Atualiza busca (limpa letra automaticamente) |
| `letra` | `string \| null` | Letra selecionada; null = TODOS |
| `setLetra(l)` | função | Alterna letra (clique duplo deseleciona) |
| `letrasDisponiveis` | `Set<string>` | Letras que têm pacientes |
| `filtrados` | `T[]` | Lista filtrada (busca + letra) |
| `grupos` | `{ letra, pacientes[] }[]` | Lista agrupada por letra, para renderização |

**O que o hook busca:**
- Nome (sem acento, case-insensitive)
- CPF (somente dígitos, mínimo 3 dígitos digitados)
- Telefone (somente dígitos, mínimo 3 dígitos)
- E-mail (sem acento, case-insensitive)

**Tipo mínimo que a lista precisa ter:**
```typescript
{ name: string; cpf?: string | null; phone?: string | null; email?: string | null }
```

**Exemplo de uso completo:**
```tsx
import {
  usePatientFilter,
  PatientSelectorBar,
  PatientGroupDivider,
} from "@/components/patients/PatientSelectorBar";

export default function MinhaTela() {
  const [pacientes, setPacientes] = useState<Paciente[]>([]);
  // ... carregar pacientes do servidor

  const { busca, setBusca, letra, setLetra, letrasDisponiveis, filtrados, grupos } =
    usePatientFilter(pacientes);

  return (
    <>
      {/* Barra — SEMPRE dentro de panel-3d-sub */}
      <div className="panel-3d-sub p-3 space-y-2 rounded-lg">
        <PatientSelectorBar
          busca={busca}
          onBuscaChange={setBusca}
          letraSelecionada={letra}
          onLetraChange={setLetra}
          letrasDisponiveis={letrasDisponiveis}
          placeholder="Buscar por nome, CPF ou telefone..."
        />
      </div>

      {/* Grade com separadores de letra */}
      <div className="flex flex-col gap-4 mt-4">
        {grupos.map((g) => (
          <div key={g.letra}>
            <PatientGroupDivider letra={g.letra} count={g.pacientes.length} />
            <div
              className="grid gap-3 mt-2"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))" }}
            >
              {g.pacientes.map((p) => (
                <SeuCard key={p.id} paciente={p} />
              ))}
            </div>
          </div>
        ))}

        {filtrados.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">
            Nenhum paciente encontrado.
          </p>
        )}
      </div>
    </>
  );
}
```

**Regras de design do Padrão A:**
1. Container da barra: `panel-3d-sub p-3 space-y-2 rounded-lg`.
2. Campo busca: `field-engraved` (já embutido no componente, não repetir).
3. Letra ativa: `border-primary bg-primary text-primary-foreground`.
4. Letras sem pacientes: `cursor-not-allowed border-transparent text-muted-foreground/25`.
5. Botão "TODOS" SEMPRE aparece antes das letras.
6. Digitar texto LIMPA a letra selecionada (comportamento embutido no hook).
7. Clicar na letra ativa NÃO limpa o texto (os dois filtros se combinam).
8. Separador `PatientGroupDivider` obrigatório entre grupos.

---

## 4. Padrão B — Picker de seleção única (`ClientPicker`)

**Onde vive:**
```
artifacts/padcom/src/components/ClientPicker.tsx
```

**Quando usar:**
- Formulário onde o usuário seleciona UM cliente.
- Seleção dispara carregamento de dados desse cliente.
- Lista cabe inteira em memória (< 2.000 clientes).

**Props principais:**
```typescript
interface ClientPickerProps {
  clientes: ClientPickerOption[];   // { id, name, cpf?, status?, deletedAt? }
  value: number | null;             // ID selecionado (controlado pelo pai)
  onChange: (id: number | null) => void;
  placeholder?: string;
  allOptionLabel?: string;          // ex.: "Todos os clientes"
  disabled?: boolean;
}
```

**Comportamento embutido:**
- Filtra por nome OU CPF (dígitos).
- Exclui automaticamente: `deletedAt != null` e `status != "active"` (quando esses campos estiverem presentes).
- Ordena A-Z após filtro.
- Limita a 300 resultados.
- Barra A-Z para filtro de letra (SEM agrupamento visual — só filtra).
- ScrollArea com altura fixa `h-64`.
- Abre em Popover (não bloqueia o fundo).

**Exemplo:**
```tsx
import { ClientPicker } from "@/components/ClientPicker";
import { useListClients } from "@/hooks/useListClients"; // hook padrão

function MeuFormulario() {
  const [clienteId, setClienteId] = useState<number | null>(null);
  const { clients } = useListClients();

  return (
    <ClientPicker
      clientes={clients}
      value={clienteId}
      onChange={setClienteId}
      placeholder="Escolha o paciente..."
    />
  );
}
```

**Telas que já usam este padrão:**
- `pages/cockpit/index.tsx`
- `pages/experiencia-cliente/index.tsx`
- `pages/portfolio-clinico/index.tsx`
- `pages/receituario-automatico/index.tsx`

---

## 5. Padrão C — Busca server-side com dropdown (`CockpitSearch`)

**Onde vive:**
```
artifacts/padcom/src/pages/cockpit-cliente/CockpitSearch.tsx
artifacts/padcom/src/hooks/useCockpitSearch.ts
```

**Quando usar:**
- Dataset muito grande (> 2.000 clientes).
- Não é viável carregar todos em memória.
- UX de busca enquanto digita (lazy search).

**Comportamento:**
- Mínimo 2 caracteres para disparar a busca.
- Debounce 300 ms.
- GET `/api/clients?search=...&limit=20`.
- Dropdown com scroll, sem A-Z, sem agrupamento.
- Clique chama `onSelect(id)` e fecha.

**Adaptar para outra tela:** copie `CockpitSearch.tsx` e `useCockpitSearch.ts`, ajuste o endpoint e os campos exibidos.

---

## 6. Padrão D — Select simples Radix

**Quando usar:**
- Lista pequena e fixa de clientes (< 30).
- Não precisa de busca.
- Exemplo: Motor de Agenda (`pages/agenda/motor.tsx`).

```tsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

<Select value={String(clienteId ?? "")} onValueChange={(v) => setClienteId(Number(v))}>
  <SelectTrigger><SelectValue placeholder="Escolha..." /></SelectTrigger>
  <SelectContent>
    {clientes.map((c) => (
      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

**Atenção:** Radix `onValueChange` dispara com `""` no mount. Sempre guarde o handler contra string vazia:
```typescript
onValueChange={(v) => { if (v) setClienteId(Number(v)); }}
```
(Ver memória: `radix-select-onvaluechange-vazio.md`)

---

## 7. O que NÃO fazer

| Proibido | Por quê |
|---|---|
| Criar busca de paciente inline com `<input>` + `useState` | Viola o padrão; gera comportamento inconsistente |
| Usar `ClientCombobox.tsx` | Está sem uso ativo no sistema; preferir `ClientPicker` |
| Usar Padrão A (grade) para seleção única | Grade é para "ver todos e agir"; picker é para "escolher um" |
| Usar Padrão D (Select) com > 30 itens | Sem busca, a lista se torna inutilizável |
| Chamar `normPatient` manualmente fora do hook | O hook já normaliza; duplicar cria divergência |
| Passar `null` como `key` em grupos | Causa warning de chave duplicada no React |

---

## 8. Referência: o padrão mestre (`clients/index.tsx`)

A página `pages/clients/index.tsx` é a implementação mais completa do sistema e serve como referência para qualquer dúvida:

| Característica | Como implementa |
|---|---|
| Busca | Server-side GET `/api/clients?search=...&tab=...` ao digitar |
| Ordenação | Local por `name`, usando `localeCompare` pt-BR |
| Agrupamento | Por primeira letra, após ordenação local |
| Scroll | Infinito via `IntersectionObserver`, fatias de 100 |
| Cards | Foto portrait 64×88, nome, CPF, status, idade, endereço, telefone, e-mail |
| Filtros extras | Abas (ativos / desativados / apagados) + A-Z + bulk actions (seleção múltipla) |
| Seleção | Checkbox por card + ações em lote; link individual `/clients/:id` |

---

## 9. Histórico de versões

| Data | Versão | O que mudou |
|---|---|---|
| 09/08/2026 | v1.0 | Criado para Radar Clínico; só documentava Padrão A. |
| 09/08/2026 | v2.0 | Auditoria completa do codebase; identificados 4 padrões; `usePatientFilter` agora busca nome + CPF + telefone + e-mail; skill unificada. |
