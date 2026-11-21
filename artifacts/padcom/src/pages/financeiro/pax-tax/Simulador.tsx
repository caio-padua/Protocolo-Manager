import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Calculator } from "lucide-react";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { Percentual, Valor } from "@/components/numeral/Numeral";
import { finApi, type FinSimulacao } from "@/lib/pax-finance-api";
import { Campo, btnCls, campoCls, reaisParaCentavos } from "../pax-finance-ui";

export function Simulador() {
  const [f, setF] = useState({ rbt12: "", mensal: "", folha: "", anexos: "III, V" });
  const [erro, setErro] = useState("");
  const sim = useMutation({
    mutationFn: () => finApi<FinSimulacao>("/simulate", { method: "POST", body: { rbt12Cents: reaisParaCentavos(f.rbt12) ?? 0, receitaMensalCents: reaisParaCentavos(f.mensal) ?? 0, folha12Cents: reaisParaCentavos(f.folha) ?? 0, anexos: f.anexos.split(",").map((x) => x.trim()).filter(Boolean) } }),
    onSuccess: () => setErro(""), onError: (e: Error) => setErro(e.message),
  });
  const r = sim.data;
  return (
    <section className="panel-3d p-4" data-testid="pax-sim">
      <BlockTitle icon={Calculator}>Simuladores (somente simulação)</BlockTitle>
      <p className="mb-3 text-[12px] text-muted-foreground">Calcula só com regras ativas e aprovadas da aba Parâmetros. Sem regra, o resultado fica pendente e o sistema não inventa número. Nada aqui altera guias, notas ou cobranças.</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Campo rotulo="RBT12 (R$)" ajuda="Receita bruta total dos últimos 12 meses. É a base para achar a faixa do Simples Nacional."><input className={campoCls} inputMode="decimal" value={f.rbt12} onChange={(e) => setF({ ...f, rbt12: e.target.value })} data-testid="sim-rbt12" /></Campo>
        <Campo rotulo="Receita do mês (R$)" ajuda="Receita que será usada para estimar o imposto do mês."><input className={campoCls} inputMode="decimal" value={f.mensal} onChange={(e) => setF({ ...f, mensal: e.target.value })} data-testid="sim-mensal" /></Campo>
        <Campo rotulo="Folha 12 meses (R$)" ajuda="Somente rubricas de folha elegíveis e comprovadas. Pagamento a autônomo (RPA) não entra automaticamente."><input className={campoCls} inputMode="decimal" value={f.folha} onChange={(e) => setF({ ...f, folha: e.target.value })} /></Campo>
        <Campo rotulo="Anexos a comparar" ajuda="Separe por vírgula. Exemplo: III, V."><input className={campoCls} value={f.anexos} onChange={(e) => setF({ ...f, anexos: e.target.value })} /></Campo>
      </div>
      <button type="button" className={`${btnCls} mt-3`} onClick={() => sim.mutate()} data-testid="sim-calcular">Simular</button>
      {erro && <p className="mt-2 text-[12px] text-destructive">{erro}</p>}
      {r && (
        <div className="mt-4 space-y-3" data-testid="sim-resultado">
          <p className="rounded bg-muted p-2 text-[12px] font-bold uppercase">{r.aviso}</p>
          <div className="panel-3d-sub p-3 text-[12px]" data-testid="sim-fator-r">
            <b>Fator R</b> (folha ÷ receita, 12 meses): <Percentual valor={r.fatorR.razaoPct} casas={2} /> · limite da regra: {r.fatorR.limitePct === null ? <i>aguardando regra</i> : <Percentual valor={r.fatorR.limitePct} casas={2} />} · anexo resultante: {r.fatorR.anexo ?? <i>indefinido</i>}
            {r.fatorR.pendencias.map((p) => <div key={p} className="text-muted-foreground">Pendente: {p}</div>)}
            <div className="text-muted-foreground">{r.fatorR.aviso}</div>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {r.cenarios.map((c) => (
              <div key={c.nome} className="panel-3d-sub space-y-1 p-3 text-[12px]" data-testid="sim-cenario">
                <div className="flex justify-between"><b>{c.nome}</b><span className="uppercase">{c.status === "calculado" ? "simulação" : "pendente"}</span></div>
                <div>Imposto estimado/mês: {c.impostoMensalCents === null ? <i>não calculado</i> : <Valor valor={c.impostoMensalCents / 100} />}</div>
                <div>Alíquota efetiva: <Percentual valor={c.aliquotaEfetivaPct} casas={2} /></div>
                {c.memoria.length > 0 && <details><summary className="min-h-[44px] cursor-pointer leading-[44px] md:min-h-0 md:leading-normal">Memória de cálculo</summary><ul className="list-disc pl-4">{c.memoria.map((m) => <li key={m}>{m}</li>)}</ul></details>}
                {c.pendencias.map((p) => <div key={p} className="text-muted-foreground">Dado ausente: {p}</div>)}
              </div>))}
          </div>
          {r.comparacao && <p className="text-[12px]">Menor imposto estimado: <b>{r.comparacao.menorCenario}</b>{r.comparacao.economiaEstimadaMensalCents != null && <> · diferença para o maior: <Valor valor={r.comparacao.economiaEstimadaMensalCents / 100} /></>} (simulação).</p>}
          <div className="text-[11px] text-muted-foreground">Premissas: {r.premissas.join(" · ")}</div>
        </div>
      )}
    </section>
  );
}
