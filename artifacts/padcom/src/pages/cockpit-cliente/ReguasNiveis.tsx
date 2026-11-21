import { Numeral } from "@/components/numeral/Numeral";
import { NIVEIS, faixasGlicemia, faixasPressao, type Nivel } from "./pulso-faixas";
import "./pulso-niveis.css";

// As duas réguas (pressão e glicemia). Usada na janela do cockpit e na Área do Cliente.
// O marcador mostra em qual nível está a média atual do cliente.

function Regua({ titulo, unidade, linhas, atual, rotuloAtual, dica }: {
  titulo: string; unidade: string; linhas: Array<{ nome: string; valores: Record<Nivel, string> }>;
  atual: Nivel | null; rotuloAtual: string | null; dica: string;
}) {
  return (
    <section className="panel-3d-sub px-4 py-3" aria-label={titulo}>
      <header className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-black uppercase tracking-[.16em] text-primary">{titulo}</h3>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{unidade}</span>
      </header>
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
    </section>
  );
}

export function ReguasNiveis({ mediaPA, mediaGlicemia, nivelPA, nivelGlicemia, janelaTexto }: {
  mediaPA: string | null; mediaGlicemia: string | null; nivelPA: Nivel | null; nivelGlicemia: Nivel | null; janelaTexto: string;
}) {
  const fp = faixasPressao(), fg = faixasGlicemia();
  const col = (i: 0 | 1) => Object.fromEntries(NIVEIS.map((n) => [n.id, fp[n.id][i]])) as Record<Nivel, string>;
  return (
    <div className="pn-escopo space-y-4">
      <Regua titulo="Pressão arterial" unidade="mmHg" atual={nivelPA} rotuloAtual={mediaPA ? `${mediaPA} · ${janelaTexto}` : null}
        linhas={[{ nome: "Máxima (sistólica)", valores: col(0) }, { nome: "Mínima (diastólica)", valores: col(1) }]}
        dica="Vale o pior dos dois números. Com 180/110 ou mais, procure atendimento." />
      <Regua titulo="Glicemia de jejum" unidade="mg/dL" atual={nivelGlicemia} rotuloAtual={mediaGlicemia ? `${mediaGlicemia} · ${janelaTexto}` : null}
        linhas={[{ nome: "Glicemia", valores: fg }]}
        dica="Valor alto ou muito alto precisa ser confirmado em outro dia, com exame de laboratório." />
    </div>
  );
}
