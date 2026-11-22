import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Numeral } from "@/components/numeral/Numeral";
import { DiretrizesDialog } from "./DiretrizesDialog";
import { PainelPulso } from "./PainelPulso";
import { NIVEIS, NIVEIS_FC, faixasFrequencia, faixasGlicemia, faixasPressao, type Nivel } from "./pulso-faixas";
import "./pulso-niveis.css";

// As duas réguas (pressão e glicemia). Usada na janela do cockpit e na Área do Cliente.
// O marcador mostra em qual nível está a média atual do cliente. O botão do canto abre os parâmetros e diretrizes.

function Regua({ titulo, unidade, linhas, atual, rotuloAtual, dica, onDiretriz, niveis = NIVEIS }: {
  niveis?: Array<{ id: Nivel; nome: string }>; titulo: string; unidade: string; linhas: Array<{ nome: string; valores: Record<Nivel, string> }>;
  atual: Nivel | null; rotuloAtual: string | null; dica: string; onDiretriz: () => void;
}) {
  return (
    <PainelPulso rotulo={titulo} titulo={<>{titulo} <span style={{ color: "var(--pn-mudo)", letterSpacing: ".08em" }}>· {unidade}</span></>}
      acoes={
        <button type="button" className="btn-3d-soft pn-mini" onClick={onDiretriz} aria-label={`Parâmetros e diretrizes: ${titulo}`} title="Parâmetros e diretrizes">
          <BookOpen size={14} aria-hidden="true" />
        </button>
      }>
      {atual && rotuloAtual && (
        <div className="pn-media-atual" data-nivel={atual}>
          <span className="pn-media-atual-rot">Sua média</span>
          <b className="bevel-3d pn-pino-placa"><Numeral peso={800}>{rotuloAtual}</Numeral></b>
          <span className="bevel-3d pn-chip" data-nivel={atual}>{niveis.find((n) => n.id === atual)?.nome}</span>
        </div>
      )}
      <div className="pn-lista" style={{ ["--pn-n" as string]: linhas.length }}>
        <div className="pn-lista-cab" aria-hidden="true">
          <span />
          {linhas.map((l) => <span key={l.nome}>{l.nome.split(" (")[0]}</span>)}
        </div>
        {niveis.map((n) => (
          <div key={n.id} className="pn-lin" data-nivel={n.id} data-atual={atual === n.id}>
            <div className="bevel-3d pn-seg">{n.nome}</div>
            {linhas.map((l) => (
              <p key={l.nome} className="pn-caixa" aria-label={`${n.nome}, ${l.nome}`}><Numeral peso={700}>{l.valores[n.id] ?? "—"}</Numeral></p>
            ))}
          </div>
        ))}
      </div>
      <p className="pn-dica">{dica}</p>
    </PainelPulso>
  );
}

export function ReguasNiveis({ mediaPA, mediaGlicemia, nivelPA, nivelGlicemia, mediaFC, nivelFC, janelaTexto, escuro = false }: {
  mediaPA: string | null; mediaGlicemia: string | null; nivelPA: Nivel | null; nivelGlicemia: Nivel | null;
  mediaFC?: string | null; nivelFC?: Nivel | null; janelaTexto: string; escuro?: boolean;
}) {
  const [diretriz, setDiretriz] = useState<"pressao" | "glicemia" | "frequencia" | null>(null);
  const fp = faixasPressao(), fg = faixasGlicemia(), ff = faixasFrequencia();
  const col = (i: 0 | 1) => Object.fromEntries(NIVEIS.map((n) => [n.id, fp[n.id][i]])) as Record<Nivel, string>;
  return (
    <div className="pn-escopo space-y-7">
      <Regua titulo="Pressão arterial" unidade="mmHg" atual={nivelPA} rotuloAtual={mediaPA ? `${mediaPA} · ${janelaTexto}` : null}
        linhas={[{ nome: "Máxima (sistólica)", valores: col(0) }, { nome: "Mínima (diastólica)", valores: col(1) }]}
        dica="Vale o pior dos dois números. Com 180/110 ou mais, procure atendimento." onDiretriz={() => setDiretriz("pressao")} />
      <Regua titulo="Glicemia de jejum" unidade="mg/dL" atual={nivelGlicemia} rotuloAtual={mediaGlicemia ? `${mediaGlicemia} · ${janelaTexto}` : null}
        linhas={[{ nome: "Glicemia", valores: fg }]}
        dica="Valor alto ou muito alto precisa ser confirmado em outro dia, com exame de laboratório." onDiretriz={() => setDiretriz("glicemia")} />
      {mediaFC !== undefined && (
        <Regua titulo="Frequência cardíaca" unidade="bpm" atual={nivelFC ?? null} rotuloAtual={mediaFC ? `${mediaFC} · ${janelaTexto}` : null} niveis={NIVEIS_FC}
          linhas={[{ nome: "Em repouso", valores: ff as Record<Nivel, string> }]}
          dica="Medida em repouso, sentado e calmo. Alta ou baixa com tontura, falta de ar ou dor no peito: procure atendimento." onDiretriz={() => setDiretriz("frequencia")} />
      )}
      <DiretrizesDialog tipo={diretriz} escuro={escuro} onClose={() => setDiretriz(null)} />
    </div>
  );
}
