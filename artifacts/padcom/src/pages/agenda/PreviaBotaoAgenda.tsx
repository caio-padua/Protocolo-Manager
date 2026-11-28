import "./agenda-barra.css";
import { Percentual } from "@/components/numeral/Numeral";
import { corSegura } from "./timeline-logica";

/**
 * Exemplo de como a agenda aparece na barra da Agenda Diária: profissão em cima, apelido embaixo, ocupação
 * no canto e a cor no vidro do rodapé. Usa as MESMAS classes do botão real (ag-chip), então o que se vê aqui é o que vai ao ar.
 * A porcentagem é só um exemplo.
 */
export function PreviaBotaoAgenda({ profissao, apelido, cor, testId }: { profissao: string; apelido: string; cor: string; testId?: string }) {
  return (
    <div className="ag-cel" style={{ ["--ev" as string]: corSegura(cor) }} data-testid={testId}>
      <div className="bevel-3d ag-chip" role="img" aria-label={`Exemplo do botão: ${profissao}, ${apelido}`} style={{ cursor: "default" }}>
        <span className="ag-chip-equipe">{profissao}</span>
        <span className="ag-chip-nome"><span className="ag-chip-nome-txt">{apelido || "—"}</span></span>
        <span className="ag-ocup" aria-hidden>
          <Percentual valor={67} casas={0} peso={700} className="ag-ocup-pct" />
          <span className="ag-ocup-sigla">Ocup</span>
        </span>
        <span className="ag-vidro" aria-hidden />
      </div>
    </div>
  );
}
