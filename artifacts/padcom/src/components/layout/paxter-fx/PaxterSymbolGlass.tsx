// MEDALHAO DE VIDRO (CUPULA VALIDADA) — fonte UNICA do simbolo da marca.
// Decisao do CEO 23/06/2026 (IMG_5142/5143): moldura DOURADA fina + cupula de
// vidro perolado restrita ao ARO superior (mix-blend screen) + miolo NAVY sempre.
// O simbolo premium (aura+faixa+faisca) fica GRANDE, quase encostando na moldura.
// `tone` mantido por compatibilidade; o medalhao e navy em QUALQUER fundo (claro/escuro),
// pois o simbolo precisa de fundo escuro p/ o mix-blend screen fazer o ouro saltar.
import "./PaxterSymbolGlass.css";
import type { CSSProperties } from "react";
import { PaxterSymbolPremium } from "./PaxterSymbolPremium";

type Tone = "dark" | "light";

interface PaxterSymbolGlassProps {
  /** Tamanho do simbolo (px). A moldura/raio escalam junto. */
  size?: number;
  /** Mantido por compatibilidade; o medalhao e sempre navy. */
  tone?: Tone;
  className?: string;
}

export function PaxterSymbolGlass({ size = 64, tone = "dark", className = "" }: PaxterSymbolGlassProps) {
  void tone;
  const outerR = Math.max(9, Math.round(size * 0.3));
  const innerR = Math.max(7, outerR - 2);
  const innerPad = Math.max(2, Math.round(size * 0.07));
  return (
    <span
      className={`pax-medallion ${className}`}
      style={{ borderRadius: outerR, ["--pax-r" as keyof CSSProperties]: `${outerR}px` } as CSSProperties}
      aria-hidden="true"
    >
      <span className="pax-medallion-inner" style={{ borderRadius: innerR, padding: innerPad }}>
        <PaxterSymbolPremium size={size} />
      </span>
    </span>
  );
}

export default PaxterSymbolGlass;
