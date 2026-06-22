import paxterSymbol from "@/assets/paxter-symbol.png";
import { PAXTER_SITE_URL } from "@/lib/brand";

interface PaxterLogoProps {
  className?: string;
  showText?: boolean;
  size?: "sm" | "md" | "lg";
  /** "dark" = fundo escuro (simbolo dourado direto + glow). "light" = fundo claro (medalhao navy p/ o dourado saltar). */
  tone?: "dark" | "light";
  /** Subtitulo "Motor Clinico - Protocolos Injetaveis" abaixo do wordmark. */
  subtitle?: boolean;
  /** Quando presente, o logo vira link clicavel que abre o site da Paxter em nova aba (data-bind pronto). */
  href?: string;
}

// Logo unico do sistema PAXTER. Substitui o antigo PadconLogo.
// Em fundo claro usa um MEDALHAO navy com anel dourado para o simbolo dourado
// nao "sumir" (padrao de luxo, decisao do CEO 22/06/2026).
export function PaxterLogo({
  className = "",
  showText = true,
  size = "md",
  tone = "dark",
  subtitle = false,
  href,
}: PaxterLogoProps) {
  const medal = size === "sm" ? "h-8 w-8" : size === "md" ? "h-10 w-10" : "h-14 w-14";
  const img = size === "sm" ? "h-6 w-6" : size === "md" ? "h-7 w-7" : "h-10 w-10";
  const wordSize = size === "sm" ? "text-base" : size === "md" ? "text-xl" : "text-2xl";
  const subSize = size === "sm" ? "text-[8px]" : size === "md" ? "text-[9px]" : "text-[11px]";

  const word = tone === "light" ? "text-[#0d1830]" : "text-[#f1dca6]";
  const sub = tone === "light" ? "text-[#3D7A7A]" : "text-[#8aa0c4]";

  const symbol =
    tone === "light" ? (
      // Medalhao navy: o dourado salta sobre o fundo escuro com anel dourado fino.
      <span
        className={`relative flex items-center justify-center ${medal} rounded-[7px] shrink-0`}
        style={{
          background: "linear-gradient(180deg,#16284a 0%,#0d1830 70%,#0b1426 100%)",
          border: "1px solid rgba(194,160,90,0.55)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 12px rgba(0,0,0,0.25)",
        }}
      >
        <img
          src={paxterSymbol}
          alt="PAXTER"
          className={`${img} object-contain`}
          style={{ filter: "drop-shadow(0 0 8px rgba(194,160,90,0.45))" }}
        />
      </span>
    ) : (
      <img
        src={paxterSymbol}
        alt="PAXTER"
        className={`${img.replace("h-6", "h-8").replace("h-7", "h-9").replace("h-10", "h-12")} object-contain shrink-0`}
        style={{ filter: "drop-shadow(0 0 18px rgba(194,160,90,0.45))" }}
      />
    );

  const content = (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {symbol}
      {showText && (
        <div className="flex flex-col leading-none">
          <span className={`${wordSize} font-bold tracking-[0.18em] ${word}`}>PAXTER</span>
          {subtitle && (
            <span className={`${subSize} tracking-[0.22em] uppercase ${sub} font-semibold mt-1`}>
              Motor Clínico · Protocolos Injetáveis
            </span>
          )}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <a
        href={href || PAXTER_SITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="PAXTER — site institucional"
        className="inline-flex transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c2a05a]/70 rounded-[8px]"
      >
        {content}
      </a>
    );
  }
  return content;
}
