// FONTE UNICA do conjunto da marca PAXTER (decisao do CEO 24/06/2026).
//
// Monta: SIMBOLO de vidro (PaxterSymbolGlass) + HEADLINE 3D com luz (PaxterHeadlineArt =
// "PAXTER" + "Clinical Intelligence System" no mesmo ouro 3D, com a mesma faixa de luz
// percorrendo nome E frase). A luz desce em CASCATA no mesmo ciclo de 12s: o simbolo
// lidera (delay 0), a headline entra ~900ms depois.
//
// Toda tela do sistema deve usar ESTE componente para o conjunto da marca, para que o
// nome + frase + simbolo NUNCA mais divirjam entre telas. Para mostrar so o nome (sem a
// frase), use showTagline={false} (renderiza PaxterWordmarkArt no lugar da headline).
import type { ReactNode } from "react";
import { PaxterSymbolGlass } from "./PaxterSymbolGlass";
import { PaxterHeadlineArt } from "./PaxterHeadlineArt";
import { PaxterWordmarkArt } from "./PaxterWordmarkArt";
import { PAXTER_SITE_URL } from "@/lib/brand";

// A luz desce em cascata: o simbolo lidera (ciclo proprio, delay 0) e a headline
// (nome + frase) entra ~900ms depois, no MESMO ciclo de 12s.
const WORD_DELAY = 900;

type Props = {
  /** vertical = simbolo em cima, conjunto embaixo. horizontal = simbolo a esquerda. */
  orientation?: "vertical" | "horizontal";
  /** tamanho do simbolo (px) */
  symbolPx?: number;
  /** largura da arte do nome/frase (px) */
  wordWidth?: number;
  /** fundo onde o conjunto mora */
  tone?: "dark" | "light";
  /** mostra a frase "Clinical Intelligence System" junto do nome (headline completa) */
  showTagline?: boolean;
  /** vira link para o site institucional */
  href?: string;
  className?: string;
};

export function PaxterLockup({
  orientation = "vertical",
  symbolPx = 60,
  wordWidth = 220,
  tone = "dark",
  showTagline = true,
  href,
  className = "",
}: Props) {
  const isH = orientation === "horizontal";

  const art = showTagline ? (
    <PaxterHeadlineArt width={wordWidth} tone={tone} cycleDelay={WORD_DELAY} />
  ) : (
    <PaxterWordmarkArt width={wordWidth} tone={tone} cycleDelay={WORD_DELAY} />
  );

  const inner: ReactNode = (
    <div
      className={`flex ${isH ? "flex-row items-center gap-2.5" : "flex-col items-center gap-3"} ${className}`}
    >
      <PaxterSymbolGlass size={symbolPx} tone={tone} />
      {art}
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
        {inner}
      </a>
    );
  }

  return inner;
}

export default PaxterLockup;
