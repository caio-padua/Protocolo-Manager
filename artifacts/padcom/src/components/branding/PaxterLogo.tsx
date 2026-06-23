import "./PaxterLogo.css";
import type { CSSProperties } from "react";
import paxterSymbol from "@/assets/paxter-symbol.png";
import { PaxterSymbolPremium } from "@/components/layout/paxter-fx/PaxterSymbolPremium";
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
    const light = tone === "light";
    // Medalhao de VIDRO. No claro: champanhe, um tom ACIMA do painel (bevel
    // saliente — luz no topo, sombra projetada embaixo). No escuro: vidro navy.
    const medallionStyle: CSSProperties = light
      ? {
          background:
            "linear-gradient(158deg, rgba(255,251,242,0.92), rgba(246,236,214,0.74) 46%, rgba(232,219,193,0.62))",
          WebkitBackdropFilter: "blur(9px) saturate(118%)",
          backdropFilter: "blur(9px) saturate(118%)",
          border: "1px solid rgba(255,255,255,0.9)",
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -12px 20px rgba(138,109,47,0.13), 0 12px 24px -6px rgba(15,28,53,0.26), 0 3px 0 -1px rgba(138,109,47,0.22)",
        }
      : {
          background:
            "linear-gradient(155deg, rgba(255,255,255,0.14), rgba(255,255,255,0.03) 45%, rgba(13,24,48,0.25))",
          WebkitBackdropFilter: "blur(10px) saturate(130%)",
          backdropFilter: "blur(10px) saturate(130%)",
          border: "1px solid rgba(255,255,255,0.2)",
          boxShadow:
            "0 10px 34px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -14px 24px rgba(0,0,0,0.28)",
        };
    return (
      <div className={`pax-lockup pax-lockup--app ${light ? "pax-tone-light" : ""} ${className}`}>
        {/* SIMBOLO PREMIUM (aura + faixa de luz + faisca no contorno) DENTRO do
            vidro que engloba a moldura em ouro — efeitos aprovados pelo CEO. */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 18,
            padding: 12,
            ...medallionStyle,
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
