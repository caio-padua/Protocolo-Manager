import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import { PlacaTitulo } from "./placa-titulo";

/**
 * Título de seção dos cadastros (Padrão 37 da skill-layout-paxter).
 * Placa Saliente (bevel-3d) com ícone + nome curto em MAIÚSCULO; uma linha fina leva o olho até a direita,
 * onde fica o contador de preenchimento num slot de largura fixa (nunca aparece/some, nunca desalinha).
 * Usa col-span-full para funcionar tanto solto quanto dentro de um grid.
 */
export function ContadorPreenchido({ preenchidos, total }: { preenchidos: number; total: number }) {
  const completo = total > 0 && preenchidos >= total;
  const tom = completo
    ? "text-emerald-700 dark:text-emerald-400"
    : preenchidos === 0
      ? "text-muted-foreground"
      : "text-amber-700 dark:text-amber-400";
  return (
    <span
      className={`concave-3d inline-flex h-6 w-[4.5rem] shrink-0 items-center justify-center gap-1 text-[10px] font-black tabular-nums ${tom}`}
      title={completo ? "Tudo preenchido" : `${total - preenchidos} campo(s) sem preencher`}
      data-testid="contador-preenchido"
      data-completo={completo ? "sim" : "nao"}
    >
      {completo && <Check className="h-3 w-3" aria-hidden />}
      {preenchidos}/{total}
    </span>
  );
}

export function PlacaSecao({ icone: Icone, titulo, dica, preenchidos, total, className = "" }: {
  icone: LucideIcon;
  titulo: string;
  dica?: string;
  preenchidos?: number;
  total?: number;
  className?: string;
}) {
  return (
    <div className={`col-span-full flex items-center gap-3 pb-2 pt-1 ${className}`} data-testid="placa-secao">
      <PlacaTitulo icone={Icone} titulo={titulo} />
      <span className="h-px min-w-4 flex-1 bg-border/60" aria-hidden />
      {dica && <span className="hidden text-[10px] text-muted-foreground sm:inline">{dica}</span>}
      {total !== undefined && preenchidos !== undefined && <ContadorPreenchido preenchidos={preenchidos} total={total} />}
    </div>
  );
}
