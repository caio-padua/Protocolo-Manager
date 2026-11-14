import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AVALIACOES, calculaDerivados } from "@workspace/avaliacoes-corporais";
import type { TipoAvaliacao } from "@workspace/avaliacoes-corporais";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Trash2 } from "lucide-react";
import { dataBr, numeroBr, useRemoverMedicao } from "./api";
import type { Medicao } from "./api";

type Metrica = { key: string; label: string; unit: string; casas: number; grupo: string; derivada: boolean };
type Ponto = { id: number; data: string; rotulo: string; valor: number };

const OURO = "#b8924d";

export function EvolucaoMedicoes({ clientId, tipo, medicoes, maximizado }: {
  clientId: number; tipo: TipoAvaliacao; medicoes: Medicao[]; maximizado: boolean;
}) {
  const def = AVALIACOES[tipo];
  const remover = useRemoverMedicao(clientId);
  const [escolhida, setEscolhida] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const metricas: Metrica[] = useMemo(() => [
    ...def.campos.filter((c) => c.kind === "number").map((c) => {
      const x = c as Extract<typeof c, { kind: "number" }>;
      return { key: x.key, label: x.label, unit: x.unit, casas: x.casas, grupo: x.grupo, derivada: false };
    }),
    ...def.derivados.map((d) => ({ key: d.key, label: d.label, unit: d.unit, casas: d.casas, grupo: d.grupo, derivada: true })),
  ], [def]);

  const valoresPorMedicao = useMemo(() => medicoes.map((m) => {
    const v: Record<string, number> = {};
    for (const [k, x] of Object.entries(m.valores)) if (typeof x === "number") v[k] = x;
    return { m, v: { ...v, ...calculaDerivados(tipo, m.valores) } };
  }), [medicoes, tipo]);

  const series = useMemo(() => {
    const s = new Map<string, Ponto[]>();
    for (const mt of metricas) {
      const pts: Ponto[] = [];
      for (const { m, v } of valoresPorMedicao) {
        if (v[mt.key] !== undefined) pts.push({ id: m.id, data: m.data, rotulo: dataBr(m.data), valor: v[mt.key] });
      }
      if (pts.length) s.set(mt.key, pts);
    }
    return s;
  }, [metricas, valoresPorMedicao]);

  const comDados = metricas.filter((m) => series.has(m.key));
  const ativa = comDados.find((m) => m.key === escolhida) ?? comDados[0] ?? null;
  const pontos = ativa ? series.get(ativa.key)! : [];
  const grupos = useMemo(() => {
    const g = new Map<string, Metrica[]>();
    for (const m of comDados) g.set(m.grupo, [...(g.get(m.grupo) ?? []), m]);
    return [...g.entries()];
  }, [comDados]);

  const fmt = (m: Metrica, v: number) => numeroBr(v, m.casas);

  function variacao(pts: Ponto[]) {
    if (pts.length < 2) return null;
    const a = pts[pts.length - 2].valor, b = pts[pts.length - 1].valor;
    return { abs: b - a, pct: a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null };
  }
  const Seta = ({ d }: { d: number }) =>
    d > 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-label="subiu" /> : d < 0 ? <ArrowDownRight className="h-3.5 w-3.5" aria-label="desceu" /> : <ArrowRight className="h-3.5 w-3.5" aria-label="igual" />;

  async function confirmaRemocao(id: number) {
    setErro(null);
    try { await remover.mutateAsync(id); setConfirmar(null); }
    catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível remover."); }
  }

  if (!ativa) {
    return (
      <div className="concave-3d p-6 text-center text-sm text-muted-foreground">
        Nenhum valor numérico registrado ainda. Use <strong>NOVA MEDIÇÃO</strong> para começar.
      </div>
    );
  }

  const v = variacao(pontos);
  const valores = pontos.map((p) => p.valor);
  const primeiro = pontos[0], ultimo = pontos[pontos.length - 1];
  const totalAbs = ultimo.valor - primeiro.valor;

  return (
    <div className="space-y-5">
      {/* Gráfico principal */}
      <section className="panel-3d-sub p-4" aria-label={`Evolução de ${ativa.label}`}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">{ativa.grupo}</p>
            <h3 className="text-lg font-black leading-tight text-foreground">{ativa.label}</h3>
          </div>
          <p className="text-3xl font-black text-foreground">
            {fmt(ativa, ultimo.valor)}<span className="ml-1 text-xs font-bold text-muted-foreground">{ativa.unit}</span>
          </p>
        </div>
        <div className={maximizado ? "h-[46vh] min-h-[260px]" : "h-56"}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pontos} margin={{ top: 10, right: 18, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.12} />
              <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: "currentColor" }} tickLine={false} axisLine={{ strokeOpacity: 0.2 }} />
              <YAxis domain={["auto", "auto"]} width={52} tick={{ fontSize: 11, fill: "currentColor" }} tickLine={false} axisLine={false}
                tickFormatter={(x: number) => numeroBr(x, ativa.casas)} />
              <Tooltip formatter={(x: number) => [`${fmt(ativa, x)} ${ativa.unit}`.trim(), ativa.label]}
                contentStyle={{ borderRadius: 6, border: `1px solid ${OURO}`, fontSize: 12 }} />
              <Line type="monotone" dataKey="valor" stroke={OURO} strokeWidth={2.5}
                dot={{ r: 4, fill: OURO, stroke: "#fff", strokeWidth: 1.5 }} activeDot={{ r: 6 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {pontos.length < 2 && (
          <p className="mt-2 text-xs text-muted-foreground">Há uma única medição deste item. A linha aparece a partir da segunda.</p>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            ["Primeira", `${fmt(ativa, primeiro.valor)} ${ativa.unit}`, primeiro.rotulo],
            ["Última", `${fmt(ativa, ultimo.valor)} ${ativa.unit}`, ultimo.rotulo],
            ["Variação total", pontos.length > 1 ? `${totalAbs > 0 ? "+" : ""}${fmt(ativa, totalAbs)} ${ativa.unit}` : "—", pontos.length > 1 ? `${pontos.length} medições` : ""],
            ["Menor", `${fmt(ativa, Math.min(...valores))} ${ativa.unit}`, ""],
            ["Maior", `${fmt(ativa, Math.max(...valores))} ${ativa.unit}`, ""],
          ].map(([t, val, sub]) => (
            <div key={t} className="concave-3d px-3 py-2">
              <dt className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">{t}</dt>
              <dd className="text-sm font-black text-foreground">{val}</dd>
              {sub && <dd className="text-[10px] text-muted-foreground">{sub}</dd>}
            </div>
          ))}
        </dl>
        {v && (
          <p className="mt-2 text-xs text-muted-foreground">
            Desde a medição anterior: {v.abs > 0 ? "+" : ""}{fmt(ativa, v.abs)} {ativa.unit}
            {v.pct !== null ? ` (${v.pct > 0 ? "+" : ""}${numeroBr(v.pct, 1)}%)` : ""}.
          </p>
        )}
      </section>

      {/* Cartões de todos os itens */}
      {grupos.map(([grupo, itens]) => (
        <section key={grupo} aria-label={grupo}>
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">{grupo}</p>
          <div className={`grid gap-2 ${maximizado ? "grid-cols-2 md:grid-cols-4 xl:grid-cols-6" : "grid-cols-2 md:grid-cols-3"}`}>
            {itens.map((m) => {
              const pts = series.get(m.key)!;
              const vr = variacao(pts);
              const sel = m.key === ativa.key;
              return (
                <button key={m.key} type="button" onClick={() => setEscolhida(m.key)} aria-pressed={sel}
                  className={`${sel ? "bevel-3d ring-1 ring-[#b8924d]" : "btn-3d-soft"} flex min-w-0 flex-col gap-1 px-3 py-2 text-left`}>
                  <span className="truncate text-[10px] font-bold text-muted-foreground" title={m.label}>{m.label}</span>
                  <span className="text-base font-black text-foreground">
                    {fmt(m, pts[pts.length - 1].valor)}<span className="ml-1 text-[10px] font-bold text-muted-foreground">{m.unit}</span>
                  </span>
                  <span className="h-8">
                    {pts.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={pts}><Line type="monotone" dataKey="valor" stroke={OURO} strokeWidth={1.8} dot={false} isAnimationActive={false} /></LineChart>
                      </ResponsiveContainer>
                    ) : <span className="text-[10px] text-muted-foreground">1 medição</span>}
                  </span>
                  {vr && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                      <Seta d={vr.abs} /> {vr.abs > 0 ? "+" : ""}{fmt(m, vr.abs)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}

      {/* Tabela comparativa */}
      <section className="panel-3d-sub p-3" aria-label="Todas as medições">
        <p className="mb-2 text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Todas as medições</p>
        {erro && <p role="alert" className="mb-2 text-sm font-semibold text-red-700 dark:text-red-300">{erro}</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Item</th>
                {valoresPorMedicao.map(({ m }) => (
                  <th key={m.id} className="px-2 py-1.5 text-right font-black text-foreground">
                    <div>{dataBr(m.data)}</div>
                    {confirmar === m.id ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold">
                        <button type="button" className="text-red-700 underline dark:text-red-300" disabled={remover.isPending}
                          onClick={() => void confirmaRemocao(m.id)}>Remover</button>
                        <button type="button" className="underline" onClick={() => setConfirmar(null)}>Manter</button>
                      </span>
                    ) : (
                      <button type="button" aria-label={`Remover medição de ${dataBr(m.data)}`} title="Remover esta medição"
                        className="text-muted-foreground/60 hover:text-red-700" onClick={() => setConfirmar(m.id)}>
                        <Trash2 className="inline h-3 w-3" />
                      </button>
                    )}
                  </th>
                ))}
                <th className="px-2 py-1.5 text-right text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">Primeira → última</th>
              </tr>
            </thead>
            <tbody>
              {comDados.map((mt) => {
                const pts = series.get(mt.key)!;
                const tot = pts.length > 1 ? pts[pts.length - 1].valor - pts[0].valor : null;
                return (
                  <tr key={mt.key} className="border-t border-border/50">
                    <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left font-bold text-foreground">
                      {mt.label}{mt.unit && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{mt.unit}</span>}
                    </th>
                    {valoresPorMedicao.map(({ m, v: vv }) => (
                      <td key={m.id} className="px-2 py-1.5 text-right tabular-nums">{vv[mt.key] === undefined ? "—" : fmt(mt, vv[mt.key])}</td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-bold tabular-nums">{tot === null ? "—" : `${tot > 0 ? "+" : ""}${fmt(mt, tot)}`}</td>
                  </tr>
                );
              })}
              {valoresPorMedicao.some(({ m }) => m.observacoes) && (
                <tr className="border-t border-border/50 align-top">
                  <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-1.5 text-left font-bold text-foreground">Observações</th>
                  {valoresPorMedicao.map(({ m }) => (
                    <td key={m.id} className="max-w-[220px] px-2 py-1.5 text-right text-[11px] text-muted-foreground">{m.observacoes ?? "—"}</td>
                  ))}
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
