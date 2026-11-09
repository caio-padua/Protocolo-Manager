import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COLLAB_EVENT, collabAuthHeaders, getCollabProfessional } from "@/lib/collab-auth";

type Options = {
  locais: { id: number; name: string }[];
  agendas: { id: number; name: string; kind: string; locationId: number }[];
  enfermagemPadraoId: number | null;
  medicoPadraoId: number | null;
};
const optionsSchema = z.object({
  locais: z.array(z.object({ id: z.number().int().positive(), name: z.string() })),
  agendas: z.array(z.object({ id: z.number().int().positive(), name: z.string(), kind: z.string(), locationId: z.number().int().positive() })),
  enfermagemPadraoId: z.number().int().positive().nullable(),
  medicoPadraoId: z.number().int().positive().nullable(),
});

export function useClientAgendaOptions(clinicaId: string) {
  const professionalId = getCollabProfessional()?.id ?? null;
  const [sessionRevision, setSessionRevision] = useState(0);
  useEffect(() => {
    const changed = () => setSessionRevision(v => v + 1);
    window.addEventListener(COLLAB_EVENT, changed);
    window.addEventListener("storage", changed);
    return () => { window.removeEventListener(COLLAB_EVENT, changed); window.removeEventListener("storage", changed); };
  }, []);
  const query = useQuery<Options>({
    queryKey: ["cliente-agendas-clinica", professionalId, clinicaId, sessionRevision],
    enabled: !!clinicaId,
    queryFn: async () => {
      const response = await fetch(`${import.meta.env.VITE_API_URL || "/api"}/clients/agenda-opcoes?clinicaId=${encodeURIComponent(clinicaId)}`, { headers: collabAuthHeaders() });
      if (!response.ok) throw new Error("Agendas indisponíveis ou não autorizadas.");
      const parsed = optionsSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error("Não foi possível interpretar as agendas da clínica.");
      return parsed.data;
    },
    staleTime: 0,
    gcTime: 0,
  });
  const data = query.isFetchedAfterMount && !query.isFetching && !query.isError ? query.data : undefined;
  return { query, data, sessionRevision };
}

export function ClientAgendaDefaults(props: {
  clinicaId: string; location: string; nursing: string; doctor: string;
  onLocation: (v: string) => void; onNursing: (v: string) => void; onDoctor: (v: string) => void;
  applyDefaults?: boolean;
}) {
  const initializedClinics = useRef(new Set<string>());
  const { query, data, sessionRevision } = useClientAgendaOptions(props.clinicaId);
  useEffect(() => { initializedClinics.current.clear(); }, [sessionRevision]);

  useEffect(() => {
    if (!props.applyDefaults || !data || initializedClinics.current.has(props.clinicaId)) return;
    initializedClinics.current.add(props.clinicaId);
    if (!props.nursing && data.enfermagemPadraoId) props.onNursing(String(data.enfermagemPadraoId));
    if (!props.doctor && data.medicoPadraoId) props.onDoctor(String(data.medicoPadraoId));
  }, [props.applyDefaults, props.clinicaId, props.nursing, props.doctor, props.onNursing, props.onDoctor, data]);

  function field(label: string, id: string, value: string, onChange: (value: string) => void, choices: { id: number; name: string }[]) {
    const missing = !!data && !!value && !choices.some(a => String(a.id) === value);
    return (
      <div className="space-y-1.5">
        <label htmlFor={id} className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">{label}</label>
        <div className="concave-3d p-1">
          <Select value={value || ""} onValueChange={v => { if (v) onChange(v); }} disabled={!props.clinicaId || !data}>
            <SelectTrigger id={id} className="h-auto min-h-9 whitespace-normal text-left border-none bg-transparent shadow-none focus:ring-0 [&>span]:line-clamp-none [&>span]:min-w-0 [&>span]:break-words">
              <SelectValue placeholder={query.isFetching ? "Carregando..." : "Selecione..."} />
            </SelectTrigger>
            <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
              {missing && <SelectItem value={value} disabled>Seleção anterior indisponível nesta clínica</SelectItem>}
              {choices.map(a => <SelectItem key={a.id} value={String(a.id)} className="whitespace-normal break-words">{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {missing && <p className="text-xs text-amber-700">A seleção anterior foi preservada. Escolha uma opção disponível ou limpe o campo.</p>}
        {value && <button type="button" className="text-xs underline" onClick={() => onChange("")}>Limpar {label.toLowerCase()}</button>}
      </div>
    );
  }

  return (
    <div className="md:col-span-2 space-y-3">
      {field("Local para agendas", "local-agendas", props.location, props.onLocation, data?.locais ?? [])}
      <div className="grid gap-3 md:grid-cols-2">
        {field("Agenda da enfermagem padrão", "agenda-enfermagem-padrao", props.nursing, props.onNursing, data?.agendas.filter(a => a.kind === "enfermagem") ?? [])}
        {field("Agenda do médico padrão", "agenda-medico-padrao", props.doctor, props.onDoctor, data?.agendas.filter(a => a.kind === "medico") ?? [])}
      </div>
      {query.isError && <p role="alert" className="text-xs text-destructive">Não foi possível carregar as agendas desta clínica ou o acesso não está autorizado. <button type="button" className="underline" onClick={() => query.refetch()}>Tentar novamente</button></p>}
      {query.isError && (props.location || props.nursing || props.doctor) && <p className="text-xs text-muted-foreground">As escolhas anteriores foram preservadas. Para trocar de clínica, limpe os vínculos incompatíveis e as agendas preferenciais anteriores antes de salvar.</p>}
      {!props.clinicaId && <p className="text-xs text-muted-foreground">Selecione a clínica de origem para consultar locais e agendas.</p>}
      <p className="text-xs text-muted-foreground">São preferências de cadastro; não reservam horários.</p>
    </div>
  );
}
