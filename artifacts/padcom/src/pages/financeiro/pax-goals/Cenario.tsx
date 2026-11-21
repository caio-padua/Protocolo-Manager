import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LineChart as LineIcon } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { Valor } from "@/components/numeral/Numeral";
import { finApi, type FinCenarioDemo } from "@/lib/pax-finance-api";
import { Ajuda, Indicador, MESES, btnCls, btnSoftCls, campoCls, reaisParaCentavos } from "../pax-finance-ui";

const ANO = 2026;

/** Tres series separadas: Real comprovado (pagamentos da empresa), Simulacao e Projecao (camada DEMO). Totais vem do servidor. */
export function Cenario() {
  const qc = useQueryClient();
  const [erro, setErro] = useState("");
  const [edit, setEdit] = useState<Record<number, string>>({});
  const c = useQuery({ queryKey: ["fin", "scenario", ANO], queryFn: () => finApi<FinCenarioDemo>(`/scenario?ano=${ANO}`) });
  const agir = useMutation({
    mutationFn: (a: { path: string; method: string; body?: unknown }) => finApi(a.path, { method: a.method, body: a.body ?? {} }),
    onSuccess: () => { setErro(""); setEdit({}); void qc.invalidateQueries({ queryKey: ["fin", "scenario"] }); },
    onError: (e: Error) => setErro(e.message),
  });
  const d = c.data;
  const dados = (d?.meses ?? []).map((m) => ({ mes: MESES[m.mes - 1], "Real comprovado": m.realComprovadoCents, "Simulação": m.simulacaoCents, "Projeção": m.projecaoCents }));
  return (
    <section className="panel-3d space-y-3 p-4" data-testid="cenario-demo">
      <BlockTitle icon={LineIcon} trailing={<Ajuda texto="Valores fictícios para testar as telas. Ficam em tabela própria e nunca viram cobrança, nota, caixa ou comprovante." />}>Cenário {ANO} — três séries separadas</BlockTitle>
      <p className="rounded bg-destructive/10 p-2 text-[12px] font-bold uppercase text-destructive" data-testid="cenario-rotulo">{d?.rotulo ?? "DADOS FICTÍCIOS — SIMULAÇÃO — NÃO SÃO FATURAMENTO REAL"}</p>
      {c.isError && <p className="text-[12px] text-destructive">{(c.error as Error).message}</p>}
      {erro && <p className="text-[12px] text-destructive" data-testid="fin-erro">{erro}</p>}
      {d && !d.temDemo && (
        <div className="panel-3d-sub p-3 text-[12px]">Nenhum cenário de simulação para esta empresa. <button type="button" className={btnCls} data-testid="cenario-semear" onClick={() => agir.mutate({ path: `/scenario/demo/seed?ano=${ANO}`, method: "POST" })}>Carregar valores de demonstração {ANO}</button></div>
      )}
      {d && (<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="cenario-totais">
          <Indicador rotulo="Real comprovado" ajuda="Soma dos pagamentos recebidos da empresa no ano. Sem importação, aparece o rótulo abaixo." centavos={d.totais.realComprovadoCents} nota={d.temReal ? undefined : "Sem dados importados"} />
          <Indicador rotulo="Simulação (jan–out)" ajuda="Soma dos meses de simulação, calculada no servidor." centavos={d.totais.simulacaoCents} nota="Fictício" />
          <Indicador rotulo="Projeção (nov–dez)" ajuda="Soma dos meses marcados como projeção." centavos={d.totais.projecaoCents} nota="Projeção ilustrativa" />
          <Indicador rotulo="Anual ilustrativo" ajuda="Simulação mais projeção. Não é faturamento." centavos={d.totais.projecaoAnualIlustrativaCents} destaque nota="Fictício" />
        </div>
        <div className="h-64 w-full" data-testid="cenario-grafico">
          <ResponsiveContainer>
            <ComposedChart data={dados}>
              <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="mes" /><YAxis tickFormatter={(v) => `${Math.round(v / 100000)}k`} width={40} />
              <RTooltip formatter={(v: number) => (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} /><Legend />
              <Bar dataKey="Real comprovado" fill="#16a34a" /><Bar dataKey="Simulação" fill="#C9A24B" /><Line dataKey="Projeção" stroke="#1e3a5f" strokeDasharray="5 4" connectNulls={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" data-testid="cenario-tabela">
            <thead><tr className="bg-muted text-left"><th className="p-2">Mês</th><th className="p-2">Real comprovado</th><th className="p-2">Simulação</th><th className="p-2">Projeção</th><th className="p-2">Editar (R$)</th></tr></thead>
            <tbody>
              {d.meses.map((m) => (
                <tr key={m.mes} className="border-t">
                  <td className="p-2 font-bold uppercase">{MESES[m.mes - 1]}</td>
                  <td className="p-2">{m.realComprovadoCents === null ? <span className="italic text-muted-foreground">Sem dados importados</span> : <Valor valor={m.realComprovadoCents / 100} />}</td>
                  <td className="p-2">{m.simulacaoCents === null ? "—" : <Valor valor={m.simulacaoCents / 100} />}</td>
                  <td className="p-2">{m.projecaoCents === null ? "—" : <Valor valor={m.projecaoCents / 100} />}</td>
                  <td className="p-2">
                    <div className="flex gap-1">
                      <input className={`${campoCls} max-w-[120px]`} inputMode="decimal" value={edit[m.mes] ?? ""} onChange={(e) => setEdit({ ...edit, [m.mes]: e.target.value })} placeholder="0,00" aria-label={`Valor de ${MESES[m.mes - 1]}`} />
                      <button type="button" className={btnSoftCls} onClick={() => { const v = reaisParaCentavos(edit[m.mes] ?? ""); if (v === null) { setErro("Informe um valor."); return; } agir.mutate({ path: `/scenario/${m.mes}`, method: "PUT", body: { ano: ANO, valorCents: v, natureza: m.projecaoCents !== null || m.mes > 10 ? "projecao" : "simulacao" } }); }}>Salvar</button>
                      <button type="button" className={btnSoftCls} onClick={() => agir.mutate({ path: `/scenario/${m.mes}?ano=${ANO}`, method: "DELETE" })}>Apagar</button>
                    </div>
                  </td>
                </tr>))}
            </tbody>
          </table>
        </div>
        {d.temDemo && <button type="button" className={btnSoftCls} data-testid="cenario-apagar" onClick={() => agir.mutate({ path: `/scenario?ano=${ANO}`, method: "DELETE" })}>Apagar toda a simulação {ANO}</button>}
        <p className="text-[11px] text-muted-foreground">{d.aviso}</p>
      </>)}
    </section>
  );
}
