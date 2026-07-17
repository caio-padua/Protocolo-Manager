import { useEffect, useRef } from "react";

type Props = {
  /** largura em px */
  width?: number;
  className?: string;
  /** animar entrada (splash/hero) */
  animate?: boolean;
};

/**
 * ParxisLogo — exibe o logo oficial PNG (símbolo + PARXIS).
 * O PNG foi renderizado pelo ChatGPT seguindo o Manual Técnico.
 * Fundo do PNG é bordô escuro — combina com o fundo #050505 do site.
 */
export function ParxisLogo({ width = 340, className, animate = false }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (!animate || !imgRef.current) return;
    const img = imgRef.current;
    img.style.opacity = "0";
    img.style.transform = "translateY(12px)";
    const t = setTimeout(() => {
      img.style.transition = "opacity 2.8s cubic-bezier(.22,.61,.36,1), transform 2.8s cubic-bezier(.22,.61,.36,1)";
      img.style.opacity = "1";
      img.style.transform = "translateY(0)";
    }, 80);
    return () => clearTimeout(t);
  }, [animate]);

  return (
    <div
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        ref={imgRef}
        src="/parxis/brand/parxis-logo.png"
        alt="PARXIS — Clinical Intelligence System"
        width={width}
        style={{
          width,
          height: "auto",
          /* Respiro contínuo — Manual §26 */
          animation: "symbol-breath 6s ease-in-out infinite",
          /* Sombra do símbolo — Manual §16 */
          filter:
            "drop-shadow(0 18px 38px rgba(0,0,0,0.75)) " +
            "drop-shadow(0 6px 10px rgba(0,0,0,0.65)) " +
            "drop-shadow(0 0 20px rgba(242,184,23,0.16))",
        }}
        draggable={false}
      />
    </div>
  );
}

export default ParxisLogo;
