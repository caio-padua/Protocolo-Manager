import { useEffect, useMemo } from "react";
import { useListAgendaResources } from "@workspace/api-client-react";
import { CalendarClock, Check, Loader2 } from "lucide-react";

interface PreferredAgendasFieldProps {
  /** Clínica selecionada no formulário (string do Select). Filtra as agendas. */
  locationId?: string;
  /** Ids das agendas (agenda_resources) escolhidas. */
  value: number[];
  onChange: (ids: number[]) => void;
}

/**
 * AGENDA PREFERENCIAL — multi-seleção das agendas ATIVAS da clínica escolhida.
 * Cada agenda é um agenda_resource (profissional × clínica). É só preferência do cliente;
 * não altera o motor de agenda. Data-bound: lista vem do backend, estado controlado.
 */
export function PreferredAgendasField({ locationId, value, onChange }: PreferredAgendasFieldProps) {
  const { data: resources, isLoading } = useListAgendaResources();

  const locId = locationId ? Number(locationId) : null;

  const agendas = useMemo(() => {
    const all = resources ?? [];
    return all
      .filter((r) => r.active && (locId == null || r.locationId === locId))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [resources, locId]);

  // Data-bound: ao trocar de clínica, remove do estado as agendas que não existem mais na
  // lista filtrada (senão IDs "fantasmas" continuariam no form e iriam no submit).
  useEffect(() => {
    if (isLoading || locId == null) return;
    const allowed = new Set(agendas.map((a) => a.id));
    const pruned = value.filter((id) => allowed.has(id));
    if (pruned.length !== value.length) onChange(pruned);
  }, [agendas, isLoading, locId, value, onChange]);

  const toggle = (id: number) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div className="md:col-span-2">
      <div className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground flex items-center gap-1.5 mb-1.5">
        <CalendarClock className="h-3 w-3 text-primary" /> Agenda Preferencial
      </div>

      <div className="concave-3d p-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando agendas...
          </div>
        ) : agendas.length === 0 ? (
          <p className="text-muted-foreground text-xs py-2">
            {locId == null
              ? "Selecione a clínica de origem para listar as agendas."
              : "Nenhuma agenda ativa para esta clínica."}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {agendas.map((a) => {
              const selected = value.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggle(a.id)}
                  aria-pressed={selected}
                  className={
                    selected
                      ? "btn-3d inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold"
                      : "field-engraved inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-foreground/80 hover:text-foreground"
                  }
                >
                  {selected && <Check className="h-3 w-3 text-primary" />}
                  {a.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-1.5">
        {value.length > 0
          ? `${value.length} agenda(s) preferida(s) selecionada(s).`
          : "Opcional — marque as agendas que o cliente prefere."}
      </p>
    </div>
  );
}
