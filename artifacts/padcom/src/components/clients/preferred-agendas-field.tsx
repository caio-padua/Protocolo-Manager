import { useMemo } from "react";
import { useListAgendaResources } from "@workspace/api-client-react";
import { agendaResourcesFrescas } from "@/lib/agenda-propagacao";
import { CalendarClock, Check, Loader2 } from "lucide-react";
import { useClientAgendaOptions } from "./client-agenda-defaults";

interface PreferredAgendasFieldProps {
  /** Clínica selecionada no formulário (string do Select). Filtra as agendas. */
  locationId?: string;
  clinicaId?: string;
  /** Ids das agendas (agenda_resources) escolhidas. */
  value: number[];
  onChange: (ids: number[]) => void;
}

/**
 * AGENDA PREFERENCIAL — multi-seleção das agendas ATIVAS da clínica escolhida.
 * Cada agenda é um agenda_resource (profissional × clínica). É só preferência do cliente;
 * não altera o motor de agenda. Data-bound: lista vem do backend, estado controlado.
 */
export function PreferredAgendasField({ locationId, clinicaId, value, onChange }: PreferredAgendasFieldProps) {
  const { data: resources, isLoading, isError } = useListAgendaResources(agendaResourcesFrescas);
  const { data: authorizedOptions, query: authorizedQuery } = useClientAgendaOptions(clinicaId ?? "");

  const locId = locationId ? Number(locationId) : null;
  const authorizedLocation = locId !== null && !!authorizedOptions?.locais.some(location => location.id === locId);

  const agendas = useMemo(() => {
    const all = authorizedLocation ? resources ?? [] : [];
    return all
      .filter((r) => r.active && r.locationId === locId &&
        authorizedOptions?.agendas.some(a => a.id === r.id && a.locationId === locId))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [resources, locId, authorizedLocation, authorizedOptions]);

  // Erro de rede ou mudança de local não pode apagar uma escolha em silêncio.
  const unavailable = resources && authorizedLocation
    ? value.filter((id) => !agendas.some((agenda) => agenda.id === id))
    : [];

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
        {isLoading || authorizedQuery.isFetching ? (
          <div className="flex items-center gap-2 text-muted-foreground text-xs py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando agendas...
          </div>
        ) : isError || authorizedQuery.isError ? (
          <p className="text-destructive text-xs py-2">
            Não foi possível carregar as agendas. Suas seleções anteriores foram preservadas.
          </p>
        ) : agendas.length === 0 ? (
          <p className="text-muted-foreground text-xs py-2">
            {locId == null
              ? "Selecione um local da clínica para listar as agendas."
              : "Nenhuma agenda disponível para este local da clínica."}
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
        {unavailable.length > 0 && !isError && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
            <span>Há {unavailable.length} seleção(ões) que não estão disponíveis neste local.</span>
            <button
              type="button"
              className="btn-3d-soft px-2 py-1 font-semibold"
              onClick={() => onChange(value.filter((id) => !unavailable.includes(id)))}
            >
              Remover seleções indisponíveis
            </button>
          </div>
        )}
        {value.length > 0 && !authorizedLocation && !authorizedQuery.isFetching && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
            <span>As escolhas anteriores foram preservadas.</span>
            <button type="button" className="btn-3d-soft px-2 py-1 font-semibold" onClick={() => onChange([])}>
              Limpar agendas preferenciais anteriores
            </button>
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
