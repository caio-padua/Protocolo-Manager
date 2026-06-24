// MEDALHAO DE VIDRO (CUPULA VALIDADA) — fonte UNICA do simbolo da marca.
// Decisao do CEO 23/06/2026 (IMG_5142/5143): moldura DOURADA fina + cupula de
// vidro perolado restrita ao ARO superior (mix-blend screen).
// O simbolo premium (aura+faixa+faisca) fica GRANDE, quase encostando na moldura.
// `tone` define o MIOLO: dark = navy (fundo escuro), light = espresso quente
// (marrom-cafe). Em AMBOS o miolo e ESCURO de proposito — o simbolo usa mix-blend
// screen e precisa de fundo escuro p/ o ouro saltar; por isso o tom claro usa
// espresso (que nao destoa do creme) em vez de champanhe puro (que apagaria o simbolo).
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
  const outerR = Math.max(9, Math.round(size * 0.3));
  const innerR = Math.max(7, outerR - 2);
  const innerPad = Math.max(2, Math.round(size * 0.07));
  // Miolo: escuro = navy (CSS padrao). Claro = ESPRESSO quente (marrom-cafe):
  // tira o azul que destoa do creme, contrasta com o painel claro e mantem o
  // fundo escuro que o simbolo (mix-blend screen) precisa p/ o ouro saltar.
  const innerStyle: CSSProperties =
    tone === "light"
      ? { borderRadius: innerR, padding: innerPad, background: "linear-gradient(180deg, #2a2113 0%, #160f06 100%)" }
      : { borderRadius: innerR, padding: innerPad };
  return (
    <span
      className={`pax-medallion ${className}`}
      style={{ borderRadius: outerR, ["--pax-r" as keyof CSSProperties]: `${outerR}px` } as CSSProperties}
      aria-hidden="true"
    >
      <span className="pax-medallion-inner" style={innerStyle}>
        <PaxterSymbolPremium size={size} />
      </span>
    </span>
  );
}

export default PaxterSymbolGlass;
