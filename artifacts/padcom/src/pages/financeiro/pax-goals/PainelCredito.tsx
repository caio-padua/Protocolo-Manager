import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CreditCard, HelpCircle } from "lucide-react";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { Percentual, Valor } from "@/components/numeral/Numeral";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { finApi } from "@/lib/pax-finance-api";
import { Campo, campoCls, reaisParaCentavos } from "../pax-finance-ui";

interface LinhaC {
  key: string; nome: string; oQueE: string; finalidade: string; campos: Record<string, string | null>; faltaInformar: Record<string, string>;
  fontes: { nome: string; url: string; consultadaEm: string }[]; conferir: string[]; tetoRotulo: string | null;
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

export function PainelCredito() {
  const [fat, setFat] = useState("");
  const [mulheres, setMulheres] = useState(false);
  const body = useMemo(() => ({ faturamentoMensalCents: reaisParaCentavos(fat), lideradaPorMulheres: mulheres }), [fat, mulheres]);
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
          <input className={`${campoCls} text-[18px] font-bold`} inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} placeholder="Digite o faturamento mensal" data-testid="credito-faturamento" autoComplete="off" />
        </Campo>
        <label className="mt-2 flex min-h-[44px] items-center gap-2 text-[12px]"><input type="checkbox" className="h-5 w-5" checked={mulheres} onChange={(e) => setMulheres(e.target.checked)} /><span>Empresa liderada por mulheres (o ProCred 360 aceita até 50% do faturamento)</span></label>
        <div className="mt-1 text-[12px]" data-testid="credito-anual">Faturamento anual (mês x 12): {p?.faturamentoAnualCents ? <b><Valor valor={p.faturamentoAnualCents / 100} /></b> : <span className="italic text-muted-foreground">— digite o faturamento mensal</span>}</div>
      </div>
      {q.isError && <p className="text-[12px] text-destructive" data-testid="fin-erro">{(q.error as Error).message}</p>}

      {p?.linhas.map((l) => (
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
          <dl className="text-[12px]">
            {p.campos.map((c) => {
              const v = l.campos[c.key];
              return (
                <div key={c.key} className="grid grid-cols-1 gap-x-3 border-t py-1.5 md:grid-cols-[13rem_minmax(0,1fr)]" data-testid={`campo-${l.key}-${c.key}`} data-vazio={v === null}>
                  <dt className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{c.rotulo}<Balao rotulo={c.rotulo} texto={c.ajuda} /></dt>
                  <dd className="break-words">{v ?? (<><span className="text-muted-foreground">—</span> <span className="italic text-muted-foreground">Falta: {l.faltaInformar[c.key] ?? "informação não consta na fonte oficial lida."}</span></>)}</dd>
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
