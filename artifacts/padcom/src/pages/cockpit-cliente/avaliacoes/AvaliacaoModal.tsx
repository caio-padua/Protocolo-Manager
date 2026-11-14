import { useEffect, useState } from "react";
import { AVALIACOES } from "@workspace/avaliacoes-corporais";
import type { TipoAvaliacao } from "@workspace/avaliacoes-corporais";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LineChart as IconeEvolucao, Maximize2, Minimize2, PlusCircle } from "lucide-react";
import { EvolucaoMedicoes } from "./EvolucaoMedicoes";
import { FormularioMedicao } from "./FormularioMedicao";
import type { Medicao } from "./api";
import { ICONES_AVALIACAO } from "./icones";

export function AvaliacaoModal({ clientId, clienteNome, tipo, medicoes, escuro, onClose }: {
  clientId: number; clienteNome: string; tipo: TipoAvaliacao | null; medicoes: Medicao[]; escuro: boolean; onClose: () => void;
}) {
  const [aba, setAba] = useState<"evolucao" | "nova">("nova");
  const [maximizado, setMaximizado] = useState(false);

  // Ao abrir: com medições, mostra a evolução; sem medições, abre o formulário.
  useEffect(() => {
    if (tipo) setAba(medicoes.some((m) => m.tipo === tipo) ? "evolucao" : "nova");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  if (!tipo) return null;
  const def = AVALIACOES[tipo];
  const doTipo = medicoes.filter((m) => m.tipo === tipo);
  const Icone = ICONES_AVALIACAO[tipo];

  const botaoAba = (v: "evolucao" | "nova", rotulo: string, I: typeof PlusCircle) => (
    <button type="button" role="tab" aria-selected={aba === v} onClick={() => setAba(v)}
      className={`${aba === v ? "bevel-3d text-primary" : "concave-3d text-muted-foreground/70"} inline-flex h-9 items-center gap-1.5 px-4 text-[10px] font-black uppercase tracking-widest`}>
      <I className="h-3.5 w-3.5" /> {rotulo}
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { setMaximizado(false); onClose(); } }}>
      <DialogContent
        className={`${escuro ? "dark " : ""}panel-3d flex max-h-[94vh] flex-col gap-0 overflow-hidden border-none p-0 text-foreground transition-[width,max-width,height] duration-200 ${
          maximizado ? "h-[96vh] w-[98vw] max-w-none" : "w-[min(96vw,980px)] max-w-none"
        }`}
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-border/60 py-3 pl-5 pr-24">
          <span className="concave-3d flex h-10 w-10 shrink-0 items-center justify-center text-primary"><Icone className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-black uppercase leading-tight tracking-wide">{def.titulo}</DialogTitle>
            <DialogDescription className="truncate text-xs text-muted-foreground">
              {clienteNome} · {def.paraQueServe}
            </DialogDescription>
          </div>
          <button type="button" onClick={() => setMaximizado((m) => !m)} aria-pressed={maximizado}
            aria-label={maximizado ? "Restaurar tamanho" : "Maximizar"} title={maximizado ? "Restaurar tamanho" : "Maximizar"}
            className="btn-3d-soft absolute right-12 top-3 flex h-8 w-8 items-center justify-center">
            {maximizado ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </header>
        <div role="tablist" className="flex gap-2 px-5 pt-3">
          {botaoAba("evolucao", `Evolução${doTipo.length ? ` (${doTipo.length})` : ""}`, IconeEvolucao)}
          {botaoAba("nova", "Nova medição", PlusCircle)}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          {aba === "evolucao" ? (
            doTipo.length ? (
              <EvolucaoMedicoes clientId={clientId} tipo={tipo} medicoes={doTipo} maximizado={maximizado} />
            ) : (
              <div className="concave-3d p-6 text-center text-sm text-muted-foreground">
                Nenhuma medição de {def.titulo.toLowerCase()} registrada para este cliente.
              </div>
            )
          ) : (
            <FormularioMedicao clientId={clientId} tipo={tipo} ultima={doTipo[doTipo.length - 1] ?? null}
              aoSalvar={() => setAba("evolucao")} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
