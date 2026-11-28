import { Check, X } from "lucide-react";
import { corSegura, estadoDaAplicacao, ESTADO_APLICACAO, type EstadoAplicacao } from "./timeline-logica";

export type AplicacaoVisivel = { substanceColor?: string; displayState?: string };

export function QuadradoAplicacao({ app }: { app: AplicacaoVisivel }) {
  const estado = estadoDaAplicacao(app.displayState);
  const info = ESTADO_APLICACAO[estado];
  const cor = corSegura(app.substanceColor, "#94a3b8");
  const estilo: Record<EstadoAplicacao, string> = {
    applied: "ring-2 ring-green-600", disp: "ring-2 ring-amber-500", prox: "border border-dashed border-slate-600 opacity-50",
    notPerformed: "ring-2 ring-red-700", unavailable: "opacity-30 ring-1 ring-slate-400", review: "ring-2 ring-red-700",
  };
  return (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]" aria-hidden>
      <span className={`absolute inset-0 rounded-[4px] ${estilo[estado]}`} style={{ backgroundColor: cor }} />
      {estado === "applied" && <Check className="relative h-3 w-3 text-white drop-shadow" strokeWidth={4} />}
      {(estado === "notPerformed") && <X className="relative h-3 w-3 text-white drop-shadow" strokeWidth={4} />}
      {estado === "review" && <span className="relative text-[11px] font-black text-white drop-shadow">?</span>}
      <span className="sr-only">{info.rotulo}</span>
    </span>
  );
}
