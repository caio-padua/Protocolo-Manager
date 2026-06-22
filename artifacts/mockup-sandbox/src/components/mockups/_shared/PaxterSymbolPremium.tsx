// SIMBOLO PAXTER PREMIUM — pronto para usar em telas reais.
// Junta o que o CEO (Dr. Caio) aprovou:
//   1) o metal 3D real (PNG) em ouro, sobre fundo escuro (mix-blend screen);
//   2) a FAIXA de luz dourada cruzando o metal (aprovada) — larga e suave;
//   3) uma FAISCA fina correndo o contorno (pavio aceso), em loop continuo.
// Tudo isso vive no motor PaxterGlintPremium; aqui so empilhamos com o PNG e a aura.
import { useId } from "react";
import SYMBOL_PNG from "../../../assets/paxter-symbol-cut.png";
import { TRACE_FLASH_STYLE, PaxterGlintPremium } from "./traceFlash";
import { PAXTER_SYMBOL_PATH, PAXTER_SYMBOL_VIEWBOX } from "./paxterSymbolPath";

const W = PAXTER_SYMBOL_VIEWBOX.w;
const H = PAXTER_SYMBOL_VIEWBOX.h;

const PSP_STYLE = `
  @keyframes pspAura { 0%,100% { opacity:.45; transform:scale(1); } 50% { opacity:.8; transform:scale(1.08); } }
  .psp-aura { animation: pspAura 3800ms ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) { .psp-aura { animation: none; } }
`;

type Props = {
  /** tamanho em pixels (lado do quadrado) */
  size?: number;
  /** largura da faixa de luz (unidades do viewBox). Maior = faixa mais larga */
  sweepWidth?: number;
  /** brilho da faixa (1 = padrao) */
  sweepBright?: number;
  /** espessura da faisca que corre o contorno (fina por padrao) */
  glintWidth?: number;
  className?: string;
};

export function PaxterSymbolPremium({
  size = 88,
  sweepWidth = 175,
  sweepBright = 1.12,
  glintWidth = 5,
  className,
}: Props) {
  const uid = useId().replace(/:/g, "");
  return (
    <div className={`relative ${className ?? ""}`} style={{ width: size, height: size }}>
      <style>{TRACE_FLASH_STYLE + PSP_STYLE}</style>

      {/* aura dourada pulsando suave (alto relevo do metal sobre o escuro) */}
      <div
        key={uid}
        className="psp-aura absolute"
        style={{
          inset: -size * 0.2,
          mixBlendMode: "screen",
          filter: "blur(9px)",
          background: "radial-gradient(circle, rgba(255,201,112,0.45), rgba(255,201,112,0.12) 50%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      {/* metal 3D real */}
      <img
        src={SYMBOL_PNG}
        alt="Paxter"
        className="absolute inset-0 w-full h-full object-contain"
        style={{ mixBlendMode: "screen", filter: "contrast(1.12) saturate(1.18) brightness(1.06)" }}
      />

      {/* faixa de luz aprovada + faisca fina correndo o contorno (loop continuo) */}
      <PaxterGlintPremium
        d={PAXTER_SYMBOL_PATH}
        size={size}
        viewBox={`0 0 ${W} ${H}`}
        sweepWidth={sweepWidth}
        sweepBright={sweepBright}
        glintWidth={glintWidth}
        sweepMs={3600}
        flashMs={3200}
        className="absolute inset-0"
      />
    </div>
  );
}
