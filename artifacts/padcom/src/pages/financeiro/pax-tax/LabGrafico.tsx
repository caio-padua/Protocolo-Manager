import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { BarChart3 } from "lucide-react";
import { rotuloMes } from "../pax-finance-ui";
import { fmt, type Mes } from "./lab-comum";

const LEGENDA = [
  { nome: "Faturamento", cor: "#c9a24e", borda: "#8a6a2c" },
  { nome: "Carga sem planejamento", cor: "#d8574c", borda: "#8c1d14" },
  { nome: "Carga com planejamento", cor: "#2f9a62", borda: "#0f5a30" },
  { nome: "Caixa com planejamento", cor: "#3d62a0", borda: "#16284a" },
];
const abrevia = (cents: number) => { const r = cents / 100; return Math.abs(r) >= 1_000_000 ? `${(r / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : Math.abs(r) >= 1000 ? `${Math.round(r / 1000)} mil` : String(Math.round(r)); };
function DicaGrafico({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number | string; dataKey?: string | number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const itens = LEGENDA.map((l) => ({ l, p: payload.find((x) => x.dataKey === l.nome) })).filter((x) => x.p && x.p.value != null);
  return (
    <div className="bevel-3d min-w-[220px] space-y-1 p-3 text-[12px]">
      <div className="mb-1 border-b pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
      {itens.map(({ l, p }) => (
        <div key={l.nome} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-[2px] border" style={{ background: l.cor, borderColor: l.borda }} />{l.nome}</span>
          <b className="tabular-nums">{fmt(Number(p!.value))}</b>
        </div>))}
    </div>
  );
}


/** Gráfico premium: barras de faturamento, linhas de carga, caixa em pontilhado; legenda em plaquetas com moldura. */
export function GraficoLab({ meses }: { meses: Mes[] }) {
  const dados = meses.map((m) => ({ mes: rotuloMes(m.mes), Faturamento: m.sem.faturamentoCents, "Carga sem planejamento": m.sem.tributosCents + m.sem.retencoesCents, "Carga com planejamento": m.com.tributosCents + m.com.retencoesCents, "Caixa com planejamento": m.com.saldoCaixaCents }));
  return (
    <section className="panel-3d p-4" aria-label="Gráfico do período" data-testid="grafico-lab">
      <div className="bevel-3d mb-4 inline-flex items-center gap-2 px-3 py-1.5"><BarChart3 className="h-4 w-4 shrink-0 text-primary" /><span className="text-[12px] font-semibold uppercase tracking-[0.12em]">Faturamento, carga tributária e caixa</span></div>
        <div className="h-80 w-full">
          <ResponsiveContainer>
            <ComposedChart data={dados} margin={{ top: 12, right: 16, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="gFat" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e8c97e" /><stop offset="55%" stopColor="#c9a24e" /><stop offset="100%" stopColor="#9a762b" /></linearGradient>
                <linearGradient id="gCaixa" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22406b" stopOpacity={0.22} /><stop offset="100%" stopColor="#22406b" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#b8924d" strokeOpacity={0.28} strokeDasharray="1 5" strokeLinecap="round" strokeWidth={1.5} />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#4b5568" }} tickLine={false} axisLine={{ stroke: "#b8924d", strokeOpacity: 0.5 }} minTickGap={8} />
              <YAxis tick={{ fontSize: 10, fill: "#4b5568" }} tickLine={false} axisLine={false} width={52} tickFormatter={(v) => abrevia(Number(v))} />
              <RTooltip content={<DicaGrafico />} cursor={{ fill: "#c9a24e", fillOpacity: 0.10 }} />
              <Bar dataKey="Faturamento" fill="url(#gFat)" stroke="#8a6a2c" strokeWidth={0.8} radius={[4, 4, 0, 0]} maxBarSize={34} />
              <Area dataKey="Caixa com planejamento" fill="url(#gCaixa)" stroke="none" legendType="none" tooltipType="none" isAnimationActive={false} />
              <Line dataKey="Carga sem planejamento" stroke="#b42318" strokeWidth={2.5} strokeLinecap="round" dot={{ r: 2.5, fill: "#fff", stroke: "#b42318", strokeWidth: 1.5 }} activeDot={{ r: 5 }} />
              <Line dataKey="Carga com planejamento" stroke="#17703e" strokeWidth={2.5} strokeLinecap="round" dot={{ r: 2.5, fill: "#fff", stroke: "#17703e", strokeWidth: 1.5 }} activeDot={{ r: 5 }} />
              <Line dataKey="Caixa com planejamento" stroke="#22406b" strokeWidth={2.75} strokeLinecap="round" strokeDasharray="1 7" dot={false} activeDot={{ r: 5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex flex-wrap items-stretch justify-center gap-2" data-testid="legenda-grafico" role="list" aria-label="Legenda do gráfico">
          {LEGENDA.map((l) => (
            <div key={l.nome} role="listitem" className="bevel-3d flex items-center gap-2 px-3 py-2 text-[12px] font-bold">
              <span aria-hidden="true" className="inline-block h-4 w-4 rounded-[3px] border-2" style={{ background: l.cor, borderColor: l.borda, boxShadow: "inset 0 1px 0 rgba(255,255,255,0.55)" }} />
              <span>{l.nome}</span>
            </div>))}
        </div>
    </section>
  );
}
