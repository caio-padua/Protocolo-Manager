import "./PaxterLogo.css";
import paxterSymbol from "@/assets/paxter-symbol.png";
import { PaxterSymbolGlass } from "@/components/layout/paxter-fx/PaxterSymbolGlass";
import headlinePng from "@/assets/brand/paxter-headline.png";
import headlineWebp from "@/assets/brand/paxter-headline.webp";
import paxterPng from "@/assets/brand/paxter-paxter.png";
import paxterWebp from "@/assets/brand/paxter-paxter.webp";
import precisionPng from "@/assets/brand/paxter-precision.png";
import precisionWebp from "@/assets/brand/paxter-precision.webp";
import subtitlePng from "@/assets/brand/paxter-subtitle.png";
import subtitleWebp from "@/assets/brand/paxter-subtitle.webp";

interface PaxterLogoProps {
  /**
   * "hero"      = simbolo chapado + PAXTER/Clinical (brilho) + Precision + subtitle (site).
   * "appHeader" = simbolo PREMIUM em VIDRO + PAXTER/Clinical com brilho (app/anamnese).
   * "compact"   = simbolo em vidro + PAXTER.
   */
  variant?: "hero" | "appHeader" | "compact";
  /**
   * Tom do fundo onde o lockup vai pousar (so afeta "appHeader"):
   * "dark"  = medalhao de VIDRO navy + ouro em screen (padrao).
   * "light" = medalhao de VIDRO CHAMPANHE, um tom ACIMA do painel claro
   *           (bevel saliente), com ouro em blend normal (sem placa azul).
   */
  tone?: "dark" | "light";
  className?: string;
}

/*
  Lockup VIVO da marca Paxter (decisao do CEO 23/06/2026).
  - Vidro SO no simbolo; PAXTER/Clinical com ouro real do anexo + brilho que percorre.
  - "appHeader" usa o PaxterSymbolPremium (aura + faixa de luz + faisca) DENTRO do
    medalhao de vidro — efeitos aprovados pelo CEO para a anamnese/app real.
  - Convive com o lockup do sidebar em components/layout/PaxterLogo.tsx (nao o substitui).
*/
export function PaxterLogo({ variant = "hero", tone = "dark", className = "" }: PaxterLogoProps) {
  const symbol = (
    <span className="pax-symbol">
      <img src={paxterSymbol} alt="PAXTER" draggable={false} />
    </span>
  );

  if (variant === "compact") {
    const light = tone === "light";
    return (
      <div className={`pax-lockup pax-lockup--compact ${className}`}>
        <PaxterSymbolGlass size={44} tone={light ? "light" : "dark"} />
        <span className="pax-word">
          <picture>
            <source srcSet={paxterWebp} type="image/webp" />
            <img src={paxterPng} alt="PAXTER" draggable={false} />
          </picture>
        </span>
      </div>
    );
  }

  if (variant === "appHeader") {
    const light = tone === "light";
    return (
      <div className={`pax-lockup pax-lockup--app ${light ? "pax-tone-light" : ""} ${className}`}>
        {/* SIMBOLO PREMIUM dentro do MEDALHAO DE VIDRO — fonte unica em PaxterSymbolGlass. */}
        <PaxterSymbolGlass size={64} tone={light ? "light" : "dark"} />
        <span className="pax-word">
          <picture>
            <source srcSet={headlineWebp} type="image/webp" />
            <img src={headlinePng} alt="PAXTER — Clinical Intelligence System" draggable={false} />
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
