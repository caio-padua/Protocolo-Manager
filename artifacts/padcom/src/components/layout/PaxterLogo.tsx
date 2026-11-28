import { PAXTER_SITE_URL } from "@/lib/brand";
import { PaxterSymbolGlass } from "./paxter-fx/PaxterSymbolGlass";
import { PaxterLockup } from "./paxter-fx/PaxterLockup";
import { PaxterHeadlineArt } from "./paxter-fx/PaxterHeadlineArt";

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
const WORD_W = 190; // largura da palavra no topo da barra (+8% sobre 176)

export function PaxterLogo({
  className = "",
  size = "md",
  collapsed = false,
  href,
}: PaxterLogoProps) {
  let inner: React.ReactNode;

  if (size === "md") {
    // Topo da sidebar: um único conjunto. Recolhido: só o símbolo. Ao expandir, a palavra só aparece
    // DEPOIS que a barra terminou de alargar (300 ms); ao recolher, some na hora. Nunca sobrepõe.
    inner = (
      <div className={`flex flex-col items-center ${className}`}>
        <PaxterSymbolGlass size={collapsed ? 46 : 60} tone="dark" />
        <div
          aria-hidden={collapsed}
          style={{
            width: WORD_W,
            maxHeight: collapsed ? 0 : 90,
            marginTop: collapsed ? 0 : 12,
            opacity: collapsed ? 0 : 1,
            overflow: "hidden",
            pointerEvents: collapsed ? "none" : undefined,
            transition: collapsed
              ? "opacity 120ms ease-out, max-height 300ms ease-in-out, margin-top 300ms ease-in-out"
              : "opacity 260ms ease-out 300ms, max-height 300ms ease-in-out, margin-top 300ms ease-in-out",
          }}
        >
          <PaxterHeadlineArt width={WORD_W} tone="dark" cycleDelay={900} />
        </div>
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
