// SIMBOLO PAXTER PREMIUM — efeito aprovado pelo CEO, agora dentro do app real.
//   1) metal 3D real (PNG) em ouro, sobre fundo escuro (mix-blend screen);
//   2) FAIXA de luz dourada cruzando o metal (aprovada) — larga e suave;
//   3) FAISCA fina correndo o contorno (pavio aceso), em loop continuo.
// Motor: PaxterGlintPremium (traceFlash). Copia fiel do mockup aprovado.
import { useId } from "react";
import SYMBOL_PNG from "@/assets/brand/paxter-symbol-cut.png";
import { TRACE_FLASH_STYLE, PaxterGlintPremium } from "./traceFlash";
import { PAXTER_SYMBOL_PATH, PAXTER_SYMBOL_VIEWBOX } from "./paxterSymbolPath";

const W = PAXTER_SYMBOL_VIEWBOX.w;
const H = PAXTER_SYMBOL_VIEWBOX.h;

const PSP_STYLE = `
  @keyframes pspAura { 0%,100% { opacity:.40; transform:scale(1); } 50% { opacity:.72; transform:scale(1.06); } }
  .psp-aura { animation: pspAura 3800ms ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) { .psp-aura { animation: none; opacity:.45; } }
`;

type Props = {
  size?: number;
  sweepWidth?: number;
  sweepBright?: number;
  glintWidth?: number;
  /** atraso do ciclo (para a palavra/simbolo entrarem em sequencia) */
  cycleDelay?: number;
  className?: string;
};

export function PaxterSymbolPremium({
  size = 60,
  sweepWidth = 175,
  sweepBright = 1.1,
  glintWidth = 5,
  cycleDelay = 0,
  className,
}: Props) {
  const uid = useId().replace(/:/g, "");
  return (
    <div className={`relative ${className ?? ""}`} style={{ width: size, height: size }}>
      <style>{TRACE_FLASH_STYLE + PSP_STYLE}</style>

      {/* aura dourada pulsando suave */}
      <div
        key={uid}
        className="psp-aura absolute"
        style={{
          inset: -size * 0.18,
          mixBlendMode: "screen",
          filter: "blur(8px)",
          background:
            "radial-gradient(circle, rgba(255,201,112,0.40), rgba(255,201,112,0.10) 50%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* metal 3D real */}
      <img
        src={SYMBOL_PNG}
        alt="PAXTER"
        className="absolute inset-0 w-full h-full object-contain"
        draggable={false}
        style={{ mixBlendMode: "screen", filter: "contrast(1.1) saturate(1.16) brightness(1.05)" }}
      />

      {/* faixa de luz + faisca correndo o contorno */}
      <PaxterGlintPremium
        d={PAXTER_SYMBOL_PATH}
        size={size}
        viewBox={`0 0 ${W} ${H}`}
        sweepWidth={sweepWidth}
        sweepBright={sweepBright}
        glintWidth={glintWidth}
        sweepMs={12000}
        flashMs={12000}
        flashDelay={cycleDelay}
        sweepDelay={cycleDelay}
        className="absolute inset-0"
      />
    </div>
  );
}
