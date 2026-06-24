import type { CSSProperties } from "react";
import paduaMaskUrl from "@/assets/padua-dp-mask.png";

type Props = {
  /** Tamanho (px) do simbolo D+P. */
  size?: number;
  className?: string;
  /** Passa um sweep de luz (glint) lento mascarado pelo proprio simbolo. */
  glint?: boolean;
};

/**
 * Simbolo PADUA (monograma D+P VAZADO) em OURO ESCOVADO 3D.
 * Geometria OFICIAL: o traco oficial (IMG_9743) e usado como MASCARA de recorte
 * sobre um gradiente de ouro escovado (estrias finas) com relevo. Assim o desenho
 * fica IDENTICO a arte aprovada — sem redesenho a mao — so trocando o preto por ouro.
 */
export function PaduaSymbol({ size = 28, className, glint = false }: Props) {
  const goldStyle: CSSProperties = {
    display: "inline-block",
    width: size,
    height: size,
    WebkitMaskImage: `url(${paduaMaskUrl})`,
    maskImage: `url(${paduaMaskUrl})`,
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    backgroundColor: "#e6b54a",
    backgroundImage:
      "repeating-linear-gradient(118deg, rgba(255,255,255,0.32) 0 1px, rgba(0,0,0,0) 1px 3px)," +
      "linear-gradient(135deg, #8a5a14 0%, #d99a2e 20%, #ffe9a8 45%, #f4c84e 60%, #a9741c 82%, #ffd970 100%)",
    filter:
      "drop-shadow(0 1px 0 rgba(255,241,168,0.42)) drop-shadow(0 1px 2px rgba(0,0,0,0.45))",
  };
  if (!glint) {
    return <span aria-hidden="true" className={className} style={goldStyle} />;
  }
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ position: "relative", display: "inline-block", width: size, height: size }}
    >
      <span style={{ ...goldStyle, position: "absolute", inset: 0 }} />
      <span
        className="symbol-glint"
        style={{ WebkitMaskImage: `url(${paduaMaskUrl})`, maskImage: `url(${paduaMaskUrl})` }}
      >
        <span className="symbol-glint-band" />
      </span>
    </span>
  );
}

export default PaduaSymbol;
