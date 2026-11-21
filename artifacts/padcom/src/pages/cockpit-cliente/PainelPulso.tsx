import { useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import "./pulso-niveis.css";

// Painel calmo (recuado) com botão para minimizar e maximizar. Usado na Área do Cliente e nas réguas de níveis.
export function PainelPulso({ titulo, acoes, children, style, className = "", iniciaAberto = true, rotulo }: {
  titulo: ReactNode; acoes?: ReactNode; children: ReactNode; style?: CSSProperties; className?: string; iniciaAberto?: boolean; rotulo?: string;
}) {
  const [aberto, setAberto] = useState(iniciaAberto);
  return (
    <section className={`pn-painel ${className}`} style={style} aria-label={rotulo}>
      <header className="pn-painel-topo">
        <h3 className="pn-painel-titulo">{titulo}</h3>
        {acoes}
        <button type="button" className="btn-3d-soft pn-mini" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
          aria-label={aberto ? "Minimizar painel" : "Maximizar painel"} title={aberto ? "Minimizar" : "Maximizar"}>
          {aberto ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
        </button>
      </header>
      {aberto && <div className="pn-painel-corpo">{children}</div>}
    </section>
  );
}
