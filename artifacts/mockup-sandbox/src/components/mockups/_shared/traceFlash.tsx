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

  @media (prefers-reduced-motion: reduce) {
    .tf-draw { animation: none; stroke-dashoffset: 0; }
    .tf-flash { display: none; }
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
