import { Minus, Plus } from "lucide-react";
import "./barra-grupo.css";

/**
 * Barra de grupo recolhível (Padrão 40): UMA peça Saliente só, sem divisões internas: título à esquerda e,
 * na ponta direita, o "+" (fechado) ou "−" (aberto). A barra inteira é o botão. Fechado = afundado (insert bevel); aberto = saliente. Nenhum número, nenhum símbolo além do + e do −.
 */
export function BarraGrupo({ titulo, aberto, onAlternar, testId, testIdControle }: {
  titulo: string;
  aberto: boolean;
  onAlternar: () => void;
  testId?: string;
  testIdControle?: string;
}) {
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-expanded={aberto}
      aria-label={`${aberto ? "Recolher" : "Abrir"} ${titulo}`}
      className="barra-grupo bevel-3d flex h-9 w-full items-center gap-3 px-3 text-primary"
      data-testid={testIdControle}
    >
      <span className="min-w-0 flex-1 truncate text-left text-[11px] font-black uppercase tracking-[0.18em]" title={titulo} data-testid={testId}>{titulo}</span>
      <span className="inline-flex w-6 shrink-0 items-center justify-center" aria-hidden>
        {aberto ? <Minus className="h-4 w-4" strokeWidth={3} /> : <Plus className="h-4 w-4" strokeWidth={3} />}
      </span>
    </button>
  );
}
