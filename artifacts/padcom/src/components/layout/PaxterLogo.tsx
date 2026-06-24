import { PAXTER_SITE_URL } from "@/lib/brand";
import { PaxterSymbolGlass } from "./paxter-fx/PaxterSymbolGlass";
import { PaxterLockup } from "./paxter-fx/PaxterLockup";

interface PaxterLogoProps {
  className?: string;
  /** "sm" = barra superior mobile (horizontal). "md" = topo da sidebar (vertical). */
  size?: "sm" | "md";
  /** Sidebar recolhida: mostra so o simbolo. */
  collapsed?: boolean;
  /** Logo vira link para o site institucional. */
  href?: string;
}

// Logo PAXTER — conjunto da marca (simbolo de vidro + nome + frase) com a luz viva,
// servido pela FONTE UNICA PaxterLockup. A luz desce do simbolo para o nome+frase.
export function PaxterLogo({
  className = "",
  size = "md",
  collapsed = false,
  href,
}: PaxterLogoProps) {
  let inner: React.ReactNode;

  if (collapsed) {
    // Sidebar recolhida: so o simbolo.
    inner = (
      <div className={`flex items-center justify-center ${className}`}>
        <PaxterSymbolGlass size={46} tone="dark" />
      </div>
    );
  } else if (size === "sm") {
    // Barra superior mobile: conjunto completo (simbolo + nome + frase), compacto.
    inner = (
      <PaxterLockup
        orientation="horizontal"
        symbolPx={40}
        wordWidth={132}
        showTagline
        className={className}
      />
    );
  } else {
    // Topo da sidebar: simbolo + PAXTER + frase "Clinical Intelligence System" (vertical).
    inner = (
      <PaxterLockup
        orientation="vertical"
        symbolPx={60}
        wordWidth={176}
        showTagline
        className={className}
      />
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
