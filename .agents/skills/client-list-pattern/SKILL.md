# SKILL: Padrão de Lista/Seletor de Clientes (ClientListPattern)

## Quando usar esta skill
Sempre que for criar ou modificar qualquer tela que:
- Liste clientes (pacientes) com busca + filtro por letra
- Exiba um seletor de cliente (dropdown/modal de seleção única)
- Mostre cards de clientes com dados de identidade

## Componentes canônicos

| Componente | Arquivo | Uso |
|---|---|---|
| `ClientPicker` | `artifacts/padcom/src/components/ClientPicker.tsx` | Seleção única de cliente (dropdown com busca + A-Z) |
| Página de listagem | `artifacts/padcom/src/pages/clients/index.tsx` | Lista completa com cards, scroll infinito, ações em lote |

---

## Padrão da Barra A-Z (obrigatório em listas e seletores)

```tsx
const LETRAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Estado
const [filterLetra, setFilterLetra] = useState<string | null>(null);

// Letras disponíveis (baseado nos dados carregados)
const disponíveis = useMemo(() => {
  const s = new Set<string>();
  for (const c of clientes) s.add(norm(c.name).charAt(0) || "#");
  return s;
}, [clientes]);

// Render
<div className="flex flex-wrap gap-[3px]">
  <button
    onClick={() => setFilterLetra(null)}
    className={cn("h-6 rounded border px-2 text-[10px] font-bold uppercase tracking-widest",
      filterLetra === null
        ? "border-primary bg-primary text-primary-foreground"
        : "border-border bg-background text-muted-foreground hover:bg-muted"
    )}
  >
    TODOS
  </button>
  {LETRAS.map((l) => {
    const tem   = disponíveis.has(l);
    const ativa = filterLetra === l;
    return (
      <button key={l} disabled={!tem}
        onClick={() => setFilterLetra(ativa ? null : l)}
        className={cn("h-6 w-6 rounded border text-[11px] font-bold",
          ativa  ? "border-primary bg-primary text-primary-foreground" :
          tem    ? "border-border bg-background hover:border-primary/50 hover:bg-primary/10" :
                   "cursor-not-allowed border-transparent text-muted-foreground/25"
        )}
      >
        {l}
      </button>
    );
  })}
</div>
```

### Função de normalização de letras
```ts
function norm(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
```
> Isso garante que "Ângela" apareça no botão **A**, não em **?**.

---

## Padrão do Container Busca + A-Z

```tsx
<div className="panel-3d-sub p-3 space-y-2 rounded-lg">
  {/* Campo de busca */}
  <div className="relative">
    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
    <Input
      type="search"
      placeholder="Buscar por nome ou CPF..."
      className="pl-8 field-engraved"
      value={search}
      onChange={(e) => { setSearch(e.target.value); setFilterLetra(null); }}
    />
  </div>
  {/* Barra A-Z aqui */}
</div>
```

---

## Padrão do Card de Cliente

Layout: **foto portrait à esquerda (64×88 px) + dados em coluna direita**.
Dados em 4 linhas alinhadas verticalmente por ícone:

```
[foto]  Nome Completo em Título Próprio
        [CPF em concave-3d]  [badge STATUS]
        🗓  XX anos · DD/MM/AAAA
        📍  Endereço completo
        📞  telefone  ·  ✉  email
        ─────────────────── [Visualizar]
```

```tsx
<CardContent className="p-4 flex flex-row gap-3">
  {/* Foto */}
  <div className="concave-3d rounded-[6px] p-1 shrink-0 self-start mt-5">
    <div className="w-16 h-[88px] rounded-[4px] overflow-hidden bg-muted flex items-center justify-center">
      {client.photoUrl
        ? <img src={client.photoUrl} alt="Foto" className="w-full h-full object-cover" />
        : <Camera className="w-5 h-5 text-muted-foreground/35" />
      }
    </div>
  </div>

  {/* Dados */}
  <div className="flex-1 min-w-0 pl-5 pt-1 space-y-1.5">
    <h3 className="text-sm font-bold leading-tight text-primary line-clamp-2 mb-2">
      {tituloProprio(client.name)}
    </h3>

    {/* L1: CPF + STATUS */}
    <div className="flex items-center gap-2 flex-wrap">
      <div className="concave-3d inline-flex px-2 py-0.5 text-[10px] font-bold tabular-nums">
        {client.cpf || "—"}
      </div>
      <Badge className={`... ${getStatusColor(client.status)}`}>
        {formatStatus(client.status)}
      </Badge>
    </div>

    {/* L2: Idade · Data de nascimento */}
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <Calendar className="w-3 h-3 text-primary shrink-0" />
      <span className="font-semibold">{idade != null ? `${idade} anos` : "—"}</span>
      <span className="text-muted-foreground/40">·</span>
      <span className="tabular-nums">{dataNasc}</span>
    </div>

    {/* L3: Endereço */}
    <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
      <MapPin className="w-3 h-3 text-primary shrink-0 mt-px" />
      <span className="line-clamp-1">{client.address || "—"}</span>
    </div>

    {/* L4: Telefone · Email */}
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
      <Phone className="w-3 h-3 text-primary shrink-0" />
      <span className="tabular-nums shrink-0 max-w-[90px] truncate">{client.phone || "—"}</span>
      <span className="text-muted-foreground/30 shrink-0">·</span>
      <Mail className="w-3 h-3 text-primary shrink-0" />
      <span className="truncate lowercase">{client.email || "—"}</span>
    </div>

    {/* Rodapé */}
    <div className="pt-2 border-t flex justify-end">
      <Link href={`/clients/${client.id}`} onClick={(e) => e.stopPropagation()}>
        <div className="screen-3d px-2 py-1 text-[9px] font-bold text-primary uppercase tracking-wider">
          Visualizar
        </div>
      </Link>
    </div>
  </div>
</CardContent>
```

**Regras visuais do card:**
- Checkbox absoluto `top-3 left-3` — nunca sobrepõe foto
- Foto: `concave-3d`, portrait 64×88 px (nunca quadrada nem circular)
- Nome em `tituloProprio()` — nunca em maiúsculas
- CPF em `concave-3d` — tabular-nums
- Status em `Badge` com `getStatusColor(client.status)`
- Ícones alinhados na coluna esquerda — cria linha imaginária vertical
- Rodapé: somente botão "Visualizar" (sem label "Prontuário")

---

## Scroll Infinito (obrigatório para listas grandes)

```tsx
const PAGE_SIZE = 100;
const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
const sentinelRef = useRef<HTMLDivElement>(null);

// Observa o sentinel e carrega mais quando entra na viewport
useEffect(() => {
  const el = sentinelRef.current;
  if (!el) return;
  const obs = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) setDisplayCount((p) => p + PAGE_SIZE); },
    { rootMargin: "300px" },
  );
  obs.observe(el);
  return () => obs.disconnect();
}, [tabClients, filterLetra]); // re-bind quando dados ou filtro mudam

const visible = afterLetter.slice(0, displayCount);
const hasMore  = visible.length < afterLetter.length;

// No JSX, ao final da lista:
{hasMore && <div ref={sentinelRef} className="h-16" />}
{!hasMore && (
  <p className="text-center text-[10px] text-muted-foreground/50 uppercase tracking-widest py-4">
    — Todos os {afterLetter.length.toLocaleString("pt-BR")} clientes exibidos —
  </p>
)}
```

> **Nunca usar `MAX_RENDER = N` fixo** — trunca a lista sem aviso e o usuário acha que faltam dados.

---

## Funções auxiliares canônicas

```ts
// Cálculo de idade a partir de birthDate ("YYYY-MM-DD" ou ISO)
function calcIdade(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const raw = birthDate.includes("T") ? birthDate.split("T")[0] : birthDate;
  const [y, m, d] = raw.split("-").map(Number);
  if (!y || !m || !d) return null;
  const hoje = new Date();
  let idade = hoje.getFullYear() - y;
  if (hoje.getMonth() + 1 < m || (hoje.getMonth() + 1 === m && hoje.getDate() < d)) idade--;
  return idade < 0 ? null : idade;
}

// Formata data para DD/MM/AAAA
function formatBirthDate(birthDate: string | null | undefined): string {
  if (!birthDate) return "—";
  const raw = birthDate.includes("T") ? birthDate.split("T")[0] : birthDate;
  const [y, m, d] = raw.split("-");
  return `${d}/${m}/${y}`;
}
```

---

## Divisor alfabético entre grupos

```tsx
<div className="flex items-center gap-3 mb-3">
  <div className="bevel-3d w-8 h-8 rounded-md flex items-center justify-center text-sm font-extrabold text-primary shrink-0">
    {letra}
  </div>
  <div className="flex-1 h-px bg-border/60" />
  <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">
    {grupo.length} {grupo.length === 1 ? "cliente" : "clientes"}
  </span>
</div>
```

---

## Grid de cards

```tsx
<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
  {/* cards aqui */}
</div>
```

> 2 colunas no tablet, 3 no desktop — mantém os cards largos o suficiente para os 4 campos de dados.

---

## Checklist antes de entregar qualquer tela com lista de clientes

- [ ] Barra A-Z presente acima do campo de busca
- [ ] Campo de busca usa `field-engraved` + ícone `Search` à esquerda
- [ ] Clientes ordenados alfabeticamente (localeCompare pt-BR)
- [ ] Divisor de letra entre grupos
- [ ] Card layout: foto portrait + 4 linhas de dados alinhadas
- [ ] Scroll infinito com sentinel (não MAX_RENDER fixo)
- [ ] Nome exibido com `tituloProprio()` — nunca ALL CAPS
- [ ] Rodapé do card: somente botão "Visualizar" (sem label "Prontuário")
