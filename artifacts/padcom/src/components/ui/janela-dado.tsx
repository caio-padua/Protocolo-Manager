import type { ReactNode } from "react";

/**
 * Janela de um dado (Padrão 40): rótulo escrito + valor, cada dado na sua janela Côncava.
 * O rótulo ocupa uma coluna de largura fixa, então todos os valores nascem na mesma linha vertical imaginária.
 * Sem símbolo, sem ícone. Dado em branco não ganha janela (quem chama decide).
 */
export const COLUNA_ROTULO_DADO = "grid-cols-[6.25rem_minmax(0,1fr)]";

export function JanelaDado({ rotulo, children, mono, titulo }: { rotulo: string; children: ReactNode; mono?: boolean; titulo?: string }) {
  return (
    <div className={`concave-3d grid min-h-8 items-center gap-2 px-2.5 py-1 text-[11px] ${COLUNA_ROTULO_DADO}`}>
      <span className="truncate text-[9px] font-black uppercase tracking-widest text-muted-foreground">{rotulo}</span>
      <span className={`min-w-0 truncate text-foreground/90 ${mono ? "font-mono" : ""}`} title={titulo}>{children}</span>
    </div>
  );
}
