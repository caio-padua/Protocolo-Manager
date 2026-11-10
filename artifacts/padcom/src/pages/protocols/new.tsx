import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { tituloProprio } from "@/lib/utils";
import { useLocation } from "wouter";
import { useCreateProtocol, useListClients, useListSubstances } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PaxterClientSelector } from "@/components/PaxterClientSelector";
import { ClinicalCertificateStatus } from "@/components/ClinicalCertificateStatus";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, ChevronRight, Beaker, User, MapPin, CalendarDays, CheckCircle2, Printer, Loader2, Clock, Stethoscope } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useClinicalIdentity } from "@/hooks/use-clinical-identity";
import { format, addDays, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getCollabToken } from "@/lib/collab-auth";
import { ProtocolSchedulingDialog } from "@/components/ProtocolSchedulingDialog";
import { ProtocolGoogleSyncDialog } from "@/components/ProtocolGoogleSyncDialog";
import {
  PROTOCOL_FREQUENCY_OPTIONS,
  UNCONFIGURED_PROTOCOL_INTERVAL,
  dosePrescritaExibivel,
  dosePrescritaTemApresentacao,
  dosePrescritaValida,
  nomeSubstanciaProtocolo,
  protocolIntervalDays,
  resolveProtocolSubstanceDefaults,
} from "@/lib/protocol-substance-selection";

const FREQUENCY_OPTIONS = PROTOCOL_FREQUENCY_OPTIONS;

const VIA_CATEGORIES = [
  { id: "im", label: "Intramuscular" },
  { id: "iv", label: "Endovenoso" },
  { id: "sc", label: "Subcutâneo" },
  { id: "implant", label: "Implante" },
  { id: "outros", label: "Outros" },
] as const;

function viaOf(procedureType?: string | null): string {
  const t = (procedureType || "").toLowerCase();
  if (t === "im" || t === "iv" || t === "sc" || t === "implant") return t;
  return "outros";
}

interface SubstanceSlot {
  id: string;
  substanceId: number;
  substanceName: string;
  substanceColor: string;
  dose: string;
  totalSessions: number;
  frequency: string;
  customDays: number | null;
  startDate: string;
}

function emptySlot(): SubstanceSlot {
  return {
    id: crypto.randomUUID(),
    substanceId: 0,
    substanceName: "",
    substanceColor: "#888",
    dose: "",
    totalSessions: 8,
    frequency: UNCONFIGURED_PROTOCOL_INTERVAL,
    customDays: null,
    startDate: format(new Date(), "yyyy-MM-dd"),
  };
}

function getEndDate(slot: SubstanceSlot): string {
  const days = protocolIntervalDays(slot.frequency, slot.customDays);
  if (days == null) return "—";
  const totalDays = days * (slot.totalSessions - 1);
  const ms = Date.parse(`${slot.startDate}T12:00:00Z`) + totalDays * 86_400_000;
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10).split("-").reverse().join("/") : "—";
}

interface AgendaOption {
  id: number; name: string; kind: string; modality: string; professionalId: number | null;
  locationId: number; locationName: string; locationType: string; locationColor: string; locationAddress: string | null;
}
interface AgendaProfessional {
  id: number; name: string; crm: string | null; category: string; professionalType: string;
  nurseType: string | null; homeServiceFeePerVisit: number | null;
}
interface ProtocolAgendaOptions {
  clientId: number;
  clinic: { id: number; name: string };
  nursingAgendaId: number;
  medicalAgendaId: number;
  nursingAgendas: AgendaOption[];
  medicalAgendas: AgendaOption[];
  nursingAgenda: AgendaOption;
  medicalAgenda: AgendaOption;
  nurses: AgendaProfessional[];
  doctors: AgendaProfessional[];
}

export default function NovoProtocolo({ clientId: clientIdProp, clientIdentity, embedded, onCreated, onBusyChange }: {
  clientId?: number;
  clientIdentity?: { id: number; name: string; cpf?: string | null };
  embedded?: boolean;
  onCreated?: (id: number) => void;
  onBusyChange?: (pending: boolean) => void;
} = {}) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  // Em modo embutido (Cockpit) o lançador NUNCA navega: fica inline, invalida as
  // listas para o painel de injetáveis atualizar e avisa via onCreated. Fora do
  // cockpit, o comportamento original de ir ao detalhe do protocolo é mantido.
  const irAoProtocolo = (id: number) => {
    if (embedded) {
      queryClient.invalidateQueries();
      onCreated?.(id);
      return;
    }
    setLocation(`/protocols/${id}`);
  };
  const { toast } = useToast();
  const { data: clients } = useListClients();
  const { data: substances, isError: substancesError, isFetching: substancesFetching } = useListSubstances();
  const [agendaOptions, setAgendaOptions] = useState<ProtocolAgendaOptions | null>(null);
  const [agendaOptionsError, setAgendaOptionsError] = useState("");
  const [agendaOptionsLoading, setAgendaOptionsLoading] = useState(false);

  const [step, setStep] = useState<"configurar" | "resumo">("configurar");
  const [clientId, setClientId] = useState<number | null>(clientIdProp ?? null);
  const [manualProfessionalId, setProfessionalId] = useState("");
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [schedulingMode, setSchedulingMode] = useState<"weekly" | "exact">("weekly");
  const [slots, setSlots] = useState<SubstanceSlot[]>([emptySlot()]);
  const [title, setTitle] = useState("");
  const [comboLoading, setComboLoading] = useState(false);
  const [activeVia, setActiveVia] = useState<string>("all");
  const [nurseId, setNurseId] = useState("");
  const [scheduleProtocolId, setScheduleProtocolId] = useState<number | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [googleSyncOpen, setGoogleSyncOpen] = useState(false);
  const [generateRasAfterSync, setGenerateRasAfterSync] = useState(false);
  const clinicalIdentity = useClinicalIdentity(embedded ? clientId : null, { refetchOnWindowFocus: true });
  const identityConfirmed = !embedded || (
    !clinicalIdentity.isError && !clinicalIdentity.isFetching &&
    clinicalIdentity.data?.client.id === clientId
  );
  const authenticatedDoctor = identityConfirmed && clinicalIdentity.data?.professional.professionalType === "medico"
    ? clinicalIdentity.data.professional : null;
  const professionalId = authenticatedDoctor ? String(authenticatedDoctor.id) : manualProfessionalId;
  const comboRef = useRef(false);
  const scheduleConfirmedRef = useRef(false);
  const operationRef = useRef(false);
  const mountedRef = useRef(true);
  const slotsTopRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (clientIdProp != null) setClientId(clientIdProp);
  }, [clientIdProp]);

  useEffect(() => {
    if (!clientId) {
      setAgendaOptions(null);
      setAgendaOptionsError("");
      setAgendaOptionsLoading(false);
      return;
    }
    const controller = new AbortController();
    setAgendaOptions(null);
    setAgendaOptionsError("");
    setAgendaOptionsLoading(true);
    fetch(`${import.meta.env.BASE_URL}api/clients/${clientId}/protocol-agenda-options`, {
      headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` },
      signal: controller.signal,
    }).then(async response => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error ?? "Não foi possível carregar as agendas vinculadas ao cliente.");
      return data as ProtocolAgendaOptions;
    }).then(data => {
      if (controller.signal.aborted) return;
      setAgendaOptions(data);
    }).catch(error => {
      if (!controller.signal.aborted) setAgendaOptionsError(error instanceof Error ? error.message : "Falha ao carregar as agendas do cliente.");
    }).finally(() => {
      if (!controller.signal.aborted) setAgendaOptionsLoading(false);
    });
    return () => controller.abort();
  }, [clientId]);

  const createMutation = useCreateProtocol({
    mutation: {
      onSuccess: (data) => {
        if (comboRef.current) return;
        operationRef.current = false;
        onBusyChange?.(false);
        if (!mountedRef.current) return;
        toast({ title: "Protocolo lançado!", description: "Abra o detalhe e confirme a prévia em Agendar protocolo." });
        irAoProtocolo(data.id);
      },
      onError: () => {
        if (comboRef.current) return;
        operationRef.current = false;
        onBusyChange?.(false);
        if (!mountedRef.current) return;
        toast({ title: "Erro ao criar protocolo", variant: "destructive" });
      }
    }
  });

  const selectedClient = clientIdentity?.id === clientId ? clientIdentity : clients?.find(c => c.id === clientId);
  const nurses = agendaOptions?.nurses ?? [];
  const availableDoctors = agendaOptions?.doctors ?? [];
  const selectedProfessional = authenticatedDoctor ?? availableDoctors.find(p => String(p.id) === professionalId);
  const selectedLocation = agendaOptions?.nursingAgenda ? {
    id: agendaOptions.nursingAgenda.locationId,
    name: agendaOptions.nursingAgenda.locationName,
    type: agendaOptions.nursingAgenda.locationType,
    color: agendaOptions.nursingAgenda.locationColor,
    address: agendaOptions.nursingAgenda.locationAddress,
  } : undefined;
  const doctorAllowed = Boolean(selectedProfessional && availableDoctors.some(p => p.id === selectedProfessional.id));
  const selectedSlots = slots.filter(s => s.substanceId > 0);
  const filledSlots = selectedSlots.filter(s =>
    s.dose.trim().length > 0 && protocolIntervalDays(s.frequency, s.customDays) != null
  );

  useEffect(() => {
    if (nurseId && !nurses.some(n => String(n.id) === nurseId)) setNurseId("");
    if (manualProfessionalId && !availableDoctors.some(p => String(p.id) === manualProfessionalId)) setProfessionalId("");
  }, [agendaOptions, availableDoctors, nurses, nurseId, manualProfessionalId]);

  const participacaoMedica = (substanceId: number): string => {
    if (substancesError) return "Cadastro indisponível";
    if (substancesFetching) return "Consultando cadastro";
    const substance = substances?.find(s => s.id === substanceId);
    if (!substance) return "Substância indisponível";
    if (substance.doctorParticipation === true) return "Sim, participa";
    if (substance.doctorParticipation === false) return "Não participa";
    return "Ainda não definida no cadastro";
  };

  const viaCounts = useMemo(() => {
    const c: Record<string, number> = { all: substances?.length ?? 0, im: 0, iv: 0, sc: 0, implant: 0, outros: 0 };
    (substances ?? []).forEach(s => { c[viaOf(s.procedureType)]++; });
    return c;
  }, [substances]);

  const substancesFiltered = useMemo(() => {
    const all = substances ?? [];
    if (activeVia === "all") return all;
    return all.filter(s => viaOf(s.procedureType) === activeVia);
  }, [substances, activeVia]);

  const addSlot = useCallback(() => {
    if (slots.length >= 10) return;
    setSlots(prev => [emptySlot(), ...prev]);
    // Rola para o topo da lista de substâncias (novo slot aparece acima)
    setTimeout(() => {
      slotsTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  }, [slots.length]);

  const removeSlot = (id: string) => {
    setSlots(prev => prev.filter(s => s.id !== id));
  };

  const updateSlot = (id: string, updates: Partial<SubstanceSlot>) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleSelectSubstance = (slotId: string, substanceId: string) => {
    const sub = substances?.find(s => String(s.id) === substanceId);
    if (!sub) return;
    const defaults = resolveProtocolSubstanceDefaults(sub);
    updateSlot(slotId, {
      substanceId: sub.id,
      substanceName: nomeSubstanciaProtocolo(sub.name),
      substanceColor: sub.color,
      dose: defaults.dose,
      frequency: defaults.frequency,
      customDays: defaults.customDays,
    });
  };

  const canAdvance = clientId && identityConfirmed && (!embedded || clientIdentity?.id === clientId) &&
    agendaOptions && !agendaOptionsLoading && !agendaOptionsError && doctorAllowed &&
    professionalId && selectedSlots.length > 0 && filledSlots.length === selectedSlots.length &&
    filledSlots.every(slot => dosePrescritaValida(slot.dose));

  const buildPayload = () => {
    const autoTitle = title || `Protocolo ${selectedClient?.name?.split(" ")[0]} — ${filledSlots.map(s => s.substanceName).join(", ")}`;
    const selectedNurse = nurses.find((n: any) => String(n.id) === nurseId);
    const feePerVisit = (selectedNurse as any)?.homeServiceFeePerVisit ?? 0;
    const maxSessions = filledSlots.length > 0 ? Math.max(...filledSlots.map(s => s.totalSessions)) : 0;
    const nurseServiceFeeCalc = feePerVisit > 0 ? feePerVisit * maxSessions : null;
    return {
      clientId: clientId ?? 0,
      title: autoTitle,
      status: "suggested" as const,
      startDate: filledSlots.map(s => s.startDate).sort()[0] ?? format(new Date(), "yyyy-MM-dd"),
      scheduledTime,
      schedulingMode,
      serviceType: "clinic" as const,
      professionalId: parseInt(professionalId),
      unit: selectedLocation?.name ?? null,
      totalValue: 0,
      notes: null,
      items: filledSlots.map(s => {
        const intervalDays = protocolIntervalDays(s.frequency, s.customDays)!;
        return {
          substanceId: s.substanceId,
          dose: s.dose,
          totalSessions: s.totalSessions,
          intervalDays,
          frequency: s.frequency,
          startDate: s.startDate,
        };
      }),
      ...(nurseId ? { nurseId: parseInt(nurseId) } : {}),
      ...(nurseServiceFeeCalc != null ? { nurseServiceFee: nurseServiceFeeCalc } : {}),
    };
  };

  const handleLancar = () => {
    if (operationRef.current || !canAdvance) return;
    operationRef.current = true;
    onBusyChange?.(true);
    createMutation.mutate({ data: buildPayload() });
  };

  const handleLancarComRasFap = async () => {
    if (operationRef.current || !canAdvance) return;
    operationRef.current = true;
    onBusyChange?.(true);
    comboRef.current = true;
    setComboLoading(true);
    let createdId: number | null = null;
    try {
      const created = await createMutation.mutateAsync({ data: buildPayload() });
      createdId = created.id;
      if (!mountedRef.current) return;
      scheduleConfirmedRef.current = false;
      setScheduleProtocolId(created.id);
      setGenerateRasAfterSync(true);
      setScheduleOpen(true);
    } catch (err: any) {
      if (!mountedRef.current) return;
      toast({ title: "Erro ao criar protocolo", description: err?.message ?? "Falha ao lançar com RAS FAP", variant: "destructive" });
    }
    if (createdId === null) {
      comboRef.current = false;
      operationRef.current = false;
      onBusyChange?.(false);
      if (mountedRef.current) setComboLoading(false);
    }
  };

  const releaseCombo = () => {
    comboRef.current = false;
    operationRef.current = false;
    onBusyChange?.(false);
    if (mountedRef.current) setComboLoading(false);
  };

  const handleGenerateRasAfterScheduling = async (protocolId: number) => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/ras/physical/${protocolId}`, {
        headers: { Authorization: `Bearer ${getCollabToken() ?? ""}` },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.details || "Erro ao gerar RAS FAP");
      }
      const blob = await response.blob();
      if (!mountedRef.current) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const disposition = response.headers.get("Content-Disposition");
      anchor.download = disposition?.match(/filename="(.+)"/)?.[1] ?? `RAS_FAP_${protocolId}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast({ title: "Protocolo agendado e RAS FAP gerado", description: "A reserva foi feita antes da emissão do documento." });
    } catch (error) {
      toast({
        title: "Protocolo agendado; o RAS FAP falhou",
        description: error instanceof Error ? error.message : "Gere o documento pela tela do protocolo.",
        variant: "destructive",
      });
    } finally {
      setGenerateRasAfterSync(false);
      setScheduleProtocolId(null);
      releaseCombo();
      if (mountedRef.current) irAoProtocolo(protocolId);
    }
  };

  const handleScheduleDialogChange = (open: boolean) => {
    setScheduleOpen(open);
    if (!open && scheduleProtocolId && !scheduleConfirmedRef.current) {
      const createdId = scheduleProtocolId;
      setGenerateRasAfterSync(false);
      setScheduleProtocolId(null);
      releaseCombo();
      toast({ title: "Protocolo criado, mas ainda não agendado", description: "Nenhum horário foi reservado. Você pode agendar pela tela do protocolo." });
      irAoProtocolo(createdId);
    }
  };

  const handleSchedulingComplete = () => {
    scheduleConfirmedRef.current = true;
    setScheduleOpen(false);
    setGoogleSyncOpen(true);
  };

  const handleGoogleSyncDialogChange = (open: boolean) => {
    setGoogleSyncOpen(open);
    if (!open && generateRasAfterSync && scheduleProtocolId) {
      void handleGenerateRasAfterScheduling(scheduleProtocolId);
    }
  };

  if (step === "resumo") {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
        <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" className="btn-3d-soft" onClick={() => setStep("configurar")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Revisar
        </Button>
        <h1 className="text-2xl font-bold uppercase tracking-tight">Resumo do Protocolo</h1>
      </div>
      {embedded && !identityConfirmed && (
        <div className="panel-3d p-4" role="alert">
          <p>{clinicalIdentity.isError
            ? "Não foi possível confirmar o profissional. O lançamento está bloqueado."
            : "Confirmando o profissional. Aguarde antes de lançar."}</p>
          {clinicalIdentity.isError && (
            <button type="button" className="btn-3d-soft mt-2 px-3 py-2" onClick={() => void clinicalIdentity.refetch()}>
              Tentar novamente
            </button>
          )}
        </div>
      )}

      <Card className="panel-3d">
        <CardHeader className="pb-3">
          <CardTitle className="bevel-3d px-3 py-1.5 uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" /> Confirme antes de lançar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className={`grid gap-4 ${nurseId ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 md:grid-cols-3"}`}>
            <div className="p-4 panel-3d-sub">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-2">
                <User className="h-3.5 w-3.5" /> Cliente
              </div>
              <p className="font-bold uppercase tracking-tight text-lg leading-tight">{selectedClient?.name ? tituloProprio(selectedClient.name) : ""}</p>
              <p className="text-xs text-muted-foreground tabular-nums font-medium mt-1">{selectedClient?.cpf}</p>
            </div>
            <div className="p-4 panel-3d-sub">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-2">
                <User className="h-3.5 w-3.5" /> Médico Responsável
              </div>
              <p className="font-bold uppercase tracking-tight text-lg leading-tight">{selectedProfessional?.name}</p>
              <p className="text-xs text-muted-foreground tabular-nums font-medium mt-1">{selectedProfessional?.crm}</p>
            </div>
            <div className="p-4 panel-3d-sub">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-2">
                <MapPin className="h-3.5 w-3.5" /> Local
              </div>
              <p className="font-bold uppercase tracking-tight text-lg leading-tight">{selectedLocation?.name}</p>
              <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold mt-1">
                Clínica: {agendaOptions?.clinic.name ?? "Carregando vínculo…"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Enfermagem: {agendaOptions?.nursingAgenda.name ?? "—"} · Médico: {agendaOptions?.medicalAgenda.name ?? "—"}
              </p>
            </div>
            {nurseId && (() => {
              const n = nurses.find((x: any) => String(x.id) === nurseId) as any;
              const feePerVisit = n?.homeServiceFeePerVisit ?? 0;
              const maxSessions = filledSlots.length > 0 ? Math.max(...filledSlots.map(s => s.totalSessions)) : 0;
              const totalFee = feePerVisit * maxSessions;
              return (
                <div className="p-4 panel-3d-sub border-l-2 border-accent/40">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-2">
                    <Stethoscope className="h-3.5 w-3.5 text-accent" /> Enfermeira
                  </div>
                  <p className="font-bold uppercase tracking-tight text-lg leading-tight">{n?.name ?? "—"}</p>
                  {totalFee > 0 && (
                    <p className="text-xs text-accent font-bold mt-1 tabular-nums">
                      Fee: R$ {totalFee.toFixed(2)} ({maxSessions}× R$ {feePerVisit})
                    </p>
                  )}
                  <p className="text-[10px] text-muted-foreground font-bold mt-0.5 uppercase tracking-widest">
                    {n?.nurseType === "home" ? "Home Nurse" : "Clínica"}
                  </p>
                </div>
              );
            })()}
          </div>

          <div>
            <p className="text-[10px] font-bold text-muted-foreground mb-3 uppercase tracking-widest">Substâncias ({filledSlots.length})</p>
            <div className="space-y-4">
              {filledSlots.map((slot, idx) => {
                const days = protocolIntervalDays(slot.frequency, slot.customDays);
                return (
                  <div key={slot.id} className="flex items-center gap-4 p-4 panel-3d-sub">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-black shadow-md"
                      style={{ backgroundColor: slot.substanceColor }}>
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <span className="font-bold uppercase tracking-tight text-lg">{slot.substanceName}</span>
                        <span className="concave-3d px-2 py-0.5 text-[10px] font-bold tabular-nums">{slot.dose}</span>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        <span className="tabular-nums">{slot.totalSessions} sessões</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> a cada {days ?? "—"} dias</span>
                        <span className="tabular-nums">Início: {slot.startDate.split("-").reverse().join("/")}</span>
                        <span className="tabular-nums">Término: {getEndDate(slot)}</span>
                      </div>
                      <p className="mt-2 text-xs"><strong>Participação médica:</strong> {participacaoMedica(slot.substanceId)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 panel-3d-sub bg-primary/5 border-primary/20 paxter-underglow">
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="font-bold uppercase tracking-wide">{schedulingMode === "exact" ? "Datas e intervalos exatos" : "Consolidação semanal ativa"}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 font-medium uppercase tracking-wide leading-relaxed">
              {schedulingMode === "exact"
                ? "Cada substância mantém sua data inicial e seu intervalo. Somente aplicações no mesmo dia compartilham uma visita."
                : "O sistema agrupará as aplicações em períodos de sete dias a partir do início do protocolo."}
              {" "}Horário padrão: <strong className="text-foreground">{scheduledTime}</strong>.
            </p>
            <p className="text-xs mt-3 font-semibold" role="status">
              Este resumo ainda não reserva horários. A prévia seguinte mostra as datas; a reserva só acontece depois da sua confirmação.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" size="lg" className="btn-3d-soft" onClick={() => setStep("configurar")} disabled={comboLoading || createMutation.isPending}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar e Editar
        </Button>
        <Button size="lg" className="btn-3d px-8" onClick={handleLancar} disabled={!canAdvance || createMutation.isPending || comboLoading}>
          {createMutation.isPending && !comboRef.current ? "Lançando..." : "Confirmar e Lançar Protocolo"}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="btn-3d px-8"
          onClick={handleLancarComRasFap}
          disabled={!canAdvance || comboLoading || createMutation.isPending}
        >
          {comboLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
          {comboLoading ? "Agendando antes do RAS FAP..." : "Lançar + Gerar RAS FAP"}
        </Button>
      </div>
      <ProtocolSchedulingDialog
        protocolId={scheduleProtocolId ?? 0}
        clientId={clientId ?? 0}
        open={scheduleOpen}
        onOpenChange={handleScheduleDialogChange}
        onScheduled={handleSchedulingComplete}
      />
      <ProtocolGoogleSyncDialog
        protocolId={scheduleProtocolId ?? 0}
        open={googleSyncOpen}
        onOpenChange={handleGoogleSyncDialogChange}
      />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      {!embedded && (
        <>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="btn-3d-soft" onClick={() => setLocation("/protocols")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-tight">Lançador de Protocolo</h1>
            <p className="text-muted-foreground text-[10px] uppercase tracking-widest font-bold">Preencha os dados e adicione as substâncias do protocolo.</p>
          </div>
        </div>
        <ClinicalCertificateStatus
          responsibleProfessionalId={professionalId ? Number(professionalId) : null}
          responsibleDoctorName={selectedProfessional?.name}
        />
        </>
      )}

      {/* BLOCO 1 - DADOS GERAIS */}
      <Card className="panel-3d">
        <CardHeader className="pb-3">
          <CardTitle className="bevel-3d px-3 py-1.5 uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-black">1</span>
            Dados Gerais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Cliente *</Label>
              {clientIdProp != null ? (
                <div className="field-engraved rounded-md px-3 py-2.5">
                  <span className="font-bold uppercase tracking-tight text-sm">
                    {selectedClient?.name ? tituloProprio(selectedClient.name) : "Cliente selecionado"}
                  </span>
                  {selectedClient?.cpf && (
                    <span className="ml-2 text-xs text-muted-foreground tabular-nums font-medium">{selectedClient.cpf}</span>
                  )}
                </div>
              ) : (
                <div className="field-engraved rounded-md p-1">
                  <PaxterClientSelector
                    clientes={clients ?? []}
                    value={clientId}
                    onChange={setClientId}
                    placeholder="Selecionar cliente…"
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Médico Responsável *</Label>
              {embedded && !identityConfirmed ? (
                <div className="field-engraved rounded-md px-3 py-2.5" role="status">
                  {clinicalIdentity.isError ? (
                    <>Não foi possível confirmar o profissional.{" "}
                      <button type="button" className="underline" onClick={() => void clinicalIdentity.refetch()}>Tentar novamente</button>
                    </>
                  ) : "Confirmando profissional…"}
                </div>
              ) : authenticatedDoctor ? (
                <div className="field-engraved rounded-md px-3 py-2.5" aria-label="Médico autenticado">
                  {authenticatedDoctor.name}
                  {authenticatedDoctor.crm ? ` — CRM ${authenticatedDoctor.crm}${authenticatedDoctor.uf ? `/${authenticatedDoctor.uf}` : ""}` : ""}
                </div>
              ) : <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger className="field-engraved">
                  <SelectValue placeholder="Selecione o médico" />
                </SelectTrigger>
                <SelectContent>
                  {availableDoctors.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}{p.crm ? ` — ${p.crm}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>}
              {authenticatedDoctor && agendaOptions && !doctorAllowed && (
                <p className="text-xs text-destructive" role="alert">
                  O médico autenticado não está vinculado à agenda médica cadastrada para este cliente.
                </p>
              )}
            </div>
          </div>
          {/* Enfermagem vinculada ao local do cliente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-1.5">
                <Stethoscope className="h-3 w-3" /> Enfermeira Responsável
              </Label>
              <Select value={nurseId || "none"} onValueChange={v => setNurseId(v === "none" ? "" : v)}>
                <SelectTrigger className="field-engraved">
                  <SelectValue placeholder="Sem enfermeira (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sem enfermeira —</SelectItem>
                  {nurses.map((n: any) => (
                    <SelectItem key={n.id} value={String(n.id)}>
                      <div className="flex items-center gap-2">
                        <span>{n.name}</span>
                        {n.homeServiceFeePerVisit && (
                          <span className="text-muted-foreground text-xs">
                            R$ {Number(n.homeServiceFeePerVisit).toFixed(2)}/visita
                          </span>
                        )}
                        <span className="text-muted-foreground text-xs uppercase">
                          {n.nurseType === "home" ? "· Home" : "· Clínica"}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {nurseId && (
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                  {(() => {
                    const n = nurses.find((x: any) => String(x.id) === nurseId) as any;
                    if (!n || !n.homeServiceFeePerVisit) return null;
                    const maxSessions = filledSlots.length > 0 ? Math.max(...filledSlots.map(s => s.totalSessions)) : 0;
                    return `Fee estimado: R$ ${(n.homeServiceFeePerVisit * maxSessions).toFixed(2)} (${maxSessions} sessões × R$ ${n.homeServiceFeePerVisit})`;
                  })()}
                </p>
              )}
            </div>

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Clínica e agendas vinculadas</Label>
              {agendaOptionsLoading ? (
                <div className="field-engraved rounded-md px-3 py-2.5 text-sm" role="status">Carregando vínculos do cliente…</div>
              ) : agendaOptionsError ? (
                <div className="panel-3d-sub rounded-md px-3 py-2.5 text-sm text-destructive" role="alert">
                  {agendaOptionsError}
                </div>
              ) : agendaOptions ? (
                <div className="field-engraved rounded-md px-3 py-2.5 text-sm space-y-1" aria-readonly="true">
                  <p><strong>Clínica:</strong> {agendaOptions.clinic.name}</p>
                  <p><strong>Agenda de enfermagem:</strong> {agendaOptions.nursingAgenda.name}</p>
                  <p><strong>Agenda médica:</strong> {agendaOptions.medicalAgenda.name}</p>
                  <p><strong>Local de atendimento:</strong> {selectedLocation?.name}</p>
                </div>
              ) : (
                <div className="field-engraved rounded-md px-3 py-2.5 text-sm text-muted-foreground">
                  Selecione o cliente para carregar somente os vínculos do cadastro.
                </div>
              )}
              {selectedLocation?.address && (
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mt-1">{selectedLocation.address}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Horário Padrão das Sessões</Label>
              <Input type="time" className="field-engraved" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Horário local para os agendamentos gerados</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="scheduling-mode" className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Organização das aplicações</Label>
            <Select value={schedulingMode} onValueChange={value => setSchedulingMode(value as "weekly" | "exact")}>
              <SelectTrigger id="scheduling-mode" className="field-engraved"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Consolidar uma visita por semana</SelectItem>
                <SelectItem value="exact">Preservar datas e intervalos exatos</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground min-h-10">
              {schedulingMode === "exact"
                ? "Mantém o início de cada substância e o dia correto de cada aplicação."
                : "Pode antecipar aplicações dentro da mesma semana; não mantém dias diferentes como visitas separadas."}
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Título do Protocolo (opcional)</Label>
            <Input
              className="field-engraved"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Deixe vazio para gerar automaticamente"
            />
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 2 - SUBSTÂNCIAS */}
      <Card className="panel-3d">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="bevel-3d px-3 py-1.5 uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[10px] font-black">2</span>
              Substâncias ({slots.filter(s => s.substanceId > 0).length}/{slots.length})
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              className="btn-3d-soft"
              onClick={addSlot}
              disabled={slots.length >= 10}
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Substância
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* âncora de scroll: ao adicionar, o novo slot aparece no topo */}
          <div ref={slotsTopRef} />
          <div className="space-y-2">
            <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Categoria de Via</Label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveVia("all")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${activeVia === "all" ? "btn-3d" : "btn-3d-soft"}`}
              >
                Todas <span className="font-mono opacity-70">{viaCounts.all}</span>
              </button>
              {VIA_CATEGORIES.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveVia(c.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${activeVia === c.id ? "btn-3d" : "btn-3d-soft"}`}
                >
                  {c.label} <span className="font-mono opacity-70">{viaCounts[c.id] ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          {slots.map((slot, idx) => {
            const selectedSubstance = substances?.find(substance => substance.id === slot.substanceId);
            return (
            <div key={slot.id} className="relative p-5 panel-3d-sub space-y-4 transition-all"
              style={{ borderLeftColor: slot.substanceId ? slot.substanceColor : undefined, borderLeftWidth: slot.substanceId ? 5 : 1 }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  {slot.substanceId ? (
                    <div className="w-6 h-6 rounded-full flex-shrink-0 shadow-sm" style={{ backgroundColor: slot.substanceColor }} />
                  ) : (
                    <Beaker className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Substância {idx + 1}</span>
                  {slot.substanceName && (
                    <span className="text-base font-bold uppercase tracking-tight ml-2">{slot.substanceName}</span>
                  )}
                </div>
                {slots.length > 1 && (
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10" onClick={() => removeSlot(slot.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Substância *</Label>
                  <Select value={String(slot.substanceId || "")} onValueChange={v => handleSelectSubstance(slot.id, v)}>
                    <SelectTrigger className="field-engraved h-10">
                      <SelectValue placeholder="Escolha a substância..." />
                    </SelectTrigger>
                    <SelectContent>
                      {substancesFiltered.map(s => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          <div className="flex min-w-0 flex-col gap-0.5 py-1">
                            <div className="flex min-w-0 items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                              <span className="truncate font-semibold">{nomeSubstanciaProtocolo(s.name)}</span>
                              <span className="shrink-0 text-[10px] text-muted-foreground">Cadastro #{s.id}</span>
                            </div>
                            <span className="max-w-[30rem] whitespace-normal text-[10px] leading-tight text-muted-foreground">
                              Via {VIA_CATEGORIES.find(category => category.id === viaOf(s.procedureType))?.label ?? "Outra"} · dose padrão {dosePrescritaExibivel(resolveProtocolSubstanceDefaults(s).dose) || "revisão clínica necessária"}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {slot.substanceId > 0 && (
                  <div className="col-span-2 concave-3d px-3 py-2 text-xs" role="status">
                    <strong>Participação médica:</strong> {participacaoMedica(slot.substanceId)}
                    <p className="mt-1 text-muted-foreground">Informação do cadastro da substância; não confirma reserva de agenda.</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Dose por aplicação *</Label>
                  <Input
                    className="field-engraved h-10"
                    value={slot.dose}
                    onChange={e => updateSlot(slot.id, { dose: e.target.value })}
                    placeholder="Dose prescrita por aplicação"
                    data-testid={`input-prescribed-dose-${slot.id}`}
                  />
                  <p
                    className={`text-[10px] ${slot.dose && !dosePrescritaValida(slot.dose) ? "text-destructive" : "text-muted-foreground"}`}
                    role={slot.dose && !dosePrescritaValida(slot.dose) ? "alert" : undefined}
                    data-testid={`text-dose-review-${slot.id}`}
                  >
                    {slot.dose && !dosePrescritaValida(slot.dose)
                      ? "Informe uma dose inequívoca, sem concentração, volume ou ampolas."
                      : selectedSubstance?.defaultDose && !slot.dose
                        ? "O cadastro não permite extrair uma dose inequívoca; revisão médica obrigatória."
                        : slot.dose
                          ? "Dose prescrita preenchida; revise antes de criar o protocolo."
                          : "Sem dose padrão inequívoca; revisão médica obrigatória."}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Total de Sessões</Label>
                  <Input
                    className="field-engraved h-10"
                    type="number"
                    min={1}
                    max={52}
                    value={slot.totalSessions}
                    onChange={e => updateSlot(slot.id, { totalSessions: parseInt(e.target.value) || 1 })}
                  />
                  <p className="text-[10px] text-muted-foreground">Quantidade inicial do formulário; revise antes de criar.</p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Frequência / intervalo *</Label>
                  <Select value={slot.frequency} onValueChange={v => updateSlot(slot.id, {
                    frequency: v,
                    customDays: v === "custom"
                      ? (slot.frequency === "custom" ? slot.customDays : protocolIntervalDays(slot.frequency, slot.customDays))
                      : null,
                  })}>
                    <SelectTrigger className="field-engraved h-10">
                      <SelectValue placeholder="Selecione o intervalo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNCONFIGURED_PROTOCOL_INTERVAL}>Intervalo não informado — escolha</SelectItem>
                      {FREQUENCY_OPTIONS.map(f => (
                        <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {slot.frequency === "custom" ? (
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Intervalo (dias)</Label>
                    <Input
                      className="field-engraved h-10"
                      type="number"
                      min={1}
                      value={slot.customDays ?? ""}
                      onChange={e => updateSlot(slot.id, { customDays: e.target.value ? parseInt(e.target.value) : null })}
                      placeholder="Informe os dias"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Data de Início</Label>
                    <Input
                      className="field-engraved h-10"
                      type="date"
                      value={slot.startDate}
                      onChange={e => updateSlot(slot.id, { startDate: e.target.value })}
                    />
                  </div>
                )}

                {slot.frequency === "custom" && (
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Data de Início</Label>
                    <Input
                      className="field-engraved h-10"
                      type="date"
                      value={slot.startDate}
                      onChange={e => updateSlot(slot.id, { startDate: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {slot.substanceId > 0 && slot.dose && (
                <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-3 border-t border-muted/20">
                  <CalendarDays className="h-3.5 w-3.5" />
                  <span>
                    {slot.totalSessions} sessões ·{" "}
                    Início: {slot.startDate.split("-").reverse().join("/")} ·{" "}
                    Término estimado: {getEndDate(slot)}
                  </span>
                </div>
              )}
            </div>
            );
          })}

          {slots.length < 10 && (
            <button
              onClick={addSlot}
              className="w-full py-4 panel-3d-sub border-2 border-dashed border-muted-foreground/30 text-muted-foreground text-[10px] font-bold uppercase tracking-widest hover:border-primary/50 hover:text-primary transition-all flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar substância ({slots.length}/10)
            </button>
          )}
        </CardContent>
      </Card>

      {/* BOTÃO AVANÇAR */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">
          {!canAdvance && (
            <span>Preencha cliente, médico, local, dose por aplicação e intervalo de cada substância selecionada.</span>
          )}
          {canAdvance && (
            <span className="text-emerald-600">Pronto para revisar — {filledSlots.length} substância{filledSlots.length !== 1 ? "s" : ""} configurada{filledSlots.length !== 1 ? "s" : ""}.</span>
          )}
        </div>
        <Button
          size="lg"
          className="btn-3d px-8"
          onClick={() => setStep("resumo")}
          disabled={!canAdvance}
        >
          Ver Resumo
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
