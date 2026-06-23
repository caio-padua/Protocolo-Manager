import { useId } from "react";
import { PADCON_SITE_URL } from "@/lib/brand";

// Lockup da PADCON (empresa que desenvolve o Paxter) para o rodape do site.
// Simbolo proprio (SVG geometrico, dourado) + wordmark "PADCON" + tagline EN.
// A area inteira e clicavel e abre o site da PADCON em nova aba (data-bind:
// PADCON_SITE_URL em lib/brand.ts).
//
// Conceito do simbolo: monograma "P" de ARQUITETURA DE SISTEMAS — uma espinha
// vertical com NOS (circulos = sistemas conectados) e a "tigela" do P como um
// arco fechado, dentro de uma moldura fina (blueprint). Tudo em linha dourada,
// sem preenchimento espalhado, para nao gerar brilho que lave o fundo.

export function PadconLogo({ className = "" }: { className?: string }) {
  const uid = useId();
  const gold = `pad-gold-${uid}`;

  return (
    <a
      href={PADCON_SITE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Abrir o site da PADCON"
      className={`group inline-flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 transition-all duration-300 hover:border-[#c2a05a]/45 hover:bg-white/[0.06] ${className}`}
    >
      <svg
        width="36"
        height="36"
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
        className="flex-shrink-0 transition-transform duration-300 group-hover:scale-105"
      >
        <defs>
          <linearGradient id={gold} x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f1dca6" />
            <stop offset="0.5" stopColor="#d9bd7e" />
            <stop offset="1" stopColor="#b8924d" />
          </linearGradient>
        </defs>
        {/* Moldura blueprint */}
        <rect x="3" y="3" width="42" height="42" rx="11" stroke={`url(#${gold})`} strokeWidth="1.5" opacity="0.5" />
        {/* Espinha do P */}
        <path d="M18 13 V35" stroke={`url(#${gold})`} strokeWidth="3.2" strokeLinecap="round" />
        {/* Tigela do P */}
        <path d="M18 13 H28 a7 7 0 0 1 0 14 H18" stroke={`url(#${gold})`} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        {/* Nos (sistemas conectados) */}
        <circle cx="18" cy="13" r="2.5" fill={`url(#${gold})`} />
        <circle cx="18" cy="35" r="2.5" fill={`url(#${gold})`} />
        <circle cx="29" cy="20" r="1.9" fill={`url(#${gold})`} />
      </svg>
      <span className="leading-tight text-left">
        <span className="block font-serif text-base font-semibold tracking-[0.3em] text-[#e8cf95]">
          PADCON
        </span>
        <span className="block text-[8px] font-medium uppercase tracking-[0.24em] text-white/45">
          Advanced Systems Architecture
        </span>
      </span>
    </a>
  );
}
