import type { ReactNode } from "react";
import "./faixa-tela.css";

/**
 * Faixa superior padrão das telas do PAXTER (Padrão 45 do skill-layout-paxter).
 * Base = tecido terno azul-marinho com risca de giz, afundada dentro de uma moldura em relevo (up bevel).
 * O nome da tela fica numa etiqueta discreta no canto superior direito, a cavaleiro da borda (não ocupa linha),
 * com letras soltas de vidro em alto-relevo. Não é botão: não tem clique nem efeito ao passar o mouse.
 */
export function FaixaTela({ titulo, children, className = "", testId }: { titulo: string; children: ReactNode; className?: string; testId?: string }) {
  const palavras = titulo.toUpperCase().split(" ");
  return (
    <div className="faixa-tela" data-testid={testId}>
      <div className="faixa-tela-etiqueta">
        <h1 className="faixa-tela-titulo" aria-label={titulo}>
          {palavras.map((p, i) => (
            <span key={`${p}-${i}`} className="faixa-tela-palavra" aria-hidden>
              {[...p].map((l, k) => <span key={k} className="faixa-tela-letra" data-l={l}>{l}</span>)}
            </span>
          ))}
        </h1>
      </div>
      <div className={`faixa-tela-miolo ${className}`}>{children}</div>
    </div>
  );
}
