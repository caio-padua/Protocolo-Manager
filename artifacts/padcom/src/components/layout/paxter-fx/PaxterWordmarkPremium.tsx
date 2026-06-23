// PALAVRA "PAXTER" PREMIUM — estende ao nome o MESMO efeito do simbolo.
// A FACE e desenhada a partir do CONTORNO OFICIAL (WORD_LETTERS, carbono potrace
// da arte aprovada) para que a luz percorra o desenho das linhas COM alinhamento
// perfeito. A LUZ (faixa-sol + faisca correndo o contorno) vem do motor unico
// `PaxterGlintPremium` — sem reimplementar a engine; so passamos os caminhos das
// letras, o transform por letra e o alcance da faixa-sol (palavra e mais larga).
import { useId } from "react";
import { PaxterGlintPremium } from "./traceFlash";
import { WORD_LETTERS, WORD_VB } from "./paxterVectorPaths";

const W = WORD_VB.w; // 1026
const H = WORD_VB.h; // 150

type Props = {
  /** largura em pixels da palavra (altura sai por proporcao) */
  width?: number;
  /** atraso do ciclo, para a luz "descer" do simbolo para o nome */
  cycleDelay?: number;
  className?: string;
};

export function PaxterWordmarkPremium({ width = 176, cycleDelay = 900, className }: Props) {
  const uid = useId().replace(/:/g, "");
  const gold = `pww-gold-${uid}`;
  const goldDepth = `pww-depth-${uid}`;
  const fLift = `pww-lift-${uid}`;
  const height = (width * H) / W;

  const paths = WORD_LETTERS.map((l) => l.d);
  const transforms = WORD_LETTERS.map((l) => `translate(${l.ox},0)`);

  return (
    <div className={className} style={{ position: "relative", width, height, lineHeight: 0 }}>
      {/* FACE 3D: contorno oficial das letras em ouro (profundidade + frente) */}
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", overflow: "visible" }}
        role="img"
        aria-label="PAXTER"
      >
        <defs>
          <linearGradient id={gold} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6E4208" />
            <stop offset="14%" stopColor="#B87918" />
            <stop offset="30%" stopColor="#F2C45C" />
            <stop offset="43%" stopColor="#FFF1A8" />
            <stop offset="56%" stopColor="#D9A441" />
            <stop offset="72%" stopColor="#A66B16" />
            <stop offset="88%" stopColor="#FFD978" />
            <stop offset="100%" stopColor="#5F3708" />
          </linearGradient>
          <linearGradient id={goldDepth} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#9B6411" />
            <stop offset="55%" stopColor="#5F3708" />
            <stop offset="100%" stopColor="#241000" />
          </linearGradient>
          <filter id={fLift} x="-15%" y="-25%" width="130%" height="160%">
            <feDropShadow dx="0" dy="0.8" stdDeviation="0.5" floodColor="#FFF1A8" floodOpacity="0.32" />
            <feDropShadow dx="0" dy="2.4" stdDeviation="1.6" floodColor="#5F3708" floodOpacity="0.7" />
            <feDropShadow dx="0" dy="5" stdDeviation="3.4" floodColor="#000000" floodOpacity="0.5" />
          </filter>
        </defs>

        {/* profundidade */}
        <g transform="translate(0,2.4)" opacity={0.75}>
          {WORD_LETTERS.map((l) => (
            <g key={`d-${l.id}`} transform={`translate(${l.ox},0)`}>
              <path d={l.d} fill={`url(#${goldDepth})`} />
            </g>
          ))}
        </g>
        {/* frente em ouro */}
        <g filter={`url(#${fLift})`}>
          {WORD_LETTERS.map((l) => (
            <g key={`f-${l.id}`} transform={`translate(${l.ox},0)`}>
              <path d={l.d} fill={`url(#${gold})`} stroke="#FFF1A8" strokeWidth={0.8} />
            </g>
          ))}
        </g>
      </svg>

      {/* LUZ — motor unico, recortado nas letras e correndo o contorno de cada uma */}
      <PaxterGlintPremium
        d={paths}
        transforms={transforms}
        viewBox={`0 0 ${W} ${H}`}
        width={width}
        height={height}
        sweepWidth={360}
        sweepBright={1.05}
        sweep={{ from: -420, to: 1240 }}
        glintWidthOuter={5}
        glintWidthInner={2}
        sweepMs={12000}
        flashMs={12000}
        flashDelay={cycleDelay}
        sweepDelay={cycleDelay}
        className="absolute inset-0"
        style={{ width, height }}
      />
    </div>
  );
}
