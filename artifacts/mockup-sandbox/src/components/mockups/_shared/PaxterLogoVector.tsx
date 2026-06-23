import React, { useId } from "react";
import { SYMBOL_VB, WORD_VB, WORD_LETTERS } from "./paxterVectorPaths";
import symbolImg from "../../../assets/paxter-symbol-original.png";

/*
  PaxterLogoVector — Opcao A (decisao do CEO):
   - SIMBOLO: imagem ORIGINAL do PNG-mestre (intacta, sem redesenho/tracing), so com fundo removido.
   - PALAVRA PAXTER: cada letra e um <path> SVG individual (carbono da imagem), NAO fonte.
     Estrutura pedida pelo CEO: grupos de profundidade (depth/mid-depth/front) e
     ids paxter-letter-p ... paxter-letter-r. Ouro polido por gradiente + relevo 3D.

  variant:
   - "hero"    -> simbolo + PAXTER + frases auxiliares
   - "compact" -> simbolo + PAXTER
   - "wordmark"-> so a palavra PAXTER
   - "symbol"  -> so o simbolo (imagem original)
*/

type Variant = "hero" | "compact" | "wordmark" | "symbol";

interface Props {
  variant?: Variant;
  width?: number | string;
  className?: string;
}

const SYM_X = SYMBOL_VB.ox;
const SYM_Y = SYMBOL_VB.oy;
const WORD_X = WORD_VB.ox;
const WORD_Y = WORD_VB.oy;
const THICK = 2.2; // engrossa a palavra ~6-9% (stroke leve), sem ficar pesada

export function PaxterLogoVector({ variant = "hero", width = "100%", className = "" }: Props) {
  const uid = useId().replace(/[:]/g, "");
  const gold = `pxGold-${uid}`;
  const goldDepth = `pxGoldDepth-${uid}`;
  const highlight = `pxHi-${uid}`;
  const fDepth = `pxFDepth-${uid}`;
  const fText = `pxFText-${uid}`;

  let vb = "30 170 1060 1010"; // hero
  if (variant === "compact") vb = "30 170 1060 665";
  if (variant === "wordmark") vb = "30 642 1060 182";
  if (variant === "symbol") vb = `${SYM_X - 14} ${SYM_Y - 14} ${SYMBOL_VB.w + 28} ${SYMBOL_VB.h + 28}`;

  const showSymbol = variant !== "wordmark";
  const showWord = variant !== "symbol";
  const showText = variant === "hero";

  // Palavra: pilha de profundidade (atras p/ frente), depois a frente polida por letra (com id).
  const Wordmark = () => (
    <g id="paxter-wordmark" transform={`translate(${WORD_X},${WORD_Y})`}>
      <g id="paxter-wordmark-depth" transform="translate(0,16)" opacity={0.7}>
        {WORD_LETTERS.map((l) => (
          <path key={l.id} d={l.d} transform={`translate(${l.ox},0)`} fill={`url(#${goldDepth})`}
            stroke="#2a1603" strokeWidth={THICK} strokeLinejoin="round" />
        ))}
      </g>
      <g id="paxter-wordmark-mid-depth" transform="translate(0,8)" opacity={0.9}>
        {WORD_LETTERS.map((l) => (
          <path key={l.id} d={l.d} transform={`translate(${l.ox},0)`} fill="#5f3d0d"
            stroke="#5f3d0d" strokeWidth={THICK} strokeLinejoin="round" />
        ))}
      </g>
      <g id="paxter-wordmark-front">
        {WORD_LETTERS.map((l) => (
          <g key={l.id} transform={`translate(${l.ox},0)`}>
            <path id={`paxter-letter-${l.id}`} d={l.d} fill={`url(#${gold})`} filter={`url(#${fDepth})`}
              stroke={`url(#${gold})`} strokeWidth={THICK} strokeLinejoin="round" />
            <path d={l.d} fill={`url(#${highlight})`} opacity={0.5} style={{ mixBlendMode: "screen" }} />
          </g>
        ))}
      </g>
    </g>
  );

  return (
    <svg
      className={className}
      style={{ width, height: "auto", display: "block", overflow: "visible" }}
      viewBox={vb}
      role="img"
      aria-label="PAXTER"
    >
      <defs>
        <linearGradient id={gold} x1="0%" y1="0%" x2="12%" y2="100%">
          <stop offset="0%" stopColor="#7A4A0A" />
          <stop offset="14%" stopColor="#C88A24" />
          <stop offset="28%" stopColor="#F2C45C" />
          <stop offset="42%" stopColor="#FFF1A8" />
          <stop offset="54%" stopColor="#D9A441" />
          <stop offset="70%" stopColor="#A66B16" />
          <stop offset="85%" stopColor="#FFD978" />
          <stop offset="100%" stopColor="#6E4208" />
        </linearGradient>
        <linearGradient id={goldDepth} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#A66B16" />
          <stop offset="55%" stopColor="#5F3708" />
          <stop offset="100%" stopColor="#2A1603" />
        </linearGradient>
        <linearGradient id={highlight} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.9} />
          <stop offset="32%" stopColor="#FFF6CF" stopOpacity={0.4} />
          <stop offset="60%" stopColor="#FFFFFF" stopOpacity={0} />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
        </linearGradient>
        <filter id={fDepth} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="1" floodColor="#FFF1A8" floodOpacity="0.35" />
          <feDropShadow dx="0" dy="5" stdDeviation="2" floodColor="#7A4A0A" floodOpacity="0.85" />
          <feDropShadow dx="0" dy="14" stdDeviation="8" floodColor="#000000" floodOpacity="0.6" />
          <feDropShadow dx="0" dy="26" stdDeviation="18" floodColor="#000000" floodOpacity="0.32" />
        </filter>
        <filter id={fText} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="0.6" floodColor="#FFF1A8" floodOpacity="0.32" />
          <feDropShadow dx="0" dy="3" stdDeviation="1.5" floodColor="#7A4A0A" floodOpacity="0.62" />
          <feDropShadow dx="0" dy="8" stdDeviation="5" floodColor="#000000" floodOpacity="0.45" />
        </filter>
      </defs>

      {showSymbol && (
        <image
          href={symbolImg}
          x={SYM_X}
          y={SYM_Y}
          width={SYMBOL_VB.w}
          height={SYMBOL_VB.h}
          preserveAspectRatio="xMidYMid meet"
        />
      )}

      {showWord && <Wordmark />}

      {showText && (
        <g>
          <text
            x="560"
            y="910"
            textAnchor="middle"
            fill={`url(#${gold})`}
            filter={`url(#${fText})`}
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 78, fontWeight: 600, letterSpacing: "0.01em" }}
          >
            Clinical Intelligence System
          </text>
          <line x1="190" y1="990" x2="490" y2="990" stroke={`url(#${gold})`} strokeWidth={2} opacity={0.8} />
          <text x="560" y="1002" textAnchor="middle" fill={`url(#${gold})`} style={{ fontFamily: "serif", fontSize: 26 }}>✦</text>
          <line x1="630" y1="990" x2="930" y2="990" stroke={`url(#${gold})`} strokeWidth={2} opacity={0.8} />
          <text
            x="560"
            y="1058"
            textAnchor="middle"
            fill={`url(#${gold})`}
            filter={`url(#${fText})`}
            style={{ fontFamily: "'Cinzel', serif", fontSize: 33, fontWeight: 600, letterSpacing: "0.34em" }}
          >
            PRECISION IN INTEGRATIVE CARE
          </text>
          <text
            x="560"
            y="1112"
            textAnchor="middle"
            fill={`url(#${gold})`}
            opacity={0.92}
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 30, fontStyle: "italic" }}
          >
            AI-guided prescriptions, exams and injectable protocols.
          </text>
        </g>
      )}
    </svg>
  );
}

export default PaxterLogoVector;
