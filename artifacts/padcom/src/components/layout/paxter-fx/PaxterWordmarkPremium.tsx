// PALAVRA "PAXTER" PREMIUM — ouro 3D limpo + luz do motor unico.
// A FACE e desenhada a partir do CONTORNO OFICIAL (WORD_LETTERS, carbono potrace
// da arte aprovada): profundidade + frente em gradiente de ouro.
// LUZ (reintroduzida por decisao do CEO 24/06/2026): o MESMO efeito do simbolo
// (faixa-sol especular + faisca de contorno) corre por cima, via o motor unico
// `PaxterGlintPremium` (traceFlash) — NUNCA um fork. As letras (1026x150) sao
// mais largas que o simbolo, entao passamos props opcionais: viewBox/transforms
// por letra, largura do glint para tracos finos e o alcance do sweep.
import { useId } from "react";
import { WORD_LETTERS, WORD_VB } from "./paxterVectorPaths";
import { TRACE_FLASH_STYLE, PaxterGlintPremium } from "./traceFlash";

const W = WORD_VB.w; // 1026
const H = WORD_VB.h; // 150

type Props = {
  /** largura em pixels da palavra (altura sai por proporcao) */
  width?: number;
  /** atraso do ciclo, para a luz "descer" do simbolo para o nome */
  cycleDelay?: number;
  className?: string;
  /** fundo onde a palavra mora. "light" = creme: borda ESCURA + relevo p/ delimitar (a
   *  borda clara some no creme). "dark" = navy: mantem a borda clara original. */
  tone?: "dark" | "light";
};

export function PaxterWordmarkPremium({ width = 176, cycleDelay = 900, className, tone = "dark" }: Props) {
  const uid = useId().replace(/:/g, "");
  const gold = `pww-gold-${uid}`;
  const goldDepth = `pww-depth-${uid}`;
  const fLift = `pww-lift-${uid}`;
  const height = (width * H) / W;
  // No CLARO o ouro encosta no creme: borda clara desaparece. Trocamos por borda escura
  // (delimita, "contorno escuro" so na transicao) e reforcamos o relevo (luz no topo +
  // sombra embaixo). No ESCURO mantemos a borda clara original.
  const isLight = tone === "light";
  const faceStroke = isLight ? "#3a2206" : "#FFF1A8";
  const faceStrokeW = isLight ? 1.1 : 0.8;
  const letterPaths = WORD_LETTERS.map((l) => l.d);
  const letterTransforms = WORD_LETTERS.map((l) => `translate(${l.ox},0)`);

  return (
    <div className={className} style={{ position: "relative", width, height, lineHeight: 0 }}>
      <style>{TRACE_FLASH_STYLE}</style>
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
            {/* CLARO: contorno escuro fino p/ separar o ouro do creme (so no claro) */}
            {isLight && (
              <feDropShadow dx="0" dy="0.6" stdDeviation="0.5" floodColor="#241000" floodOpacity="0.6" />
            )}
            <feDropShadow dx="0" dy="0.8" stdDeviation="0.5" floodColor="#FFF1A8" floodOpacity={isLight ? 0.45 : 0.32} />
            <feDropShadow dx="0" dy="2.4" stdDeviation="1.6" floodColor="#5F3708" floodOpacity="0.7" />
            <feDropShadow dx="0" dy="5" stdDeviation="3.4" floodColor="#000000" floodOpacity={isLight ? 0.42 : 0.5} />
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
              <path d={l.d} fill={`url(#${gold})`} stroke={faceStroke} strokeWidth={faceStrokeW} />
            </g>
          ))}
        </g>
      </svg>

      {/* LUZ por cima (motor unico): faixa-sol especular recortada nas letras +
          faisca de contorno. sweep com alcance proprio para a largura da palavra. */}
      <PaxterGlintPremium
        d={letterPaths}
        transforms={letterTransforms}
        viewBox={`0 0 ${W} ${H}`}
        width={width}
        height={height}
        sweepWidth={W * 0.42}
        sweepBright={1}
        glintWidthOuter={4.5}
        glintWidthInner={1.6}
        sweep={{ from: -W * 0.35, to: W * 1.05 }}
        sweepMs={12000}
        flashMs={12000}
        flashDelay={cycleDelay}
        sweepDelay={cycleDelay}
        style={{ position: "absolute", inset: 0 }}
      />
    </div>
  );
}
