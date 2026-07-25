import { useId, type CSSProperties } from "react";
import symbolAsset from "@/assets/parxis-symbol.png.asset.json";

const PAXTER_GLINT_STYLE = `
  .tf-base { fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .tf-draw {
    fill: none; stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 100; stroke-dashoffset: 100;
    animation: tfDraw var(--tf-draw, 1800ms) cubic-bezier(.65,0,.35,1) forwards;
  }
  @keyframes tfDraw { to { stroke-dashoffset: 0; } }
  .tf-flash {
    fill: none; stroke-linecap: round; stroke-linejoin: round;
    stroke-dasharray: 7 100; stroke-dashoffset: 107; opacity: 0;
    animation: tfFlash var(--tf-flash, 12000ms) linear var(--tf-flash-delay, 0ms) infinite backwards;
  }
  @keyframes tfFlash {
    0%   { stroke-dashoffset: 107; opacity: 0; }
    2%   { stroke-dashoffset: 107; opacity: 0; }
    5%   { opacity: 1; }
    21%  { stroke-dashoffset: 0;   opacity: 1; }
    24%  { stroke-dashoffset: 0;   opacity: 0; }
    100% { stroke-dashoffset: 0;   opacity: 0; }
  }
  .tf-sweep {
    opacity: 0;
    animation: tfSweep var(--tf-sweep, 12000ms) cubic-bezier(.45,0,.55,1) var(--tf-sweep-delay, 0ms) infinite backwards;
  }
  @keyframes tfSweep {
    0%   { transform: translateX(-220px); opacity: 0; }
    26%  { transform: translateX(-220px); opacity: 0; }
    30%  { opacity: 1; }
    45%  { transform: translateX(480px);  opacity: 1; }
    48%  { transform: translateX(480px);  opacity: 0; }
    100% { transform: translateX(480px);  opacity: 0; }
  }
  @keyframes pspAura {
    0%,100% { opacity: .40; transform: scale(1);    }
    50%     { opacity: .72; transform: scale(1.06); }
  }
  .pax-aura { animation: pspAura 3800ms ease-in-out infinite; }
  @keyframes paxDomeShine {
    0%,100% { opacity: .55; }
    50%     { opacity: .75; }
  }
  .pax-dome-shine { animation: paxDomeShine 4200ms ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .tf-draw  { animation: none; stroke-dashoffset: 0; }
    .tf-flash { display: none; }
    .tf-sweep { animation: none; opacity: 0; }
    .pax-aura { animation: none; opacity: .45; }
    .pax-dome-shine { animation: none; }
  }
`;

const SYMBOL_RING_OUTER =
  "M 200,200 m -180,0 a 180,180 0 1,0 360,0 a 180,180 0 1,0 -360,0";
const SYMBOL_RING_MID =
  "M 200,200 m -168,0 a 168,168 0 1,0 336,0 a 168,168 0 1,0 -336,0";
const SYMBOL_RING_INNER =
  "M 200,200 m -148,0 a 148,148 0 1,0 296,0 a 148,148 0 1,0 -296,0";
// Contorno completo da letra "P" do monograma: silhueta externa fechada
// (haste + topo + bojo + descida) e o contorno interno (contra-forma do bojo).
const SYMBOL_LETTER_P_OUTER =
  "M 130 320 L 130 90 L 235 90 A 65 65 0 0 1 235 220 L 175 220 L 175 320 Z";
const SYMBOL_LETTER_P_INNER =
  "M 175 130 L 220 130 A 30 30 0 0 1 220 190 L 175 190 Z";
// Traços horizontais decorativos do símbolo (esquerda e direita do P).
const SYMBOL_TICK_LEFT = "M 60 200 L 100 200";
const SYMBOL_TICK_RIGHT = "M 300 200 L 340 200";
const SYMBOL_PATHS = [
  SYMBOL_RING_OUTER,
  SYMBOL_RING_MID,
  SYMBOL_RING_INNER,
  SYMBOL_LETTER_P_OUTER,
  SYMBOL_LETTER_P_INNER,
  SYMBOL_TICK_LEFT,
  SYMBOL_TICK_RIGHT,
];
const SYMBOL_VIEWBOX = "0 0 400 400";

interface GlintPremiumProps {
  d: string | string[];
  size?: number;
  viewBox?: string;
  glintWidth?: number;
  sweepWidth?: number;
  sweepBright?: number;
  sweepMs?: number;
  flashMs?: number;
  flashDelay?: number;
  sweepDelay?: number;
  className?: string;
  style?: CSSProperties;
}

function PaxterGlintPremium({
  d,
  size = 150,
  viewBox = SYMBOL_VIEWBOX,
  glintWidth = 9,
  sweepWidth = 150,
  sweepBright = 1,
  sweepMs = 12000,
  flashMs = 12000,
  flashDelay = 0,
  sweepDelay = 0,
  className,
  style,
}: GlintPremiumProps) {
  const uid = useId().replace(/:/g, "");
  const maskId = `pmm-${uid}`;
  const sweepGId = `pms-${uid}`;
  const glowId = `pmg-${uid}`;
  const paths = Array.isArray(d) ? d : [d];
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  const o1 = clamp(0.5 * sweepBright);
  const o2 = clamp(0.95 * sweepBright);
  const wOuter = glintWidth + 4;
  const wInner = Math.max(1, glintWidth - 4);
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ mixBlendMode: "plus-lighter", overflow: "visible", ...style }}
      aria-hidden="true"
    >
      <defs>
        <mask id={maskId}>
          {paths.map((p, i) => (
            <path key={`m${i}`} d={p} fill="#fff" stroke="#fff" strokeWidth={2} />
          ))}
        </mask>
        <linearGradient id={sweepGId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffcf6e" stopOpacity="0" />
          <stop offset="38%" stopColor="#ffdf95" stopOpacity={o1} />
          <stop offset="50%" stopColor="#fff3cf" stopOpacity={o2} />
          <stop offset="62%" stopColor="#ffd986" stopOpacity={o1} />
          <stop offset="100%" stopColor="#ffcf6e" stopOpacity="0" />
        </linearGradient>
        <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g mask={`url(#${maskId})`}>
        <g
          className="tf-sweep"
          style={{
            ["--tf-sweep" as string]: `${sweepMs}ms`,
            ["--tf-sweep-delay" as string]: `${sweepDelay}ms`,
          } as CSSProperties}
        >
          <rect
            x={-sweepWidth}
            y="-60"
            width={sweepWidth}
            height="500"
            fill={`url(#${sweepGId})`}
            transform="skewX(-20)"
          />
        </g>
      </g>
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
            strokeWidth={wOuter}
            strokeOpacity={0.85}
            filter={`url(#${glowId})`}
            style={{
              ["--tf-flash" as string]: `${flashMs}ms`,
              ["--tf-flash-delay" as string]: `${flashDelay + i * 120}ms`,
            } as CSSProperties}
          />
          <path
            d={p}
            pathLength={100}
            className="tf-flash"
            fill="none"
            stroke="#ffe6a3"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={wInner}
            style={{
              ["--tf-flash" as string]: `${flashMs}ms`,
              ["--tf-flash-delay" as string]: `${flashDelay + i * 120}ms`,
            } as CSSProperties}
          />
        </g>
      ))}
    </svg>
  );
}

interface PaxterMedalhaoProps {
  size?: number;
  tone?: "dark" | "light";
  className?: string;
}

export function PaxterMedalhao({
  size = 38,
  tone = "dark",
  className = "",
}: PaxterMedalhaoProps) {
  const uid = useId().replace(/:/g, "");
  const outerR = Math.round(size * 0.30);
  const innerR = Math.round(size * 0.24);
  const innerPad = Math.round(size * 0.07);
  const innerBg =
    tone === "light"
      ? "linear-gradient(180deg,#2a2113 0%,#160f06 100%)"
      : "linear-gradient(180deg,#102140 0%,#070f22 100%)";
  return (
    <>
      <style>{PAXTER_GLINT_STYLE}</style>
      <span
        className={`pax-med ${className}`}
        aria-hidden="true"
        style={{
          position: "relative",
          display: "inline-flex",
          padding: "2px",
          flexShrink: 0,
          borderRadius: outerR,
          background:
            "linear-gradient(135deg,#6f5421 0%,#f6e6a8 16%,#c9a24e 38%,#8a6d2f 56%,#f1dd9a 76%,#927235 100%)",
          boxShadow:
            "0 8px 24px rgba(0,0,0,0.50), 0 0 18px rgba(194,160,90,0.35)",
        } as CSSProperties}
      >
        <span
          className="pax-dome-shine"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: outerR,
            pointerEvents: "none",
            zIndex: 3,
            background:
              "linear-gradient(180deg,rgba(255,255,255,.62) 0%,rgba(255,255,255,.18) 10%,rgba(255,255,255,.04) 22%,transparent 32%)," +
              "radial-gradient(80% 30% at 50% 2%,rgba(255,255,255,.56) 0%,transparent 70%)",
            mixBlendMode: "screen",
          }}
        />
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            position: "relative",
            zIndex: 1,
            borderRadius: innerR,
            padding: innerPad,
            background: innerBg,
          }}
        >
          <span
            key={uid}
            className="pax-aura"
            style={{
              position: "absolute",
              inset: -size * 0.18,
              mixBlendMode: "screen",
              filter: "blur(6px)",
              background:
                "radial-gradient(circle,rgba(255,201,112,.40),rgba(255,201,112,.10) 50%,transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <span
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: size,
              height: size,
            }}
          >
            <img
              src={symbolAsset.url}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                mixBlendMode: "screen",
                filter: "contrast(1.1) saturate(1.16) brightness(1.05)",
              }}
            />
            <PaxterGlintPremium
              d={SYMBOL_PATHS}
              size={size}
              viewBox={SYMBOL_VIEWBOX}
              sweepWidth={200}
              sweepBright={1.1}
              glintWidth={5}
              sweepMs={12000}
              flashMs={12000}
              flashDelay={0}
              sweepDelay={0}
              style={{ position: "absolute", inset: 0 }}
            />
          </span>
        </span>
      </span>
    </>
  );
}

export default PaxterMedalhao;