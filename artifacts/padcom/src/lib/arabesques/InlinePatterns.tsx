// Tiles SVG para os modelos inline-svg (geométrico + rinceaux)
import React from "react";
import type { ArabesqueModelId } from "./models";

type T = { stroke: string; sw: number; op: number };

// ─── Rinceaux de Acanto ────────────────────────────────────────────────────────
const RINCEAUX: { d: string; sw: number; op?: number }[] = [
  { d: "M0 60 H320", sw: 0.7, op: 0.55 },
  { d: "M0 60 C28 60 30 22 66 22 C92 22 100 47 80 58 C59 69 39 51 48 37 C55 26 73 29 75 41 C78 55 60 59 54 50", sw: 2.1 },
  { d: "M320 60 C292 60 290 22 254 22 C228 22 220 47 240 58 C261 69 281 51 272 37 C265 26 247 29 245 41 C242 55 260 59 266 50", sw: 2.1 },
  { d: "M0 60 C28 60 30 98 66 98 C92 98 100 73 80 62 C59 51 39 69 48 83 C55 94 73 91 75 79 C78 65 60 61 54 70", sw: 2.1 },
  { d: "M320 60 C292 60 290 98 254 98 C228 98 220 73 240 62 C261 51 281 69 272 83 C265 94 247 91 245 79 C242 65 260 61 266 70", sw: 2.1 },
  { d: "M78 58 C101 42 118 26 125 8 C128 31 120 48 101 60 C120 72 128 89 125 112 C118 94 101 78 78 62", sw: 1.5 },
  { d: "M242 58 C219 42 202 26 195 8 C192 31 200 48 219 60 C200 72 192 89 195 112 C202 94 219 78 242 62", sw: 1.5 },
  { d: "M160 9 C171 25 181 37 199 47 C183 50 173 54 164 60 C173 66 183 70 199 73 C181 83 171 95 160 111 C149 95 139 83 121 73 C137 70 147 66 156 60 C147 54 137 50 121 47 C139 37 149 25 160 9 Z", sw: 1.8 },
  { d: "M160 28 C168 38 173 47 173 60 C173 73 168 82 160 92 C152 82 147 73 147 60 C147 47 152 38 160 28 Z", sw: 1.15 },
];

function RinceauxTile({ stroke, sw, op }: T) {
  return (
    <g fill="none" stroke={stroke} strokeLinecap="round" strokeLinejoin="round">
      {RINCEAUX.map((p, i) => (
        <path key={i} d={p.d} strokeWidth={p.sw * sw} opacity={p.op ?? op}/>
      ))}
      <circle cx={160} cy={60} r={3.1} fill={stroke} stroke="none"/>
    </g>
  );
}

// ─── Círculos Islâmicos (tile 56×56) ─────────────────────────────────────────
function CirclesTile({ stroke, sw, op }: T) {
  const r = 24, d = 56;
  return (
    <g fill="none" stroke={stroke} strokeWidth={sw} opacity={op}>
      <circle cx={28} cy={28} r={r}/>
      <circle cx={0}  cy={0}  r={r}/><circle cx={d} cy={0}  r={r}/>
      <circle cx={0}  cy={d}  r={r}/><circle cx={d} cy={d}  r={r}/>
      <circle cx={28} cy={28} r={r * 0.42}/>
      <circle cx={28} cy={28} r={1.4} fill={stroke} stroke="none"/>
    </g>
  );
}

// ─── Estrela de 8 Pontas (tile 72×72) ────────────────────────────────────────
const STAR8 = "M0,-26 L4.21,-10.16 L18.38,-18.38 L10.16,-4.21 L26,0 L10.16,4.21 L18.38,18.38 L4.21,10.16 L0,26 L-4.21,10.16 L-18.38,18.38 L-10.16,4.21 L-26,0 L-10.16,-4.21 L-18.38,-18.38 L-4.21,-10.16 Z";

function Star8Tile({ stroke, sw, op }: T) {
  const S = 72;
  const star = (cx: number, cy: number) => (
    <path key={`${cx}-${cy}`} d={STAR8} transform={`translate(${cx},${cy})`}
          fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" opacity={op}/>
  );
  return (
    <g>
      {star(36,36)} {star(0,0)} {star(S,0)} {star(0,S)} {star(S,S)}
    </g>
  );
}

// ─── Estrela de 6 Pontas (tile 80×92) ────────────────────────────────────────
const STAR6 = "M0,-26 L7,-12.12 L22.52,-13 L14,0 L22.52,13 L7,12.12 L0,26 L-7,12.12 L-22.52,13 L-14,0 L-22.52,-13 L-7,-12.12 Z";

function Star6Tile({ stroke, sw, op }: T) {
  const W = 80, H = 92;
  const star = (cx: number, cy: number) => (
    <path key={`${cx}-${cy}`} d={STAR6} transform={`translate(${cx},${cy})`}
          fill="none" stroke={stroke} strokeWidth={sw} strokeLinejoin="round" opacity={op}/>
  );
  return (
    <g>
      {star(W/2,H/2)} {star(0,0)} {star(W,0)} {star(0,H)} {star(W,H)}
      {star(W/2,0)} {star(W/2,H)} {star(0,H/2)} {star(W,H/2)}
    </g>
  );
}

// ─── Losangos Entrelaçados (tile 60×60) ───────────────────────────────────────
function DiamondsTile({ stroke, sw, op }: T) {
  const S = 60, H = 30;
  return (
    <g fill="none" stroke={stroke} opacity={op}>
      <path d={`M${H},4 L${S-4},${H} L${H},${S-4} L4,${H} Z`} strokeWidth={sw * 1.2}/>
      <path d={`M${H},14 L${S-14},${H} L${H},${S-14} L14,${H} Z`} strokeWidth={sw * 0.8}/>
      <path d={`M${H},22 L${S-22},${H} L${H},${S-22} L22,${H} Z`} strokeWidth={sw * 0.6}/>
      <circle cx={H} cy={2}   r={1.5} fill={stroke} stroke="none"/>
      <circle cx={H} cy={S-2} r={1.5} fill={stroke} stroke="none"/>
      <circle cx={2} cy={H}   r={1.5} fill={stroke} stroke="none"/>
      <circle cx={S-2} cy={H} r={1.5} fill={stroke} stroke="none"/>
    </g>
  );
}

// ─── Quatrefoil (tile 60×60) ─────────────────────────────────────────────────
function QuatrefoilTile({ stroke, sw, op }: T) {
  const S = 60, H = 30, r = 16;
  return (
    <g fill="none" stroke={stroke} opacity={op}>
      <circle cx={H}     cy={H-r} r={r} strokeWidth={sw}/>
      <circle cx={H+r}   cy={H}   r={r} strokeWidth={sw}/>
      <circle cx={H}     cy={H+r} r={r} strokeWidth={sw}/>
      <circle cx={H-r}   cy={H}   r={r} strokeWidth={sw}/>
      <circle cx={H} cy={H} r={5} strokeWidth={sw * 0.8}/>
      <circle cx={H} cy={H} r={2} fill={stroke} stroke="none"/>
      <circle cx={0}  cy={0}  r={r} strokeWidth={sw}/><circle cx={S} cy={0}  r={r} strokeWidth={sw}/>
      <circle cx={0}  cy={S}  r={r} strokeWidth={sw}/><circle cx={S} cy={S}  r={r} strokeWidth={sw}/>
    </g>
  );
}

// ─── Dispatcher ───────────────────────────────────────────────────────────────
export function getTileForModel(id: ArabesqueModelId, stroke: string, sw: number, op: number): React.ReactElement {
  switch (id) {
    case "rinceaux-acanto":    return <RinceauxTile   stroke={stroke} sw={sw} op={op}/>;
    case "islamic-circles":    return <CirclesTile    stroke={stroke} sw={sw} op={op}/>;
    case "islamic-8star":      return <Star8Tile      stroke={stroke} sw={sw} op={op}/>;
    case "islamic-6star":      return <Star6Tile      stroke={stroke} sw={sw} op={op}/>;
    case "islamic-diamonds":   return <DiamondsTile   stroke={stroke} sw={sw} op={op}/>;
    case "islamic-quatrefoil": return <QuatrefoilTile stroke={stroke} sw={sw} op={op}/>;
    default:                   return <CirclesTile    stroke={stroke} sw={sw} op={op}/>;
  }
}
