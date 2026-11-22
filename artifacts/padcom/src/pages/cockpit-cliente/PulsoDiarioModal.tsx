import { useState } from "react";
import { Activity, Maximize2, Minimize2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import MeuPulsoCliente from "@/components/MeuPulsoCliente";
import type { Janela } from "./PulsoDiarioCompacto";

// Pulso Diário do cockpit: a MESMA tela do "Meu pulso" da Área do Cliente (médias, réguas de nível, gráficos com
// referência científica e tabela), em janela ampla e maximizável para uso no computador. No cockpit é só leitura.
// `janela` e `onJanela` seguem aceitos para não mudar quem chama; a janela de dias agora é escolhida dentro da tela.
export function PulsoDiarioModal({ clientId, clienteNome, aberto, escuro, onClose }: {
  clientId: number; clienteNome: string; aberto: boolean; janela?: Janela; onJanela?: (j: Janela) => void; escuro: boolean; onClose: () => void;
}) {
  const [maximizado, setMaximizado] = useState(false);
  if (!aberto) return null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o) { setMaximizado(false); onClose(); } }}>
      <DialogContent
        className={`${escuro ? "dark " : ""}panel-3d !top-[3vh] !translate-y-0 flex flex-col gap-0 overflow-hidden border-none p-0 text-foreground transition-[width,max-width,height] duration-200 ${
          maximizado ? "h-[94vh] w-[98vw] max-w-none" : "h-[min(92vh,900px)] w-[min(96vw,1280px)] max-w-none"
        }`}
      >
        <header className="flex flex-wrap items-center gap-3 border-b border-border/60 py-3 pl-5 pr-24">
          <span className="concave-3d flex h-10 w-10 shrink-0 items-center justify-center text-primary"><Activity className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-lg font-black uppercase leading-tight tracking-wide">Pulso diário</DialogTitle>
            <DialogDescription className="truncate text-xs text-muted-foreground">
              {clienteNome} · Como o cliente se sente e o que mede em casa, dia a dia.
            </DialogDescription>
          </div>
          <button type="button" onClick={() => setMaximizado((m) => !m)} aria-pressed={maximizado}
            aria-label={maximizado ? "Restaurar tamanho" : "Maximizar"} title={maximizado ? "Restaurar tamanho" : "Maximizar"}
            className="btn-3d-soft absolute right-12 top-3 flex h-8 w-8 items-center justify-center">
            {maximizado ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4">
          <MeuPulsoCliente clienteId={clientId} escuro={escuro} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
