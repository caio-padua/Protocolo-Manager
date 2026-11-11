import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Registro } from "@/components/MarcadorVinculo";
import { VidroCor } from "@/components/VidroCor";

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
 * Lista de agendas de atendimento: cada item é uma tecla Saliente (up bevel); a selecionada fica APERTADA
 * (insert bevel, mesmo tom creme) e troca o conteúdo do lado direito. A ordem muda por arraste ou pelas setas.
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
              <VidroCor cor={r.color} />
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
