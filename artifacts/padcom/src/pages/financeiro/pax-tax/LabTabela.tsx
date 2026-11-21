import { useEffect, useState, Fragment } from "react";
import { CalendarRange } from "lucide-react";
import { Valor } from "@/components/numeral/Numeral";
import { Ajuda, campoCls, reaisParaCentavos, rotuloMes, mascaraReais } from "../pax-finance-ui";
import { brl, pct, type Mes, type Ov } from "./lab-comum";

function CelulaFat({ valor, manual, onSalva, mes }: { valor: number; manual: boolean; onSalva: (c: number | null) => void; mes: string }) {
  const [t, setT] = useState(brl(valor));
  useEffect(() => { setT(brl(valor)); }, [valor]);
  return <input className={`${campoCls} !min-h-[34px] max-w-[150px] text-right text-[13px] tabular-nums ${manual ? "!border-[#c9a24e] font-bold" : ""}`} title={manual ? "Valor digitado por você" : "Valor da curva automática"} inputMode="decimal" value={t} aria-label={`Faturamento de ${mes}`} data-testid={`lab-fat-${mes}`}
    onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
    onChange={(e) => setT(mascaraReais(e.target.value))}
    onBlur={() => { const c = reaisParaCentavos(t); if (c !== null && c !== valor) onSalva(c); else setT(brl(valor)); }} />;
}

const COLS = "grid grid-cols-[92px_minmax(150px,1.2fr)_minmax(110px,1fr)_130px_minmax(110px,1fr)_minmax(110px,1fr)_minmax(120px,1fr)] items-center gap-x-3";
const ORIGEM: Record<string, string> = { anterior_abertura: "Clínica-modelo", mes_abertura: "Mês da abertura" };
const MES3 = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Tabela mês a mês: faixas por ano (ano mais recente no topo), números no mostrador, uma coluna por assunto. */
export function TabelaMeses({ meses, ov, sel, onSel, onSalvaFat }: { meses: Mes[]; ov: Ov; sel: string | null; onSel: (m: string) => void; onSalvaFat: (mes: string, c: number | null) => void }) {
  let anoAnt = "";
  return (
    <section className="panel-3d p-4" aria-label="Mês a mês" data-testid="tabela-meses">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5"><CalendarRange className="h-4 w-4 shrink-0 text-primary" /><span className="text-[12px] font-semibold uppercase tracking-[0.12em]">Mês a mês</span><Ajuda texto="Digite o faturamento de um mês e os seguintes acompanham a partir dele. Toque na linha para abrir o Raio-X do mês." rotulo="Mês a mês" /></div>
        <p className="text-[11px] text-muted-foreground">Mais recente no topo · borda dourada = valor digitado por você</p>
      </div>
      <div className="overflow-x-auto rounded-md border border-[#b8924d]/40 bg-white/60">
        <div className="min-w-[940px]">
          <div className={`${COLS} border-b border-[#b8924d]/50 bg-[#f1e8d0] px-3 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-primary`}>
            <span>Mês</span><span className="text-right">Faturamento</span><span className="text-right">Pró-labore</span><span className="text-center">Fator R</span><span className="text-right">Carga sem</span><span className="text-right">Carga com</span><span className="text-right">Caixa</span>
          </div>
          {meses.map((m) => {
            const ano = m.mes.slice(0, 4); const novoAno = ano !== anoAnt; anoAnt = ano;
            const a = m.ativo; const ativa = sel === m.mes; const caixa = m.com.saldoCaixaCents;
            return (
              <Fragment key={m.mes}>
                {novoAno && <div className="border-b border-[#b8924d]/40 bg-gradient-to-r from-[#16284a] to-[#22406a] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.3em] text-[#f3ead6]" style={{ fontFamily: "'EB Garamond', serif" }}>{ano}</div>}
                <div className={`${COLS} cursor-pointer border-b border-[#b8924d]/20 px-3 py-2 transition-colors even:bg-[#faf6ea] hover:bg-[#c9a24e]/15 ${ativa ? "!bg-[#c9a24e]/25 shadow-[inset_3px_0_0_#c9a24e]" : ""}`}
                  onClick={() => onSel(m.mes)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSel(m.mes)} data-testid={`lab-mes-${m.mes}`}>
                  <span className="leading-tight"><b className="text-[15px] uppercase tracking-wide text-primary" style={{ fontFamily: "'EB Garamond', serif" }}>{MES3[Number(m.mes.slice(5, 7)) - 1]}</b><span className="ml-1 text-[11px] text-muted-foreground">{m.mes.slice(2, 4)}</span>{ORIGEM[m.fase.fase] && <span className="mt-0.5 block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{ORIGEM[m.fase.fase]}</span>}</span>
                  <span className="flex justify-end"><CelulaFat mes={m.mes} valor={m.sem.faturamentoCents} manual={ov[m.mes]?.faturamentoCents !== undefined} onSalva={(c) => onSalvaFat(m.mes, c)} /></span>
                  <span className="text-right text-[13px]"><Valor valor={a.proLaboreCents / 100} semCentavos planilha peso={600} /></span>
                  <span className="flex items-center justify-center gap-1.5 text-[12px] tabular-nums"><span>{pct(a.fatorRPct)}</span><span className={`rounded-[3px] border px-1.5 py-0.5 text-[10px] font-bold ${a.anexo === "III" ? "border-emerald-700/40 bg-emerald-50 text-emerald-800" : "border-amber-700/40 bg-amber-50 text-amber-800"}`}>Anexo {a.anexo}</span></span>
                  <span className="text-right text-[13px]"><Valor valor={(m.sem.tributosCents + m.sem.retencoesCents) / 100} semCentavos planilha peso={600} /></span>
                  <span className="text-right text-[13px]"><Valor valor={(m.com.tributosCents + m.com.retencoesCents) / 100} semCentavos planilha peso={600} /></span>
                  <span className={`text-right text-[13px] ${caixa !== null && caixa < 0 ? "text-destructive" : ""}`}>{caixa === null ? "—" : <Valor valor={caixa / 100} semCentavos planilha peso={700} />}</span>
                </div>
              </Fragment>
            );
          })}
        </div>
      </div>
    </section>
  );
}
