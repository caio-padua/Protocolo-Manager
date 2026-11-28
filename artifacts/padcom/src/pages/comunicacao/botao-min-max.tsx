import { Maximize2, Minimize2 } from "lucide-react";

/** Botao padrao de minimizar/maximizar de painel, sempre no extremo direito do cabecalho. */
export function BotaoMinMax({ aberto, onAlternar }: { aberto: boolean; onAlternar: () => void }) {
  return (
    <button
      type="button"
      className="bevel-3d p-1.5"
      onClick={(e) => { e.stopPropagation(); onAlternar(); }}
      aria-label={aberto ? "Minimizar painel" : "Maximizar painel"}
      title={aberto ? "Minimizar" : "Maximizar"}
    >
      {aberto ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
    </button>
  );
}
