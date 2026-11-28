import { useLayoutEffect, useRef, useState } from "react";
import "./M20AbaNomeEResumoFora.css";
import { Tela, Comandos, Chips, Grade } from "./_Moldura";

const COR = "#12294c";

/** Aba de fichario numa peca so (contorno por SVG): so o NOME fica dentro; o resumo fica FORA, a direita da aba. */
function Aba({ titulo, resumo }: { titulo: string; resumo: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setDim({ w: el.offsetWidth, h: el.offsetHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    document.fonts?.ready.then(medir);
    return () => ro.disconnect();
  }, [titulo]);
  const { w, h } = dim;
  const r = 12, c = 10;
  return (
    <div className="m20-wrap">
      {w > 0 && (
        <svg className="m20-svg" width={w + r} height={h} viewBox={`0 0 ${w + r} ${h}`} aria-hidden>
          <path d={`M0,-1 L${w + r},-1 L${w + r},0 A${r},${r} 0 0 0 ${w},${r} L${w},${h - c} A${c},${c} 0 0 1 ${w - c},${h} L0,${h} Z`} fill={COR} />
        </svg>
      )}
      <div ref={ref} className="m20-nome" role="heading" aria-level={1}>{titulo}</div>
      <div className="m20-resumo" style={{ left: w + r + 14 }}>{resumo}</div>
    </div>
  );
}

export function M20AbaNomeEResumoFora() {
  return (
    <Tela rente>
      <div style={{ position: "relative", margin: "0 -18px", height: 40, flex: "none" }}>
        <div style={{ position: "absolute", inset: "0 0 auto 0", height: 6, background: COR }} />
        <Aba titulo="Agenda Configuração" resumo="Horários, locais e repetições" />
      </div>
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
