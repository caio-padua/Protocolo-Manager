import { useId } from "react";

const CYCLE_MS = 12000;
const BREATH_MS = 6200;

type Props = {
  fontSize?: number;
  cycleDelay?: number;
  className?: string;
  style?: React.CSSProperties;
};

/**
 * ParxisWordmark — CSS text com fonte geométrica Michroma + gradiente ouro 18K.
 * Segue Manual Técnico §6 (gradiente), §9 (desenho das letras), §7 (reflexos).
 */
export function ParxisWordmark({
  fontSize = 28,
  cycleDelay = 0,
  className,
  style,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const sweep  = `px-s-${uid}`;
  const spark  = `px-k-${uid}`;
  const breath = `px-b-${uid}`;
  const wrap   = `px-w-${uid}`;

  const css = `
    .${wrap} {
      position: relative;
      display: inline-flex;
      align-items: center;
      line-height: 1;
    }

    .${wrap} .px-face {
      font-family: 'Michroma', 'Rajdhani', 'Orbitron', monospace;
      font-weight: 400;
      font-size: ${fontSize}px;
      letter-spacing: 0.10em;
      text-transform: uppercase;
      line-height: 1;

      /* Gradiente ouro 18K — Manual §6.2 */
      background: linear-gradient(115deg,
        #5B2C00 0%, #9A5700 10%, #F2B817 25%,
        #FFF3A6 38%, #FFD85A 48%, #D99000 62%,
        #FFF0A0 74%, #B76C00 88%, #5B2C00 100%
      );
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;

      /* Reflexo suave externo — Manual §7.3 */
      filter:
        drop-shadow(0px 1px 0px rgba(0,0,0,0.95))
        drop-shadow(0px 2px 4px rgba(0,0,0,0.85))
        drop-shadow(0 0 8px rgba(242,184,23,0.12));

      position: relative;
      z-index: 1;
      user-select: none;
    }

    .${sweep}, .${spark}, .${breath} {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 2;
    }

    /* Respiro — Manual §26 */
    .${breath}::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(
        80% 100% at 50% 30%,
        rgba(255,216,90,0.40) 0%,
        rgba(255,180,30,0.12) 45%,
        transparent 75%
      );
      mix-blend-mode: screen;
      opacity: 0;
      animation: ${breath} ${BREATH_MS}ms ease-in-out ${cycleDelay}ms infinite;
    }
    @keyframes ${breath} {
      0%, 100% { opacity: 0.05; }
      50%       { opacity: 0.22; }
    }

    /* Reflexo longitudinal / varredura — Manual §7.1 */
    .${sweep}::before {
      content: "";
      position: absolute;
      top: -30%; bottom: -30%; left: 0; width: 50%;
      background: linear-gradient(100deg,
        transparent 0%,
        rgba(255,216,90,0.22) 35%,
        rgba(255,247,180,0.80) 50%,
        rgba(255,216,90,0.22) 65%,
        transparent 100%
      );
      mix-blend-mode: screen;
      transform: translateX(-200%) skewX(-14deg); opacity: 0;
      animation: ${sweep} ${CYCLE_MS}ms cubic-bezier(.45,0,.55,1) ${cycleDelay}ms infinite;
    }
    @keyframes ${sweep} {
      0%   { transform: translateX(-200%) skewX(-14deg); opacity: 0; }
      28%  { transform: translateX(-200%) skewX(-14deg); opacity: 0; }
      32%  { opacity: 1; }
      46%  { transform: translateX(350%) skewX(-14deg); opacity: 1; }
      49%  { transform: translateX(350%) skewX(-14deg); opacity: 0; }
      100% { transform: translateX(350%) skewX(-14deg); opacity: 0; }
    }

    /* Faísca pontual — Manual §7.2 */
    .${spark}::before {
      content: "";
      position: absolute;
      top: -30%; bottom: -30%; left: 0; width: 10%;
      background: linear-gradient(100deg,
        transparent 0%,
        rgba(255,250,220,0.95) 50%,
        transparent 100%
      );
      mix-blend-mode: screen;
      transform: translateX(-250%) skewX(-14deg); opacity: 0;
      animation: ${spark} ${CYCLE_MS}ms linear ${cycleDelay}ms infinite;
    }
    @keyframes ${spark} {
      0%   { transform: translateX(-250%) skewX(-14deg); opacity: 0; }
      3%   { transform: translateX(-250%) skewX(-14deg); opacity: 0; }
      6%   { opacity: 1; }
      22%  { transform: translateX(380%) skewX(-14deg); opacity: 1; }
      25%  { transform: translateX(380%) skewX(-14deg); opacity: 0; }
      100% { transform: translateX(380%) skewX(-14deg); opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .${sweep}::before, .${spark}::before, .${breath}::before {
        animation: none; opacity: 0;
      }
    }
  `;

  return (
    <div className={className} style={{ display: "inline-flex", ...style }}>
      <style>{css}</style>
      <div className={wrap}>
        <span className="px-face" aria-label="PARXIS">PARXIS</span>
        <div className={breath} aria-hidden="true" />
        <div className={spark}  aria-hidden="true" />
        <div className={sweep}  aria-hidden="true" />
      </div>
    </div>
  );
}

export default ParxisWordmark;
