import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, HelpCircle } from "lucide-react";
import { BlockTitle } from "@/components/settings/SettingsUI";
import { Percentual, Valor } from "@/components/numeral/Numeral";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { finApi } from "@/lib/pax-finance-api";
import { Campo, campoCls, reaisParaCentavos, InputReais } from "../pax-finance-ui";

type Estado = "calculado" | "vazio" | "informativo" | "nao_se_aplica";
interface Linha { chave: string; rotulo: string; sigla: string; valorCents: number | null; pct: number | null; estado: Estado; soma: boolean; motivo: string | null; detalhe: string | null; explicacao: { oQueE: string; quemPaga: string; comoCalcula: string; fontes: { nome: string; url: string }[] } }
interface Regime { key: string; nome: string; texto: string; disponivel: boolean; motivoIndisponivel: string | null; completo: boolean; linhas: Linha[]; subtotalCents: number | null; subtotalPct: number | null; liquidoCents: number | null; pendencias: string[]; memoria: string[] }
interface Painel {
  aviso: string; conferencia: string; consultadoEm: string; entrada: { faturamentoMensalCents: number; rbt12Cents: number; rbt12Estimado: boolean };
  fatorR: { razaoPct: number | null; limitePct: number; anexo: "III" | "V" | null; avisos: string[]; explicacao: string };
  emFoco: string; regimes: Regime[]; comparacao: { menorCarga: string; menorCargaKey: string } | null;
  socio: { linhas: Linha[]; subtotalCents: number | null; subtotalPct: number | null; completo: boolean; memoria: string[] }; nota: string;
}

const dec = (t: string): number | null => { const s = t.replace(/\./g, "").replace(/[^\d,]/g, "").replace(",", "."); if (!s) return null; const n = Number(s); return Number.isFinite(n) ? n : null; };

/** Balão de explicação: abre com clique ou toque (celular não tem hover). Mostra o que é, quem paga, como calcula e a fonte. */
function Balao({ l }: { l: Linha }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Explicação: ${l.rotulo}`} data-testid={`balao-${l.chave}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-foreground md:h-7 md:w-7">
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-1.5 text-[12px] leading-snug" side="top">
        <div className="font-bold">{l.rotulo} ({l.sigla})</div>
        <div><b>O que é:</b> {l.explicacao.oQueE}</div>
        <div><b>Quem paga:</b> {l.explicacao.quemPaga}</div>
        <div><b>Como se calcula:</b> {l.explicacao.comoCalcula}</div>
        <div className="break-words"><b>Fonte oficial:</b>{" "}{l.explicacao.fontes.map((f) => <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="block underline">{f.nome}</a>)}</div>
      </PopoverContent>
    </Popover>
  );
}

const GRADE = "grid grid-cols-2 items-start gap-x-2 md:grid-cols-[minmax(0,1fr)_10rem_5rem]";
const NOME = "col-span-2 min-w-0 md:col-span-1";

function LinhaTributo({ l }: { l: Linha }) {
  const vazio = l.valorCents === null;
  return (
    <div className={`${GRADE} border-t py-1.5`} data-testid={`linha-${l.chave}`} data-estado={l.estado}>
      <div className={NOME}>
        <div className="flex items-center gap-1 text-[13px] font-bold"><span className="min-w-0 break-words">{l.rotulo}</span><Balao l={l} /></div>
        {l.estado === "informativo" && <div className="text-[11px] text-muted-foreground">Informativo (não soma no total)</div>}
        {vazio && l.motivo && <div className="text-[11px] italic text-muted-foreground" data-testid={`motivo-${l.chave}`}>{l.estado === "nao_se_aplica" ? "Não se aplica: " : "Falta: "}{l.motivo}</div>}
        {!vazio && l.detalhe && <div className="text-[11px] text-muted-foreground">{l.detalhe}</div>}
      </div>
      <div className="pt-0.5 text-left text-[14px] tabular-nums md:text-right"><span className="mr-1 text-[10px] font-bold uppercase text-muted-foreground md:hidden">Valor</span>{vazio ? <span className="text-muted-foreground" aria-label="sem valor">—</span> : <Valor valor={l.valorCents! / 100} />}</div>
      <div className="pt-0.5 text-right text-[13px] tabular-nums"><span className="mr-1 text-[10px] font-bold uppercase text-muted-foreground md:hidden">% do fat.</span>{l.pct === null ? <span className="text-muted-foreground" aria-label="sem percentual">—</span> : <Percentual valor={l.pct} casas={2} />}</div>
    </div>
  );
}

const Cabecalho = () => (
  <div className={`${GRADE} max-md:hidden pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground`}><span>Tributo</span><span className="text-right">Valor (R$)</span><span className="text-right">% do faturamento</span></div>
);

function Total({ rotulo, centavos, pct, id, forte, parcial }: { rotulo: string; centavos: number | null; pct: number | null; id: string; forte?: boolean; parcial?: boolean }) {
  return (
    <div className={`${GRADE} border-t-2 py-2 ${forte ? "text-[15px] font-bold" : "text-[14px] font-bold"}`} data-testid={id}>
      <div className={NOME}>{rotulo}{parcial && <span className="ml-1 text-[11px] font-normal italic text-muted-foreground">(parcial: faltam dados acima)</span>}</div>
      <div className="text-left tabular-nums md:text-right">{centavos === null ? <span className="text-muted-foreground">—</span> : <Valor valor={centavos / 100} />}</div>
      <div className="text-right tabular-nums">{pct === null ? <span className="text-muted-foreground">—</span> : <Percentual valor={pct} casas={2} />}</div>
    </div>
  );
}

export function PainelTributario() {
  const [f, setF] = useState({ fat: "", rbt: "", folha: "", pl: "", desp: "", div: "", iss: "", rat: "", terc: "", hosp: false });
  const [reg, setReg] = useState<string | null>(null);
  const body = useMemo(() => ({
    faturamentoMensalCents: reaisParaCentavos(f.fat), rbt12Cents: reaisParaCentavos(f.rbt), folhaMensalCents: reaisParaCentavos(f.folha), proLaboreMensalCents: reaisParaCentavos(f.pl),
    despesasMensaisCents: reaisParaCentavos(f.desp), distribuicaoLucrosMensalCents: reaisParaCentavos(f.div), issAliquotaPct: dec(f.iss), ratPct: dec(f.rat), terceirosPct: dec(f.terc), hospitalar: f.hosp,
  }), [f]);
  const [deb, setDeb] = useState(body);
  useEffect(() => { const t = setTimeout(() => setDeb(body), 350); return () => clearTimeout(t); }, [body]);
  const q = useQuery({ queryKey: ["fin-tax-panel", deb], queryFn: () => finApi<Painel>("/tax/panel", { method: "POST", body: deb }), placeholderData: (p) => p });
  const p = q.data;
  const atual = p ? p.regimes.find((r) => r.key === (reg ?? p.emFoco)) ?? p.regimes[0] : null;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  return (
    <section className="panel-3d space-y-4 p-4" data-testid="painel-tributario">
      <BlockTitle icon={Calculator}>Quanto de imposto sai do faturamento</BlockTitle>
      <p className="rounded bg-muted p-2 text-[12px] font-bold">Simulação. Não é apuração oficial e não altera guias, notas, cobranças nem cadastro. As regras foram lidas em fontes oficiais em 21/11/2026; a conferência humana foi dispensada nesta etapa e continua pendente.</p>

      <div className="panel-3d-sub p-3">
        <Campo rotulo="Faturamento do mês (R$)" ajuda="Digite quanto a empresa fatura em um mês. Tudo abaixo é recalculado enquanto você digita. Nenhum valor vem pronto.">
          <input className={`${campoCls} text-[18px] font-bold`} inputMode="decimal" value={f.fat} onChange={set("fat")} placeholder="Digite o faturamento mensal" data-testid="painel-faturamento" autoComplete="off" />
        </Campo>
        <details className="mt-3" open>
          <summary className="min-h-[44px] cursor-pointer text-[12px] font-bold uppercase leading-[44px] md:min-h-0 md:leading-normal">Dados que mudam o cálculo (todos opcionais)</summary>
          <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-3">
            <Campo rotulo="Faturamento dos últimos 12 meses (R$)" ajuda="Define a faixa do Simples. Vazio: o sistema usa o faturamento do mês x 12 e avisa que é estimativa."><InputReais className={campoCls}  value={f.rbt} onChange={set("rbt")} placeholder="Vazio = mês x 12" data-testid="painel-rbt12" /></Campo>
            <Campo rotulo="Folha dos empregados por mês (R$)" ajuda="Salários dos empregados com carteira. Entra no Fator R, no INSS da empresa, no RAT, em terceiros e no FGTS."><InputReais className={campoCls}  value={f.folha} onChange={set("folha")} placeholder="Sem empregados: deixe vazio" data-testid="painel-folha" /></Campo>
            <Campo rotulo="Pró-labore dos sócios por mês (R$)" ajuda="Salário que os sócios retiram. Entra no Fator R, no INSS da empresa (fora do Simples) e no INSS e imposto de renda do sócio."><InputReais className={campoCls}  value={f.pl} onChange={set("pl")} placeholder="Vazio" data-testid="painel-prolabore" /></Campo>
            <Campo rotulo="Alíquota de ISS do município (%)" ajuda="Imposto sobre serviços da cidade da empresa. A lei federal permite de 2% a 5% para medicina. Pergunte ao contador ou veja a lei do município."><input className={campoCls} inputMode="decimal" value={f.iss} onChange={set("iss")} placeholder="Ex.: informe a da sua cidade" data-testid="painel-iss" /></Campo>
            <Campo rotulo="RAT (%)" ajuda="Adicional de INSS pelo risco da atividade: 1%, 2% ou 3% sobre a folha dos empregados. Depende do CNAE; peça ao contador."><input className={campoCls} inputMode="decimal" value={f.rat} onChange={set("rat")} placeholder="1, 2 ou 3" /></Campo>
            <Campo rotulo="Terceiros (%)" ajuda="Contribuições a Sesc, Senac, Sebrae e outros, sobre a folha. A alíquota depende do enquadramento da empresa; peça ao contador."><input className={campoCls} inputMode="decimal" value={f.terc} onChange={set("terc")} placeholder="Peça ao contador" /></Campo>
            <Campo rotulo="Despesas dedutíveis por mês (R$)" ajuda="Só para o Lucro Real, que cobra sobre o lucro de verdade (faturamento menos despesas)."><InputReais className={campoCls}  value={f.desp} onChange={set("desp")} placeholder="Só Lucro Real" /></Campo>
            <Campo rotulo="Lucros distribuídos aos sócios por mês (R$)" ajuda="Dinheiro do lucro que os sócios retiram. Em 2026, acima de R$ 50.000 por mês por sócio há retenção de 10% sobre o total."><InputReais className={campoCls}  value={f.div} onChange={set("div")} placeholder="Vazio" /></Campo>
            <label className="flex min-h-[44px] items-center gap-2 text-[12px] md:self-end">
              <input type="checkbox" checked={f.hosp} onChange={(e) => setF({ ...f, hosp: e.target.checked })} className="h-5 w-5" data-testid="painel-hospitalar" />
              <span>Serviços hospitalares ou de apoio diagnóstico (presunção de 8% no Lucro Presumido)</span>
            </label>
          </div>
        </details>
      </div>

      {q.isError && <p className="text-[12px] text-destructive" data-testid="fin-erro">{(q.error as Error).message}</p>}

      {p && atual && (<>
        <div className="panel-3d-sub p-3 text-[12px]" data-testid="painel-fator-r">
          <b>Fator R:</b> {p.fatorR.razaoPct === null ? <i className="text-muted-foreground">— </i> : <Percentual valor={p.fatorR.razaoPct} casas={2} />} (limite de {p.fatorR.limitePct}% para o Anexo III) · anexo indicado: <b>{p.fatorR.anexo ?? "—"}</b>
          {p.fatorR.avisos.map((a) => <div key={a} className="italic text-muted-foreground">Falta: {a}</div>)}
          <div className="mt-1 text-muted-foreground">{p.fatorR.explicacao}</div>
          {p.entrada.rbt12Estimado && p.entrada.faturamentoMensalCents > 0 && <div className="mt-1 text-muted-foreground">Faturamento de 12 meses estimado em {(p.entrada.rbt12Cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} (mês x 12).</div>}
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Regime tributário" data-testid="painel-regimes">
          {p.regimes.map((r) => (
            <button key={r.key} type="button" role="tab" aria-selected={r.key === atual.key} onClick={() => setReg(r.key)} data-testid={`regime-${r.key}`}
              className={`${r.key === atual.key ? "btn-3d-gold" : "bevel-3d"} min-h-[44px] rounded-md px-3 text-[12px] font-bold uppercase md:min-h-[36px]`}>
              {r.nome}{p.comparacao?.menorCargaKey === r.key ? " (menor carga)" : ""}{r.key === p.emFoco && !p.comparacao ? " (indicado)" : ""}
            </button>))}
        </div>

        <div className="panel-3d-sub p-3" data-testid={`quadro-${atual.key}`}>
          <h3 className="text-[14px] font-bold uppercase">{atual.nome}</h3>
          <p className="mb-2 text-[12px] text-muted-foreground">{atual.texto}</p>
          {!atual.disponivel && <p className="mb-2 rounded bg-muted p-2 text-[12px] font-bold" data-testid="regime-indisponivel">Indisponível: {atual.motivoIndisponivel}</p>}
          <Cabecalho />
          {atual.linhas.map((l) => <LinhaTributo key={l.chave} l={l} />)}
          <Total rotulo="Total de impostos" centavos={atual.subtotalCents} pct={atual.subtotalPct} id="total-impostos" forte parcial={atual.subtotalCents !== null && !atual.completo} />
          <Total rotulo="Valor líquido após impostos" centavos={atual.liquidoCents} pct={atual.subtotalPct === null ? null : Math.round((100 - atual.subtotalPct) * 100) / 100} id="valor-liquido" forte />
          {atual.pendencias.length > 0 && <p className="mt-2 text-[12px] italic text-muted-foreground" data-testid="painel-pendencias">Para fechar o total: {atual.pendencias.join("; ")}.</p>}
          {atual.memoria.length > 0 && <details className="mt-2 text-[12px]"><summary className="min-h-[44px] cursor-pointer font-bold leading-[44px] md:min-h-0 md:leading-normal">Memória de cálculo</summary><ul className="list-disc pl-5">{atual.memoria.map((m) => <li key={m}>{m}</li>)}</ul></details>}
        </div>

        <div className="panel-3d-sub p-3" data-testid="quadro-socio">
          <h3 className="text-[14px] font-bold uppercase">Do sócio (pessoa física, fora da conta da empresa)</h3>
          <p className="mb-2 text-[12px] text-muted-foreground">Estes valores saem do bolso do sócio, retidos pela empresa. Não entram no total de impostos da empresa acima.</p>
          <Cabecalho />
          {p.socio.linhas.map((l) => <LinhaTributo key={l.chave} l={l} />)}
          <Total rotulo="Total retido do sócio" centavos={p.socio.subtotalCents} pct={p.socio.subtotalPct} id="total-socio" parcial={p.socio.subtotalCents !== null && !p.socio.completo} />
          {p.socio.memoria.length > 0 && <details className="mt-2 text-[12px]"><summary className="min-h-[44px] cursor-pointer font-bold leading-[44px] md:min-h-0 md:leading-normal">Memória de cálculo do sócio</summary><ul className="list-disc pl-5">{p.socio.memoria.map((m) => <li key={m}>{m}</li>)}</ul></details>}
        </div>
        <p className="text-[11px] text-muted-foreground">{p.nota} {p.conferencia}</p>
      </>)}
    </section>
  );
}
