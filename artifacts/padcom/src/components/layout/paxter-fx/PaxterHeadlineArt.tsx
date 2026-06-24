// "PAXTER" + "Clinical Intelligence System" = ARTE OFICIAL (raster) + LUZ VIVA.
// Wrapper fino do motor unico PaxterRasterGlow com a HEADLINE oficial (nome + frase
// no MESMO ouro 3D bisel). A mesma faixa de luz percorre o nome E a frase numa unica
// passada (decisao do CEO 24/06/2026: "a frase tambem brilha, tudo junto"). A frase
// NUNCA e texto chapado — e a arte 3D oficial, como o nome.
//
// A mascara (paxter-headline-clean.png) foi gerada a partir da headline binarizando o
// canal alpha (remove a sombra suave) — mesma logica do par paxter-paxter(-clean).
import headlinePng from "@/assets/brand/paxter-headline.png";
import headlineWebp from "@/assets/brand/paxter-headline.webp";
import headlineCleanPng from "@/assets/brand/paxter-headline-clean.png";
import { PaxterRasterGlow } from "./PaxterRasterGlow";

type Props = {
  /** largura em pixels (altura sai por proporcao da arte: 1019x275) */
  width?: number;
  /** fundo onde a arte mora. dark=navy (arte oficial c/ sombra). light=creme (arte limpa). */
  tone?: "dark" | "light";
  /** atraso do ciclo de luz, p/ a luz descer do simbolo para o nome+frase (cascata) */
  cycleDelay?: number;
  className?: string;
};

export function PaxterHeadlineArt({ width = 220, tone = "dark", cycleDelay = 900, className }: Props) {
  return (
    <PaxterRasterGlow
      facePng={headlinePng}
      faceWebp={headlineWebp}
      faceCleanPng={headlineCleanPng}
      width={width}
      tone={tone}
      cycleDelay={cycleDelay}
      className={className}
      alt="PAXTER — Clinical Intelligence System"
    />
  );
}

export default PaxterHeadlineArt;
