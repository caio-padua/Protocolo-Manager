// PALAVRA "PAXTER" = ARTE OFICIAL (raster) + LUZ VIVA por cima.
// Wrapper fino do motor unico PaxterRasterGlow com os assets do nome "PAXTER".
// (decisao do CEO 24/06/2026: face oficial 3D + luz mascarada que nunca serrilha.)
import paxterPaxterPng from "@/assets/brand/paxter-paxter.png";
import paxterPaxterWebp from "@/assets/brand/paxter-paxter.webp";
import paxterPaxterCleanPng from "@/assets/brand/paxter-paxter-clean.png";
import { PaxterRasterGlow } from "./PaxterRasterGlow";

type Props = {
  /** largura em pixels (altura sai por proporcao da arte) */
  width?: number;
  /** fundo onde a palavra mora. dark=navy (arte oficial c/ sombra). light=creme (arte sem halo). */
  tone?: "dark" | "light";
  /** atraso do ciclo de luz, p/ a luz descer do simbolo para o nome (cascata) */
  cycleDelay?: number;
  className?: string;
};

export function PaxterWordmarkArt({ width = 168, tone = "dark", cycleDelay = 900, className }: Props) {
  return (
    <PaxterRasterGlow
      facePng={paxterPaxterPng}
      faceWebp={paxterPaxterWebp}
      faceCleanPng={paxterPaxterCleanPng}
      width={width}
      tone={tone}
      cycleDelay={cycleDelay}
      className={className}
      alt="PAXTER"
    />
  );
}

export default PaxterWordmarkArt;
