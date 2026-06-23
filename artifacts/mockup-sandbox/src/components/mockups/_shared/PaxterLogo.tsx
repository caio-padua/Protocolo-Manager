import "./PaxterLogo.css";
import paxterSymbol from "@/assets/paxter-symbol.png";
import { PaxterSymbolPremium } from "./PaxterSymbolPremium";
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
   * "appHeader" = simbolo em VIDRO + PAXTER/Clinical com brilho que percorre (app/anamnese).
   * "compact"   = simbolo em vidro + PAXTER.
   * "wordmark"  = so a palavra PAXTER (rodape "Powered by").
   */
  variant?: "hero" | "appHeader" | "compact" | "wordmark";
  className?: string;
}

/*
  Lockup VIVO da marca PAXTER — Opcao A aprovada pelo CEO (23/06/2026).
  Usa os PIXELS ORIGINAIS da imagem aprovada (ouro 3D), so com o fundo removido.
  NAO usa o vetor geometrico (rejeitado: perdeu serifa/chanfro) nem fonte Cinzel.
*/
export function PaxterLogo({ variant = "hero", className = "" }: PaxterLogoProps) {
  const symbol = (
    <span className="pax-symbol">
      <img src={paxterSymbol} alt="PAXTER" draggable={false} />
    </span>
  );

  if (variant === "wordmark") {
    return (
      <span className={`pax-word--solo ${className}`}>
        <picture>
          <source srcSet={paxterWebp} type="image/webp" />
          <img src={paxterPng} alt="PAXTER" draggable={false} />
        </picture>
      </span>
    );
  }

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

  if (variant === "appHeader") {
    return (
      <div className={`pax-lockup pax-lockup--app ${className}`}>
        {/* SIMBOLO PREMIUM (aura + faixa de luz + faisca no contorno) DENTRO do
            vidro que engloba a moldura em ouro — efeitos aprovados pelo CEO. */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 18,
            padding: 12,
            background:
              "linear-gradient(155deg, rgba(255,255,255,0.14), rgba(255,255,255,0.03) 45%, rgba(13,24,48,0.25))",
            WebkitBackdropFilter: "blur(10px) saturate(130%)",
            backdropFilter: "blur(10px) saturate(130%)",
            border: "1px solid rgba(255,255,255,0.2)",
            boxShadow:
              "0 10px 34px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -14px 24px rgba(0,0,0,0.28)",
          }}
        >
          <PaxterSymbolPremium size={64} />
        </span>
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
      </div>
    );
  }

  // hero (site)
  return (
    <div className={`pax-lockup pax-lockup--hero ${className}`}>
      {symbol}

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

      <span className="pax-tag">
        <picture>
          <source srcSet={precisionWebp} type="image/webp" />
          <img src={precisionPng} alt="Precision in integrative care" draggable={false} />
        </picture>
      </span>

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
