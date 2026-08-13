// -------------------------------------------------------------------------------
// ORGAO DIETA — tipos e helpers compartilhados pelas abas "Tipos de Dieta",
// "Receitas" e "Lista de Compras" (Task 234). Convenções (fetch cru sem
// BASE_URL, classes 3D) espelham exatamente o restante de src/pages/dieta.
// -------------------------------------------------------------------------------

export interface Alimento {
  id: number;
  codigo: string;
  nome: string;
  grupo: string | null;
  subgrupo: string | null;
  porcaoPadraoG: number | null;
  kcal100g: number | null;
  proteinaG100g: number | null;
  carboidratoG100g: number | null;
  gorduraG100g: number | null;
  fibraG100g: number | null;
  indiceGlicemico: number | null;
  observacao: string | null;
  precoMedio: number | null;
  unidadeCompra: string | null;
  unidadeCompraEquivalenteG: number | null;
  categoriaCompra: string | null;
  ativo: boolean;
}

export interface Protocolo {
  id: number;
  codigo: string;
  nome: string;
  objetivo: string | null;
  estiloAlimentar: string | null;
  descricao: string | null;
  jejumIntermitente: boolean;
  jejumJanelaInicio: string | null;
  jejumJanelaFim: string | null;
  fatorAjusteObjetivo: number | null;
  ativo: boolean;
}

export interface ReceitaIngredienteRow {
  id: number;
  alimentoId: number;
  alimentoNome: string | null;
  quantidadeG: number;
  ordem: number | null;
  observacao: string | null;
}

export interface ReceitaTipoRow {
  protocoloId: number;
  codigo: string;
  nome: string;
}

export interface Receita {
  id: number;
  codigo: string;
  nome: string;
  modoPreparo: string | null;
  porcoes: number;
  tempoPreparoMin: number | null;
  observacao: string | null;
  ativo: boolean;
  ingredientes: ReceitaIngredienteRow[];
  tipos: ReceitaTipoRow[];
  totais: { kcal: number; proteinaG: number; carboidratoG: number; gorduraG: number };
}

export interface Cliente {
  id: number;
  name: string;
}

// Rotulos acentuados para os enums ASCII do backend (UNIDADES_COMPRA /
// CATEGORIAS_COMPRA em lib/db/src/schema/dieta.ts) — padcom nao depende de
// @workspace/db, entao os valores sao replicados aqui a mao (mantenha em sync).
export const UNIDADE_COMPRA_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "kg", label: "Quilo (kg)" },
  { value: "g", label: "Grama (g)" },
  { value: "l", label: "Litro (l)" },
  { value: "ml", label: "Mililitro (ml)" },
  { value: "dz", label: "Dúzia" },
  { value: "un", label: "Unidade" },
  { value: "maco", label: "Maço" },
  { value: "pacote", label: "Pacote" },
];

export const CATEGORIA_COMPRA_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "acougue", label: "Açougue" },
  { value: "hortifruti", label: "Hortifruti" },
  { value: "laticinios", label: "Laticínios" },
  { value: "mercearia", label: "Mercearia" },
];

export function unidadeLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return UNIDADE_COMPRA_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function categoriaLabel(v: string | null | undefined): string {
  if (!v) return "—";
  return CATEGORIA_COMPRA_OPTIONS.find((o) => o.value === v)?.label ?? v;
}

export function formatBRL(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export async function parseApiError(r: Response, fallback: string): Promise<string> {
  const d = await r.json().catch(() => ({}) as Record<string, unknown>);
  return (d as { error?: string }).error ?? fallback;
}

// ---- Helpers visuais compartilhados (movidos de index.tsx p/ evitar import
// circular entre index.tsx e as abas novas — ambos importam daqui). ----
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export function Metric({ label, value, unit, gold }: { label: string; value: string; unit: string; gold?: boolean }) {
  return (
    <div className="concave-3d px-2 py-2">
      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-lg font-black leading-none ${gold ? "text-primary" : "text-foreground"}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground/70">{unit}</div>
    </div>
  );
}

// Toggle "switch" customizado (pill 3D) — mesmo padrao visual do jejum
// intermitente em MontarCardapio, reaproveitado nas abas novas.
export function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full border transition-colors ${
        checked ? "bg-primary border-primary" : "bg-muted border-border"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
