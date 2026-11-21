import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Gauge } from "lucide-react";
import { ReguasNiveis } from "./ReguasNiveis";
import type { Nivel } from "./pulso-faixas";
import "./pulso-niveis.css";

// Janela para mostrar ao cliente durante a consulta: duas réguas de cinco níveis, uma embaixo da outra.
export function PulsoNiveisDialog({ aberto, escuro, onClose, mediaPA, mediaGlicemia, nivelPA, nivelGlicemia, janelaTexto }: {
  aberto: boolean; escuro: boolean; onClose: () => void; mediaPA: string | null; mediaGlicemia: string | null;
  nivelPA: Nivel | null; nivelGlicemia: Nivel | null; janelaTexto: string;
}) {
  if (!aberto) return null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className={`${escuro ? "dark " : ""}pn-escopo panel-3d !top-[4vh] !translate-y-0 flex max-h-[92vh] w-[min(96vw,980px)] max-w-none flex-col gap-0 overflow-hidden border-none p-0 text-foreground`}>
        <header className="flex items-center gap-3 border-b border-border/60 py-3 pl-5 pr-14">
          <span className="concave-3d flex h-10 w-10 shrink-0 items-center justify-center text-primary"><Gauge className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-black uppercase leading-tight tracking-wide">Níveis de referência</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">Em que faixa cada medida está: de muito baixo a muito alto. Adultos, medidas feitas em casa.</DialogDescription>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <ReguasNiveis mediaPA={mediaPA} mediaGlicemia={mediaGlicemia} nivelPA={nivelPA} nivelGlicemia={nivelGlicemia} janelaTexto={janelaTexto} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
