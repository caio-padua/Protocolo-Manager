/**
 * Comparação de receitas emitidas (aba "Comparar" do painel Prescrições — Histórico).
 * Cada ativo ocupa uma linha fixa, na mesma posição em todas as colunas. Mudança de dose/posologia ou
 * ativo presente só em algumas receitas ganha um retângulo contínuo de ponta a ponta da linha.
 * A coluna "Conduta" decide o que é levado ao editor de prescrição que já existe na tela (não há editor novo).
 * Somente leitura: nada é emitido ou enviado aqui.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Eye, Loader2, Pencil, FilePlus2 } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";
import { BASE } from "../comunicacao/_shared";
import { PrescriptionPdfLink } from "./PrescricoesEmitidas";
import {
  chaveTexto, compararReceitas, lerLinhasAtivos, type LinhaAtivo, type LinhaFormula,
} from "@/lib/comparar-receitas";

type Item = { name: string; ativos: string | null; posologia: string | null };
type Receita = { id: number; title: string; recipeType: string; items: Item[] };
type Prescricao = {
  id: number; createdAt: string; status: string; professionalName: string | null;
  signatureStatus?: "signed" | "unsigned_expired" | "legacy_unknown"; recipes: Receita[];
};

/** O que a comparação entrega ao editor: fórmula, ativos mantidos (texto original), posologia e o ativo a focar. */
export type FormulaParaEdicao = { name: string; ativos: string; posologia: string | null; foco: string | null };

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const nomesDasFormulas = (p: Prescricao) => [...new Set(p.recipes.flatMap((r) => r.items.map((i) => i.name)).filter(Boolean))];

const MOLDURA = {
  alterada: "border-[#D97706] bg-[#FFFBEB] text-slate-900",
  so_em_algumas: "border-[#0284C7] bg-[#F0F9FF] text-slate-900",
  igual: "border-transparent",
} as const;

export function HistoricoReceitasExpandido({ clientId, onLevarParaEdicao }: {
  clientId: number; onLevarParaEdicao?: (itens: FormulaParaEdicao[]) => void;
}) {
  const [marcadas, setMarcadas] = useState<number[]>([]);
  const [busca, setBusca] = useState("");
  const [manter, setManter] = useState<Record<string, boolean>>({});
  const { data, isPending, error, refetch } = useQuery<Prescricao[]>({
    queryKey: ["prescricoes-historico", clientId],
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

  // Mais antiga à esquerda, mais recente à direita, junto da coluna de conduta.
  const escolhidas = useMemo(
    () => (data ?? []).filter((p) => marcadas.includes(p.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [data, marcadas],
  );
  const itensPorReceita = useMemo(() => escolhidas.map((p) => p.recipes.flatMap((r) => r.items)), [escolhidas]);
  const comparacao = useMemo(
    () => escolhidas.length >= 2
      ? compararReceitas(escolhidas.map((p, i) => ({ id: p.id, rotulo: `#${p.id}`, formulas: itensPorReceita[i] })))
      : null,
    [escolhidas, itensPorReceita],
  );
  useEffect(() => { setManter({}); }, [marcadas.join(",")]);

  const alternar = (id: number) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  const chave = (f: LinhaFormula, a: LinhaAtivo) => `${chaveTexto(f.nome)}|${chaveTexto(a.nome)}`;
  const ultima = escolhidas.length - 1;
  /** Padrão: mantém o ativo que existe na receita mais recente. */
  const mantido = (f: LinhaFormula, a: LinhaAtivo) => manter[chave(f, a)] ?? a.doses[ultima] !== undefined;

  /** Monta o que vai ao editor: ativos mantidos de cada fórmula, no texto da receita mais recente que os contém. */
  const montarPacote = (extra?: { f: LinhaFormula; a: LinhaAtivo }): FormulaParaEdicao[] => {
    if (!comparacao) return [];
    const pacote: FormulaParaEdicao[] = [];
    for (const f of comparacao.formulas) {
      const ativosMantidos = f.ativos.filter((a) => mantido(f, a) || (extra && extra.f === f && extra.a === a));
      if (!ativosMantidos.length) continue;
      const linhas: string[] = [];
      let posologia: string | null = null;
      for (const a of ativosMantidos) {
        for (let i = ultima; i >= 0; i--) {
          const item = itensPorReceita[i].find((it) => chaveTexto(it.name) === chaveTexto(f.nome));
          const achada = item && lerLinhasAtivos(item.ativos).find((l) => chaveTexto(l.nome) === chaveTexto(a.nome));
          if (achada) { linhas.push(achada.linha); if (posologia === null) posologia = item?.posologia ?? null; break; }
        }
      }
      for (let i = ultima; i >= 0 && posologia === null; i--) {
        posologia = itensPorReceita[i].find((it) => chaveTexto(it.name) === chaveTexto(f.nome))?.posologia ?? null;
      }
      pacote.push({ name: f.nome, ativos: linhas.join("\n"), posologia, foco: extra && extra.f === f ? extra.a.nome : null });
    }
    return pacote;
  };
  const totalMantidos = comparacao ? comparacao.formulas.reduce((n, f) => n + f.ativos.filter((a) => mantido(f, a)).length, 0) : 0;

  return (
    <div data-testid="historico-expandido">
      <div className="grid gap-3 md:h-[70vh] md:grid-cols-[320px_1fr]">
        {/* Lista */}
        <section className="panel-3d-sub flex max-h-[60vh] min-h-0 flex-col gap-2 !rounded-[3px] p-2 md:max-h-none" aria-label="Prescrições emitidas">
          <input className="concave-3d !rounded-[2px] bg-transparent px-2 py-1.5 text-sm outline-none" placeholder="Buscar fórmula ou número…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar no histórico" />
          {isPending && <p role="status" className="flex items-center gap-2 text-xs"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…</p>}
          {error && <div role="alert" className="text-xs text-destructive">{error.message}<button type="button" className="btn-3d-soft ml-2 !rounded-[2px] px-2 py-1" onClick={() => void refetch()}>Tentar novamente</button></div>}
          {!isPending && !error && !lista.length && <p className="text-xs text-muted-foreground">Nenhuma prescrição emitida encontrada.</p>}
          <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {lista.map((p) => {
              const ligado = marcadas.includes(p.id);
              return (
                <li key={p.id}>
                  <div className={`!rounded-[2px] p-2 text-xs ${ligado ? "btn-3d-apertado" : "concave-3d"}`}>
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
                        <PrescriptionPdfLink key={r.id} href={`${BASE}/api/clinical-documents/prescricao/${r.id}/pdf`} className="btn-3d-soft inline-flex items-center gap-1 !rounded-[2px] px-2 py-1 text-[11px]">
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
        <section className="panel-3d-sub min-h-0 overflow-auto !rounded-[3px] p-3" aria-label="Comparação" data-testid="area-comparacao">
          {escolhidas.length === 0 && <Vazio texto="Marque duas ou mais prescrições na lista para compará-las." />}
          {escolhidas.length === 1 && <UmaReceita p={escolhidas[0]} />}
          {comparacao && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                <strong>Comparando {escolhidas.length} prescrições</strong>
                <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-5 rounded-[3px] border-2 border-[#D97706] bg-[#FFFBEB]" /> Dose ou posologia alterada</span>
                <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-5 rounded-[3px] border-2 border-[#0284C7] bg-[#F0F9FF]" /> Ativo só em algumas receitas</span>
                <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-5 rounded-[3px] border-2 border-border" /> Igual</span>
                <button
                  type="button" disabled={!onLevarParaEdicao || totalMantidos === 0} data-testid="gerar-nova-prescricao"
                  onClick={() => onLevarParaEdicao?.(montarPacote())}
                  className="btn-3d ml-auto flex items-center gap-2 !rounded-[2px] px-4 py-2 text-xs font-bold disabled:opacity-40"
                >
                  <FilePlus2 className="h-4 w-4" /> Gerar nova prescrição a partir desta seleção ({totalMantidos})
                </button>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[640px] space-y-3">
                  {comparacao.formulas.map((f) => (
                    <BlocoFormula
                      key={f.nome} f={f} colunas={escolhidas}
                      mantido={(a) => mantido(f, a)}
                      alternarMantido={(a) => setManter((m) => ({ ...m, [chave(f, a)]: !mantido(f, a) }))}
                      manterTodos={(v) => setManter((m) => ({ ...m, ...Object.fromEntries(f.ativos.map((a) => [chave(f, a), v])) }))}
                      editar={(a) => onLevarParaEdicao?.(montarPacote({ f, a }))}
                      disabledEditar={!onLevarParaEdicao}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="concave-3d !rounded-[2px] px-3 py-3 text-xs text-muted-foreground" role="status">{texto}</p>;
}

function UmaReceita({ p }: { p: Prescricao }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">Prescrição #{p.id} · {dataHora(p.createdAt)}</p>
      {p.recipes.flatMap((r) => r.items).map((i, k) => (
        <div key={k} className="concave-3d !rounded-[2px] p-2 text-xs">
          <p className="font-bold">{i.name}</p>
          {i.ativos && <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{i.ativos}</pre>}
          {i.posologia && <p className="mt-1 text-muted-foreground">Posologia: {i.posologia}</p>}
        </div>
      ))}
      <Vazio texto="Marque mais uma prescrição para comparar." />
    </div>
  );
}

function BlocoFormula({ f, colunas, mantido, alternarMantido, manterTodos, editar, disabledEditar }: {
  f: LinhaFormula; colunas: Prescricao[]; mantido: (a: LinhaAtivo) => boolean; alternarMantido: (a: LinhaAtivo) => void;
  manterTodos: (v: boolean) => void; editar: (a: LinhaAtivo) => void; disabledEditar: boolean;
}) {
  const grade = { gridTemplateColumns: `minmax(160px,1.3fr) repeat(${colunas.length}, minmax(100px,1fr)) 140px` };
  const todos = f.ativos.length > 0 && f.ativos.every(mantido);
  return (
    <article className="concave-3d space-y-1 !rounded-[3px] p-2" data-testid={`formula-${f.status}`}>
      <header className="flex flex-wrap items-center gap-2 pb-1">
        <h4 className="text-sm font-bold">{f.nome}</h4>
        <button type="button" onClick={() => manterTodos(!todos)} className={`${todos ? "btn-3d-apertado" : "btn-3d-soft"} ml-auto !rounded-[2px] px-3 py-1 text-[11px] font-bold`}>
          Manter fórmula
        </button>
      </header>
      <div className="grid items-center gap-x-2 px-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground" style={grade}>
        <span>Ativo</span>
        {colunas.map((c) => <span key={c.id}>#{c.id} · {dataHora(c.createdAt).slice(0, 10)}</span>)}
        <span className="text-center">Conduta</span>
      </div>
      {f.ativos.map((a) => {
        const moldura = a.status === "dose_diferente" ? MOLDURA.alterada : a.status === "ausente_em_algumas" || f.status === "so_em_algumas" ? MOLDURA.so_em_algumas : MOLDURA.igual;
        const ligado = mantido(a);
        return (
          <div key={a.nome} className={`grid min-h-[38px] items-center gap-x-2 rounded-[6px] border-2 px-2 py-1 text-[12px] ${moldura}`} style={grade} data-testid={`linha-${f.status === "so_em_algumas" ? "ausente_em_algumas" : a.status}`}>
            <span className="font-semibold">{a.nome}</span>
            {a.doses.map((d, i) => (
              <span key={i} className={!f.presente[i] || d === undefined ? "opacity-50" : "font-bold"}>
                {!f.presente[i] || d === undefined ? "não consta" : d || "sem dose"}
              </span>
            ))}
            <span className="flex items-center justify-end gap-1">
              <button type="button" onClick={() => alternarMantido(a)} aria-pressed={ligado} aria-label={`Manter ${a.nome}`}
                className={`${ligado ? "btn-3d-apertado" : "btn-3d-soft"} flex items-center gap-1 !rounded-[2px] px-2 py-1 text-[11px] font-bold`}>
                {ligado && <Check className="h-3 w-3" />} Manter
              </button>
              <button type="button" disabled={disabledEditar} onClick={() => editar(a)} aria-label={`Editar ${a.nome}`} title="Levar ao editor, focado neste ativo"
                className="btn-3d-soft flex items-center !rounded-[2px] px-2 py-1 disabled:opacity-40"><Pencil className="h-3 w-3" /></button>
            </span>
          </div>
        );
      })}
      <div
        className={`grid min-h-[38px] items-center gap-x-2 rounded-[6px] border-2 px-2 py-1 text-[12px] ${f.posologiaDiferente ? MOLDURA.alterada : MOLDURA.igual}`}
        style={grade}
      >
        <span className="text-[10px] font-black uppercase tracking-wider">Posologia</span>
        {f.posologias.map((p, i) => <span key={i} className={f.presente[i] ? "" : "opacity-50"}>{f.presente[i] ? (p ?? "—") : "não consta"}</span>)}
        <span />
      </div>
    </article>
  );
}
