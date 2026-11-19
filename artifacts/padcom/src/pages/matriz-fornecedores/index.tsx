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
        <div className="panel-3d p-2" data-testid="planilha-matriz">
          <div className="concave-3d overflow-auto" style={{ maxHeight: "68vh" }}>
            <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[13px]" data-testid="tabela-matriz">
              <thead>
                <tr className="text-center text-[10px] font-semibold tracking-widest" style={{ background: "#e9edf4", color: "#5b6a86" }}>
                  <th className="sticky left-0 top-0 z-30 w-10 border-b border-r border-[#c5cddb] bg-[#e9edf4] py-1" />
                  <th className="sticky left-10 top-0 z-30 border-b border-r border-[#c5cddb] bg-[#e9edf4] py-1">A</th>
                  {visiveis.map((f, i) => (
                    <th key={f.id} className="sticky top-0 z-20 border-b border-r border-[#c5cddb] bg-[#e9edf4] py-1">{String.fromCharCode(66 + i)}</th>
                  ))}
                  <th className="sticky top-0 z-20 border-b border-r border-[#c5cddb] bg-[#e9edf4] py-1">{String.fromCharCode(66 + visiveis.length)}</th>
                  <th className="sticky top-0 z-20 border-b border-[#c5cddb] bg-[#e9edf4] py-1">{String.fromCharCode(67 + visiveis.length)}</th>
                </tr>
                <tr className="text-left text-[11px] font-bold uppercase tracking-widest text-white">
                  <th className="sticky left-0 top-[25px] z-30 w-10 border-r border-[#2b4170] p-2" style={{ background: "#16284a" }} />
                  <th className="sticky left-10 top-[25px] z-30 min-w-[240px] border-r border-[#2b4170] p-2" style={{ background: "#16284a" }}>Produto ({linhas.length})</th>
                  {visiveis.map((f) => (
                    <th key={f.id} className="sticky top-[25px] z-20 min-w-[150px] border-r border-[#2b4170] p-2" style={{ background: "#16284a", boxShadow: `inset 0 -4px 0 ${cor(f.id)}` }}>{f.nome}</th>
                  ))}
                  <th className="sticky top-[25px] z-20 min-w-[160px] border-r border-[#b8923a] p-2 text-[#16284a]" style={{ background: "linear-gradient(#f0cd7c,#d9a940)" }}><Trophy className="mr-1 inline h-3.5 w-3.5" />Melhor valor</th>
                  <th className="sticky top-[25px] z-20 min-w-[130px] p-2" style={{ background: "#16284a" }}>Referência (maior)</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, idx) => {
                  const validas = l.celulas.filter((c) => visiveis.some((f) => f.id === c.fornecedorId));
                  const menor = validas.length ? Math.min(...validas.map((c) => c.custoUnitarioCentavos)) : null;
                  const maior = validas.length ? Math.max(...validas.map((c) => c.custoUnitarioCentavos)) : null;
                  const vencedoras = validas.filter((c) => c.custoUnitarioCentavos === menor);
                  const fundo = idx % 2 ? "#f5f7fb" : "#ffffff";
                  const grade = "border-b border-r border-[#d5dbe7]";
                  return (
                    <tr key={l.varianteId} className="align-middle hover:[&>td]:!bg-[#fff6dd]">
                      <td className={`sticky left-0 z-10 w-10 ${grade} px-1 py-1.5 text-center text-[10px] font-semibold`} style={{ background: "#e9edf4", color: "#5b6a86" }}>{idx + 1}</td>
                      <td className={`sticky left-10 z-10 ${grade} px-2 py-1.5`} style={{ background: fundo }}>
                        <div className="font-semibold uppercase leading-tight text-[#16284a]">{l.produto}</div>
                        <div className="text-[11px] leading-tight text-[#5b6a86]">{l.doseTotal} · {l.forma}{l.volumeMl ? ` · ${Number(l.volumeMl).toLocaleString("pt-BR")} ml` : ""} · {l.via ?? "via não informada"}</div>
                      </td>
                      {visiveis.map((f) => {
                        const c = l.celulas.find((x) => x.fornecedorId === f.id);
                        const ganha = !!c && c.custoUnitarioCentavos === menor && validas.length > 1;
                        return (
                          <td key={f.id} className={`${grade} px-2 py-1.5 text-right`} style={{ background: ganha ? `${cor(f.id)}33` : fundo, boxShadow: ganha ? `inset 3px 0 0 ${cor(f.id)}` : undefined }}>
                            {c ? (<>
                              <Valor valor={c.custoUnitarioCentavos / 100} />
                              <div className="text-[10px] leading-tight text-[#5b6a86]">cx {c.quantidadeEmbalagem}: <Valor valor={c.custoEmbalagemCentavos / 100} peso={500} /></div>
                            </>) : <span className="text-[11px] text-[#9aa5bb]">—</span>}
                          </td>
                        );
                      })}
                      <td className={`${grade} px-2 py-1.5 text-right`} style={{ background: menor === null ? fundo : "#fbf0cf" }}>
                        {menor === null ? <span className="text-[11px] text-[#9aa5bb]">—</span> : (<>
                          <Valor valor={menor / 100} peso={800} />
                          {vencedoras.map((c) => (
                            <div key={c.fornecedorId} className="text-[10px] font-bold uppercase leading-tight" style={{ color: cor(c.fornecedorId) }}>{nome(c.fornecedorId)}</div>
                          ))}
                        </>)}
                      </td>
                      <td className="border-b border-[#d5dbe7] px-2 py-1.5 text-right" style={{ background: fundo }}>{maior === null ? <span className="text-[11px] text-[#9aa5bb]">—</span> : <Valor valor={maior / 100} />}</td>
                    </tr>
                  );
                })}
                {linhas.length === 0 && <tr><td colSpan={visiveis.length + 4} className="p-6 text-center text-sm text-[#5b6a86]">Nenhum produto com esses filtros.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#5b6a86]" data-testid="barra-estado-matriz">
            <span>{linhas.length} de {q.data.linhas.length} produtos</span>
            <span>{linhas.filter((l) => l.celulas.length > 0).length} com preço</span>
            <span>{visiveis.length} laboratório(s) na comparação</span>
          </div>
        </div>
      )}
      <p className="text-xs opacity-70">Valores de custo por unidade. A Referência usa o maior valor entre os laboratórios mostrados. Custo nunca altera preço de venda nem estoque.</p>
    </div>
  );
}
