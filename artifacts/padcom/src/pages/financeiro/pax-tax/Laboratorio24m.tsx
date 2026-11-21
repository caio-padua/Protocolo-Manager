import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FlaskConical } from "lucide-react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { finApi } from "@/lib/pax-finance-api";
import { Ajuda, Campo, Indicador, btnCls, btnSoftCls, campoCls, reaisParaCentavos, rotuloMes, mascaraReais } from "../pax-finance-ui";

type Linha = { chave: string; rotulo: string; valorCents: number };
type Cen = {
  faturamentoCents: number; recebimentoCents: number; folhaCltCents: number; fgtsCents: number; proLaboreCents: number; prestadoresCents: number; despesasCents: number;
  anexo: "III" | "V"; fatorRPct: number; rbt12Cents: number; rbt12Estimado: boolean; aliquotaEfetivaPct: number | null;
  tributos: Linha[]; tributosCents: number; retencoesSocio: Linha[]; retencoesCents: number; resultadoOperacionalCents: number; saldoCaixaCents: number | null; notaLucro: string; pendencias: string[];
};
type Mes = { ativo: Cen; mes: string; fase: { fase: string; rotulo: string }; sem: Cen; com: Cen };
type Prem = {
  inicio: string; faturamentoBaseCents: number; crescimentoMensalPct: number; tetoFaturamentoCents: number | null; folhaCltCents: number; proLaboreMinimoCents: number;
  prestadoresPct: number; rpaContaFatorR: boolean; fatorRAutomatico: boolean; despesasFixasCents: number; despesasVariaveisPct: number; issPct: number; recebimentoNoMesPct: number; caixaInicialCents: number; metaMensalCents: number | null;
};
type Ov = Record<string, { faturamentoCents?: number; folhaCltCents?: number; proLaboreCents?: number; despesasCents?: number }>;
type Lab = {
  selo: string; origemPremissas: string; salvo: boolean; premissas: Prem; overrides: Ov; meses: Mes[]; avisos: string[];
  totais: { sem_planejamento: Tot; com_planejamento: Tot; economiaCargaCents: number };
};
type Tot = { faturamentoCents: number; recebimentoCents: number; tributosCents: number; retencoesCents: number; resultadoOperacionalCents: number; saldoFinalCaixaCents: number | null };

const fmt = (c: number | null) => (c === null ? "—" : (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);

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

function Reais({ rotulo, ajuda, valor, onChange }: { rotulo: string; ajuda: string; valor: number | null; onChange: (c: number | null) => void }) {
  const [t, setT] = useState(valor === null ? "" : brl(valor));
  useEffect(() => { setT(valor === null ? "" : brl(valor)); }, [valor]);
  return <Campo rotulo={rotulo} ajuda={ajuda}><input className={campoCls} inputMode="decimal" value={t} onChange={(e) => setT(mascaraReais(e.target.value))} onBlur={() => onChange(reaisParaCentavos(t))} /></Campo>;
}
function CelulaFat({ valor, manual, onSalva, mes }: { valor: number; manual: boolean; onSalva: (c: number | null) => void; mes: string }) {
  const [t, setT] = useState(brl(valor));
  useEffect(() => { setT(brl(valor)); }, [valor]);
  return <input className={`${campoCls} max-w-[130px] text-right ${manual ? "font-bold" : ""}`} inputMode="decimal" value={t} aria-label={`Faturamento de ${mes}`} data-testid={`lab-fat-${mes}`}
    onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    onChange={(e) => setT(mascaraReais(e.target.value))}
    onBlur={() => { const c = reaisParaCentavos(t); if (c !== null && c !== valor) onSalva(c); else setT(brl(valor)); }} />;
}
function Num({ rotulo, ajuda, valor, onChange }: { rotulo: string; ajuda: string; valor: number; onChange: (n: number) => void }) {
  return <Campo rotulo={rotulo} ajuda={ajuda}><input className={campoCls} type="number" step="0.5" value={valor} onChange={(e) => onChange(Number(e.target.value))} /></Campo>;
}

function RaioX({ m, ov, onEdit }: { m: Mes; ov: Ov[string] | undefined; onEdit: (o: Ov[string]) => void }) {
  const [e, setE] = useState<Ov[string]>(ov ?? {});
  useEffect(() => setE(ov ?? {}), [m.mes, ov]);
  const linhas = (c: Cen): [string, string, number | string, boolean?][] => [
    ["Faturamento simulado (receita por competência)", "Valor emitido no mês, independente de já ter sido recebido.", c.faturamentoCents],
    ["Recebimentos simulados", "O que entra no caixa no mês: parte do faturamento do mês e o restante do mês anterior.", c.recebimentoCents],
    ["Folha de empregados (CLT)", "Salários dos empregados com carteira assinada.", c.folhaCltCents],
    ["FGTS (8%)", "Depósito sobre a folha dos empregados.", c.fgtsCents],
    ["Pró-labore", "Remuneração do sócio administrador.", c.proLaboreCents],
    ["Prestadores (RPA)", "Pagamento a profissionais autônomos, como percentual do faturamento.", c.prestadoresCents],
    ["Despesas", "Despesas fixas mais variáveis estimadas.", c.despesasCents],
    ...c.tributos.map((t): [string, string, number] => [`Tributo: ${t.rotulo}`, "Parte do imposto calculada pelo motor tributário, por faixa.", t.valorCents]),
    ["Total de tributos da empresa", "Soma dos tributos discriminados acima.", c.tributosCents, true],
    ...c.retencoesSocio.map((t): [string, string, number] => [`Retenção do sócio: ${t.rotulo}`, "Descontada do pró-labore; não é despesa da empresa.", t.valorCents]),
    ["Resultado operacional estimado", "Receita menos tributos, folha, pró-labore, prestadores e despesas. Não é lucro contábil.", c.resultadoOperacionalCents, true],
    ["Saldo estimado de caixa", "Caixa inicial mais entradas menos saídas, acumulado. O imposto de um mês é pago no mês seguinte.", c.saldoCaixaCents === null ? "—" : c.saldoCaixaCents, true],
  ];
  return (
    <section className="panel-3d-sub space-y-3 p-3" data-testid="raio-x-mes" aria-label={`Raio-X de ${rotuloMes(m.mes)}`}>
      <BlockTitle icon={FlaskConical}>Raio-X do mês: {rotuloMes(m.mes)}</BlockTitle>
      <p className="bevel-3d inline-block rounded px-2 py-1 text-[11px] font-bold">{m.fase.rotulo}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="p-1">Item</th><th className="p-1 text-right">Sem planejamento</th><th className="p-1 text-right">Com planejamento</th></tr></thead>
          <tbody>
            <tr className="border-t"><td className="p-1">Anexo do Simples (Fator R)</td><td className="p-1 text-right">Anexo {m.sem.anexo} · Fator R {pct(m.sem.fatorRPct)}</td><td className="p-1 text-right">Anexo {m.com.anexo} · Fator R {pct(m.com.fatorRPct)}</td></tr>
            <tr className="border-t"><td className="p-1">Receita dos 12 meses (RBT12)</td><td className="p-1 text-right">{fmt(m.sem.rbt12Cents)}{m.sem.rbt12Estimado ? " (estimada)" : ""}</td><td className="p-1 text-right">{fmt(m.com.rbt12Cents)}</td></tr>
            <tr className="border-t"><td className="p-1">Alíquota total sobre o faturamento</td><td className="p-1 text-right">{pct(m.sem.aliquotaEfetivaPct)}</td><td className="p-1 text-right">{pct(m.com.aliquotaEfetivaPct)}</td></tr>
            {(() => {
              const a = linhas(m.sem), b = linhas(m.com);
              const chaves = Array.from(new Set([...a.map((x) => x[0]), ...b.map((x) => x[0])]));
              return chaves.map((k) => {
                const x = a.find((l) => l[0] === k), y = b.find((l) => l[0] === k);
                const ref = (x ?? y)!;
                const cel = (l?: (typeof a)[number]) => (l ? (typeof l[2] === "number" ? fmt(l[2]) : l[2]) : "—");
                return (
                  <tr key={k} className={`border-t ${ref[3] ? "font-bold" : ""}`} title={ref[1]}>
                    <td className="p-1">{k}</td><td className="p-1 text-right tabular-nums">{cel(x)}</td><td className="p-1 text-right tabular-nums">{cel(y)}</td>
                  </tr>
                );
              });
            })()}
            <tr className="border-t"><td className="p-1" title="Só existe com contabilidade completa.">Lucro contábil / lucro distribuível</td><td className="p-1 text-right italic" colSpan={2}>Não calculado: exige contabilidade completa</td></tr>
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">{m.com.notaLucro} Caixa menor com planejamento: parte do dinheiro virou pró-labore do sócio, que é saída da empresa.</p>
      {m.sem.pendencias.length > 0 && <ul className="list-disc pl-5 text-[11px] text-muted-foreground">{Array.from(new Set(m.sem.pendencias)).map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Reais rotulo="Editar faturamento" ajuda="Troca só o faturamento deste mês. Os outros meses continuam seguindo a curva." valor={e.faturamentoCents ?? m.sem.faturamentoCents} onChange={(c) => setE({ ...e, faturamentoCents: c ?? undefined })} />
        <Reais rotulo="Editar folha CLT" ajuda="Troca a folha de empregados só neste mês." valor={e.folhaCltCents ?? m.sem.folhaCltCents} onChange={(c) => setE({ ...e, folhaCltCents: c ?? undefined })} />
        <Reais rotulo="Editar pró-labore mínimo" ajuda="Piso do pró-labore neste mês. O planejamento pode elevar acima disso." valor={e.proLaboreCents ?? m.sem.proLaboreCents} onChange={(c) => setE({ ...e, proLaboreCents: c ?? undefined })} />
        <Reais rotulo="Editar despesas" ajuda="Troca as despesas totais deste mês." valor={e.despesasCents ?? m.sem.despesasCents} onChange={(c) => setE({ ...e, despesasCents: c ?? undefined })} />
      </div>
      <button type="button" className={btnCls} onClick={() => onEdit(e)}>Aplicar ao mês e salvar</button>
    </section>
  );
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const diasNoMes = (ym: string) => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
const dataIni = (ym: string) => `01 / ${ym.slice(5, 7)} / ${ym.slice(0, 4)}`;
const dataFim = (ym: string) => `${pad2(diasNoMes(ym))} / ${ym.slice(5, 7)} / ${ym.slice(0, 4)}`;
/** Digita só números: 14112025 vira 14 / 11 / 2025. */
const mascaraData = (t: string) => { const d = t.replace(/\D/g, "").slice(0, 8); return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter((x) => x).join(" / "); };
/** "14.11.2025" -> "2025-11" (null se a data não existe). */
const mesDaData = (t: string): string | null => {
  const m = /^(\d{2}) \/ (\d{2}) \/ (\d{4})$/.exec(t); if (!m) return null;
  const dia = Number(m[1]), mes = Number(m[2]), ano = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > new Date(ano, mes, 0).getDate()) return null;
  return `${ano}-${pad2(mes)}`;
};
function CampoData({ rotulo, valor, onValida, id }: { rotulo: string; valor: string; onValida: (ym: string) => void; id: string }) {
  const [t, setT] = useState(valor);
  const [ruim, setRuim] = useState(false);
  useEffect(() => { setT(valor); setRuim(false); }, [valor]);
  const aplicar = () => { const ym = mesDaData(t); if (ym) { setRuim(false); onValida(ym); } else { setRuim(true); } };
  return (
    <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{rotulo}
      <input className={`${campoCls} mt-1 text-center text-[14px] font-bold tabular-nums ${ruim ? "border-destructive" : ""}`} inputMode="numeric" placeholder="dd / mm / aaaa" maxLength={14} value={t} data-testid={id}
        aria-invalid={ruim} onChange={(e) => setT(mascaraData(e.target.value))} onBlur={() => { if (t !== valor) aplicar(); }} onKeyDown={(e) => { if (e.key === "Enter") aplicar(); }} />
      {ruim && <span className="mt-1 block text-[10px] normal-case text-destructive" role="alert">Data inválida. Exemplo: 14 / 11 / 2025</span>}
    </label>
  );
}

/** Faixa de meses com duas alças: arraste e solte (ou aperte Enter) para aplicar o corte. Não apaga nenhum dado. */
function FaixaMeses({ titulo, ajuda, rotulos, meses, valor, onAplicar, id }: { titulo: string; ajuda: string; rotulos: string[]; meses: string[]; valor: [number, number]; onAplicar: (v: [number, number]) => void; id: string }) {
  const [r, setR] = useState<[number, number]>(valor);
  useEffect(() => setR(valor), [valor[0], valor[1]]);
  const max = rotulos.length - 1;
  const mudou = r[0] !== valor[0] || r[1] !== valor[1];
  const cls = "paxter-range pointer-events-none absolute inset-x-0 top-0 h-8 w-full";
  const tecla = (e: React.KeyboardEvent) => { if (e.key === "Enter") onAplicar(r); };
  return (
    <div className="panel-3d-sub space-y-2 p-3" data-testid={id}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{titulo}<Ajuda texto={ajuda} rotulo={titulo} /></span>
        <b data-testid={`${id}-texto`}>{dataIni(meses[r[0]])} até {dataFim(meses[r[1]])} ({r[1] - r[0] + 1} meses)</b>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CampoData id={`${id}-de`} rotulo="Data inicial" valor={dataIni(meses[r[0]])} onValida={(ym) => { const i = Math.min(Math.max(meses.indexOf(ym) < 0 ? (ym < meses[0] ? 0 : max) : meses.indexOf(ym), 0), r[1]); const n: [number, number] = [i, r[1]]; setR(n); onAplicar(n); }} />
        <CampoData id={`${id}-ate`} rotulo="Data final" valor={dataFim(meses[r[1]])} onValida={(ym) => { const i = Math.max(Math.min(meses.indexOf(ym) < 0 ? (ym < meses[0] ? 0 : max) : meses.indexOf(ym), max), r[0]); const n: [number, number] = [r[0], i]; setR(n); onAplicar(n); }} />
      </div>
      <div className="relative mx-3 h-8">
        <div className="concave-3d absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-[3px]" />
        <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded-[3px] border border-[#8a6a2c] bg-gradient-to-b from-[#e3c477] via-[#c9a24e] to-[#a37e32] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]" style={{ left: `${(r[0] / max) * 100}%`, right: `${100 - (r[1] / max) * 100}%` }} />
        <input type="range" className={cls} min={0} max={max} value={r[0]} aria-label={`${titulo}: mês inicial`} onKeyDown={tecla} onPointerUp={() => onAplicar(r)} onChange={(e) => setR([Math.min(Number(e.target.value), r[1]), r[1]])} />
        <input type="range" className={cls} min={0} max={max} value={r[1]} aria-label={`${titulo}: mês final`} onKeyDown={tecla} onPointerUp={() => onAplicar(r)} onChange={(e) => setR([r[0], Math.max(Number(e.target.value), r[0])])} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground"><span>{dataIni(meses[0])}</span><span>{mudou ? "Solte ou aperte Enter para aplicar" : "Arraste as alças para mudar o corte"}</span><span>{dataFim(meses[max])}</span></div>
    </div>
  );
}

export function Laboratorio24m() {
  const qc = useQueryClient();
  const [erro, setErro] = useState("");
  const [p, setP] = useState<Prem | null>(null);
  const [ov, setOv] = useState<Ov>({});
  const [sel, setSel] = useState<string | null>(null);
  const [gr, setGr] = useState<[number, number]>([0, 23]);
  const [tr, setTr] = useState<[number, number]>([0, 23]);
  const q = useQuery({ queryKey: ["fin", "lab"], queryFn: () => finApi<Lab>("/lab") });
  useEffect(() => { if (q.data) { setP(q.data.premissas); setOv(q.data.overrides); } }, [q.data]);
  const salvar = useMutation({
    mutationFn: (b: { premissas: Prem; overrides: Ov }) => finApi<Lab>("/lab", { method: "PUT", body: b }),
    onSuccess: () => { setErro(""); void qc.invalidateQueries({ queryKey: ["fin", "lab"] }); },
    onError: (e: Error) => setErro(e.message),
  });
  const limpar = useMutation({
    mutationFn: () => finApi("/lab", { method: "DELETE" }),
    onSuccess: () => { setErro(""); setSel(null); void qc.invalidateQueries({ queryKey: ["fin", "lab"] }); },
    onError: (e: Error) => setErro(e.message),
  });
  const d = q.data;
  if (q.isLoading || !d || !p) return <p role="status" className="text-[12px]">Carregando o laboratório…</p>;
  const set = <K extends keyof Prem>(k: K, v: Prem[K]) => setP({ ...p, [k]: v });
  const mes = d.meses.find((m) => m.mes === sel) ?? null;
  const noGrafico = d.meses.slice(gr[0], gr[1] + 1);
  const dados = noGrafico.map((m) => ({ mes: rotuloMes(m.mes), Faturamento: m.sem.faturamentoCents, "Carga sem planejamento": m.sem.tributosCents + m.sem.retencoesCents, "Carga com planejamento": m.com.tributosCents + m.com.retencoesCents, "Caixa com planejamento": m.com.saldoCaixaCents }));
  const somar = (k: "sem" | "com", f: (x: Cen) => number) => noGrafico.reduce((a, m) => a + f(m[k]), 0);
  const cargaSem = somar("sem", (x) => x.tributosCents + x.retencoesCents), cargaCom = somar("com", (x) => x.tributosCents + x.retencoesCents);
  const T = { fat: somar("sem", (x) => x.faturamentoCents), cargaSem, cargaCom, dif: cargaSem - cargaCom };
  const rot = d.meses.map((m) => rotuloMes(m.mes));
  return (
    <div className="space-y-4" data-testid="laboratorio-24m">
      <div role="note" className="bevel-3d paxter-alert flex items-start gap-2 rounded p-3 text-[12px] font-bold" data-testid="selo-simulacao">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{d.selo}
      </div>
      {erro && <p role="alert" className="text-[12px] font-bold text-destructive">{erro}</p>}

      <section className="panel-3d-sub space-y-3 p-3">
        <BlockTitle icon={FlaskConical}>Automação da simulação</BlockTitle>
        <label className="flex min-h-[44px] items-center gap-3 text-[13px]" data-testid="toggle-fator-r">
          <input type="checkbox" className="h-5 w-5" checked={p.fatorRAutomatico} onChange={(e) => { const n = { ...p, fatorRAutomatico: e.target.checked }; setP(n); salvar.mutate({ premissas: n, overrides: ov }); }} />
          <span><b>Fator R automático:</b> o sistema calcula o pró-labore de cada mês para a folha chegar a 28% do faturamento (Anexo III). Desligado: vale o pró-labore mínimo.</span>
        </label>
        <p className="text-[12px] text-muted-foreground" data-testid="origem-premissas">Premissas preenchidas a partir de: {d.origemPremissas}. Nada precisa ser digitado; ajuste só se quiser testar outro cenário.</p>
        <details><summary className="min-h-[44px] cursor-pointer py-2 text-[12px] font-bold uppercase">Ajustar premissas manualmente</summary>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Campo rotulo="Primeiro mês da janela" ajuda="A janela mostra 24 meses seguidos a partir deste mês. Meses antes de 13/08/2026 são de uma clínica-modelo, não da PADUMANN.">
            <input className={campoCls} type="month" value={p.inicio} onChange={(e) => e.target.value && set("inicio", e.target.value)} />
          </Campo>
          <Reais rotulo="Faturamento do mês 0" ajuda="Ponto de partida da curva. Valor de demonstração, não é faturamento real." valor={p.faturamentoBaseCents} onChange={(c) => set("faturamentoBaseCents", c ?? 0)} />
          <Num rotulo="Crescimento mensal (%)" ajuda="Quanto o faturamento cresce a cada mês, em percentual composto." valor={p.crescimentoMensalPct} onChange={(n) => set("crescimentoMensalPct", n)} />
          <Reais rotulo="Teto de faturamento mensal" ajuda="A curva para de crescer neste valor. Deixe vazio para não limitar." valor={p.tetoFaturamentoCents} onChange={(c) => set("tetoFaturamentoCents", c)} />
          <Reais rotulo="Folha CLT mensal" ajuda="Salários de empregados com carteira. Entra no Fator R junto com FGTS e pró-labore." valor={p.folhaCltCents} onChange={(c) => set("folhaCltCents", c ?? 0)} />
          <Reais rotulo="Pró-labore mínimo" ajuda="Piso do pró-labore. Começa no salário mínimo; o planejamento pode elevar para buscar o Fator R de 28%." valor={p.proLaboreMinimoCents} onChange={(c) => set("proLaboreMinimoCents", c ?? 0)} />
          <Num rotulo="Prestadores (% do faturamento)" ajuda="Pagamento a médicos autônomos. Não entra no Fator R sem a caixa abaixo marcada." valor={p.prestadoresPct} onChange={(n) => set("prestadoresPct", n)} />
          <Campo rotulo="RPA conta no Fator R?" ajuda="Regra a validar com o contador: nem todo pagamento a autônomo entra na folha elegível. Desmarcado = não conta.">
            <label className="flex min-h-[44px] items-center gap-2 text-[12px] md:min-h-[36px]"><input type="checkbox" checked={p.rpaContaFatorR} onChange={(e) => set("rpaContaFatorR", e.target.checked)} />Contar</label>
          </Campo>
          <Reais rotulo="Despesas fixas" ajuda="Aluguel, sistemas, contabilidade e outros custos fixos do mês." valor={p.despesasFixasCents} onChange={(c) => set("despesasFixasCents", c ?? 0)} />
          <Num rotulo="Despesas variáveis (%)" ajuda="Custos que variam com o faturamento, como insumos." valor={p.despesasVariaveisPct} onChange={(n) => set("despesasVariaveisPct", n)} />
          <Num rotulo="ISS do município (%)" ajuda="Entre 2% e 5%. Confirme a alíquota do município da clínica." valor={p.issPct} onChange={(n) => set("issPct", n)} />
          <Num rotulo="Recebido no próprio mês (%)" ajuda="O restante é recebido no mês seguinte (cartão, convênio, parcelamento)." valor={p.recebimentoNoMesPct} onChange={(n) => set("recebimentoNoMesPct", n)} />
          <Reais rotulo="Caixa inicial" ajuda="Saldo de partida do caixa simulado no primeiro mês da janela." valor={p.caixaInicialCents} onChange={(c) => set("caixaInicialCents", c ?? 0)} />
          <Reais rotulo="Meta mensal de faturamento" ajuda="Opcional. Compara a curva com a meta para mostrar quantos meses ela é atingida." valor={p.metaMensalCents} onChange={(c) => set("metaMensalCents", c)} />
        </div>
        </details>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnCls} disabled={salvar.isPending} onClick={() => salvar.mutate({ premissas: p, overrides: ov })}>{salvar.isPending ? "Salvando…" : "Salvar e recalcular"}</button>
          <button type="button" className={btnSoftCls} disabled={limpar.isPending || !d.salvo} onClick={() => limpar.mutate()}>Voltar ao automático</button>
        </div>
        <p className="text-[11px] text-muted-foreground">{d.salvo ? "Simulação salva para esta empresa." : "Ainda não salva: estes são valores padrão de demonstração."} Limpar apaga só esta simulação; notas, cobranças e lançamentos reais não são tocados.</p>
      </section>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <FaixaMeses id="faixa-grafico" titulo="Período do gráfico e dos totais" ajuda="Escolha de que mês até que mês o gráfico e os quatro totais abaixo calculam. Os dados de todos os 24 meses continuam guardados." rotulos={rot} meses={d.meses.map((m) => m.mes)} valor={gr} onAplicar={setGr} />
        <FaixaMeses id="faixa-digitacao" titulo="Período para digitar na tabela" ajuda="A tabela mês a mês mostra só os meses deste período, para você digitar o faturamento sem rolar. Os outros meses continuam guardados e calculados." rotulos={rot} meses={d.meses.map((m) => m.mes)} valor={tr} onAplicar={setTr} />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Indicador rotulo="Faturamento no período" ajuda="Soma simulada da receita por competência no período escolhido no gráfico." centavos={T.fat} />
        <Indicador rotulo="Carga sem planejamento" ajuda="Tributos da empresa mais retenções do sócio, mantendo o pró-labore mínimo." centavos={T.cargaSem} />
        <Indicador rotulo="Carga com planejamento" ajuda="Mesma soma, elevando o pró-labore para buscar Fator R de 28% e o Anexo III." centavos={T.cargaCom} />
        <Indicador rotulo="Diferença" ajuda="Carga sem planejamento menos carga com planejamento. Negativo significa que planejar custou mais nesta premissa." centavos={T.dif} destaque />
      </div>

      <section className="panel-3d-sub p-3" aria-label="Gráfico de 24 meses">
        <BlockTitle icon={FlaskConical}>Faturamento, carga tributária e caixa por mês</BlockTitle>
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

      <section className="panel-3d-sub p-3">
        <BlockTitle icon={FlaskConical}>Mês a mês: digite o faturamento de um mês e os seguintes acompanham; toque na linha para abrir o Raio-X</BlockTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[12px]">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="p-1">Mês</th><th className="p-1">Origem</th><th className="p-1 text-right">Faturamento (digite o valor de cada mês)</th><th className="p-1 text-right">Pró-labore</th><th className="p-1 text-center">Fator R / Anexo</th><th className="p-1 text-center">Anexo sem/com</th><th className="p-1 text-right">Carga sem</th><th className="p-1 text-right">Carga com</th><th className="p-1 text-right">Caixa (com)</th>
            </tr></thead>
            <tbody>
              {d.meses.slice(tr[0], tr[1] + 1).reverse().map((m) => (
                <tr key={m.mes} className={`cursor-pointer border-t hover:bg-muted ${sel === m.mes ? "bg-muted" : ""}`} onClick={() => setSel(m.mes)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setSel(m.mes)} data-testid={`lab-mes-${m.mes}`}>
                  <td className="p-1 font-bold">{rotuloMes(m.mes)}</td>
                  <td className="p-1 text-[10px]">{m.fase.fase === "anterior_abertura" ? "Clínica-modelo (sem CNPJ)" : m.fase.fase === "mes_abertura" ? "Mês da abertura" : "Simulação pós-abertura"}</td>
                  <td className="p-1 text-right"><div className="flex items-center justify-end gap-1"><CelulaFat mes={m.mes} valor={m.sem.faturamentoCents} manual={ov[m.mes]?.faturamentoCents !== undefined}
                    onSalva={(c) => { const n = { ...ov, [m.mes]: { ...(ov[m.mes] ?? {}), faturamentoCents: c ?? undefined } }; setOv(n); salvar.mutate({ premissas: p, overrides: n }); }} />
                    </div></td>
                  <td className="p-1 text-right tabular-nums">{fmt(m.ativo.proLaboreCents)}</td><td className="p-1 text-center">{pct(m.ativo.fatorRPct)} · {m.ativo.anexo}</td><td className="p-1 text-center">{m.sem.anexo} / {m.com.anexo}</td>
                  <td className="p-1 text-right tabular-nums">{fmt(m.sem.tributosCents + m.sem.retencoesCents)}</td>
                  <td className="p-1 text-right tabular-nums">{fmt(m.com.tributosCents + m.com.retencoesCents)}</td>
                  <td className="p-1 text-right tabular-nums">{fmt(m.com.saldoCaixaCents)}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </section>

      {mes && <RaioX m={mes} ov={ov[mes.mes]} onEdit={(o) => { const n = { ...ov, [mes.mes]: o }; setOv(n); salvar.mutate({ premissas: p, overrides: n }); }} />}

      <section className="panel-3d-sub p-3 text-[12px]">
        <p className="mb-1 flex items-center gap-1 font-bold"><AlertTriangle className="h-4 w-4" aria-hidden="true" />O que esta simulação não é</p>
        <ul className="list-disc space-y-1 pl-5">{d.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
      </section>
    </div>
  );
}
