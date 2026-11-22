import { ExternalLink } from "lucide-react";
import { REFERENCIAS, type TipoReferencia } from "./pulso-referencias";
import "./pulso-niveis.css";

// Campo "Referência": um cartão internacional e um nacional, com o link do artigo.
export function ReferenciaLista({ tipo }: { tipo: TipoReferencia | "sono" }) {
  return (
    <section aria-label="Referência">
      <h4 className="pn-sec-rotulo">Referência</h4>
      <ul className="space-y-2.5">
        {REFERENCIAS[tipo].map((r) => (
          <li key={r.link} className="concave-3d pn-ref">
            <span className="bevel-3d pn-ref-etiqueta">{r.origem}</span>
            <p className="pn-ref-titulo">{r.titulo}</p>
            <p className="pn-ref-meta">{r.autores}</p>
            <p className="pn-ref-meta"><i>{r.revista}</i></p>
            <p className="pn-ref-serve">{r.serve}</p>
            <a href={r.link} target="_blank" rel="noopener noreferrer" className="btn-3d-soft pn-ref-link">
              Abrir artigo <ExternalLink size={12} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
