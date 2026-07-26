import type { CSSProperties } from "react";
import "./padaxor-logo.css";

type PadaxorLogoProps = {
  /** "black" = PNG fundo preto (telas de abertura)
   *  "screen" = PNG fundo preto + mix-blend-mode:screen sobre navy (headers) */
  variant?: "black" | "screen";
  maxWidth?: number | string;
  className?: string;
};

export function PadaxorLogo({
  variant = "screen",
  maxWidth = 280,
  className = "",
}: PadaxorLogoProps) {
  const width = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;

  const style = {
    "--padaxor-max-width": width,
  } as CSSProperties;

  return (
    <div
      className={`padaxor-logo padaxor-logo--${variant} ${className}`.trim()}
      style={style}
      role="img"
      aria-label="PADAXOR — Clinical Intelligence System"
    >
      <picture>
        <img
          src="/brand/padaxor-logo-black.png"
          alt="PADAXOR"
          width={1865}
          height={374}
          loading="eager"
          decoding="async"
          draggable={false}
        />
      </picture>
    </div>
  );
}
