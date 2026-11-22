/**
 * Histórico expandido das receitas emitidas + comparação lado a lado.
 * Abre por cima da tela do Cockpit (sem sair dela). Marque duas ou mais prescrições para comparar:
 * o sistema alinha as fórmulas pelo nome e mostra o que mudou (dose de cada ativo, ativo que entrou ou saiu,
 * posologia) e o que só existe em algumas receitas. Somente leitura: nada é emitido ou enviado aqui.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Columns3, Eye, History, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getCollabToken } from "@/lib/collab-auth";
import { BASE } from "../comunicacao/_shared";
import { PrescriptionPdfLink } from "./PrescricoesEmitidas";
import {
  compararReceitas, type LinhaAtivo, type LinhaFormula, type StatusAtivo, type StatusFormula,
} from "@/lib/comparar-receitas";

type Item = { name: string; ativos: string | null; posologia: string | null };
type Receita = { id: number; title: string; recipeType: string; items: Item[] };
type Prescricao = {
  id: number; createdAt: string; status: string; professionalName: string | null;
  signatureStatus?: "signed" | "unsigned_expired" | "legacy_unknown"; recipes: Receita[];
};

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const ROTULO_FORMULA: Record<StatusFormula, { texto: string; cls: string }> = {
  igual: { texto: "Igual", cls: "bg-emerald-100 text-emerald-900 border-emerald-700/40" },
  alterada: { texto: "Alterada", cls: "bg-amber-100 text-amber-900 border-amber-700/50" },
  so_em_algumas: { texto: "Só em algumas", cls: "bg-sky-100 text-sky-900 border-sky-700/40" },
};
const COR_ATIVO: Record<StatusAtivo, string> = {
  igual: "",
  dose_diferente: "bg-amber-100/80 font-bold text-amber-900",
  ausente_em_algumas: "bg-sky-100/80 font-bold text-sky-900",
};

function nomesDasFormulas(p: Prescricao): string[] {
  return [...new Set(p.recipes.flatMap((r) => r.items.map((i) => i.name)).filter(Boolean))];
}

export function HistoricoReceitasExpandido({ clientId, aberto, onFechar }: { clientId: number; aberto: boolean; onFechar: () => void }) {
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const [busca, setBusca] = useState("");
  const { data, isPending, error, refetch } = useQuery<Prescricao[]>({
    queryKey: ["prescricoes-historico", clientId],
    enabled: aberto,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/prescriptions/historico/${clientId}`, { headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` } });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || `Falha ao carregar o histórico (HTTP ${r.status}).`);
      return d as Prescricao[];
    },
  });

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (data ?? []).filter((p) => !t || nomesDasFormulas(p).some((n) => n.toLowerCase().includes(t)) || String(p.id).includes(t));
  }, [data, busca]);

  const escolhidas = useMemo(
    () => (data ?? []).filter((p) => marcadas.includes(p.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [data, marcadas],
  );
  const comparacao = useMemo(
    () => escolhidas.length >= 2
      ? compararReceitas(escolhidas.map((p) => ({
          id: p.id,
          rotulo: `#${p.id}`,
          formulas: p.recipes.flatMap((r) => r.items),
        })))
      : null,
    [escolhidas],
  );
  const alternar = (id: number) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) onFechar(); }}>
      <DialogContent className="flex h-[90vh] w-[96vw] max-w-[1400px] flex-col gap-3 overflow-hidden rounded-[4px] p-4" data-testid="historico-expandido">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold uppercase tracking-widest"><History className="h-4 w-4" /> Histórico de receitas emitidas</DialogTitle>
          <DialogDescription>Marque duas ou mais prescrições para compará-las lado a lado. Aqui só se consulta: nada é emitido nem enviado.</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[340px_1fr]">
          {/* Lista */}
          <section className="panel-3d-sub flex min-h-0 flex-col gap-2 rounded-[4px] p-2" aria-label="Prescrições emitidas">
            <input className="concave-3d rounded-[3px] bg-transparent px-2 py-1.5 text-sm outline-none" placeholder="Buscar fórmula ou número…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar no histórico" />
            {isPending && <p role="status" className="flex items-center gap-2 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…</p>}
            {error && <div role="alert" className="text-xs text-destructive">{error.message}<button type="button" className="btn-3d-soft ml-2 rounded-[3px] px-2 py-1" onClick={() => void refetch()}>Tentar novamente</button></div>}
            {!isPending && !error && !lista.length && <p className="text-xs text-muted-foreground">Nenhuma prescrição emitida encontrada.</p>}
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
              {lista.map((p) => {
                const ligado = marcadas.includes(p.id);
                return (
                  <li key={p.id}>
                    <div className={`rounded-[3px] p-2 text-xs ${ligado ? "btn-3d-apertado" : "concave-3d"}`}>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input type="checkbox" className="mt-0.5" checked={ligado} onChange={() => alternar(p.id)} data-testid={`comparar-${p.id}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-bold">Prescrição #{p.id} · {dataHora(p.createdAt)}</span>
                          {p.signatureStatus === "unsigned_expired" && <span className="block font-bold text-amber-800">sem assinatura digital</span>}
                          <span className="mt-1 block text-muted-foreground">{nomesDasFormulas(p).join(" · ") || "sem fórmulas registradas"}</span>
                        </span>
                      </label>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 pl-6">
                        {p.recipes.map((r) => (
                          <PrescriptionPdfLink key={r.id} href={`${BASE}/api/clinical-documents/prescricao/${r.id}/pdf`} className="btn-3d-soft inline-flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px]">
                            <Eye className="h-3 w-3" /> PDF da receita {r.id}
                          </PrescriptionPdfLink>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Comparação */}
          <section className="panel-3d-sub min-h-0 overflow-auto rounded-[4px] p-3" aria-label="Comparação" data-testid="area-comparacao">
            {escolhidas.length === 0 && <Vazio texto="Marque uma ou mais prescrições na lista para ver as fórmulas. Com duas ou mais, o sistema compara." />}
            {escolhidas.length === 1 && <UmaReceita p={escolhidas[0]} />}
            {comparacao && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Columns3 className="h-4 w-4" />
                  <strong>Comparando {escolhidas.length} prescrições</strong>
                  <span className="rounded-[3px] border border-emerald-700/40 bg-emerald-100 px-2 py-0.5 text-emerald-900">{comparacao.resumo.iguais} iguais</span>
                  <span className="rounded-[3px] border border-amber-700/50 bg-amber-100 px-2 py-0.5 text-amber-900">{comparacao.resumo.alteradas} alteradas</span>
                  <span className="rounded-[3px] border border-sky-700/40 bg-sky-100 px-2 py-0.5 text-sky-900">{comparacao.resumo.soEmAlgumas} só em algumas</span>
                </div>
                <div className="space-y-3">
                  {comparacao.formulas.map((f) => <BlocoFormula key={f.nome} f={f} colunas={escolhidas} />)}
                </div>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="concave-3d rounded-[3px] px-3 py-3 text-xs text-muted-foreground" role="status">{texto}</p>;
}

function UmaReceita({ p }: { p: Prescricao }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">Prescrição #{p.id} · {dataHora(p.createdAt)}</p>
      {p.recipes.flatMap((r) => r.items).map((i, k) => (
        <div key={k} className="concave-3d rounded-[3px] p-2 text-xs">
          <p className="font-bold">{i.name}</p>
          {i.ativos && <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{i.ativos}</pre>}
          {i.posologia && <p className="mt-1 text-muted-foreground">Posologia: {i.posologia}</p>}
        </div>
      ))}
      <Vazio texto="Marque mais uma prescrição para comparar." />
    </div>
  );
}

function BlocoFormula({ f, colunas }: { f: LinhaFormula; colunas: Prescricao[] }) {
  const rot = ROTULO_FORMULA[f.status];
  const grade = { gridTemplateColumns: `minmax(150px,1.2fr) repeat(${colunas.length}, minmax(110px,1fr))` };
  return (
    <article className="concave-3d space-y-2 rounded-[3px] p-2" data-testid={`formula-${f.status}`}>
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-bold">{f.nome}</h4>
        <span className={`rounded-[3px] border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${rot.cls}`}>{rot.texto}</span>
      </header>
      <div className="grid gap-px text-[11px]" style={grade}>
        <span className="font-black uppercase tracking-wider text-muted-foreground">Ativo</span>
        {colunas.map((c) => <span key={c.id} className="font-black uppercase tracking-wider text-muted-foreground">#{c.id} · {dataHora(c.createdAt).slice(0, 10)}</span>)}
        {f.ativos.map((a) => <LinhaDoAtivo key={a.nome} a={a} presente={f.presente} />)}
        <span className={`pt-1 font-black uppercase tracking-wider ${f.posologiaDiferente ? "text-amber-900" : "text-muted-foreground"}`}>Posologia</span>
        {f.posologias.map((p, i) => (
          <span key={i} className={`pt-1 ${f.posologiaDiferente && f.presente[i] ? "bg-amber-100/80 font-bold text-amber-900" : ""}`}>{f.presente[i] ? (p ?? "—") : "não consta"}</span>
        ))}
      </div>
    </article>
  );
}

function LinhaDoAtivo({ a, presente }: { a: LinhaAtivo; presente: boolean[] }) {
  return (
    <>
      <span className={COR_ATIVO[a.status]}>{a.nome}</span>
      {a.doses.map((d, i) => (
        <span key={i} className={COR_ATIVO[a.status]}>
          {!presente[i] ? "não consta" : d === undefined ? "não tem" : d || "sem dose"}
        </span>
      ))}
    </>
  );
}
