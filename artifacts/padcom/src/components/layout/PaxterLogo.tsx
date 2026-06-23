import subtitlePng from "@/assets/brand/paxter-subtitle.png";
import subtitleWebp from "@/assets/brand/paxter-subtitle.webp";
import { PAXTER_SITE_URL } from "@/lib/brand";
import { PaxterSymbolGlass } from "./paxter-fx/PaxterSymbolGlass";
import { PaxterWordmarkPremium } from "./paxter-fx/PaxterWordmarkPremium";

interface PaxterLogoProps {
  className?: string;
  /** "sm" = barra superior mobile (horizontal). "md" = topo da sidebar (vertical). */
  size?: "sm" | "md";
  /** Sidebar recolhida: mostra so o simbolo. */
  collapsed?: boolean;
  /** Logo vira link para o site institucional. */
  href?: string;
}

// Logo PAXTER — efeito premium (aura + faixa-sol + faisca correndo o contorno)
// no SIMBOLO e ESTENDIDO a palavra "PAXTER". A luz desce do simbolo para o nome.
export function PaxterLogo({
  className = "",
  size = "md",
  collapsed = false,
  href,
}: PaxterLogoProps) {
  const symPx = collapsed ? 46 : size === "sm" ? 40 : 60;
  // A luz "desce": o simbolo lidera, a palavra entra ~900ms depois (mesmo ciclo 12s).
  const WORD_DELAY = 900;

  const symbol = <PaxterSymbolGlass size={symPx} tone="dark" />;

  let inner: React.ReactNode;

  if (collapsed) {
    inner = <div className={`flex items-center justify-center ${className}`}>{symbol}</div>;
  } else if (size === "sm") {
    // Barra superior mobile: simbolo + PAXTER (horizontal, compacto)
    inner = (
      <div className={`flex flex-row items-center gap-2.5 ${className}`}>
        {symbol}
        <PaxterWordmarkPremium width={116} cycleDelay={WORD_DELAY} />
      </div>
    );
  } else {
    // Topo da sidebar: simbolo + PAXTER + subtitulo (vertical)
    inner = (
      <div className={`flex flex-col items-center gap-3 ${className}`}>
        {symbol}
        <PaxterWordmarkPremium width={176} cycleDelay={WORD_DELAY} />
        <picture>
          <source srcSet={subtitleWebp} type="image/webp" />
          <img
            src={subtitlePng}
            alt="Clinical Intelligence System"
            draggable={false}
            style={{ width: 176, height: "auto", display: "block" }}
          />
        </picture>
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
