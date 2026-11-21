import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Numeral } from "@/components/numeral/Numeral";
import { DiretrizesDialog } from "./DiretrizesDialog";
import { PainelPulso } from "./PainelPulso";
import { NIVEIS, faixasGlicemia, faixasPressao, type Nivel } from "./pulso-faixas";
import "./pulso-niveis.css";

// As duas réguas (pressão e glicemia). Usada na janela do cockpit e na Área do Cliente.
// O marcador mostra em qual nível está a média atual do cliente. O botão do canto abre os parâmetros e diretrizes.

function Regua({ titulo, unidade, linhas, atual, rotuloAtual, dica, onDiretriz }: {
  titulo: string; unidade: string; linhas: Array<{ nome: string; valores: Record<Nivel, string> }>;
  atual: Nivel | null; rotuloAtual: string | null; dica: string; onDiretriz: () => void;
}) {
  return (
    <PainelPulso rotulo={titulo} titulo={<>{titulo} <span style={{ color: "var(--pn-mudo)", letterSpacing: ".08em" }}>· {unidade}</span></>}
      acoes={
        <button type="button" className="pn-mini" onClick={onDiretriz} aria-label={`Parâmetros e diretrizes: ${titulo}`} title="Parâmetros e diretrizes">
          <BookOpen size={14} aria-hidden="true" />
        </button>
      }>
      <div className="pn-regua">
        {NIVEIS.map((n) => {
          const aqui = atual === n.id && rotuloAtual;
          return (
            <div key={n.id} className="pn-col" data-nivel={n.id} data-atual={atual === n.id}>
              <div className="pn-pino">
                {aqui ? (
                  <>
                    <div className="pn-pino-placa"><span>Média atual</span><b><Numeral peso={800}>{rotuloAtual}</Numeral></b></div>
                    <i className="pn-seta" aria-hidden="true" />
                  </>
                ) : null}
              </div>
              <div className="pn-seg">{n.nome}</div>
              <div className="pn-vals">
                {linhas.map((l) => (
                  <p key={l.nome}>
                    {linhas.length > 1 && <small>{l.nome}</small>}
                    <span><Numeral peso={700}>{l.valores[n.id]}</Numeral></span>
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="pn-dica">{dica}</p>
    </PainelPulso>
  );
}

export function ReguasNiveis({ mediaPA, mediaGlicemia, nivelPA, nivelGlicemia, janelaTexto, escuro = false }: {
  mediaPA: string | null; mediaGlicemia: string | null; nivelPA: Nivel | null; nivelGlicemia: Nivel | null; janelaTexto: string; escuro?: boolean;
}) {
  const [diretriz, setDiretriz] = useState<"pressao" | "glicemia" | null>(null);
  const fp = faixasPressao(), fg = faixasGlicemia();
  const col = (i: 0 | 1) => Object.fromEntries(NIVEIS.map((n) => [n.id, fp[n.id][i]])) as Record<Nivel, string>;
  return (
    <div className="pn-escopo space-y-7">
      <Regua titulo="Pressão arterial" unidade="mmHg" atual={nivelPA} rotuloAtual={mediaPA ? `${mediaPA} · ${janelaTexto}` : null}
        linhas={[{ nome: "Máxima (sistólica)", valores: col(0) }, { nome: "Mínima (diastólica)", valores: col(1) }]}
        dica="Vale o pior dos dois números. Com 180/110 ou mais, procure atendimento." onDiretriz={() => setDiretriz("pressao")} />
      <Regua titulo="Glicemia de jejum" unidade="mg/dL" atual={nivelGlicemia} rotuloAtual={mediaGlicemia ? `${mediaGlicemia} · ${janelaTexto}` : null}
        linhas={[{ nome: "Glicemia", valores: fg }]}
        dica="Valor alto ou muito alto precisa ser confirmado em outro dia, com exame de laboratório." onDiretriz={() => setDiretriz("glicemia")} />
      <DiretrizesDialog tipo={diretriz} escuro={escuro} onClose={() => setDiretriz(null)} />
    </div>
  );
}
