import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { ClientVisitPreferenceOptions, ClientVisitPreferences } from "@workspace/api-client-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { useCollabIdentity } from "@/pages/agenda/agenda-integration-api";

const slotSchema = z.object({ weekday: z.number().int().min(0).max(6), time: z.string() });
const categorySchema = z.object({
  weekdays: z.array(z.number().int().min(0).max(6)),
  times: z.array(slotSchema),
  priority: z.array(slotSchema).max(504).optional(),
});
export const visitPreferencesSchema = z.object({ medical: categorySchema, nursing: categorySchema });
const optionsCategorySchema = z.object({
  days: z.array(z.object({ weekday: z.number().int().min(0).max(6), times: z.array(z.string()) })),
  mismatchedResources: z.array(z.string()),
});
const optionsSchema = z.object({ medical: optionsCategorySchema, nursing: optionsCategorySchema });
export const emptyVisitPreferences = (): ClientVisitPreferences => ({
  medical: { weekdays: [], times: [] }, nursing: { weekdays: [], times: [] },
});

const WEEKDAYS = [
  { value: 1, label: "Segunda" }, { value: 2, label: "Terça" }, { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" }, { value: 5, label: "Sexta" }, { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

export function VisitPreferencesField({ value, onChange, disabled = false }: {
  value: ClientVisitPreferences; onChange: (value: ClientVisitPreferences) => void; disabled?: boolean;
}) {
  const identity = useCollabIdentity();
  const options = useQuery({
    queryKey: ["client-visit-preference-options", identity],
    queryFn: async (): Promise<ClientVisitPreferenceOptions> => {
      const response = await fetch("/api/clients/visit-preference-options", { headers: collabAuthHeaders() });
      if (!response.ok) throw new Error("Não foi possível carregar os horários.");
      const parsed = optionsSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("Não foi possível interpretar os horários.");
      return parsed.data;
    },
  });

  function toggleDay(kind: "medical" | "nursing", weekday: number) {
    const current = value[kind];
    const selected = current.weekdays.includes(weekday);
    onChange({ ...value, [kind]: {
      weekdays: selected ? current.weekdays.filter(d => d !== weekday) : [...current.weekdays, weekday],
      times: selected ? current.times.filter(t => t.weekday !== weekday) : current.times,
      ...(current.priority === undefined ? {} : {
        priority: selected ? current.priority.filter(t => t.weekday !== weekday) : current.priority,
      }),
    } });
  }
  function toggleTime(kind: "medical" | "nursing", weekday: number, time: string) {
    const current = value[kind];
    const selected = current.times.some(t => t.weekday === weekday && t.time === time);
    onChange({ ...value, [kind]: {
      ...current,
      times: selected ? current.times.filter(t => t.weekday !== weekday || t.time !== time) : [...current.times, { weekday, time }],
      ...(selected && current.priority === undefined ? {} : {
        priority: selected
          ? (current.priority ?? []).filter(t => t.weekday !== weekday || t.time !== time)
          : [...(current.priority ?? []), { weekday, time }],
      }),
    } });
  }
  function setPriority(kind: "medical" | "nursing", priority: { weekday: number; time: string }[]) {
    onChange({ ...value, [kind]: { ...value[kind], priority } });
  }
  function movePriority(kind: "medical" | "nursing", index: number, delta: number) {
    const priority = [...(value[kind].priority ?? [])];
    const destination = index + delta;
    if (destination < 0 || destination >= priority.length) return;
    [priority[index], priority[destination]] = [priority[destination], priority[index]];
    setPriority(kind, priority);
  }

  return <section className="panel-3d-sub p-5 space-y-4" aria-label="Preferências para visitas à clínica">
    <div>
      <h3 className="font-bold text-sm">Preferências para visitas à clínica</h3>
      <p className="text-xs text-muted-foreground mt-1">A preferência não reserva horário. A disponibilidade é conferida na data da marcação.</p>
      <p className="text-xs text-muted-foreground">Ao desmarcar um dia, seus horários preferenciais também serão retirados.</p>
      <p className="text-xs text-muted-foreground">Selecione os horários na ordem desejada; se necessário, ajuste a ordem abaixo.</p>
    </div>
    {options.isPending && <p role="status" className="text-xs">Consultando o expediente cadastrado…</p>}
    {options.isError && <div role="alert" className="text-xs text-red-700 dark:text-red-300">
      Não foi possível consultar os horários. As preferências já registradas foram preservadas.
      <button type="button" className="btn-3d-soft ml-2 px-2 py-1" onClick={() => options.refetch()}>Tentar novamente</button>
    </div>}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {(["medical", "nursing"] as const).map(kind => {
        const current = value[kind];
        const catalog = options.data?.[kind];
        const days = new Map((catalog?.days ?? []).map(day => [day.weekday, day.times]));
        const priority = current.priority ?? [];
        const unranked = current.times.filter(t => !priority.some(p => p.weekday === t.weekday && p.time === t.time));
        const dayName = (weekday: number) => WEEKDAYS.find(day => day.value === weekday)?.label ?? "Dia desconhecido";
        return <div key={kind} className="concave-3d rounded-[6px] p-4 space-y-3">
          <div>
            <h4 className="font-bold text-xs uppercase">{kind === "medical" ? "Consultas médicas" : "Aplicações de enfermagem"}</h4>
            <p className="text-xs text-muted-foreground mt-1">{kind === "medical" ? "Grade de 60 minutos" : "Grade de 20 minutos"}</p>
          </div>
          {!!catalog?.mismatchedResources.length && <p role="status" className="text-xs text-amber-800 dark:text-amber-300">
            A duração configurada difere da grade solicitada: {catalog.mismatchedResources.join(", ")}.
          </p>}
          {catalog && !catalog.days.length && <p className="text-xs">Nenhum expediente compatível cadastrado para este atendimento.</p>}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label={`Dias preferenciais — ${kind === "medical" ? "consultas" : "enfermagem"}`}>
            {WEEKDAYS.map(day => {
              const selected = current.weekdays.includes(day.value);
              return <button key={day.value} type="button" aria-pressed={selected}
                disabled={disabled || (!selected && !days.has(day.value))}
                className={`min-w-0 px-2 py-2 text-xs ${selected ? "btn-3d" : "btn-3d-soft"} disabled:opacity-50`}
                onClick={() => toggleDay(kind, day.value)}>{day.label}</button>;
            })}
          </div>
          {WEEKDAYS.filter(day => current.weekdays.includes(day.value)).map(day => {
            const saved = current.times.filter(t => t.weekday === day.value).map(t => t.time);
            const available = days.get(day.value) ?? [];
            const times = [...new Set([...available, ...saved])].sort();
            return <div key={day.value} className="space-y-2">
              <p className="text-xs font-semibold">{day.label} — horários preferenciais</p>
              {!available.length && <p className="text-xs text-amber-800 dark:text-amber-300">Dia sem expediente compatível no cadastro atual.</p>}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2" role="group" aria-label={`Horários de ${day.label} — ${kind === "medical" ? "consultas" : "enfermagem"}`}>
                {times.map(time => {
                  const selected = saved.includes(time);
                  return <button key={time} type="button" aria-pressed={selected} disabled={disabled || (!selected && !available.includes(time))}
                    title={available.includes(time) ? undefined : "Horário salvo fora da grade atual"}
                    className={`px-2 py-2 text-xs ${selected ? "btn-3d" : "btn-3d-soft"} disabled:opacity-50`}
                    onClick={() => toggleTime(kind, day.value, time)}>{time}{!available.includes(time) ? " *" : ""}</button>;
                })}
              </div>
            </div>;
          })}
          <div className="panel-3d-sub rounded-[6px] p-3 space-y-2" aria-label={`Ordem de preferência — ${kind === "medical" ? "consultas" : "enfermagem"}`}>
            <p className="text-xs font-bold uppercase">Ordem de preferência</p>
            {!priority.length && <p className="text-xs text-muted-foreground">Nenhuma ordem definida.</p>}
            {priority.map((entry, index) => <div key={`${entry.weekday}-${entry.time}`} className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <span className="text-xs font-medium">{index + 1}ª — {dayName(entry.weekday)} às {entry.time}</span>
              <div className="flex gap-1.5">
                <button type="button" className="btn-3d-soft min-h-9 px-2 py-1 text-xs" disabled={disabled || index === 0}
                  aria-label={`Subir ${dayName(entry.weekday)} às ${entry.time}`} onClick={() => movePriority(kind, index, -1)}>↑</button>
                <button type="button" className="btn-3d-soft min-h-9 px-2 py-1 text-xs" disabled={disabled || index === priority.length - 1}
                  aria-label={`Descer ${dayName(entry.weekday)} às ${entry.time}`} onClick={() => movePriority(kind, index, 1)}>↓</button>
                <button type="button" className="btn-3d-soft min-h-9 px-2 py-1 text-xs" disabled={disabled}
                  aria-label={`Retirar da ordem ${dayName(entry.weekday)} às ${entry.time}`}
                  onClick={() => setPriority(kind, priority.filter((_, i) => i !== index))}>Retirar</button>
              </div>
            </div>)}
            {unranked.length > 0 && <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Horários selecionados sem ordem definida:</p>
              {unranked.map(entry => <div key={`${entry.weekday}-${entry.time}`} className="flex items-center justify-between gap-2">
                <span className="text-xs">{dayName(entry.weekday)} às {entry.time}</span>
                <button type="button" className="btn-3d-soft px-2 py-1 text-xs" disabled={disabled}
                  aria-label={`Adicionar à ordem ${dayName(entry.weekday)} às ${entry.time}`}
                  onClick={() => setPriority(kind, [...priority, entry])}>Adicionar à ordem</button>
              </div>)}
            </div>}
          </div>
        </div>;
      })}
    </div>
  </section>;
}
