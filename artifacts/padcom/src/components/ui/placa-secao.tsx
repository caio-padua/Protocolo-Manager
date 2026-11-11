import { PlacaTitulo } from "./placa-titulo";

/**
 * Título de seção dos cadastros (Padrões 37 e 40 da skill-layout-paxter).
 * Placa Saliente de largura fixa com o nome em MAIÚSCULO (sem símbolo); uma linha fina leva o olho até a direita,
 * onde fica, só se existir, a explicação escrita. Nenhum contador: o cadastro não exibe contagem interna.
 * Usa col-span-full para funcionar tanto solto quanto dentro de um grid.
 */
export function PlacaSecao({ titulo, dica, className = "" }: {
  titulo: string;
  dica?: string;
  className?: string;
}) {
  return (
    <div className={`col-span-full flex items-center gap-3 pb-2 pt-1 ${className}`} data-testid="placa-secao">
      <PlacaTitulo titulo={titulo} />
      <span className="h-px min-w-4 flex-1 bg-border/60" aria-hidden />
      {dica && <span className="hidden text-[10px] text-muted-foreground sm:inline">{dica}</span>}
    </div>
  );
}
