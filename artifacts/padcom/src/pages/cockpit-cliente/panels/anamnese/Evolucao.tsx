import { useMemo, useState } from "react";
import { ArrowRight, Minus, Plus, TrendingDown, TrendingUp } from "lucide-react";
import { agruparPorBloco, compararAchados, compararSessoes, dataBR, horaBR, NAVY, OURO, MUDO, quando, VOL_COR, VOL_ROTULO, type SessaoDetalhe, type SessaoResumo } from "./util";

const rotuloSessao = (s: SessaoResumo) => `${dataBR(quando(s))} ${horaBR(quando(s))}${s.mode === "consulta" ? " · consulta" : ""}`;

function Kpi({ n, rotulo, cor }: { n: number; rotulo: string; cor: string }) {
  return (
    <div className="concave-3d px-3 py-2">
      <div className="text-[22px] font-bold leading-none" style={{ color: cor }}>{n}</div>
      <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: MUDO }}>{rotulo}</div>
    </div>
  );
}

/** Evolucao entre duas anamneses: o que mudou, o que apareceu, o que ficou igual. Compara pela identidade da pergunta. */
export default function Evolucao({ sessoes, baseId, atualId, onBase, onAtual, detalhes }: {
  sessoes: SessaoResumo[]; baseId: number | null; atualId: number | null;
  onBase: (id: number) => void; onAtual: (id: number) => void; detalhes: Map<number, SessaoDetalhe>;
}) {
  const [mostrarIguais, setMostrarIguais] = useState(false);
  const base = baseId != null ? detalhes.get(baseId) : undefined;
  const atual = atualId != null ? detalhes.get(atualId) : undefined;
  const linhas = useMemo(() => (base && atual ? compararSessoes(base.respostas ?? [], atual.respostas ?? []) : []), [base, atual]);
  const achados = useMemo(() => (base && atual ? compararAchados(base.findings, atual.findings) : null), [base, atual]);
  const cont = { mudou: 0, novo: 0, igual: 0, removido: 0 };
  for (const l of linhas) cont[l.situacao] += 1;
  const visiveis = linhas.filter((l) => mostrarIguais || l.situacao !== "igual");

  if (sessoes.length < 2) {
    return <div className="panel-3d-sub p-5 text-[13px]" style={{ color: MUDO }}>A evolução aparece quando houver duas anamneses. Abra uma nova na consulta para começar a comparar.</div>;
  }
  return (
    <div className="space-y-4" data-testid="anamnese-evolucao">
      <div className="panel-3d-sub p-4">
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: MUDO }}>
            Anamnese anterior
            <select className="field-engraved mt-1 w-full px-2 py-2 text-[13px] normal-case" value={baseId ?? ""} onChange={(e) => onBase(Number(e.target.value))}>
              {sessoes.filter((s) => s.id !== atualId).map((s) => <option key={s.id} value={s.id}>{rotuloSessao(s)}</option>)}
            </select>
          </label>
          <ArrowRight className="mb-3 hidden h-5 w-5 sm:block" style={{ color: OURO }} />
          <label className="block text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: MUDO }}>
            Anamnese atual
            <select className="field-engraved mt-1 w-full px-2 py-2 text-[13px] normal-case" value={atualId ?? ""} onChange={(e) => onAtual(Number(e.target.value))}>
              {sessoes.filter((s) => s.id !== baseId).map((s) => <option key={s.id} value={s.id}>{rotuloSessao(s)}</option>)}
            </select>
          </label>
        </div>
      </div>

      {!base || !atual ? <div className="py-4 text-sm" style={{ color: MUDO }}>Carregando a comparação…</div> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi n={cont.mudou} rotulo="Mudaram" cor={OURO} />
            <Kpi n={cont.novo} rotulo="Novas respostas" cor="#16a34a" />
            <Kpi n={cont.removido} rotulo="Sem resposta agora" cor="#d97706" />
            <Kpi n={cont.igual} rotulo="Iguais" cor={MUDO} />
          </div>

          {achados && (
            <div className="panel-3d-sub grid gap-4 p-4 sm:grid-cols-3">
              {([["Achados novos", achados.novos, "#dc2626"], ["Achados mantidos", achados.mantidos, MUDO], ["Achados que saíram", achados.resolvidos, "#16a34a"]] as const).map(([t, lista, cor]) => (
                <div key={t}>
                  <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: cor }}>{t} ({lista.length})</div>
                  {lista.length === 0 ? <div className="text-[12px]" style={{ color: MUDO }}>Nenhum.</div> : (
                    <ul className="space-y-1">{lista.map((f) => <li key={f.id} className="text-[12px]" style={{ color: NAVY }}>{f.rotulo}</li>)}</ul>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="text-[12px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}>
              {mostrarIguais ? "Todas as respostas" : "Só o que mudou"} ({visiveis.length})
            </div>
            <button type="button" onClick={() => setMostrarIguais((v) => !v)} className="btn-3d-soft rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide">
              {mostrarIguais ? "Esconder o que não mudou" : "Mostrar também o que não mudou"}
            </button>
          </div>

          {visiveis.length === 0 ? (
            <div className="panel-3d-sub p-5 text-[13px]" style={{ color: MUDO }}>Nenhuma diferença entre estas duas anamneses.</div>
          ) : agruparPorBloco(visiveis).map(([bloco, itens]) => (
            <div key={bloco} className="panel-3d-sub p-4">
              <div className="mb-2 border-b pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: OURO, borderColor: "#eee5d0" }}>{bloco}</div>
              <div className="divide-y" style={{ borderColor: "#f3eee1" }}>
                {itens.map((l) => (
                  <div key={l.rowId} className="grid items-start gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_64px]" data-situacao={l.situacao}>
                    <div className="text-[12px]" style={{ color: "#4a5d75" }}>{l.pergunta}</div>
                    <div className="space-y-1.5">
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div className="concave-3d px-2 py-1 text-[12px]" style={{ color: l.situacao === "novo" ? MUDO : "#7a8aa0", textDecoration: l.situacao === "mudou" ? "line-through" : undefined }}>{l.antes}</div>
                        <ArrowRight className="h-3.5 w-3.5" style={{ color: OURO }} />
                        <div className="concave-3d px-2 py-1 text-[12px] font-semibold" style={{ color: NAVY }}>{l.depois}</div>
                      </div>
                      {(l.acrescentou.length > 0 || l.retirou.length > 0 || l.delta != null) && (
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {l.acrescentou.map((x) => <span key={`+${x}`} className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-semibold text-white" style={{ background: "#16a34a" }}><Plus className="h-3 w-3" />{x}</span>)}
                          {l.retirou.map((x) => <span key={`-${x}`} className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-semibold text-white" style={{ background: "#d97706" }}><Minus className="h-3 w-3" />{x}</span>)}
                          {l.delta != null && l.delta !== 0 && (
                            <span className="inline-flex items-center gap-1 font-bold" style={{ color: OURO }}>
                              {l.delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                              {l.delta > 0 ? "+" : ""}{l.delta}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="justify-self-start rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white sm:justify-self-end" style={{ background: VOL_COR[l.vol] }}>{VOL_ROTULO[l.vol]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
