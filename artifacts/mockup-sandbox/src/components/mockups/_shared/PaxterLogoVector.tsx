import React, { useId } from "react";
import { SYMBOL_VB } from "./paxterVectorPaths";
import symbolImg from "../../../assets/paxter-symbol-original.png";

/*
  PaxterLogoVector — decisao do CEO (23/06/2026): NADA de tracing automatico no PAXTER.
   - SIMBOLO: imagem ORIGINAL do PNG-mestre, intacta (so fundo removido). NAO mexer.
   - PALAVRA PAXTER: wordmark vetorial LIMPO, desenhado a mao em SVG (base enviada pelo CEO).
     Cada letra e um <g id="paxter-letter-*"> com <path> geometrico limpo (sem fonte, sem <text>).
     P e R vazados (fillRule evenodd). Relevo em 3 camadas: depth / mid-depth / front + brilho fino.
   - Frases auxiliares (hero): <text> em ouro (permitido).

  variant: "hero" | "compact" | "wordmark" | "symbol"
*/

type Variant = "hero" | "compact" | "wordmark" | "symbol";

interface Props {
  variant?: Variant;
  width?: number | string;
  className?: string;
}

const SYM_X = SYMBOL_VB.ox;
const SYM_Y = SYMBOL_VB.oy;

// Letras desenhadas a mao (base autoral do CEO). Espaco interno 1200x240, tinta ~ x28..1144 / y30..190.
function PaxterLetters() {
  return (
    <>
      {/* P — vazado, aberto, geometrico, nao-fonte */}
      <g id="paxter-letter-p">
        <path
          fillRule="evenodd"
          d="M 28 32 H 150 C 184 32 204 54 204 84 C 204 116 181 136 147 136 H 76 V 190 H 28 Z
             M 76 75 V 96 H 145 C 154 96 160 92 160 84 C 160 78 154 75 145 75 Z"
        />
        <path d="M76 136 H124 L76 190 Z" opacity="0.92" />
      </g>

      {/* A — geometrico aberto */}
      <g id="paxter-letter-a" transform="translate(190 0)">
        <path
          fillRule="evenodd"
          d="M 84 30 L 170 190 H 117 L 101 157 H 55 L 39 190 H -8 Z
             M 78 102 L 63 126 H 94 Z"
        />
      </g>

      {/* X — duas laminas cruzadas */}
      <g id="paxter-letter-x" transform="translate(380 0)">
        <path d="M 8 32 H 65 L 106 88 L 148 32 H 204 L 134 112 L 206 190 H 146 L 105 137 L 64 190 H 6 L 78 112 Z" />
      </g>

      {/* T — haste forte */}
      <g id="paxter-letter-t" transform="translate(570 0)">
        <path d="M 0 32 H 170 V 78 H 109 V 190 H 61 V 78 H 0 Z" />
      </g>

      {/* E — barras */}
      <g id="paxter-letter-e" transform="translate(760 0)">
        <path d="M 0 32 H 160 V 76 H 49 V 92 H 139 V 132 H 49 V 146 H 164 V 190 H 0 Z" />
      </g>

      {/* R — vazado, com perna diagonal */}
      <g id="paxter-letter-r" transform="translate(950 0)">
        <path
          fillRule="evenodd"
          d="M 0 32 H 122 C 158 32 180 53 180 84 C 180 108 167 126 145 134 L 194 190 H 134 L 93 140 H 49 V 190 H 0 Z
             M 49 75 V 100 H 118 C 127 100 134 95 134 87 C 134 79 127 75 118 75 Z"
        />
        <path d="M49 140 H93 L134 190 H82 Z" opacity="0.92" />
      </g>
    </>
  );
}

export function PaxterLogoVector({ variant = "hero", width = "100%", className = "" }: Props) {
  const uid = useId().replace(/[:]/g, "");
  const gold = `pxGold-${uid}`;
  const goldDepth = `pxGoldDepth-${uid}`;
  const fDepth = `pxFDepth-${uid}`;
  const fText = `pxFText-${uid}`;

  let vb = "30 170 1060 1010"; // hero
  if (variant === "compact") vb = "30 170 1060 665";
  if (variant === "wordmark") vb = "20 18 1140 184";
  if (variant === "symbol") vb = `${SYM_X - 14} ${SYM_Y - 14} ${SYMBOL_VB.w + 28} ${SYMBOL_VB.h + 28}`;

  const showSymbol = variant !== "wordmark";
  const showWord = variant !== "symbol";
  const showText = variant === "hero";

  // Bloco da palavra em seu espaco proprio (1200x240); 3 camadas de relevo + brilho fino.
  const WordmarkBlock = () => (
    <g id="paxter-wordmark">
      <g id="paxter-wordmark-depth" transform="translate(0,16)" opacity={0.72} fill={`url(#${goldDepth})`}>
        <PaxterLetters />
      </g>
      <g id="paxter-wordmark-mid-depth" transform="translate(0,8)" opacity={0.9} fill="#9B6411">
        <PaxterLetters />
      </g>
      <g
        id="paxter-wordmark-front"
        fill={`url(#${gold})`}
        stroke="#FFF1A8"
        strokeWidth={2}
        strokeLinejoin="round"
        filter={`url(#${fDepth})`}
      >
        <PaxterLetters />
      </g>
      <g id="paxter-wordmark-highlight" fill="none" stroke="#FFF6C8" strokeWidth={2.2} strokeLinecap="round" opacity={0.55}>
        <path d="M34 45 H135" />
        <path d="M212 45 H318" />
        <path d="M406 45 H505" />
        <path d="M594 45 H730" />
        <path d="M784 45 H920" />
        <path d="M972 45 H1092" />
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
        <filter id={fDepth} x="-20%" y="-30%" width="140%" height="170%">
          <feDropShadow dx="0" dy="3" stdDeviation="1.2" floodColor="#FFF1A8" floodOpacity="0.28" />
          <feDropShadow dx="0" dy="8" stdDeviation="3" floodColor="#7A4A0A" floodOpacity="0.75" />
          <feDropShadow dx="0" dy="16" stdDeviation="9" floodColor="#000000" floodOpacity="0.58" />
          <feDropShadow dx="0" dy="28" stdDeviation="18" floodColor="#000000" floodOpacity="0.35" />
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

      {/* Palavra: variante isolada usa o espaco proprio; no hero/compact, encaixa via <svg> aninhado */}
      {showWord && variant === "wordmark" && <WordmarkBlock />}
      {showWord && variant !== "wordmark" && (
        <svg x={51} y={646} width={1017} height={155} viewBox="20 18 1140 184" overflow="visible">
          <WordmarkBlock />
        </svg>
      )}

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
