import { useLayoutEffect, useRef, useState } from "react";
import "./M20AbaOuroRefinado.css";
import { Tela, Comandos, Chips, Grade } from "./_Moldura";

const COR = "#12294c";

/** Aba de fichario numa peca so: o contorno e calculado pela largura do conteudo, para qualquer nome. */
function Aba({ titulo, resumo, px = 16 }: { titulo: string; resumo?: string; px?: number }) {
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

  const { w, h } = dim;
  const r = 12; // ombro curvo (sobe para a faixa)
  const c = 10; // canto inferior direito
  const contorno = `M${w + r},0 A${r},${r} 0 0 0 ${w},${r} L${w},${h - c} A${c},${c} 0 0 1 ${w - c},${h} L0,${h}`;

  return (
    <div className="m20-wrap">
      {w > 0 && (
        <svg className="m20-svg" width={w + r} height={h} viewBox={`0 0 ${w + r} ${h}`} aria-hidden>
          <path d={`M0,-1 L${w + r},-1 L${w + r},0 A${r},${r} 0 0 0 ${w},${r} L${w},${h - c} A${c},${c} 0 0 1 ${w - c},${h} L0,${h} Z`} fill={COR} />
          <path d={contorno} fill="none" stroke="rgba(201,162,74,.8)" strokeWidth="1" />
        </svg>
      )}
      <div ref={ref} className="m20-conteudo" style={{ padding: "9px 20px 10px 18px" }} role="heading" aria-level={1}>
        <span className="m20-ouro" style={{ fontSize: px }}>{titulo}</span>
        {resumo && <><span className="m20-sep" aria-hidden /><span className="m20-resumo">{resumo}</span></>}
      </div>
    </div>
  );
}

export function M20AbaOuroRefinado() {
  return (
    <Tela rente>
      <div style={{ position: "relative", margin: "0 -18px", height: 46, flex: "none" }}>
        <div style={{ position: "absolute", inset: "0 0 auto 0", height: 6, background: COR, boxShadow: "0 1px 0 rgba(201,162,74,.5)" }} />
        <Aba titulo="Agenda Configuração" resumo="Horários, locais e repetições" />
      </div>
      <Comandos />
      <Chips />
      <Grade />
    </Tela>
  );
}
