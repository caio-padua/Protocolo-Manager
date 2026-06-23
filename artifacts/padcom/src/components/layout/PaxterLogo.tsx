import "./PaxterLogo.css";
import symbolCut from "@/assets/brand/paxter-symbol-cut.png";
import headlinePng from "@/assets/brand/paxter-headline.png";
import headlineWebp from "@/assets/brand/paxter-headline.webp";
import paxterPng from "@/assets/brand/paxter-paxter.png";
import paxterWebp from "@/assets/brand/paxter-paxter.webp";
import { PAXTER_SITE_URL } from "@/lib/brand";

interface PaxterLogoProps {
  className?: string;
  /** "sm" = barra superior mobile (horizontal). "md" = topo da sidebar (vertical). */
  size?: "sm" | "md";
  /** Sidebar recolhida: mostra so o simbolo. */
  collapsed?: boolean;
  /** Logo vira link para o site institucional. */
  href?: string;
}

// Logo unico do sistema PAXTER (pixels reais do anexo, ouro 3D + faixa de luz).
export function PaxterLogo({
  className = "",
  size = "md",
  collapsed = false,
  href,
}: PaxterLogoProps) {
  const symPx = collapsed ? 46 : size === "sm" ? 40 : 60;

  const symbol = (
    <span className="pxs-symbol" style={{ width: symPx, height: symPx }}>
      <img src={symbolCut} alt="PAXTER" draggable={false} />
      <span
        className="pxs-sheen pxs-sheen--symbol"
        aria-hidden="true"
        style={{ WebkitMaskImage: `url(${symbolCut})`, maskImage: `url(${symbolCut})` }}
      />
    </span>
  );

  let inner: React.ReactNode;

  if (collapsed) {
    inner = <div className={`pxs-lockup ${className}`}>{symbol}</div>;
  } else if (size === "sm") {
    // Barra superior mobile: simbolo + PAXTER (horizontal, compacto)
    inner = (
      <div className={`pxs-lockup pxs-lockup--row ${className}`}>
        {symbol}
        <span className="pxs-word" style={{ width: 116 }}>
          <picture>
            <source srcSet={paxterWebp} type="image/webp" />
            <img src={paxterPng} alt="PAXTER" draggable={false} />
          </picture>
          <span
            className="pxs-sheen pxs-sheen--word"
            aria-hidden="true"
            style={{ WebkitMaskImage: `url(${paxterPng})`, maskImage: `url(${paxterPng})` }}
          />
        </span>
      </div>
    );
  } else {
    // Topo da sidebar: simbolo + PAXTER + Clinical Intelligence System (vertical)
    inner = (
      <div className={`pxs-lockup ${className}`}>
        {symbol}
        <span className="pxs-word" style={{ width: 176 }}>
          <picture>
            <source srcSet={headlineWebp} type="image/webp" />
            <img
              src={headlinePng}
              alt="PAXTER — Clinical Intelligence System"
              draggable={false}
            />
          </picture>
          <span
            className="pxs-sheen pxs-sheen--word"
            aria-hidden="true"
            style={{ WebkitMaskImage: `url(${headlinePng})`, maskImage: `url(${headlinePng})` }}
          />
        </span>
      </div>
    );
  }

  if (href) {
    return (
      <a
        href={href || PAXTER_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="PAXTER — site institucional"
        className="inline-flex transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/70 rounded-[8px]"
      >
        {inner}
      </a>
    );
  }

  return inner;
}
