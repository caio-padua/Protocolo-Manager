import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCw, Search, Table2, Trophy } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Valor } from "@/components/numeral/Numeral";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Celula = { fornecedorId: number; custoUnitarioCentavos: number; custoEmbalagemCentavos: number; quantidadeEmbalagem: number };
type Categoria = "IM" | "SC" | "IMPLANTE" | "OUTRAS" | "SEM_VIA";
type Linha = {
  varianteId: number; produto: string; doseTotal: string; forma: string; volumeMl: string | null;
  via: string | null; categoria: Categoria; celulas: Celula[];
};
type Fornecedor = { id: number; nome: string; ativo: boolean };
type Matriz = { fornecedores: Fornecedor[]; linhas: Linha[] };

// Uma cor por laboratório (ordem fixa do cadastro): bate o olho e reconhece quem tem o menor preço.
const CORES = ["#c9962b", "#2f7d6b", "#7a4fb5", "#c4503f", "#2d6cb0", "#8a6d2f"];
const CATEGORIAS: { id: Categoria | "TODAS"; nome: string }[] = [
  { id: "TODAS", nome: "Todas" }, { id: "IM", nome: "Injetáveis IM" }, { id: "SC", nome: "Injetáveis SC" },
  { id: "IMPLANTE", nome: "Implantes" }, { id: "OUTRAS", nome: "Outras vias" }, { id: "SEM_VIA", nome: "Sem via" },
];

async function carregar(): Promise<Matriz> {
  const r = await fetch("/api/matriz-fornecedores", { headers: collabAuthHeaders() });
  if (r.status === 401) throw new Error("Entre novamente com seu acesso profissional.");
  if (r.status === 403) throw new Error("Somente o proprietário pode ver esta matriz.");
  if (!r.ok) throw new Error("A matriz está indisponível neste momento.");
  return r.json();
}

export default function MatrizFornecedores() {
  const q = useQuery({ queryKey: ["matriz-fornecedores"], queryFn: carregar });
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<Categoria | "TODAS">("TODAS");
  const [soComPreco, setSoComPreco] = useState(false);
  const [escondidos, setEscondidos] = useState<number[]>([]);

  const forn = q.data?.fornecedores ?? [];
  const cor = (id: number) => CORES[Math.max(0, forn.findIndex((f) => f.id === id)) % CORES.length];
  const nome = (id: number) => forn.find((f) => f.id === id)?.nome ?? "—";
  const visiveis = forn.filter((f) => !escondidos.includes(f.id));

  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (q.data?.linhas ?? []).filter((l) =>
      (categoria === "TODAS" || l.categoria === categoria) &&
      (!soComPreco || l.celulas.length > 0) &&
      (!t || `${l.produto} ${l.doseTotal}`.toLowerCase().includes(t)));
  }, [q.data, busca, categoria, soComPreco]);

  const alternar = (id: number) => setEscondidos((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));

  return (
    <div className="space-y-5 p-4 md:p-6" data-testid="page-matriz-fornecedores">
      <div className="panel-3d p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="bevel-3d inline-flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-widest">
            <Table2 className="h-4 w-4" /> Matrix: Substâncias x Fornecedores
          </div>
          <Button type="button" variant="outline" size="icon" className="btn-3d-soft h-10 w-10" aria-label="Atualizar matriz"
            onClick={() => q.refetch()} disabled={q.isFetching}><RotateCw className="h-4 w-4" /></Button>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 opacity-60" />
            <Input className="field-engraved pl-9" placeholder="Buscar substância ou dose" value={busca} onChange={(e) => setBusca(e.target.value)} data-testid="input-busca-matriz" />
          </div>
          <label className="concave-3d flex items-center gap-2 px-3 py-2 text-sm">
            <input type="checkbox" checked={soComPreco} onChange={(e) => setSoComPreco(e.target.checked)} /> Só com preço
          </label>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Categoria">
          {CATEGORIAS.map((c) => (
            <button key={c.id} type="button" onClick={() => setCategoria(c.id)} aria-pressed={categoria === c.id}
              className={`${categoria === c.id ? "bevel-3d" : "btn-3d-soft"} px-3 py-2 text-xs font-semibold uppercase tracking-wide`}>{c.nome}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Laboratórios">
          {forn.map((f) => (
            <button key={f.id} type="button" onClick={() => alternar(f.id)} aria-pressed={!escondidos.includes(f.id)}
              className="concave-3d flex items-center gap-2 px-3 py-2 text-xs font-semibold" style={{ opacity: escondidos.includes(f.id) ? 0.45 : 1 }}>
              <span className="inline-block h-3 w-3 rounded-[2px]" style={{ background: cor(f.id) }} /> {f.nome}
            </button>
          ))}
        </div>
      </div>

      {q.isLoading && <Skeleton className="h-64 w-full" />}
      {q.isError && <div className="panel-3d p-4 text-sm" role="alert">{(q.error as Error).message}</div>}

      {q.data && (
        <div className="panel-3d overflow-x-auto">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm" data-testid="tabela-matriz">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest">
                <th className="sticky left-0 z-10 bg-[#16284a] p-3 text-white">Produto ({linhas.length})</th>
                {visiveis.map((f) => (
                  <th key={f.id} className="p-3 text-white" style={{ background: "#16284a", borderBottom: `4px solid ${cor(f.id)}` }}>{f.nome}</th>
                ))}
                <th className="p-3 text-[#16284a]" style={{ background: "#e3b659" }}><Trophy className="mr-1 inline h-3.5 w-3.5" />Melhor valor</th>
                <th className="p-3 text-white" style={{ background: "#16284a" }}>Referência (maior)</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const validas = l.celulas.filter((c) => visiveis.some((f) => f.id === c.fornecedorId));
                const menor = validas.length ? Math.min(...validas.map((c) => c.custoUnitarioCentavos)) : null;
                const maior = validas.length ? Math.max(...validas.map((c) => c.custoUnitarioCentavos)) : null;
                const vencedoras = validas.filter((c) => c.custoUnitarioCentavos === menor);
                return (
                  <tr key={l.varianteId} className="align-top">
                    <td className="sticky left-0 z-10 border-b bg-white p-3 dark:bg-[#0f1b33]">
                      <div className="font-semibold uppercase">{l.produto}</div>
                      <div className="text-xs opacity-70">{l.doseTotal} · {l.forma}{l.volumeMl ? ` · ${Number(l.volumeMl).toLocaleString("pt-BR")} ml` : ""} · {l.via ?? "via não informada"}</div>
                    </td>
                    {visiveis.map((f) => {
                      const c = l.celulas.find((x) => x.fornecedorId === f.id);
                      const ganha = !!c && c.custoUnitarioCentavos === menor && validas.length > 1;
                      return (
                        <td key={f.id} className="border-b p-3" style={ganha ? { background: `${cor(f.id)}26`, boxShadow: `inset 4px 0 0 ${cor(f.id)}` } : undefined}>
                          {c ? (<>
                            <Valor valor={c.custoUnitarioCentavos / 100} />
                            <div className="text-xs opacity-70">caixa c/ {c.quantidadeEmbalagem}: <Valor valor={c.custoEmbalagemCentavos / 100} peso={500} /></div>
                          </>) : <span className="text-xs opacity-50">sem preço</span>}
                        </td>
                      );
                    })}
                    <td className="border-b p-3" style={{ background: "#e3b65922" }}>
                      {menor === null ? <span className="text-xs opacity-50">sem preço</span> : (<>
                        <Valor valor={menor / 100} peso={800} />
                        {vencedoras.map((c) => (
                          <div key={c.fornecedorId} className="mt-1 text-[11px] font-bold uppercase" style={{ color: cor(c.fornecedorId) }}>{nome(c.fornecedorId)}</div>
                        ))}
                      </>)}
                    </td>
                    <td className="border-b p-3">{maior === null ? <span className="text-xs opacity-50">sem preço</span> : <Valor valor={maior / 100} />}</td>
                  </tr>
                );
              })}
              {linhas.length === 0 && <tr><td colSpan={visiveis.length + 3} className="p-6 text-center text-sm opacity-70">Nenhum produto com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs opacity-70">Valores de custo por unidade. A Referência usa o maior valor entre os laboratórios mostrados. Custo nunca altera preço de venda nem estoque.</p>
    </div>
  );
}
