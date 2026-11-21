import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, CalendarRange, FlaskConical, SlidersHorizontal } from "lucide-react";
import { Campo, Indicador, campoCls, reaisParaCentavos, rotuloMes, mascaraReais } from "../pax-finance-ui";
import { finApi } from "@/lib/pax-finance-api";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { Switch } from "@/components/ui/switch";
import { brl, fmt, pct, type Cen, type Lab, type Mes, type Ov, type Prem } from "./lab-comum";
import { GraficoLab } from "./LabGrafico";
import { SeletorPeriodo } from "./LabPeriodo";
import { TabelaMeses } from "./LabTabela";

const BTN = "h-9 rounded-md px-4 text-[11px] font-semibold uppercase tracking-[0.1em] disabled:opacity-40";
const BTN_P = `btn-3d ${BTN}`;
const BTN_S = `btn-3d-soft ${BTN}`;

function Reais({ rotulo, ajuda, valor, onChange }: { rotulo: string; ajuda: string; valor: number | null; onChange: (c: number | null) => void }) {
  const [t, setT] = useState(valor === null ? "" : brl(valor));
  useEffect(() => { setT(valor === null ? "" : brl(valor)); }, [valor]);
  return <Campo rotulo={rotulo} ajuda={ajuda}><input className={campoCls} inputMode="decimal" value={t} onChange={(e) => setT(mascaraReais(e.target.value))} onBlur={() => onChange(reaisParaCentavos(t))} /></Campo>;
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
      <button type="button" className={BTN_P} onClick={() => onEdit(e)}>Aplicar ao mês e salvar</button>
    </section>
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
  const somar = (k: "sem" | "com", f: (x: Cen) => number) => noGrafico.reduce((a, m) => a + f(m[k]), 0);
  const cargaSem = somar("sem", (x) => x.tributosCents + x.retencoesCents), cargaCom = somar("com", (x) => x.tributosCents + x.retencoesCents);
  const T = { fat: somar("sem", (x) => x.faturamentoCents), cargaSem, cargaCom, dif: cargaSem - cargaCom };
  const ym = d.meses.map((m) => m.mes);
  const grava = (n: Ov) => { setOv(n); salvar.mutate({ premissas: p, overrides: n }); };
  return (
    <div className="space-y-5" data-testid="laboratorio-24m">
      <div role="note" className="bevel-3d paxter-alert flex items-start gap-2 rounded p-3 text-[12px] font-bold" data-testid="selo-simulacao">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{d.selo}
      </div>
      {erro && <p role="alert" className="text-[12px] font-bold text-destructive">{erro}</p>}

      <section className="panel-3d p-4" aria-label="Parâmetros da simulação">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5"><SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" /><span className="text-[12px] font-semibold uppercase tracking-[0.12em]">Parâmetros da simulação</span></div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="concave-3d px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" data-testid="estado-salvo">{d.salvo ? "Simulação salva" : "Automática"}</span>
            <button type="button" className={BTN_S} disabled={limpar.isPending || !d.salvo} onClick={() => limpar.mutate()}>Voltar ao automático</button>
            <button type="button" className={BTN_P} disabled={salvar.isPending} onClick={() => salvar.mutate({ premissas: p, overrides: ov })}>{salvar.isPending ? "Salvando…" : "Salvar e recalcular"}</button>
          </div>
        </div>
        <label className="concave-3d flex min-h-[56px] cursor-pointer items-center gap-4 px-4 py-3" data-testid="toggle-fator-r">
          <Switch checked={p.fatorRAutomatico} onCheckedChange={(v) => { const n = { ...p, fatorRAutomatico: v }; setP(n); salvar.mutate({ premissas: n, overrides: ov }); }} aria-label="Fator R automático" />
          <span className="text-[13px] leading-snug"><b className="uppercase tracking-wide">Fator R automático</b><span className="block text-[12px] text-muted-foreground">O pró-labore de cada mês sobe sozinho até a folha chegar a 28% do faturamento (Anexo III).</span></span>
        </label>
        <p className="mt-3 text-[11px] text-muted-foreground" data-testid="origem-premissas">Premissas calculadas a partir de: {d.origemPremissas}.</p>
        <details className="mt-2">
          <summary className={`${BTN_S} inline-flex cursor-pointer list-none items-center`}>Ajustar premissas manualmente</summary>
          <div className="mt-3">
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
          </div>
        </details>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SeletorPeriodo id="faixa-grafico" titulo="Período do gráfico" subtitulo="Define também os quatro totais abaixo." ajuda="Escolha de que mês até que mês o gráfico e os quatro totais calculam. Os 24 meses continuam guardados." icone={<BarChart3 className="h-4 w-4 shrink-0 text-primary" />} meses={ym} valor={gr} onAplicar={setGr} />
        <SeletorPeriodo id="faixa-digitacao" titulo="Período da tabela" subtitulo="Meses que aparecem para digitar." ajuda="A tabela mês a mês mostra só os meses deste período. Os outros continuam guardados e calculados." icone={<CalendarRange className="h-4 w-4 shrink-0 text-primary" />} meses={ym} valor={tr} onAplicar={setTr} />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Indicador rotulo="Faturamento no período" ajuda="Soma simulada da receita por competência no período do gráfico." centavos={T.fat} />
        <Indicador rotulo="Carga sem planejamento" ajuda="Tributos da empresa mais retenções do sócio, mantendo o pró-labore mínimo." centavos={T.cargaSem} />
        <Indicador rotulo="Carga com planejamento" ajuda="Mesma soma, elevando o pró-labore para buscar Fator R de 28% e o Anexo III." centavos={T.cargaCom} />
        <Indicador rotulo="Diferença" ajuda="Carga sem planejamento menos carga com planejamento. Negativo significa que planejar custou mais nesta premissa." centavos={T.dif} destaque />
      </div>

      <GraficoLab meses={noGrafico} />

      <TabelaMeses meses={d.meses.slice(tr[0], tr[1] + 1).reverse()} ov={ov} sel={sel} onSel={setSel}
        onSalvaFat={(m, c) => grava({ ...ov, [m]: { ...(ov[m] ?? {}), faturamentoCents: c ?? undefined } })} />

      {mes && <RaioX m={mes} ov={ov[mes.mes]} onEdit={(o) => grava({ ...ov, [mes.mes]: o })} />}

      <details className="panel-3d-sub p-4 text-[12px]">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-bold uppercase tracking-[0.12em]"><AlertTriangle className="h-4 w-4" aria-hidden="true" />O que esta simulação não é</summary>
        <ul className="mt-3 list-disc space-y-1 pl-5">{d.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
      </details>
    </div>
  );
}
