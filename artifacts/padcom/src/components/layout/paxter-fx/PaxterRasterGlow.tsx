// MOTOR UNICO da LUZ sobre ARTE RASTER (decisao do CEO 24/06/2026).
//
// A face usa a arte OFICIAL aprovada (contorno liso, bisel 3D real). A luz (o "sol
// passando" + a "polvora" + o "respiro" especular) corre por cima recortada pela
// MESMA arte LIMPA via `mask-image` — entao a luz NUNCA serrilha ("carcomido nos
// raios" vinha do motor SVG, que recortava a luz pelos paths do potrace ondulado).
//
// Este motor e GENERICO: recebe a face (png/webp), a arte limpa (mascara da luz e
// face no tom claro) e as dimensoes. Os wrappers PaxterWordmarkArt (so "PAXTER") e
// PaxterHeadlineArt ("PAXTER" + "Clinical Intelligence System") usam o MESMO motor —
// nunca um fork (memoria paxter-glint-motor-unico).
//
// TIMING (luxo = contencao): ciclo de 12s igual ao do simbolo, para NUNCA derivarem
// entre si. Dentro do ciclo: polvora (fases ~2->24) -> sol (fases 26->48) -> descanso.
// O RESPIRO especular (Opcao A escolhida pelo CEO) e uma camada ADICIONAL: um brilho
// dourado suave que pulsa devagar (6,2s) o ciclo todo, sem mexer na base spark+sweep.
// `cycleDelay` faz a luz "descer" do simbolo para o nome/frase (cascata).
import { useId } from "react";

const CYCLE_MS = 12000;
const BREATH_MS = 6200;

type Props = {
  /** arte oficial COM sombra (usada no tom escuro/navy) */
  facePng: string;
  /** webp opcional da face escura */
  faceWebp?: string;
  /** arte LIMPA (sem sombra): mascara da luz SEMPRE; e face no tom claro */
  faceCleanPng: string;
  /** largura em pixels (altura sai por proporcao da arte) */
  width?: number;
  /** fundo onde a arte mora. dark=navy (arte oficial c/ sombra). light=creme (arte limpa). */
  tone?: "dark" | "light";
  /** atraso do ciclo de luz, p/ a luz descer do simbolo para o nome/frase (cascata) */
  cycleDelay?: number;
  className?: string;
  alt?: string;
};

export function PaxterRasterGlow({
  facePng,
  faceWebp,
  faceCleanPng,
  width = 168,
  tone = "dark",
  cycleDelay = 900,
  className,
  alt = "PAXTER",
}: Props) {
  const uid = useId().replace(/:/g, "");
  const sweep = `prg-sweep-${uid}`; // o "sol" (faixa larga especular)
  const spark = `prg-spark-${uid}`; // a "polvora" (faisca fina, corre antes)
  const breath = `prg-breath-${uid}`; // o "respiro" especular (brilho que pulsa devagar o ciclo todo)
  const isLight = tone === "light";
  // A MASCARA da luz e SEMPRE a arte LIMPA (silhueta lisa das letras), nunca a
  // oficial com sombra — assim a luz cai so nas letras, sem vazar na sombra e sem serrilhar.
  const maskUrl = `url(${faceCleanPng})`;

  const css = `
    .${sweep}, .${spark}, .${breath} {
      position: absolute; inset: 0; pointer-events: none; overflow: hidden;
      mix-blend-mode: screen;
      -webkit-mask-image: ${maskUrl}; mask-image: ${maskUrl};
      -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
      -webkit-mask-size: contain; mask-size: contain;
      -webkit-mask-position: center; mask-position: center;
    }
    /* o RESPIRO especular: brilho dourado suave que PULSA devagar o ciclo todo.
       Camada ADICIONAL (Opcao A) — nao toca na base spark+sweep. */
    .${breath}::before {
      content: ""; position: absolute; inset: 0;
      background: radial-gradient(78% 135% at 50% 42%,
        rgba(255,240,200,0.62) 0%, rgba(255,236,190,0.22) 38%, transparent 70%);
      opacity: 0;
      animation: ${breath} ${BREATH_MS}ms ease-in-out ${cycleDelay}ms infinite;
    }
    @keyframes ${breath} {
      0%, 100% { opacity: 0.02; }
      50%      { opacity: 0.17; }
    }
    /* o SOL: faixa dourada larga, ease-in-out, atravessa e descansa */
    .${sweep}::before {
      content: ""; position: absolute; top: -30%; bottom: -30%; left: 0; width: 56%;
      background: linear-gradient(100deg,
        transparent 0%,
        rgba(255,231,150,0.32) 38%,
        rgba(255,247,214,0.92) 50%,
        rgba(255,231,150,0.32) 62%,
        transparent 100%);
      transform: translateX(-180%) skewX(-14deg); opacity: 0;
      animation: ${sweep} ${CYCLE_MS}ms cubic-bezier(.45,0,.55,1) ${cycleDelay}ms infinite backwards;
    }
    @keyframes ${sweep} {
      0%   { transform: translateX(-180%) skewX(-14deg); opacity: 0; }
      26%  { transform: translateX(-180%) skewX(-14deg); opacity: 0; }
      30%  { opacity: 1; }
      45%  { transform: translateX(320%) skewX(-14deg); opacity: 1; }
      48%  { transform: translateX(320%) skewX(-14deg); opacity: 0; }
      100% { transform: translateX(320%) skewX(-14deg); opacity: 0; }
    }
    /* a POLVORA: faisca fina e quente, corre ANTES do sol */
    .${spark}::before {
      content: ""; position: absolute; top: -30%; bottom: -30%; left: 0; width: 13%;
      background: linear-gradient(100deg, transparent 0%, rgba(255,253,235,0.95) 50%, transparent 100%);
      transform: translateX(-220%) skewX(-14deg); opacity: 0;
      animation: ${spark} ${CYCLE_MS}ms linear ${cycleDelay}ms infinite backwards;
    }
    @keyframes ${spark} {
      0%   { transform: translateX(-220%) skewX(-14deg); opacity: 0; }
      2%   { transform: translateX(-220%) skewX(-14deg); opacity: 0; }
      5%   { opacity: 1; }
      21%  { transform: translateX(360%) skewX(-14deg); opacity: 1; }
      24%  { transform: translateX(360%) skewX(-14deg); opacity: 0; }
      100% { transform: translateX(360%) skewX(-14deg); opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .${sweep}::before, .${spark}::before, .${breath}::before { animation: none; opacity: 0; }
    }
  `;

  return (
    <div className={className} style={{ position: "relative", width, lineHeight: 0 }}>
      <style>{css}</style>
      {/* FACE: arte oficial (escuro c/ sombra embutida; claro = arte limpa sem halo) */}
      {isLight ? (
        <img
          src={faceCleanPng}
          alt={alt}
          draggable={false}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      ) : (
        <picture>
          {faceWebp && <source srcSet={faceWebp} type="image/webp" />}
          <img
            src={facePng}
            alt={alt}
            draggable={false}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </picture>
      )}
      {/* LUZ por cima, recortada na silhueta LISA das letras */}
      <div className={breath} aria-hidden="true" />
      <div className={spark} aria-hidden="true" />
      <div className={sweep} aria-hidden="true" />
    </div>
  );
}

export default PaxterRasterGlow;
