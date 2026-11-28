import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { Valor } from "@/components/numeral/Numeral";
import { finApi, type FinComparacao, type FinCreditoRes } from "@/lib/pax-finance-api";
import { Ajuda, Campo, btnCls, campoCls, reaisParaCentavos, InputReais } from "../pax-finance-ui";

const VALORES = [5000000, 10000000, 15000000, 20000000, 25000000];
const CENARIOS = [2000000, 3000000, 4000000, 5000000, 6000000, 8000000];
const SIT: Record<string, string> = { atende: "Atende", nao_atende: "Não atende", a_validar: "A validar", nao_avaliada: "Não avaliada", pendente: "Pendente" };

export function SimuladorCredito() {
  const [valor, setValor] = useState("100000");
  const [finalidade, setFinalidade] = useState("capital_giro");
  const [prazo, setPrazo] = useState("36");
  const [cenario, setCenario] = useState("");
  const [teto, setTeto] = useState("30");
  const [sel, setSel] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const cmp = useMutation({ mutationFn: (b: unknown) => finApi<FinComparacao>("/credit/compare", { method: "POST", body: b }), onSuccess: (r) => { setErro(""); setSel(r.ordemSugerida[0] ?? r.linhas[0]?.lineKey ?? null); }, onError: (e: Error) => setErro(e.message) });
  const calcular = () => {
    const v = reaisParaCentavos(valor); const c = cenario ? reaisParaCentavos(cenario) : undefined;
    if (!v) { setErro("Informe o valor pretendido."); return; }
    cmp.mutate({ valorDesejadoCents: v, finalidade, prazoMeses: Number(prazo) || 36, ...(c ? { cenarioMensalCents: c } : {}), tetoIlustrativoPct: Number(teto.replace(",", ".")) || 30 });
  };
  const d = cmp.data; const l: FinCreditoRes | undefined = d?.linhas.find((x) => x.lineKey === sel);
  return (
    <section className="panel-3d space-y-3 p-4" data-testid="simulador-credito">
      <BlockTitle icon={Calculator} trailing={<Ajuda texto="Calcula quanto precisa faturar por mês para alcançar o valor pretendido. Não é oferta nem análise de crédito." />}>Simulador de crédito</BlockTitle>
      <p className="rounded bg-muted p-2 text-[12px] font-bold" data-testid="credito-aviso-aprovacao">Faturamento não garante aprovação. Condições de programas só valem com fonte oficial verificada; sem ela o resultado é estimativa ilustrativa (REGRA DO PROGRAMA A VALIDAR).</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Campo rotulo="Valor pretendido (R$)" ajuda="Escolha um valor pronto ou digite outro."><div className="space-y-1">
          <div className="flex flex-wrap gap-1">{VALORES.map((v) => <button key={v} type="button" className="bevel-3d min-h-[36px] rounded px-2 text-[11px] font-bold" onClick={() => setValor(String(v / 100))}>{(v / 100000).toFixed(0)} mil</button>)}</div>
          <InputReais className={campoCls}  value={valor} onChange={(e) => setValor(e.target.value)} data-testid="sim-valor" /></div></Campo>
        <Campo rotulo="Finalidade" ajuda="Para que o dinheiro será usado."><select className={campoCls} value={finalidade} onChange={(e) => setFinalidade(e.target.value)} data-testid="sim-finalidade"><option value="capital_giro">Capital de giro</option><option value="investimento">Investimento</option><option value="equipamentos">Equipamentos</option></select></Campo>
        <Campo rotulo="Prazo (meses)" ajuda="Prazo desejado. Só vale se o programa permitir."><input className={campoCls} inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></Campo>
        <Campo rotulo="Faturamento mensal do cenário (R$)" ajuda="Quanto a empresa passaria a faturar por mês. Vazio = igual à meta mensal necessária."><div className="space-y-1">
          <div className="flex flex-wrap gap-1">{CENARIOS.map((v) => <button key={v} type="button" className="bevel-3d min-h-[36px] rounded px-2 text-[11px] font-bold" onClick={() => setCenario(String(v / 100))}>{v / 100000} mil</button>)}</div>
          <InputReais className={campoCls}  value={cenario} onChange={(e) => setCenario(e.target.value)} placeholder="livre" data-testid="sim-cenario" /></div></Campo>
        <Campo rotulo="Premissa ilustrativa: % do faturamento anual" ajuda="Usada SOMENTE quando o programa não tem regra verificada. Não é regra de nenhum programa; edite à vontade."><input className={campoCls} inputMode="decimal" value={teto} onChange={(e) => setTeto(e.target.value)} /></Campo>
        <div className="flex items-end"><button type="button" className={btnCls} data-testid="sim-calcular" onClick={calcular} disabled={cmp.isPending}>Comparar linhas</button></div>
      </div>
      {erro && <p className="text-[12px] text-destructive" data-testid="fin-erro">{erro}</p>}
      {d && (<>
        <div className="panel-3d-sub p-3 text-[12px]" data-testid="sim-recomendacao"><b>{d.recomendacaoFirme ? "Recomendação" : "Sem recomendação firme"}:</b> {d.justificativa}</div>
        <div className="overflow-x-auto"><table className="w-full text-[12px]" data-testid="sim-comparacao">
          <thead><tr className="bg-muted text-left"><th className="p-2">Linha</th><th className="p-2">Situação da regra</th><th className="p-2">Meta mensal</th><th className="p-2">Meses até a meta</th><th className="p-2" /></tr></thead>
          <tbody>{d.linhas.map((x) => (
            <tr key={x.lineKey} className={`border-t ${x.lineKey === sel ? "bg-muted/50" : ""}`} data-testid={`sim-linha-${x.lineKey}`}>
              <td className="p-2 font-bold">{x.nome}{!x.aderenteAFinalidade && <span className="ml-1 text-[10px] font-normal text-muted-foreground">(outra finalidade)</span>}</td>
              <td className="p-2">{x.avisoRegra ? <span className="font-bold text-destructive">{x.avisoRegra}</span> : "Regra verificada"} <span className="text-muted-foreground">· {x.statusFonte === "confirmado" ? "Confirmado" : "Aguardando validação atual"}</span></td>
              <td className="p-2"><Valor valor={x.metaMensalCents / 100} semCentavos /></td><td className="p-2">{x.mesesParaMeta ?? "—"}</td>
              <td className="p-2"><button type="button" className="bevel-3d min-h-[36px] rounded px-2 text-[11px] font-bold uppercase" onClick={() => setSel(x.lineKey)}>Detalhar</button></td>
            </tr>))}</tbody></table></div>
        {l && (
          <div className="space-y-3" data-testid="sim-detalhe">
            <h3 className="text-[14px] font-bold uppercase">{l.nome} — {l.modo === "regra_confirmada" ? "regra verificada" : "estimativa ilustrativa"}</h3>
            <p className="text-[12px]">Fonte: {l.fonte.oficial ?? "Aguardando validação atual"}{l.fonte.url ? ` · ${l.fonte.url}` : ""}{l.fonte.verificadaEm ? ` · verificada em ${l.fonte.verificadaEm}` : ""}. Percentual usado: {l.percentualUsado}% ({l.percentualOrigem}).</p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 text-[12px]">
              <div className="panel-3d-sub p-3"><b>Receita anual necessária</b><div className="text-[18px]"><Valor valor={l.receitaAnualNecessariaCents / 100} semCentavos /></div></div>
              <div className="panel-3d-sub p-3"><b>Meta mensal</b><div className="text-[18px]"><Valor valor={l.metaMensalCents / 100} semCentavos /></div></div>
              <div className="panel-3d-sub p-3"><b>Comprovado (12 meses)</b><div className="text-[18px]">{l.comprovadoUltimos12mCents === null ? <i className="text-[13px] text-muted-foreground">Não importado</i> : <Valor valor={l.comprovadoUltimos12mCents / 100} semCentavos />}</div></div>
              <div className="panel-3d-sub p-3"><b>Falta</b><div className="text-[18px]"><Valor valor={l.faltaCents / 100} semCentavos /></div></div>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-[12px]" data-testid="sim-requisitos"><thead><tr className="bg-muted text-left"><th className="p-2">Requisito</th><th className="p-2">Exigido</th><th className="p-2">Situação</th><th className="p-2">Detalhe</th></tr></thead>
              <tbody>{l.requisitos.map((r) => <tr key={r.nome} className="border-t"><td className="p-2 font-bold">{r.nome}</td><td className="p-2">{r.exigido}</td><td className="p-2">{SIT[r.situacao] ?? r.situacao}</td><td className="p-2">{r.detalhe}</td></tr>)}</tbody></table></div>
            <div className="overflow-x-auto"><table className="w-full text-[12px]" data-testid="sim-cronograma"><thead><tr className="bg-muted text-left"><th className="p-2">Mês</th><th className="p-2">Meta do mês</th><th className="p-2">Acumulado</th><th className="p-2">Falta</th></tr></thead>
              <tbody>{l.plano.map((p) => <tr key={p.mes} className="border-t"><td className="p-2">{p.mes}</td><td className="p-2"><Valor valor={p.metaMesCents / 100} semCentavos /></td><td className="p-2"><Valor valor={p.acumuladoCents / 100} semCentavos /></td><td className="p-2"><Valor valor={p.faltaCents / 100} semCentavos /></td></tr>)}</tbody></table></div>
            <details className="text-[12px]"><summary className="cursor-pointer font-bold">Memória de cálculo</summary><ul className="mt-1 list-disc pl-5">{l.memoria.map((m) => <li key={m}>{m}</li>)}</ul></details>
          </div>)}
      </>)}
    </section>
  );
}
