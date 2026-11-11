import { Minus, Plus } from "lucide-react";
import "./barra-grupo.css";
import { LARGURA_PLACA_TITULO } from "./placa-titulo";

/**
 * Barra de grupo recolhível (Padrão 40): UMA faixa Saliente contígua = placa do título (largura fixa, à esquerda),
 * barra que se estende até a direita e, na ponta direita, o controle com "+" (fechado) ou "−" (aberto).
 * A faixa inteira é o botão. Fechado = afundado (insert bevel); aberto = saliente. Nenhum número, nenhum símbolo além do + e do −.
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
      className="barra-grupo flex h-8 w-full items-stretch"
      data-testid={testIdControle}
    >
      <span className={`seg bevel-3d inline-flex shrink-0 items-center px-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-primary ${LARGURA_PLACA_TITULO}`} data-testid={testId}>
        <span className="min-w-0 flex-1 truncate" title={titulo}>{titulo}</span>
      </span>
      <span className="seg bevel-3d min-w-0 flex-1" aria-hidden />
      <span className="seg seg-controle bevel-3d inline-flex w-11 shrink-0 items-center justify-center text-primary" aria-hidden>
        {aberto ? <Minus className="h-4 w-4" strokeWidth={3} /> : <Plus className="h-4 w-4" strokeWidth={3} />}
      </span>
    </button>
  );
}
