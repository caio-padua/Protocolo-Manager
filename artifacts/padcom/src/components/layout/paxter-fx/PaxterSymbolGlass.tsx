// MEDALHAO DE VIDRO + SIMBOLO PREMIUM — fonte UNICA do efeito "glass" da marca.
// Decisao do CEO 23/06/2026: o vidro nitido cobrindo o simbolo vale para TODAS as
// telas internas e externas (anamnese, portal, area, agendar, entrada, sidebar).
// UNICA excecao: o SITE (abertura/variant hero), que segue chapado.
// O simbolo dentro e o PaxterSymbolPremium (aura + faixa de luz + faisca).
// tone "dark"  = vidro navy translucido (fundos escuros: sidebar/teal/navy).
// tone "light" = vidro champanhe um tom acima do painel claro (anamnese /v2).
import type { CSSProperties } from "react";
import { PaxterSymbolPremium } from "./PaxterSymbolPremium";

type Tone = "dark" | "light";

const GLASS: Record<Tone, CSSProperties> = {
  light: {
    background:
      "linear-gradient(158deg, rgba(255,251,242,0.92), rgba(246,236,214,0.74) 46%, rgba(232,219,193,0.62))",
    WebkitBackdropFilter: "blur(9px) saturate(118%)",
    backdropFilter: "blur(9px) saturate(118%)",
    border: "1px solid rgba(255,255,255,0.9)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -12px 20px rgba(138,109,47,0.13), 0 12px 24px -6px rgba(15,28,53,0.26), 0 3px 0 -1px rgba(138,109,47,0.22)",
  },
  dark: {
    background:
      "linear-gradient(155deg, rgba(255,255,255,0.14), rgba(255,255,255,0.03) 45%, rgba(13,24,48,0.25))",
    WebkitBackdropFilter: "blur(10px) saturate(130%)",
    backdropFilter: "blur(10px) saturate(130%)",
    border: "1px solid rgba(255,255,255,0.2)",
    boxShadow:
      "0 10px 34px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -14px 24px rgba(0,0,0,0.28)",
  },
};

interface PaxterSymbolGlassProps {
  /** Tamanho do simbolo (px). O medalhao escala junto (padding/raio proporcionais). */
  size?: number;
  tone?: Tone;
  className?: string;
}

export function PaxterSymbolGlass({
  size = 64,
  tone = "dark",
  className = "",
}: PaxterSymbolGlassProps) {
  const pad = Math.max(6, Math.round(size * 0.2));
  const radius = Math.max(10, Math.round(size * 0.28));
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius,
        padding: pad,
        ...GLASS[tone],
      }}
    >
      <PaxterSymbolPremium size={size} />
    </span>
  );
}

export default PaxterSymbolGlass;
