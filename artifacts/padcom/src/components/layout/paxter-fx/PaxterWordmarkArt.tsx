// PALAVRA "PAXTER" = ARTE OFICIAL (raster) + LUZ VIVA por cima.
//
// Por que existe (decisao do CEO 24/06/2026): a face usa a arte OFICIAL aprovada
// (contorno liso, bisel 3D real). A luz (o "sol passando" + a "polvora") corre por
// cima recortada pela MESMA arte LISA via `mask-image` — entao a luz NUNCA serrilha
// ("carcomido nos raios" vinha do motor SVG, que recortava a luz pelos paths do
// potrace ondulado). Mesma tecnica do `.symbol-glint` do rodape (mask + screen).
//
// TIMING (psicologia de atencao / luxo): ciclo de 12s igual ao do simbolo e do
// subtitulo, para NUNCA derivarem entre si (sincronia = elegancia, sem piscar
// irregular). Dentro do ciclo: evento curto + descanso longo (luxo = contencao).
// Fases travadas nas MESMAS do motor unico: a polvora (faisca fina) corre primeiro
// (fases ~2->24), depois o sol (faixa larga especular, fases 26->48); o resto do
// ciclo e descanso. `cycleDelay` faz a luz "descer" do simbolo para o nome (cascata).
import { useId } from "react";
import paxterPaxterPng from "@/assets/brand/paxter-paxter.png";
import paxterPaxterWebp from "@/assets/brand/paxter-paxter.webp";
import paxterPaxterCleanPng from "@/assets/brand/paxter-paxter-clean.png";

type Props = {
  /** largura em pixels (altura sai por proporcao da arte) */
  width?: number;
  /** fundo onde a palavra mora. dark=navy (arte oficial c/ sombra). light=creme (arte sem halo). */
  tone?: "dark" | "light";
  /** atraso do ciclo de luz, p/ a luz descer do simbolo para o nome (cascata) */
  cycleDelay?: number;
  className?: string;
};

const CYCLE_MS = 12000;

export function PaxterWordmarkArt({ width = 168, tone = "dark", cycleDelay = 900, className }: Props) {
  const uid = useId().replace(/:/g, "");
  const sweep = `pwa-sweep-${uid}`; // o "sol" (faixa larga especular)
  const spark = `pwa-spark-${uid}`; // a "polvora" (faisca fina, corre antes)
  const isLight = tone === "light";
  // A MASCARA da luz e SEMPRE a arte LIMPA (silhueta lisa das letras), nunca a
  // oficial com sombra — assim a luz cai so nas letras, sem vazar na sombra e sem serrilhar.
  const maskUrl = `url(${paxterPaxterCleanPng})`;

  const css = `
    .${sweep}, .${spark} {
      position: absolute; inset: 0; pointer-events: none; overflow: hidden;
      mix-blend-mode: screen;
      -webkit-mask-image: ${maskUrl}; mask-image: ${maskUrl};
      -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;
      -webkit-mask-size: contain; mask-size: contain;
      -webkit-mask-position: center; mask-position: center;
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
      .${sweep}::before, .${spark}::before { animation: none; opacity: 0; }
    }
  `;

  return (
    <div className={className} style={{ position: "relative", width, lineHeight: 0 }}>
      <style>{css}</style>
      {/* FACE: arte oficial (escuro c/ sombra embutida; claro sem halo) */}
      {isLight ? (
        <img
          src={paxterPaxterCleanPng}
          alt="PAXTER"
          draggable={false}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      ) : (
        <picture>
          <source srcSet={paxterPaxterWebp} type="image/webp" />
          <img
            src={paxterPaxterPng}
            alt="PAXTER"
            draggable={false}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </picture>
      )}
      {/* LUZ por cima, recortada na silhueta LISA das letras */}
      <div className={spark} aria-hidden="true" />
      <div className={sweep} aria-hidden="true" />
    </div>
  );
}
