// BRILHO DE TEXTO PAXTER — para a frase "CLINICAL INTELLIGENCE SYSTEM".
// A frase e TEXTO (nao um desenho vetorial), entao nao usa o motor SVG de glint;
// em vez disso, uma faixa de luz dourada VARRE o texto na MESMA cadencia do motor
// (ciclo de 12s, janela curta de luz, fases 0/26/30/45/48/100).
//
// Regra de seguranca (memoria paxter-botoes-validados): a cor SOLIDA fica sempre
// embaixo (legivel); a faixa de luz vem por cima recortada no texto (background-clip)
// em mix-blend-mode:screen — so CLAREIA. Se a faixa sumir, a base permanece.
import { useId, type CSSProperties, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** cor solida de base (sempre visivel) */
  color: string;
  /** atraso do ciclo (para entrar depois do simbolo e do nome) */
  cycleDelay?: number;
  className?: string;
  style?: CSSProperties;
};

export function PaxterTextShimmer({ children, color, cycleDelay = 1700, className, style }: Props) {
  const uid = useId().replace(/:/g, "");
  const anim = `pts-${uid}`;
  const css = `
    .${anim}-wrap { position: relative; display: inline-block; }
    .${anim}-shine {
      position: absolute; inset: 0; pointer-events: none;
      color: transparent;
      background-image: linear-gradient(100deg,
        transparent 38%,
        rgba(255,245,205,0.55) 47%,
        rgba(255,250,230,0.95) 50%,
        rgba(255,245,205,0.55) 53%,
        transparent 62%);
      background-size: 240% 100%;
      background-repeat: no-repeat;
      -webkit-background-clip: text;
      background-clip: text;
      mix-blend-mode: screen;
      /* a sombra/relevo vive so na base; a faixa de luz nao herda (evita sombra dupla) */
      text-shadow: none;
      opacity: 0;
      animation: ${anim} 12000ms linear ${cycleDelay}ms infinite backwards;
    }
    @keyframes ${anim} {
      0%   { background-position: 220% 0; opacity: 0; }
      26%  { background-position: 220% 0; opacity: 0; }
      30%  { opacity: 1; }
      45%  { background-position: -120% 0; opacity: 1; }
      48%  { background-position: -120% 0; opacity: 0; }
      100% { background-position: -120% 0; opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .${anim}-shine { display: none; }
    }
  `;
  return (
    <span className={`${anim}-wrap ${className ?? ""}`} style={{ color, ...style }}>
      <style>{css}</style>
      {children}
      <span className={`${anim}-shine`} aria-hidden="true">
        {children}
      </span>
    </span>
  );
}
