import { useLayoutEffect, useRef, useState } from "react";
import "./AbaTitulo.css";
import { useFraseAbaAtual } from "./abaTopo";

const COR = "hsl(var(--sidebar))";
const OMBRO = 12; // curva que sobe para a faixa
const CANTO = 10; // canto inferior direito

/**
 * Aba de fichario numa peca so: o contorno e UM caminho vetorial calculado pela largura real do
 * conteudo, entao serve para qualquer nome e qualquer resumo. Plana (sem relevo), so o nome dentro; resumo fora, a direita.
 */
export function AbaTitulo({ titulo, resumo }: { titulo: string | null; resumo?: string | null }) {
  const fraseTela = useFraseAbaAtual();
  resumo = fraseTela ?? resumo;
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
  }, [titulo, resumo]);

  if (!titulo) return null;
  const { w, h } = dim;
  const r = OMBRO;
  const c = CANTO;

  return (
    <div className="aba-teto">
      <div className="aba-teto-faixa" aria-hidden />
      <div className="aba-wrap">
        {w > 0 && (
          <svg className="aba-svg" width={w + r} height={h} viewBox={`0 0 ${w + r} ${h}`} aria-hidden>
            <path d={`M0,-1 L${w + r},-1 L${w + r},0 A${r},${r} 0 0 0 ${w},${r} L${w},${h - c} A${c},${c} 0 0 1 ${w - c},${h} L0,${h} Z`} style={{ fill: COR }} />
                      </svg>
        )}
        <div ref={ref} className="aba-conteudo" role="heading" aria-level={1}>
          <span className="aba-t">{titulo}</span>
        </div>
        {resumo && w > 0 ? <div className="aba-s" style={{ left: w + r + 14 }}>{resumo}</div> : null}
      </div>
      <div id="aba-acoes" className="aba-acoes" />
    </div>
  );
}
