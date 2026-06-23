import "./PaxterLogo.css";
import heroPng from "@/assets/brand/paxter-logo-hero.png";
import heroWebp from "@/assets/brand/paxter-logo-hero.webp";

interface PaxterLogoProps {
  /** "hero" = logo completa (simbolo + PAXTER + frases). "compact" = simbolo + PAXTER. */
  variant?: "hero" | "compact";
  className?: string;
  alt?: string;
}

/*
  Logo de MARCA da Paxter (imagem original aprovada, fiel ao anexo — opcao A do CEO).
  Convive com o lockup do sidebar em components/layout/PaxterLogo.tsx (nao o substitui).
*/
export function PaxterLogo({
  variant = "hero",
  className = "",
  alt = "PAXTER — Clinical Intelligence System",
}: PaxterLogoProps) {
  return (
    <div className={`paxter-brand-logo paxter-brand-logo--${variant} ${className}`}>
      <picture>
        <source srcSet={heroWebp} type="image/webp" />
        <img src={heroPng} alt={alt} loading="eager" decoding="async" draggable={false} />
      </picture>
    </div>
  );
}

export default PaxterLogo;
