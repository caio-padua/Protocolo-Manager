import { useEffect, useState, type ReactNode } from "react";
import { Numeral } from "@/components/numeral/Numeral";
import { Ajuda, campoCls } from "../pax-finance-ui";

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


/** Seletor de período: contagem em destaque, duas datas e duas alças salientes. Arraste e solte (ou Enter) para aplicar. Não apaga dado. */
export function SeletorPeriodo({ titulo, subtitulo, ajuda, icone, meses, valor, onAplicar, id }: { titulo: string; subtitulo: string; ajuda: string; icone: ReactNode; meses: string[]; valor: [number, number]; onAplicar: (v: [number, number]) => void; id: string }) {
  const [r, setR] = useState<[number, number]>(valor);
  useEffect(() => setR(valor), [valor[0], valor[1]]);
  const max = meses.length - 1;
  const n = r[1] - r[0] + 1;
  const mudou = r[0] !== valor[0] || r[1] !== valor[1];
  const cls = "paxter-range pointer-events-none absolute inset-x-0 top-0 h-8 w-full";
  const tecla = (e: React.KeyboardEvent) => { if (e.key === "Enter") onAplicar(r); };
  const idx = (ym: string) => (meses.indexOf(ym) < 0 ? (ym < meses[0] ? 0 : max) : meses.indexOf(ym));
  return (
    <div className="panel-3d-sub space-y-4 p-4" data-testid={id}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="bevel-3d inline-flex max-w-full items-center gap-2 px-3 py-1.5">{icone}<span className="text-[12px] font-semibold uppercase tracking-[0.12em]">{titulo}</span><Ajuda texto={ajuda} rotulo={titulo} /></div>
          <p className="text-[11px] leading-snug text-muted-foreground">{subtitulo}</p>
        </div>
        <div className="screen-3d flex min-w-[92px] shrink-0 flex-col items-center px-4 py-2.5" data-testid={`${id}-texto`} aria-label={`${n} ${n === 1 ? "mês" : "meses"}`}>
          <Numeral peso={800} className="text-[40px] leading-none text-primary">{n}</Numeral>
          <span className="mt-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-muted-foreground">{n === 1 ? "mês" : "meses"}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <CampoData id={`${id}-de`} rotulo="Data inicial" valor={dataIni(meses[r[0]])} onValida={(ym) => { const i = Math.min(idx(ym), r[1]); const nv: [number, number] = [i, r[1]]; setR(nv); onAplicar(nv); }} />
        <CampoData id={`${id}-ate`} rotulo="Data final" valor={dataFim(meses[r[1]])} onValida={(ym) => { const i = Math.max(idx(ym), r[0]); const nv: [number, number] = [r[0], i]; setR(nv); onAplicar(nv); }} />
      </div>
      <div>
        <div className="relative mx-3 h-8">
          <div className="concave-3d absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-[3px]" />
          <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded-[3px] border border-[#8a6a2c] bg-gradient-to-b from-[#e3c477] via-[#c9a24e] to-[#a37e32] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]" style={{ left: `${(r[0] / max) * 100}%`, right: `${100 - (r[1] / max) * 100}%` }} />
          <input type="range" className={cls} min={0} max={max} value={r[0]} aria-label={`${titulo}: mês inicial`} onKeyDown={tecla} onPointerUp={() => onAplicar(r)} onChange={(e) => setR([Math.min(Number(e.target.value), r[1]), r[1]])} />
          <input type="range" className={cls} min={0} max={max} value={r[1]} aria-label={`${titulo}: mês final`} onKeyDown={tecla} onPointerUp={() => onAplicar(r)} onChange={(e) => setR([r[0], Math.max(Number(e.target.value), r[0])])} />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[10px] tabular-nums text-muted-foreground"><span>{dataIni(meses[0])}</span><span className="italic">{mudou ? "Solte ou aperte Enter para aplicar" : "Arraste as alças"}</span><span>{dataFim(meses[max])}</span></div>
      </div>
    </div>
  );
}
