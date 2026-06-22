// ============================================================================
// MOTOR DO EFEITO "ESCRITA" (trace-flash) — reutilizavel em qualquer lugar.
//
// A ideia (decodificada): o simbolo NAO leva um flash que varre o BLOCO/caixa.
// Em vez disso, o flash percorre o TRACADO (os caminhos desenhados do simbolo),
// dando a impressao de que ele esta sendo ESCRITO a mao, e depois um ponto de
// luz fica correndo pela linha para sempre.
//
// Como e feito (a tal "formiguinha"):
//   1. O simbolo e descrito como CAMINHOS de SVG (atributo `d`) — as coordenadas
//      de cada traco. Aqui esta a parte chata/manual: desenhar a linha de centro
//      de cada letra/forma.
//   2. Usamos `pathLength={100}` para normalizar o comprimento do caminho a 100,
//      sem precisar medir em JavaScript.
//   3. A "escrita" e a animacao classica de line-drawing: `stroke-dasharray:100`
//      + `stroke-dashoffset` indo de 100 (invisivel) a 0 (desenhado).
//   4. O "flash" e um tracinho curto e brilhante (com glow) que corre pelo mesmo
//      caminho repetidamente, via `stroke-dashoffset`.
//   5. Respeita quem prefere menos movimento (mostra ja escrito, sem flash).
//
// Por ser data-driven (recebe `d`), o MESMO efeito pode ser "repicado" para
// qualquer simbolo ou logotipo: basta passar o caminho do desenho.
// ============================================================================

import { useId, type CSSProperties } from "react";
import { PAXTER_SYMBOL_PATH, PAXTER_SYMBOL_VIEWBOX } from "./paxterSymbolPath";

export const TRACE_FLASH_STYLE = `
  /* base do simbolo (sempre visivel, suave) */
  .tf-base { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  /* a "escrita": revela o tracado uma vez ao montar */
  .tf-draw {
    fill: none; stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 100; stroke-dashoffset: 100;
    animation: tfDraw var(--tf-draw, 1800ms) cubic-bezier(.65,0,.35,1) forwards;
  }
  @keyframes tfDraw { to { stroke-dashoffset: 0; } }
  /* o "flash": tracinho curto e brilhante correndo pelo caminho para sempre */
  .tf-flash {
    fill: none; stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 7 100; stroke-dashoffset: 107;
    animation: tfFlash var(--tf-flash, 3000ms) linear var(--tf-flash-delay, 1800ms) infinite;
  }
  @keyframes tfFlash { from { stroke-dashoffset: 107; } to { stroke-dashoffset: 0; } }

  /* varrimento especular (reflexo de luz cruzando o metal polido) */
  .tf-sweep { animation: tfSweep var(--tf-sweep, 3200ms) cubic-bezier(.45,0,.55,1) infinite; }
  @keyframes tfSweep { 0% { transform: translateX(-220px); } 100% { transform: translateX(480px); } }

  @media (prefers-reduced-motion: reduce) {
    .tf-draw { animation: none; stroke-dashoffset: 0; }
    .tf-flash { display: none; }
    .tf-sweep { animation: none; opacity: 0; }
  }
`;

type TraceFlashProps = {
  /** Caminho(s) SVG do desenho. String unica ou varias (desenhadas na ordem). */
  d: string | string[];
  size?: number;
  viewBox?: string;
  /** largura do traco da face do simbolo */
  width?: number;
  /** largura do tracinho de flash (um pouco maior fica melhor) */
  flashWidth?: number;
  /** cor da face (gradiente ouro por padrao) */
  goldTop?: string;
  goldMid?: string;
  goldDeep?: string;
  /** cor do flash */
  flashColor?: string;
  /** duracao da escrita e do flash (ms) */
  drawMs?: number;
  flashMs?: number;
  baseOpacity?: number;
  className?: string;
  style?: CSSProperties;
};

export function TraceFlash({
  d,
  size = 120,
  viewBox = "0 0 120 120",
  width = 9,
  flashWidth,
  goldTop = "#fff3cf",
  goldMid = "#d8b765",
  goldDeep = "#9c7a32",
  flashColor = "#fffbe6",
  drawMs = 1800,
  flashMs = 3000,
  baseOpacity = 0.22,
  className,
  style,
}: TraceFlashProps) {
  const uid = useId().replace(/:/g, "");
  const gid = `tfg-${uid}`;
  const glow = `tfx-${uid}`;
  const paths = Array.isArray(d) ? d : [d];
  const fw = flashWidth ?? width + 1.5;

  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={goldTop} />
          <stop offset="45%" stopColor={goldMid} />
          <stop offset="78%" stopColor={goldDeep} />
          <stop offset="100%" stopColor={goldTop} />
        </linearGradient>
        <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* sombra/relevo do tracado (leve deslocamento para baixo) */}
      {paths.map((p, i) => (
        <path key={`sh${i}`} d={p} className="tf-base" stroke="rgba(0,0,0,0.55)" strokeWidth={width} transform="translate(1.4,2)" opacity={0.5} />
      ))}
      {/* face ouro de base (suave, sempre visivel) */}
      {paths.map((p, i) => (
        <path key={`b${i}`} d={p} className="tf-base" stroke={`url(#${gid})`} strokeWidth={width} opacity={baseOpacity} />
      ))}
      {/* a escrita: revela o tracado uma vez */}
      {paths.map((p, i) => (
        <path
          key={`d${i}`}
          d={p}
          pathLength={100}
          className="tf-draw"
          stroke={`url(#${gid})`}
          strokeWidth={width}
          style={{ ["--tf-draw" as string]: `${drawMs}ms`, animationDelay: `${i * drawMs}ms` }}
        />
      ))}
      {/* o flash correndo pelo tracado para sempre */}
      {paths.map((p, i) => (
        <path
          key={`f${i}`}
          d={p}
          pathLength={100}
          className="tf-flash"
          stroke={flashColor}
          strokeWidth={fw}
          filter={`url(#${glow})`}
          style={{
            ["--tf-flash" as string]: `${flashMs}ms`,
            ["--tf-flash-delay" as string]: `${drawMs * paths.length + i * 120}ms`,
          }}
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Monograma "Rx" descrito como tracado (a linha de centro de cada letra).
// Ordem de escrita: haste do R -> barriga -> perna -> primeira diagonal do x ->
// segunda diagonal do x. E o "desenho" que o flash vai percorrer.
// ---------------------------------------------------------------------------
export const RX_TRACE_PATHS = [
  "M34 90 L34 32 L50 32 C62 32 62 56 50 56 L34 56",
  "M45 56 L60 90",
  "M68 60 L92 88",
  "M92 60 L68 88",
];

export function RxWriting({ size = 120, ...rest }: Partial<TraceFlashProps> & { size?: number }) {
  return <TraceFlash d={RX_TRACE_PATHS} size={size} width={9} {...rest} />;
}

// ---------------------------------------------------------------------------
// GLINT SOBRE O 3D (A + B juntos) — so o FLASH, sem o tracado de base. Feito
// para ficar POR CIMA do PNG 3D dourado com mix-blend-mode: screen (so clareia),
// dando a impressao de um reflexo correndo pelo metal real do simbolo.
// O simbolo 3D continua fixo embaixo; este overlay so passa a luz pelo tracado.
// ---------------------------------------------------------------------------
type GlintProps = {
  d: string | string[];
  size?: number;
  viewBox?: string;
  flashWidth?: number;
  flashColor?: string;
  flashMs?: number;
  flashDelay?: number;
  className?: string;
  style?: CSSProperties;
};

export function TraceFlashGlint({
  d,
  size = 150,
  viewBox = "0 0 120 120",
  flashWidth = 6,
  flashColor = "#fffdf0",
  flashMs = 2600,
  flashDelay = 0,
  className,
  style,
}: GlintProps) {
  const uid = useId().replace(/:/g, "");
  const glow = `tgx-${uid}`;
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={className}
      style={{ mixBlendMode: "screen", ...style }}
      aria-hidden="true"
    >
      <defs>
        <filter id={glow} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {paths.map((p, i) => (
        <path
          key={`g${i}`}
          d={p}
          pathLength={100}
          className="tf-flash"
          fill="none"
          stroke={flashColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={flashWidth}
          filter={`url(#${glow})`}
          style={{
            ["--tf-flash" as string]: `${flashMs}ms`,
            ["--tf-flash-delay" as string]: `${flashDelay + i * 120}ms`,
          }}
        />
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// BRILHO DE OURO PREMIUM (A + B em alta fidelidade). Overlay para ficar POR CIMA
// do PNG 3D dourado. Duas camadas de luz, ambas em OURO (nunca branco chapado):
//   1) Varrimento especular: uma faixa de luz dourada cruza o metal, recortada
//      pela SILHUETA do simbolo (so acende o metal, nunca a caixa).
//   2) Glint de borda: um reflexo dourado quente correndo pelo tracado exato.
// O modo de mistura "plus-lighter" (aditivo) intensifica o ouro existente em vez
// de lavar para branco — e o que da a sensacao de metal polido refletindo luz.
// ---------------------------------------------------------------------------
type GlintPremiumProps = {
  d: string | string[];
  size?: number;
  viewBox?: string;
  /** largura do glint de borda (em unidades do viewBox) */
  glintWidth?: number;
  sweepMs?: number;
  flashMs?: number;
  className?: string;
  style?: CSSProperties;
};

export function PaxterGlintPremium({
  d,
  size = 150,
  viewBox = "0 0 381 369",
  glintWidth = 9,
  sweepMs = 3400,
  flashMs = 3000,
  className,
  style,
}: GlintPremiumProps) {
  const uid = useId().replace(/:/g, "");
  const maskId = `pmm-${uid}`;
  const sweepG = `pms-${uid}`;
  const glow = `pmg-${uid}`;
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      className={className}
      style={{ mixBlendMode: "plus-lighter", ...style }}
      aria-hidden="true"
    >
      <defs>
        <mask id={maskId}>
          {paths.map((p, i) => (
            <path key={`m${i}`} d={p} fill="#fff" stroke="#fff" strokeWidth={2} />
          ))}
        </mask>
        <linearGradient id={sweepG} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffcf6e" stopOpacity="0" />
          <stop offset="38%" stopColor="#ffdf95" stopOpacity="0.5" />
          <stop offset="50%" stopColor="#fff3cf" stopOpacity="0.95" />
          <stop offset="62%" stopColor="#ffd986" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#ffcf6e" stopOpacity="0" />
        </linearGradient>
        <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* 1) varrimento especular dourado, recortado no metal do simbolo */}
      <g mask={`url(#${maskId})`}>
        <g className="tf-sweep" style={{ ["--tf-sweep" as string]: `${sweepMs}ms` }}>
          <rect x="-150" y="-60" width="150" height="500" fill={`url(#${sweepG})`} transform="skewX(-20)" />
        </g>
      </g>

      {/* 2) glint de borda dourado quente correndo pelo tracado */}
      {paths.map((p, i) => (
        <g key={`gl${i}`}>
          <path
            d={p}
            pathLength={100}
            className="tf-flash"
            fill="none"
            stroke="#ffcf73"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={glintWidth + 4}
            filter={`url(#${glow})`}
            style={{ ["--tf-flash" as string]: `${flashMs}ms`, ["--tf-flash-delay" as string]: `${i * 120}ms`, opacity: 0.85 }}
          />
          <path
            d={p}
            pathLength={100}
            className="tf-flash"
            fill="none"
            stroke="#ffe6a3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={glintWidth - 4}
            style={{ ["--tf-flash" as string]: `${flashMs}ms`, ["--tf-flash-delay" as string]: `${i * 120}ms` }}
          />
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// SIMBOLO EXATO — tracado vetorizado do PNG real (potrace). Aqui o efeito de
// escrita percorre o CONTORNO real do simbolo Paxter (R + X + moldura), nao um
// "Rx" digitado. Mesmo motor (TraceFlash), so muda o caminho `d`.
// ---------------------------------------------------------------------------
export function PaxterSymbolWriting({
  size = 150,
  width = 4,
  ...rest
}: Partial<TraceFlashProps> & { size?: number }) {
  const { w, h } = PAXTER_SYMBOL_VIEWBOX;
  return (
    <TraceFlash
      d={PAXTER_SYMBOL_PATH}
      size={size}
      viewBox={`0 0 ${w} ${h}`}
      width={width}
      flashWidth={width + 2}
      baseOpacity={0.18}
      drawMs={2400}
      {...rest}
    />
  );
}
