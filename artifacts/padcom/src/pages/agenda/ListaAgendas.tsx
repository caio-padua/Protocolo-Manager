import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Registro } from "@/components/MarcadorVinculo";

export type ItemAgenda = {
  id: number;
  name: string;
  color: string;
  categoryName?: string | null;
  modalityLabel: string;
  sharing: string;
  active: boolean;
};

/**
 * Cor da agenda como um cabochão de vidro (olho de boi): quadradinho de cantos arredondados,
 * cor translúcida, reflexo de vidro por cima e uma luz suave acesa por trás.
 */
function Cabochao({ cor }: { cor: string }) {
  return (
    <span className="relative inline-block h-8 w-8 shrink-0" aria-hidden="true">
      <span className="absolute -inset-1 rounded-xl opacity-60 blur-[7px]" style={{ backgroundColor: cor }} />
      <span
        className="absolute inset-0 overflow-hidden rounded-[10px]"
        style={{
          background: `radial-gradient(circle at 32% 28%, color-mix(in srgb, ${cor} 35%, white) 0%, ${cor} 52%, color-mix(in srgb, ${cor} 70%, black) 100%)`,
          border: `1px solid color-mix(in srgb, ${cor} 55%, white)`,
          boxShadow: "inset 0 -3px 5px rgba(0,0,0,0.28), inset 0 2px 3px rgba(255,255,255,0.55), 0 1px 2px rgba(7,22,43,0.35)",
        }}
      >
        <span
          className="absolute left-[3px] top-[2px] h-[11px] w-[22px] rounded-[8px]"
          style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.05) 100%)" }}
        />
      </span>
    </span>
  );
}

/**
 * Lista de agendas de atendimento: cada item é uma tecla Saliente; a selecionada fica APERTADA
 * (navy, afundada) e troca o conteúdo do lado direito. A ordem muda por arraste ou pelas setas.
 */
export function ListaAgendas({ itens, selecionadaId, onSelecionar, onMover, ocupado }: {
  itens: ItemAgenda[];
  selecionadaId: number | null;
  onSelecionar: (id: number) => void;
  /** Move a agenda `id` para a posição `paraIndice` (0 = primeira). */
  onMover: (id: number, paraIndice: number) => void;
  ocupado?: boolean;
}) {
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [sobre, setSobre] = useState<number | null>(null);

  return (
    <ul className="space-y-2.5" aria-label="Agendas de atendimento">
      {itens.map((r, indice) => {
        const sel = r.id === selecionadaId;
        return (
          <li
            key={r.id}
            data-tecla-sel={sel}
            data-agenda-id={r.id}
            draggable={!ocupado}
            onDragStart={(e) => { setArrastando(r.id); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { if (arrastando !== null) { e.preventDefault(); setSobre(r.id); } }}
            onDrop={(e) => {
              e.preventDefault();
              if (arrastando !== null && arrastando !== r.id) onMover(arrastando, indice);
              setArrastando(null); setSobre(null);
            }}
            onDragEnd={() => { setArrastando(null); setSobre(null); }}
            className={`relative rounded-md ${arrastando === r.id ? "opacity-40" : ""} ${
              sobre === r.id && arrastando !== r.id ? "outline outline-2 outline-dashed outline-offset-2 outline-primary" : ""
            }`}
          >
            <Registro codigo="A1" nota={`posição ${indice + 1}`} />
            <button
              type="button"
              aria-pressed={sel}
              onClick={() => onSelecionar(r.id)}
              className="tecla-3d flex w-full items-center gap-2.5 py-2.5 pl-4 pr-10 text-left"
            >
              <Cabochao cor={r.color} />
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2 break-words text-sm font-bold leading-tight">{r.name}</span>
                <span className="tecla-sub block truncate text-[10px] font-semibold uppercase tracking-wide">
                  {r.categoryName ?? "Categoria pendente"} · {r.modalityLabel} · {r.sharing === "individual" ? "individual" : "compartilhada"}
                </span>
              </span>
              {!r.active && <span className="text-[10px] font-semibold uppercase text-amber-500">inativo</span>}
            </button>
            <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 flex-col">
              <button
                type="button"
                className="tecla-ctl inline-flex h-5 w-6 items-center justify-center"
                aria-label={`Subir a agenda ${r.name}`}
                disabled={ocupado || indice === 0}
                onClick={() => onMover(r.id, indice - 1)}
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="tecla-ctl inline-flex h-5 w-6 items-center justify-center"
                aria-label={`Descer a agenda ${r.name}`}
                disabled={ocupado || indice === itens.length - 1}
                onClick={() => onMover(r.id, indice + 1)}
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
