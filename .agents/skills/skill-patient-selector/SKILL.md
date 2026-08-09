# Skill: Patient Selector Bar — Seletor de Paciente com A–Z

**Quando usar:** SEMPRE que uma tela precisar buscar ou filtrar pacientes.
Este é o padrão canônico do sistema. Nunca inventar outra solução de busca de paciente sem consultar este skill primeiro.

---

## Arquivos do componente

```
artifacts/padcom/src/components/patients/PatientSelectorBar.tsx
```

Exporta:
- `PatientSelectorBar` — componente visual (barra de busca + A–Z)
- `usePatientFilter` — hook que encapsula toda a lógica de filtro
- `PatientGroupDivider` — separador de grupo com a letra
- `normPatient(s: string)` — utilitário de normalização (sem acentos, maiúsculas)
- `LETRAS_AZ` — array `["A","B",..."Z"]`

---

## Quando usar cada parte

| Situação | O que usar |
|---|---|
| Filtrar uma lista já carregada | `usePatientFilter` + `PatientSelectorBar` |
| Só renderizar a barra (filtro externo) | só `PatientSelectorBar` |
| Separar grupos por letra | `PatientGroupDivider` |
| Normalizar texto para comparação | `normPatient()` |

---

## Exemplo de uso completo (React)

```tsx
import {
  usePatientFilter,
  PatientSelectorBar,
  PatientGroupDivider,
} from "@/components/patients/PatientSelectorBar";

export default function MinhaTela() {
  const [pacientes, setPacientes] = useState<Paciente[]>([]);

  // carrega pacientes do servidor...

  const { busca, setBusca, letra, setLetra, letrasDisponiveis, filtrados, grupos } =
    usePatientFilter(pacientes);

  return (
    <div>
      {/* Barra de seleção — sempre dentro de panel-3d-sub */}
      <div className="panel-3d-sub p-3 space-y-2 rounded-lg">
        <PatientSelectorBar
          busca={busca}
          onBuscaChange={setBusca}
          letraSelecionada={letra}
          onLetraChange={setLetra}
          letrasDisponiveis={letrasDisponiveis}
          placeholder="Buscar por nome ou CPF..."
        />
      </div>

      {/* Grade ou lista com separadores de letra */}
      {grupos.map((g) => (
        <div key={g.letra}>
          <PatientGroupDivider letra={g.letra} count={g.pacientes.length} />
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px,1fr))" }}>
            {g.pacientes.map((p) => (
              <PatientCard key={p.id} paciente={p} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

## Regras de design system

1. O container da barra DEVE usar `panel-3d-sub p-3 space-y-2 rounded-lg`.
2. O campo de busca usa `field-engraved` (já aplicado no componente).
3. A letra ativa usa `border-primary bg-primary text-primary-foreground`.
4. Letras sem pacientes ficam com `cursor-not-allowed border-transparent text-muted-foreground/25` (invisíveis, mas presentes no DOM).
5. O botão "TODOS" SEMPRE aparece antes das letras.
6. Mudar a busca por texto LIMPA a letra selecionada (comportamento do hook `setBusca`).
7. Mudar a letra NÃO limpa o texto de busca (os dois filtros se combinam).

---

## Quando usar em modo MODAL (picker de um único paciente)

Para telas que precisam selecionar UM paciente e retornar:

```tsx
function PatientPickerModal({ onSelect, onClose }) {
  const [pacientes, setPacientes] = useState([]);
  const { busca, setBusca, letra, setLetra, letrasDisponiveis, filtrados } =
    usePatientFilter(pacientes);

  return (
    <div className="fixed inset-0 z-50 ...">
      <div className="panel-3d max-w-lg w-full p-4 flex flex-col gap-3">
        <div className="panel-3d-sub p-3 space-y-2 rounded-lg">
          <PatientSelectorBar ... />
        </div>
        <div className="max-h-[50vh] overflow-y-auto flex flex-col gap-1">
          {filtrados.map((p) => (
            <button
              key={p.id}
              className="btn-3d-soft text-left flex items-center gap-3 px-3 py-2"
              onClick={() => { onSelect(p); onClose(); }}
            >
              {/* foto 40×56 concave-3d + nome */}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## O que NÃO fazer

- Não usar `<Input>` do shadcn diretamente para busca de paciente (use o componente).
- Não criar uma nova barra A–Z inline em cada página (sempre importar do componente).
- Não usar `state` separado para busca e letra em cada tela (use o hook `usePatientFilter`).
- Não chamar `normPatient` manualmente para comparações — o hook já faz isso.

---

## Histórico

Criado em 09/08/2026. Extraído do padrão validado em `clients/index.tsx` (barra A–Z v1) e generalizado como componente reutilizável. Aprovado pelo CEO em sessão de Radar Clínico.
