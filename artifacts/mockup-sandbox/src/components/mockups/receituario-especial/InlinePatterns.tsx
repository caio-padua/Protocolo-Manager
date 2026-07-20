// ─────────────────────────────────────────────────────────────────────────────
// INLINE PATTERNS — Geradores de tile SVG para cada padrão geométrico
// Cada função retorna os elementos JSX a serem colocados dentro de <pattern>
// ─────────────────────────────────────────────────────────────────────────────
import React from "react";
import type { ArabesqueModelId } from "./arabesqueModels";

type TileProps = { stroke: string; sw: number; op: number };

// ─── Paths do ChatGPT (Rinceaux de Acanto, tile 320×120) ─────────────────────
export const RINCEAUX_PATHS: { d: string; sw: number; op?: number }[] = [
  { d: "M0 60 H320", sw: 0.7, op: 0.55 },
  { d: "M0 60 C28 60 30 22 66 22 C92 22 100 47 80 58 C59 69 39 51 48 37 C55 26 73 29 75 41 C78 55 60 59 54 50", sw: 2.1 },
  { d: "M320 60 C292 60 290 22 254 22 C228 22 220 47 240 58 C261 69 281 51 272 37 C265 26 247 29 245 41 C242 55 260 59 266 50", sw: 2.1 },
  { d: "M0 60 C28 60 30 98 66 98 C92 98 100 73 80 62 C59 51 39 69 48 83 C55 94 73 91 75 79 C78 65 60 61 54 70", sw: 2.1 },
  { d: "M320 60 C292 60 290 98 254 98 C228 98 220 73 240 62 C261 51 281 69 272 83 C265 94 247 91 245 79 C242 65 260 61 266 70", sw: 2.1 },
  { d: "M78 58 C101 42 118 26 125 8 C128 31 120 48 101 60 C120 72 128 89 125 112 C118 94 101 78 78 62", sw: 1.5 },
  { d: "M242 58 C219 42 202 26 195 8 C192 31 200 48 219 60 C200 72 192 89 195 112 C202 94 219 78 242 62", sw: 1.5 },
  { d: "M104 48 C109 34 117 24 128 16 C126 29 121 41 110 53 Z", sw: 1.15 },
  { d: "M104 72 C109 86 117 96 128 104 C126 91 121 79 110 67 Z", sw: 1.15 },
  { d: "M216 48 C211 34 203 24 192 16 C194 29 199 41 210 53 Z", sw: 1.15 },
  { d: "M216 72 C211 86 203 96 192 104 C194 91 199 79 210 67 Z", sw: 1.15 },
  { d: "M160 9 C171 25 181 37 199 47 C183 50 173 54 164 60 C173 66 183 70 199 73 C181 83 171 95 160 111 C149 95 139 83 121 73 C137 70 147 66 156 60 C147 54 137 50 121 47 C139 37 149 25 160 9 Z", sw: 1.8 },
  { d: "M160 28 C168 38 173 47 173 60 C173 73 168 82 160 92 C152 82 147 73 147 60 C147 47 152 38 160 28 Z", sw: 1.15 },
  { d: "M136 60 C146 52 151 49 160 49 C169 49 174 52 184 60 C174 68 169 71 160 71 C151 71 146 68 136 60 Z", sw: 1.15 },
  { d: "M18 60 C27 52 34 48 44 48 C37 54 33 59 33 66 C27 64 22 62 18 60 Z", sw: 1.0 },
  { d: "M302 60 C293 52 286 48 276 48 C283 54 287 59 287 66 C293 64 298 62 302 60 Z", sw: 1.0 },
];
export const RINCEAUX_CIRCLES = [
  { cx: 160, cy: 60, r: 3.1, sw: 1.0 },
  { cx: 0,   cy: 60, r: 2.2, sw: 1.0 },
  { cx: 320, cy: 60, r: 2.2, sw: 1.0 },
];

// ─── Rinceaux ─────────────────────────────────────────────────────────────────
export function RinceauxTile({ stroke, sw, op }: TileProps) {
  return (
    <g fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
      {RINCEAUX_PATHS.map((p, i) => (
        <path key={i} d={p.d} strokeWidth={p.sw * sw} opacity={p.op ?? op}/>
      ))}
      {RINCEAUX_CIRCLES.map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r={c.r} strokeWidth={c.sw * sw}/>
      ))}
    </g>
  );
}

// ─── Círculos Islâmicos (tile 56×56) ─────────────────────────────────────────
// Círculos sobrepostos em grade quadrada — interseção cria pétala de 4 folhas
export function IslamicCirclesTile({ stroke, sw, op }: TileProps) {
  const r = 24, cx = 28, cy = 28;
  const d = 56;
  return (
    <g fill="none" stroke={stroke} strokeWidth={sw} opacity={op}>
      <circle cx={cx} cy={cy} r={r}/>
      {/* Corner circles (quarter arcs that join with neighbors) */}
      <circle cx={0}  cy={0}  r={r}/>
      <circle cx={d}  cy={0}  r={r}/>
      <circle cx={0}  cy={d}  r={r}/>
      <circle cx={d}  cy={d}  r={r}/>
      {/* Inner detail circle */}
      <circle cx={cx} cy={cy} r={r * 0.42}/>
      {/* Small accent dots */}
      <circle cx={cx} cy={cy} r={1.4} fill={stroke} stroke="none"/>
      <circle cx={0}  cy={0}  r={1.0} fill={stroke} stroke="none"/>
      <circle cx={d}  cy={0}  r={1.0} fill={stroke} stroke="none"/>
      <circle cx={0}  cy={d}  r={1.0} fill={stroke} stroke="none"/>
      <circle cx={d}  cy={d}  r={1.0} fill={stroke} stroke="none"/>
    </g>
  );
}

// ─── Estrela de 8 Pontas (tile 72×72) ────────────────────────────────────────
// Estrela islâmica clássica — grade quadrada com estrelas e quadrados entre elas
const STAR8_PATH = "M0,-26 L4.21,-10.16 L18.38,-18.38 L10.16,-4.21 L26,0 L10.16,4.21 L18.38,18.38 L4.21,10.16 L0,26 L-4.21,10.16 L-18.38,18.38 L-10.16,4.21 L-26,0 L-10.16,-4.21 L-18.38,-18.38 L-4.21,-10.16 Z";

function Star8({ cx, cy, stroke, sw, op }: { cx: number; cy: number; stroke: string; sw: number; op: number }) {
  return <path d={STAR8_PATH} transform={`translate(${cx},${cy})`} fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" opacity={op}/>;
}

export function Islamic8StarTile({ stroke, sw, op }: TileProps) {
  const S = 72, H = S / 2;
  return (
    <g>
      <Star8 cx={H}  cy={H}  stroke={stroke} sw={sw} op={op}/>
      {/* Corner quarter-stars */}
      <Star8 cx={0}  cy={0}  stroke={stroke} sw={sw} op={op}/>
      <Star8 cx={S}  cy={0}  stroke={stroke} sw={sw} op={op}/>
      <Star8 cx={0}  cy={S}  stroke={stroke} sw={sw} op={op}/>
      <Star8 cx={S}  cy={S}  stroke={stroke} sw={sw} op={op}/>
      {/* Inner square between stars */}
      <rect
        x={H - 8} y={H - 26} width={16} height={16}
        transform={`rotate(45 ${H} ${H})`}
        fill="none" stroke={stroke} strokeWidth={sw * 0.7} opacity={op * 0.7}
      />
    </g>
  );
}

// ─── Estrela de 6 Pontas / Hexagrama (tile 80×92) ────────────────────────────
// Grade hexagonal com hexagramas — mosaico andaluz
const STAR6_PATH = "M0,-26 L7,-12.12 L22.52,-13 L14,0 L22.52,13 L7,12.12 L0,26 L-7,12.12 L-22.52,13 L-14,0 L-22.52,-13 L-7,-12.12 Z";

function Star6({ cx, cy, stroke, sw, op }: { cx: number; cy: number; stroke: string; sw: number; op: number }) {
  return <path d={STAR6_PATH} transform={`translate(${cx},${cy})`} fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" opacity={op}/>;
}

export function Islamic6StarTile({ stroke, sw, op }: TileProps) {
  // Hexagonal grid: tile 80×92 (= 2 * 40 × 2 * 46)
  // Stars at: (40,46), corners and edge midpoints for hex tiling
  const W = 80, H = 92;
  return (
    <g>
      {/* Center star */}
      <Star6 cx={W/2} cy={H/2} stroke={stroke} sw={sw} op={op}/>
      {/* Corner stars (for seamless hex tiling) */}
      <Star6 cx={0}   cy={0}   stroke={stroke} sw={sw} op={op}/>
      <Star6 cx={W}   cy={0}   stroke={stroke} sw={sw} op={op}/>
      <Star6 cx={0}   cy={H}   stroke={stroke} sw={sw} op={op}/>
      <Star6 cx={W}   cy={H}   stroke={stroke} sw={sw} op={op}/>
      {/* Edge mid stars */}
      <Star6 cx={W/2} cy={0}   stroke={stroke} sw={sw} op={op}/>
      <Star6 cx={W/2} cy={H}   stroke={stroke} sw={sw} op={op}/>
      <Star6 cx={0}   cy={H/2} stroke={stroke} sw={sw} op={op}/>
      <Star6 cx={W}   cy={H/2} stroke={stroke} sw={sw} op={op}/>
      {/* Connecting lines (light) */}
      <g opacity={op * 0.4} stroke={stroke} strokeWidth={sw * 0.6} fill="none">
        <line x1={W/2} y1={H/2 - 26} x2={W/2} y2={0}/>
        <line x1={W/2} y1={H/2 + 26} x2={W/2} y2={H}/>
        <line x1={W/2 - 22.52} y1={H/2 - 13} x2={0} y2={H/2}/>
        <line x1={W/2 + 22.52} y1={H/2 - 13} x2={W} y2={H/2}/>
        <line x1={W/2 - 22.52} y1={H/2 + 13} x2={0} y2={H/2}/>
        <line x1={W/2 + 22.52} y1={H/2 + 13} x2={W} y2={H/2}/>
      </g>
    </g>
  );
}

// ─── Losangos Entrelaçados (tile 60×60) ───────────────────────────────────────
// Losangos com detalhe interno — geometria persa clássica
export function IslamicDiamondsTile({ stroke, sw, op }: TileProps) {
  const S = 60, H = S / 2;
  // Outer diamond (rotated square)
  const outer = `M${H},4 L${S-4},${H} L${H},${S-4} L4,${H} Z`;
  // Inner diamond (smaller, rotated ~22.5°)
  const inner = `M${H},14 L${S-14},${H} L${H},${S-14} L14,${H} Z`;
  // Very inner diamond
  const mini  = `M${H},22 L${S-22},${H} L${H},${S-22} L22,${H} Z`;
  return (
    <g fill="none" stroke={stroke} opacity={op}>
      <path d={outer} strokeWidth={sw * 1.2}/>
      <path d={inner} strokeWidth={sw * 0.8}/>
      <path d={mini}  strokeWidth={sw * 0.6}/>
      {/* Corner accent marks */}
      <circle cx={H}  cy={2}    r={1.5} fill={stroke} stroke="none"/>
      <circle cx={H}  cy={S-2}  r={1.5} fill={stroke} stroke="none"/>
      <circle cx={2}  cy={H}    r={1.5} fill={stroke} stroke="none"/>
      <circle cx={S-2} cy={H}   r={1.5} fill={stroke} stroke="none"/>
      {/* Corner partial diamonds (for seamless tiling) */}
      <path d={`M0,4 L${H-2},0`}    strokeWidth={sw * 1.2}/>
      <path d={`M${S-4},0 L${S},${H-2}`} strokeWidth={sw * 1.2}/>
      <path d={`M4,${S} L0,${H+2}`}  strokeWidth={sw * 1.2}/>
      <path d={`M${S},${H+2} L${S-4},${S}`} strokeWidth={sw * 1.2}/>
    </g>
  );
}

// ─── Quatrefoil / Trevo de Quatro Folhas (tile 60×60) ────────────────────────
// Quatro círculos sobrepostos — mosaico mourisco
export function IslamicQuatrefoilTile({ stroke, sw, op }: TileProps) {
  const S = 60, H = S / 2;
  const r = 16;
  return (
    <g fill="none" stroke={stroke} opacity={op}>
      {/* 4 overlapping circles forming the quatrefoil */}
      <circle cx={H}     cy={H - r} r={r} strokeWidth={sw}/>   {/* top */}
      <circle cx={H + r} cy={H}     r={r} strokeWidth={sw}/>   {/* right */}
      <circle cx={H}     cy={H + r} r={r} strokeWidth={sw}/>   {/* bottom */}
      <circle cx={H - r} cy={H}     r={r} strokeWidth={sw}/>   {/* left */}
      {/* Central accent circle */}
      <circle cx={H} cy={H} r={5} strokeWidth={sw * 0.8}/>
      <circle cx={H} cy={H} r={2} fill={stroke} stroke="none"/>
      {/* Corner quarter-quatrefoils (seamless tiling) */}
      <circle cx={0} cy={0} r={r} strokeWidth={sw}/>
      <circle cx={S} cy={0} r={r} strokeWidth={sw}/>
      <circle cx={0} cy={S} r={r} strokeWidth={sw}/>
      <circle cx={S} cy={S} r={r} strokeWidth={sw}/>
    </g>
  );
}

// ─── Dispatcher — retorna o tile correto para cada modelId ────────────────────
export function getTileForModel(
  id: ArabesqueModelId,
  stroke: string,
  sw: number,
  op: number,
): React.ReactElement {
  switch (id) {
    case "rinceaux-acanto":
      return <RinceauxTile stroke={stroke} sw={sw} op={op}/>;
    case "islamic-circles":
      return <IslamicCirclesTile stroke={stroke} sw={sw} op={op}/>;
    case "islamic-8star":
      return <Islamic8StarTile stroke={stroke} sw={sw} op={op}/>;
    case "islamic-6star":
      return <Islamic6StarTile stroke={stroke} sw={sw} op={op}/>;
    case "islamic-diamonds":
      return <IslamicDiamondsTile stroke={stroke} sw={sw} op={op}/>;
    case "islamic-quatrefoil":
      return <IslamicQuatrefoilTile stroke={stroke} sw={sw} op={op}/>;
    default:
      return <IslamicCirclesTile stroke={stroke} sw={sw} op={op}/>;
  }
}
