import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Gauge } from "lucide-react";
import { Numeral } from "@/components/numeral/Numeral";
import { NIVEIS, faixasGlicemia, faixasPressao, type Nivel } from "./pulso-faixas";

// Janela para mostrar ao cliente: duas réguas de cinco níveis (pressão e glicemia), uma embaixo da outra.
// O marcador "Média atual" mostra em qual nível o cliente está na janela escolhida.

function Regua({ titulo, unidade, linhas, atual, rotuloAtual }: {
  titulo: string; unidade: string; linhas: Array<{ nome: string; valores: Record<Nivel, string> }>;
  atual: Nivel | null; rotuloAtual: string | null;
}) {
  return (
    <section className="panel-3d-sub px-4 py-3" aria-label={titulo}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-[11px] font-black uppercase tracking-[.16em] text-primary">{titulo}</h3>
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{unidade}</span>
      </header>
      <div className="pn-regua">
        {NIVEIS.map((n) => (
          <div key={n.id} className="pn-col" data-nivel={n.id} data-atual={atual === n.id}>
            <div className="pn-pino" aria-hidden={atual !== n.id}>{atual === n.id ? <><span>Média atual</span><b>{rotuloAtual}</b><i>▼</i></> : null}</div>
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
        ))}
      </div>
    </section>
  );
}

export function PulsoNiveisDialog({ aberto, escuro, onClose, mediaPA, mediaGlicemia, nivelPA, nivelGlicemia, janelaTexto }: {
  aberto: boolean; escuro: boolean; onClose: () => void; mediaPA: string | null; mediaGlicemia: string | null;
  nivelPA: Nivel | null; nivelGlicemia: Nivel | null; janelaTexto: string;
}) {
  if (!aberto) return null;
  const fp = faixasPressao(), fg = faixasGlicemia();
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${escuro ? "dark " : ""}pn-dialog panel-3d !top-[4vh] !translate-y-0 flex max-h-[92vh] w-[min(96vw,980px)] max-w-none flex-col gap-0 overflow-hidden border-none p-0 text-foreground`}>
        <header className="flex items-center gap-3 border-b border-border/60 py-3 pl-5 pr-14">
          <span className="concave-3d flex h-10 w-10 shrink-0 items-center justify-center text-primary"><Gauge className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-black uppercase leading-tight tracking-wide">Níveis de referência</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">Em que faixa cada medida está: de muito baixo a muito alto. Adultos, medidas feitas em casa.</DialogDescription>
          </div>
        </header>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Regua titulo="Pressão arterial" unidade="mmHg" atual={nivelPA} rotuloAtual={mediaPA ? `${mediaPA} (${janelaTexto})` : null}
            linhas={[{ nome: "Sistólica (máxima)", valores: Object.fromEntries(NIVEIS.map((n) => [n.id, fp[n.id][0]])) as Record<Nivel, string> },
                     { nome: "Diastólica (mínima)", valores: Object.fromEntries(NIVEIS.map((n) => [n.id, fp[n.id][1]])) as Record<Nivel, string> }]} />
          <p className="-mt-2 px-1 text-[11px] text-muted-foreground">Vale o pior dos dois números. Com 180/110 ou mais, o cliente deve procurar atendimento.</p>
          <Regua titulo="Glicemia de jejum" unidade="mg/dL" atual={nivelGlicemia} rotuloAtual={mediaGlicemia ? `${mediaGlicemia} (${janelaTexto})` : null}
            linhas={[{ nome: "Glicemia", valores: fg }]} />
          <p className="-mt-2 px-1 text-[11px] text-muted-foreground">Valor alto ou muito alto precisa ser confirmado em outro dia, com exame de laboratório.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
