import { useState, type ReactNode } from "react";
import { BotaoAjuda } from "./BotaoAjuda";
import { JanelaAjuda } from "./JanelaAjuda";
import { ReferenciaLista } from "./ReferenciaLista";
import { NIVEIS } from "./pulso-faixas";
import { REFERENCIAS } from "./pulso-referencias";
import "./pulso-niveis.css";

const SENTIDO: Record<string, string> = {
  muitobaixo: "Bem abaixo do esperado.", baixo: "Abaixo do esperado.", normal: "Dentro do esperado.",
  alto: "Acima do esperado.", muitoalto: "Bem acima do esperado.",
};
const TODAS = (["pressao", "frequencia", "glicemia", "energia", "libido", "sono"] as const).flatMap((t) => REFERENCIAS[t]);

// "?" dos painéis que resumem os outros (médias e tabela de registros). Mesmo molde de todo "?":
// botões coloridos em cima, explicação no meio e as referências bibliográficas das medidas embaixo.
export function AjudaPainelDialog({ titulo, escuro, children }: { titulo: string; escuro: boolean; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <BotaoAjuda aberto={aberto} onClick={() => setAberto((a) => !a)} rotulo={titulo} />
      {aberto && (
        <JanelaAjuda onClose={() => setAberto(false)} escuro={escuro} titulo={titulo}
          rotuloTopo="Níveis"
          topo={
            <ul className="space-y-2.5">
              {NIVEIS.map((n) => (
                <li key={n.id} className="grid grid-cols-[84px_1fr] items-center gap-3">
                  <span className="bevel-3d pn-chip text-center" data-nivel={n.id}>{n.nome}</span>
                  <span className="pn-texto">{SENTIDO[n.id]}</span>
                </li>
              ))}
            </ul>
          }
          rotuloPorque="Como ler e por que medimos"
          porque={<div className="grid gap-3 pn-texto">{children}</div>}
          referencias={<ReferenciaLista itens={TODAS} />} />
      )}
    </>
  );
}
