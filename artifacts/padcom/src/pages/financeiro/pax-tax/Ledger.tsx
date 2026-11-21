import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { Valor } from "@/components/numeral/Numeral";
import { finApi, type FinLedger } from "@/lib/pax-finance-api";
import { Indicador } from "../pax-finance-ui";

const ESTADO: Record<string, string> = { recebido: "Recebido", a_receber: "A receber", vencido: "Vencido" };
export function LedgerAba() {
  const l = useQuery({ queryKey: ["fin", "ledger"], queryFn: () => finApi<FinLedger>("/ledger") });
  const d = l.data;
  return (
    <section className="panel-3d p-4" data-testid="pax-ledger">
      <BlockTitle icon={BookOpen}>Apuração, guias e livro-caixa gerencial</BlockTitle>
      <p className="mb-3 text-[12px] text-muted-foreground">Somente leitura dos pagamentos desta empresa (Asaas e cobranças locais). Não emite nota, não transfere e não altera cobranças. Apuração e guias oficiais ainda não existem: aqui só há o caixa gerencial.</p>
      {l.isLoading && <p className="text-[12px]">Carregando…</p>}
      {l.isError && <p className="text-[12px] text-destructive">{(l.error as Error).message}</p>}
      {d && (<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Indicador rotulo="Recebido" ajuda="Cobranças pagas." centavos={d.totais.recebidoPagamentosCents} />
          <Indicador rotulo="A receber" ajuda="Cobranças pendentes ou vencidas." centavos={d.totais.aReceberCents} />
          <Indicador rotulo="Despesas e guias pagas" ajuda="Lançamentos manuais realizados." centavos={d.totais.despesasPagasCents + d.totais.guiasPagasCents} />
          <Indicador rotulo="Caixa líquido" ajuda="Recebido mais receitas manuais, menos despesas e guias pagas." centavos={d.totais.caixaLiquidoCents} />
        </div>
        <div className="mt-4 hidden md:block">
          <table className="w-full text-[12px]"><thead><tr className="text-left text-[10px] uppercase text-muted-foreground"><th>Referência</th><th>Origem</th><th>Estado</th><th>Data</th><th className="text-right">Valor</th></tr></thead>
            <tbody>{d.pagamentos.map((p) => <tr key={p.referencia} className="border-t border-border/40"><td>{p.referencia}</td><td>{p.origem}</td><td>{ESTADO[p.estado] ?? p.estado}</td><td>{p.data ?? "—"}</td><td className="text-right"><Valor valor={p.valorCents / 100} /></td></tr>)}</tbody></table>
        </div>
        <div className="mt-4 space-y-2 md:hidden">{d.pagamentos.map((p) => (
          <div key={p.referencia} className="panel-3d-sub flex items-center justify-between p-3 text-[12px]"><span>{p.referencia}<br /><span className="text-muted-foreground">{ESTADO[p.estado] ?? p.estado} · {p.data ?? "—"}</span></span><Valor valor={p.valorCents / 100} /></div>))}</div>
        {d.pagamentos.length === 0 && <p className="mt-3 text-[12px] italic text-muted-foreground">Nenhum pagamento desta empresa.</p>}
        <p className="mt-2 text-[11px] text-muted-foreground">{d.modo}</p>
      </>)}
    </section>
  );
}
