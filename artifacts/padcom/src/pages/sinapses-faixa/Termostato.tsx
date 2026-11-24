import { useEffect, useRef, useState, type RefObject } from "react";

// Regua de rolagem vertical "termostato": trilho Concavo estreito e quadrado + botao retangular Saliente que desce e sobe.
// Substitui a barra nativa da coluna (escondida por CSS). Arrastar o botao, clicar no trilho ou usar as setas rola a coluna.
export function Termostato({ alvo, rotulo, testid }: { alvo: RefObject<HTMLDivElement | null>; rotulo: string; testid: string }) {
  const trilho = useRef<HTMLDivElement | null>(null);
  const [g, setG] = useState({ topo: 0, altura: 100, visivel: false, f: 0 });
  const arrasto = useRef<{ y: number; rolagem: number } | null>(null);

  useEffect(() => {
    const el = alvo.current;
    if (!el) return;
    const medir = () => {
      const total = el.scrollHeight, vis = el.clientHeight;
      const altura = Math.max(14, Math.min(100, (vis / Math.max(total, 1)) * 100));
      const livre = total - vis;
      setG({ altura, topo: livre > 0 ? (el.scrollTop / livre) * (100 - altura) : 0, visivel: livre > 1, f: livre > 0 ? el.scrollTop / livre : 0 });
    };
    medir();
    el.addEventListener("scroll", medir, { passive: true });
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => { el.removeEventListener("scroll", medir); ro.disconnect(); };
  }, [alvo]);

  const irPara = (fracao: number) => {
    const el = alvo.current;
    if (!el) return;
    el.scrollTop = Math.max(0, Math.min(1, fracao)) * (el.scrollHeight - el.clientHeight);
  };
  const fracaoDoPonteiro = (clientY: number) => {
    const r = trilho.current!.getBoundingClientRect();
    const livre = r.height * (1 - g.altura / 100);
    return livre <= 0 ? 0 : (clientY - r.top - (r.height * g.altura) / 200) / livre;
  };

  return (
    <div ref={trilho} className="sinapse-termostato concave-3d" data-testid={testid} style={{ visibility: g.visivel ? "visible" : "hidden" }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) irPara(fracaoDoPonteiro(e.clientY)); }}>
      <button type="button" role="scrollbar" aria-orientation="vertical" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.topo)}
        className="sinapse-termostato-botao bevel-3d" style={{ height: `max(${g.altura}%, 28px)`, top: `calc((100% - max(${g.altura}%, 28px)) * ${g.f})` }}
        onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); arrasto.current = { y: e.clientY, rolagem: alvo.current?.scrollTop ?? 0 }; }}
        onPointerMove={(e) => { if (arrasto.current) irPara(fracaoDoPonteiro(e.clientY)); }}
        onPointerUp={() => { arrasto.current = null; }}
        onKeyDown={(e) => {
          const el = alvo.current; if (!el) return;
          if (e.key === "ArrowDown") { el.scrollTop += 60; e.preventDefault(); }
          if (e.key === "ArrowUp") { el.scrollTop -= 60; e.preventDefault(); }
        }} />
    </div>
  );
}
