import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, HelpCircle } from "lucide-react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { Percentual, Valor } from "@/components/numeral/Numeral";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { finApi, type FinCenarioDemo } from "@/lib/pax-finance-api";
import { Campo, MESES, campoCls, reaisParaCentavos, InputReais } from "../pax-finance-ui";

const ANO = 2026;
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface LinhaC {
  key: string; nome: string; oQueE: string; finalidade: string; campos: Record<string, string | null>; faltaInformar: Record<string, string>;
  fontes: { nome: string; url: string; consultadaEm: string }[]; conferir: string[]; tetoRotulo: string | null;
  naoSeAplica: Record<string, string>; faixa: { minAnualCents: number | null; maxAnualCents: number | null; mesesFaturamento: number | null; texto: string } | null;
  metaMensalCents: number | null; metaRotulo: string | null; necessarioLimiteCheioMensalCents: number | null; mesesAtingidos: number; mesesComDado: number;
  serie: { mes: number; valorCents: number | null; atingiu: boolean | null }[]; situacaoFaixa: "sem_dado" | "sem_faixa" | "abaixo" | "dentro" | "acima";
  percentualUsadoPct: number | null; limiteSobreFaturamentoCents: number | null; limiteTeoricoCents: number | null; motivoLimiteVazio: string | null; limitadoPeloTeto: boolean;
}
interface PainelC { aviso: string; conferencia: string; campos: { key: string; rotulo: string; ajuda: string }[]; faturamentoAnualCents: number | null; linhas: LinhaC[] }

const Balao = ({ rotulo, texto }: { rotulo: string; texto: string }) => (
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label={`Explicação: ${rotulo}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground md:h-7 md:w-7"><HelpCircle className="h-4 w-4" /></button>
    </PopoverTrigger>
    <PopoverContent className="w-72 text-[12px] leading-snug" side="top">{texto}</PopoverContent>
  </Popover>
);

const SITUACAO: Record<LinhaC["situacaoFaixa"], { texto: string; cls: string }> = {
  sem_dado: { texto: "Sem faturamento para comparar", cls: "bg-muted text-muted-foreground" },
  sem_faixa: { texto: "Programa sem faixa pública de faturamento", cls: "bg-muted text-muted-foreground" },
  abaixo: { texto: "Faturamento abaixo do mínimo do programa", cls: "bg-destructive/15 text-destructive" },
  dentro: { texto: "Faturamento dentro da faixa do programa", cls: "bg-emerald-600/15 text-emerald-700" },
  acima: { texto: "Faturamento acima do porte aceito", cls: "bg-destructive/15 text-destructive" },
};

/** Mês a mês contra a meta do programa: barra verde = atingiu, dourada = ainda não, cinza = sem dado. */
function GraficoMeta({ l }: { l: LinhaC }) {
  const dados = l.serie.map((m) => ({ mes: MESES[m.mes - 1], valor: m.valorCents, atingiu: m.atingiu, meta: l.metaMensalCents }));
  const s = SITUACAO[l.situacaoFaixa];
  return (
    <div className="mt-2 border-t pt-2" data-testid={`credito-grafico-${l.key}`}>
      <div className="grid grid-cols-1 items-center gap-2 text-[12px] md:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="min-w-0"><div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Faixa de faturamento exigida</div>
          <div>{l.faixa ? l.faixa.texto : <span className="italic text-muted-foreground">— A página oficial lida não informa faixa de faturamento.</span>}</div></div>
        <div className={`flex h-11 items-center justify-center rounded px-2 text-center text-[11px] font-bold uppercase ${s.cls}`} data-testid={`credito-situacao-${l.key}`}>{s.texto}</div>
      </div>
      <div className="mt-1 text-[12px]">
        <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{l.metaRotulo ?? "Meta mensal do programa"}</div>
        {l.metaMensalCents !== null
          ? <span data-testid={`credito-meta-${l.key}`}><b>{brl(l.metaMensalCents)}</b> por mês{l.mesesComDado > 0 && <> · atingida em <b>{l.mesesAtingidos}</b> de {l.mesesComDado} meses com dado</>}</span>
          : <span className="italic text-muted-foreground">— Falta: o programa não define meta de faturamento que dê para medir mês a mês.</span>}
      </div>
      <div className="mt-1 h-44 w-full" aria-label={`Faturamento mensal contra a meta de ${l.nome}`}>
        <ResponsiveContainer>
          <ComposedChart data={dados}>
            <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mes" /><YAxis tickFormatter={(v) => `${Math.round(v / 100000)}k`} width={40} />
            <RTooltip formatter={(v: number) => brl(v)} />
            <Bar dataKey="valor" name="Faturamento do mês">{dados.map((d, i) => <Cell key={i} fill={d.atingiu === true ? "#16a34a" : d.atingiu === false ? "#C9A24B" : "#9ca3af"} />)}</Bar>
            {l.metaMensalCents !== null && <Line dataKey="meta" name="Meta do programa" stroke="#1e3a5f" strokeDasharray="5 4" dot={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PainelCredito() {
  const [fat, setFat] = useState("");
  const [mulheres, setMulheres] = useState(false);
  const [linhaEscolhida, setLinhaEscolhida] = useState("todas");
  const cen = useQuery({ queryKey: ["fin", "scenario", ANO], queryFn: () => finApi<FinCenarioDemo>(`/scenario?ano=${ANO}`) });
  // Mês a mês vindo do sistema: pagamentos reais da empresa; sem eles, a simulação fictícia (rotulada).
  const meses = useMemo(() => (cen.data?.meses ?? []).map((m) => m.realComprovadoCents ?? m.simulacaoCents ?? m.projecaoCents ?? null), [cen.data]);
  const origem = !cen.data ? null : cen.data.temReal ? "real" : cen.data.temDemo ? "ficticio" : null;
  const mediaAuto = useMemo(() => { const v = meses.filter((x): x is number => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; }, [meses]);
  const [digitou, setDigitou] = useState(false);
  useEffect(() => { if (!digitou && mediaAuto !== null) setFat((mediaAuto / 100).toFixed(2).replace(".", ",")); }, [mediaAuto, digitou]);
  const body = useMemo(() => ({ faturamentoMensalCents: reaisParaCentavos(fat), lideradaPorMulheres: mulheres, ...(meses.length === 12 ? { mesesCents: meses } : {}) }), [fat, mulheres, meses]);
  const [deb, setDeb] = useState(body);
  useEffect(() => { const t = setTimeout(() => setDeb(body), 350); return () => clearTimeout(t); }, [body]);
  const q = useQuery({ queryKey: ["fin-credit-panel", deb], queryFn: () => finApi<PainelC>("/credit/panel", { method: "POST", body: deb }), placeholderData: (p) => p });
  const p = q.data;

  return (
    <section className="panel-3d space-y-4 p-4" data-testid="painel-credito">
      <BlockTitle icon={CreditCard}>Quanto de crédito cada programa permite</BlockTitle>
      <p className="rounded bg-muted p-2 text-[12px] font-bold" data-testid="credito-aviso-aprovacao">Faturamento não garante aprovação. O limite mostrado é o teto teórico do programa; o banco decide na análise de crédito. Condições lidas nas páginas oficiais em 21/11/2026, com conferência humana dispensada nesta etapa (pendente).</p>
      <div className="panel-3d-sub p-3">
        <Campo rotulo="Faturamento do mês (R$)" ajuda="Digite quanto a empresa fatura em um mês. O sistema multiplica por 12 e aplica o percentual de cada programa. Nenhum valor vem pronto.">
          <InputReais className={`${campoCls} text-[18px] font-bold`}  value={fat} onChange={(e) => { setDigitou(true); setFat(e.target.value); }} placeholder="Digite o faturamento mensal" data-testid="credito-faturamento" autoComplete="off" />
        </Campo>
        <label className="mt-2 flex min-h-[44px] items-center gap-2 text-[12px]"><input type="checkbox" className="h-5 w-5" checked={mulheres} onChange={(e) => setMulheres(e.target.checked)} /><span>Empresa liderada por mulheres (o ProCred 360 aceita até 50% do faturamento)</span></label>
        <p className="mt-1 text-[11px]" data-testid="credito-origem">{!digitou && mediaAuto !== null
          ? (origem === "real" ? "Preenchido com a média mensal dos pagamentos recebidos da empresa em 2026. Você pode trocar o valor." : "Preenchido com a média da SIMULAÇÃO FICTÍCIA de 2026 (não é faturamento real). Você pode trocar o valor.")
          : digitou ? <>Valor digitado por você. <button type="button" className="underline" onClick={() => setDigitou(false)}>Voltar ao valor do sistema</button></> : "Sem faturamento no sistema para 2026: digite o valor."}</p>
        <label className="mt-2 flex min-h-[44px] items-center gap-2 text-[12px]"><span className="font-bold uppercase text-[10px] tracking-[0.1em] text-muted-foreground">Quero ver</span>
          <select className={`${campoCls} max-w-[16rem]`} value={linhaEscolhida} onChange={(e) => setLinhaEscolhida(e.target.value)} aria-label="Escolher o programa de crédito" data-testid="credito-escolha">
            <option value="todas">Todos os programas</option>{p?.linhas.map((l) => <option key={l.key} value={l.key}>{l.nome}</option>)}
          </select></label>
        <div className="mt-1 text-[12px]" data-testid="credito-anual">Faturamento anual (mês x 12): {p?.faturamentoAnualCents ? <b><Valor valor={p.faturamentoAnualCents / 100} /></b> : <span className="italic text-muted-foreground">— digite o faturamento mensal</span>}</div>
      </div>
      {q.isError && <p className="text-[12px] text-destructive" data-testid="fin-erro">{(q.error as Error).message}</p>}

      {p?.linhas.filter((l) => linhaEscolhida === "todas" || l.key === linhaEscolhida).map((l) => (
        <article key={l.key} className="panel-3d-sub p-3" data-testid={`credito-${l.key}`}>
          <h3 className="text-[14px] font-bold uppercase">{l.nome}</h3>
          <p className="text-[12px] text-muted-foreground">{l.oQueE} <b>Finalidade:</b> {l.finalidade}.</p>
          <div className="mt-2 grid grid-cols-2 items-start gap-x-2 border-t py-1.5 text-[13px] md:grid-cols-[minmax(0,1fr)_11rem_5rem]" data-testid={`credito-limite-${l.key}`}>
            <div className="col-span-2 min-w-0 font-bold md:col-span-1">Limite teórico com este faturamento
              {l.limiteTeoricoCents === null && l.motivoLimiteVazio && <div className="text-[11px] font-normal italic text-muted-foreground">Falta: {l.motivoLimiteVazio}</div>}
              {l.limiteTeoricoCents !== null && <div className="text-[11px] font-normal text-muted-foreground">{l.percentualUsadoPct}% do faturamento anual{l.limitadoPeloTeto ? `; limitado pelo teto do programa (${l.tetoRotulo})` : ""}</div>}
            </div>
            <div className="text-left text-[14px] tabular-nums md:text-right">{l.limiteTeoricoCents === null ? <span className="text-muted-foreground">—</span> : <Valor valor={l.limiteTeoricoCents / 100} />}</div>
            <div className="text-right tabular-nums">{l.percentualUsadoPct === null ? <span className="text-muted-foreground">—</span> : <Percentual valor={l.percentualUsadoPct} casas={0} />}</div>
          </div>
          <GraficoMeta l={l} />
          <dl className="text-[12px]">
            {p.campos.map((c) => {
              const v = l.campos[c.key];
              const nao = v === null ? l.naoSeAplica[c.key] : undefined;
              return (
                <div key={c.key} className={`grid grid-cols-1 gap-x-3 border-t py-1.5 md:grid-cols-[13rem_minmax(0,1fr)] ${nao ? "opacity-45" : ""}`} data-testid={`campo-${l.key}-${c.key}`} data-vazio={v === null} data-nao-se-aplica={nao ? "true" : "false"}>
                  <dt className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{c.rotulo}<Balao rotulo={c.rotulo} texto={c.ajuda} /></dt>
                  <dd className="break-words">{nao ? (<><span className="text-muted-foreground">—</span> <span className="italic text-muted-foreground">Não se aplica: {nao}</span></>) : v ?? (<><span className="text-muted-foreground">—</span> <span className="italic text-muted-foreground">Falta: {l.faltaInformar[c.key] ?? "informação não consta na fonte oficial lida."}</span></>)}</dd>
                </div>);
            })}
          </dl>
          {l.conferir.length > 0 && <p className="mt-1 text-[11px] italic text-muted-foreground">A conferir: {l.conferir.join(" ")}</p>}
          <p className="mt-1 break-words text-[11px] text-muted-foreground">Fonte oficial (consultada em {l.fontes[0]?.consultadaEm.split("-").reverse().join("/")}):{" "}{l.fontes.map((f) => <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="mr-2 underline">{f.nome}</a>)}</p>
        </article>
      ))}
    </section>
  );
}
