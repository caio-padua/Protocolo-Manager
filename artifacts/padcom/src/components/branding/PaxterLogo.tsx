import "./PaxterLogo.css";
import paxterSymbol from "@/assets/paxter-symbol.png";
import headlinePng from "@/assets/brand/paxter-headline.png";
import headlineWebp from "@/assets/brand/paxter-headline.webp";
import paxterPng from "@/assets/brand/paxter-paxter.png";
import paxterWebp from "@/assets/brand/paxter-paxter.webp";
import precisionPng from "@/assets/brand/paxter-precision.png";
import precisionWebp from "@/assets/brand/paxter-precision.webp";
import subtitlePng from "@/assets/brand/paxter-subtitle.png";
import subtitleWebp from "@/assets/brand/paxter-subtitle.webp";

interface PaxterLogoProps {
  /** "hero" = simbolo(vidro) + PAXTER+Clinical(brilho) + frases. "compact" = simbolo + PAXTER. */
  variant?: "hero" | "compact";
  className?: string;
}

/*
  Lockup VIVO da marca Paxter (decisao do CEO 23/06/2026).
  - Vidro SO no simbolo; PAXTER/Clinical com ouro real do anexo + brilho que percorre.
  - Convive com o lockup do sidebar em components/layout/PaxterLogo.tsx (nao o substitui).
*/
export function PaxterLogo({ variant = "hero", className = "" }: PaxterLogoProps) {
  const symbol = (
    <span className="pax-symbol">
      <img src={paxterSymbol} alt="PAXTER" draggable={false} />
    </span>
  );

  if (variant === "compact") {
    return (
      <div className={`pax-lockup pax-lockup--compact ${className}`}>
        {symbol}
        <span className="pax-word">
          <picture>
            <source srcSet={paxterWebp} type="image/webp" />
            <img src={paxterPng} alt="PAXTER" draggable={false} />
          </picture>
        </span>
      </div>
    );
  }

  return (
    <div className={`pax-lockup pax-lockup--hero ${className}`}>
      {symbol}

      {/* PAXTER + Clinical Intelligence System — ouro real + brilho que percorre */}
      <span className="pax-word">
        <picture>
          <source srcSet={headlineWebp} type="image/webp" />
          <img src={headlinePng} alt="PAXTER — Clinical Intelligence System" draggable={false} />
        </picture>
        <span
          className="pax-sheen"
          aria-hidden="true"
          style={{ WebkitMaskImage: `url(${headlinePng})`, maskImage: `url(${headlinePng})` }}
        />
      </span>

      {/* PRECISION IN INTEGRATIVE CARE */}
      <span className="pax-tag">
        <picture>
          <source srcSet={precisionWebp} type="image/webp" />
          <img src={precisionPng} alt="Precision in integrative care" draggable={false} />
        </picture>
      </span>

      {/* AI-guided prescriptions, exams and injectable protocols */}
      <span className="pax-sub">
        <picture>
          <source srcSet={subtitleWebp} type="image/webp" />
          <img
            src={subtitlePng}
            alt="AI-guided prescriptions, exams and injectable protocols"
            draggable={false}
          />
        </picture>
      </span>
    </div>
  );
}

export default PaxterLogo;
