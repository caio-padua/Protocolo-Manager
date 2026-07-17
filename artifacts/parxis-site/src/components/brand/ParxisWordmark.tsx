import { useId } from "react";

const CYCLE_MS = 12000;
const BREATH_MS = 6200;

type Props = {
  /** largura-alvo (a altura sai por proporção da fonte) */
  width?: number;
  /** fontSize em px — controla o tamanho real das letras */
  fontSize?: number;
  cycleDelay?: number;
  className?: string;
};

export function ParxisWordmark({
  width,
  fontSize = 52,
  cycleDelay = 0,
  className,
}: Props) {
  const uid = useId().replace(/:/g, "");
  const sweep = `px-sweep-${uid}`;
  const spark = `px-spark-${uid}`;
  const breath = `px-breath-${uid}`;
  const wrap = `px-wrap-${uid}`;

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@900&display=swap');

    .${wrap} {
      position: relative;
      display: inline-flex;
      align-items: center;
      line-height: 1;
    }

    .${wrap} .px-face {
      font-family: 'Cinzel', 'Trajan Pro', 'Times New Roman', serif;
      font-weight: 900;
      font-size: ${fontSize}px;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      line-height: 1;
      padding: 0.05em 0.04em;

      /* Gradiente ouro 3D — cópia fiel do PAXTER */
      background: linear-gradient(
        180deg,
        #fffbe8 0%,
        #f5d98c 12%,
        #d4a435 35%,
        #b8882a 55%,
        #8a6522 72%,
        #c49a2e 85%,
        #f0d080 100%
      );
      -webkit-background-clip: text;
      background-clip: text;
      -webkit-text-fill-color: transparent;

      /* Bevel / profundidade via drop-shadow */
      filter:
        drop-shadow(0px 1px 0px rgba(0,0,0,0.95))
        drop-shadow(0px 2px 2px rgba(0,0,0,0.85))
        drop-shadow(0px 3px 5px rgba(0,0,0,0.6));

      position: relative;
      z-index: 1;
      user-select: none;
    }

    /* CAMADA DE LUZ — faixa dourada que varre as letras */
    .${sweep}, .${spark}, .${breath} {
      position: absolute;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 2;
    }

    /* RESPIRO: brilho suave constante */
    .${breath}::before {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(
        80% 100% at 50% 30%,
        rgba(255,240,180,0.55) 0%,
        rgba(255,230,150,0.18) 45%,
        transparent 75%
      );
      mix-blend-mode: screen;
      opacity: 0;
      animation: ${breath} ${BREATH_MS}ms ease-in-out ${cycleDelay}ms infinite;
    }
    @keyframes ${breath} {
      0%, 100% { opacity: 0.05; }
      50%       { opacity: 0.25; }
    }

    /* SOL: faixa larga e lenta */
    .${sweep}::before {
      content: "";
      position: absolute;
      top: -30%; bottom: -30%; left: 0; width: 55%;
      background: linear-gradient(100deg,
        transparent 0%,
        rgba(255,231,150,0.28) 35%,
        rgba(255,247,210,0.88) 50%,
        rgba(255,231,150,0.28) 65%,
        transparent 100%
      );
      mix-blend-mode: screen;
      transform: translateX(-180%) skewX(-14deg); opacity: 0;
      animation: ${sweep} ${CYCLE_MS}ms cubic-bezier(.45,0,.55,1) ${cycleDelay}ms infinite backwards;
    }
    @keyframes ${sweep} {
      0%   { transform: translateX(-180%) skewX(-14deg); opacity: 0; }
      26%  { transform: translateX(-180%) skewX(-14deg); opacity: 0; }
      30%  { opacity: 1; }
      45%  { transform: translateX(320%) skewX(-14deg);  opacity: 1; }
      48%  { transform: translateX(320%) skewX(-14deg);  opacity: 0; }
      100% { transform: translateX(320%) skewX(-14deg);  opacity: 0; }
    }

    /* PÓLVORA: faísca fina e rápida, varre antes do sol */
    .${spark}::before {
      content: "";
      position: absolute;
      top: -30%; bottom: -30%; left: 0; width: 12%;
      background: linear-gradient(100deg,
        transparent 0%,
        rgba(255,253,230,0.95) 50%,
        transparent 100%
      );
      mix-blend-mode: screen;
      transform: translateX(-220%) skewX(-14deg); opacity: 0;
      animation: ${spark} ${CYCLE_MS}ms linear ${cycleDelay}ms infinite backwards;
    }
    @keyframes ${spark} {
      0%   { transform: translateX(-220%) skewX(-14deg); opacity: 0; }
      2%   { transform: translateX(-220%) skewX(-14deg); opacity: 0; }
      5%   { opacity: 1; }
      21%  { transform: translateX(360%) skewX(-14deg);  opacity: 1; }
      24%  { transform: translateX(360%) skewX(-14deg);  opacity: 0; }
      100% { transform: translateX(360%) skewX(-14deg);  opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      .${sweep}::before, .${spark}::before, .${breath}::before {
        animation: none; opacity: 0;
      }
    }
  `;

  return (
    <div
      className={className}
      style={width ? { width, display: "inline-flex" } : { display: "inline-flex" }}
    >
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
