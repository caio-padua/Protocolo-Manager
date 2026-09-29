import { useEffect, useMemo, useState } from "react";
import {
  useCreateProtocol,
  useValidateProtocol,
  useListSubstances,
  useListProfessionals,
  useListClients,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Beaker,
  Syringe,
  Gem,
  User,
  MapPin,
  Loader2,
  AlertTriangle,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addDays } from "date-fns";

// ===========================================================================
// LANÇADOR INLINE (T004) — mini-lançador de protocolo dentro do Cockpit da
// Consulta. Copia a lógica de pages/protocols/new.tsx (buildPayload,
// FREQUENCY_OPTIONS, slots) sem navegar para outra tela. Filtra substâncias
// por procedureType conforme o tipo (injetável = iv/im; implante = implant).
// Tema CLARO (skill-layout-paxter): panel-3d, bevel-3d, field-engraved, btn-3d.
// ===========================================================================

const NAVY = "#16294a";
const GOLD = "#9a7b32";

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Semanal (7 dias)", days: 7 },
  { value: "biweekly", label: "Quinzenal (15 dias)", days: 15 },
  { value: "triweekly", label: "A cada 21 dias", days: 21 },
  { value: "monthly", label: "Mensal (30 dias)", days: 30 },
  { value: "custom", label: "Personalizado", days: 0 },
];

interface SubstanceSlot {
  id: string;
  substanceId: number;
  substanceName: string;
  substanceColor: string;
  dose: string;
  totalSessions: number;
  frequency: string;
  customDays: number;
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
    frequency: "weekly",
    customDays: 14,
    startDate: format(new Date(), "yyyy-MM-dd"),
  };
}

interface Location {
  id: number;
  name: string;
  type: string;
  color: string;
  address: string | null;
}

const MAX_SLOTS = 5;

export default function LancadorInline({
  clientId,
  tipo,
}: {
  clientId: number;
  tipo: "injetavel" | "implante";
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: clients } = useListClients();
  const { data: substances } = useListSubstances();
  const { data: professionals } = useListProfessionals();

  const [locations, setLocations] = useState<Location[]>([]);
  const [professionalId, setProfessionalId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [slots, setSlots] = useState<SubstanceSlot[]>([emptySlot()]);
  const [title, setTitle] = useState("");
  const [semAnamnese, setSemAnamnese] = useState(false);
  const [validando, setValidando] = useState(false);

  const cliente = useMemo(
    () => (clients ?? []).find((c) => c.id === clientId) ?? null,
    [clients, clientId],
  );

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/locations`)
      .then((r) => r.json())
      .then(setLocations)
      .catch(() => {});
  }, []);

  // Aviso âmbar: cliente sem anamnese registrada (só aviso, não bloqueia).
  useEffect(() => {
    let ativo = true;
    fetch(`${import.meta.env.BASE_URL}api/cockpit/${clientId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((dto) => {
        if (!ativo || !dto) return;
        setSemAnamnese((dto?.passado?.respostasAnamnese ?? 0) === 0);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [clientId]);

  // Filtro de substâncias por procedureType.
  const substanciasFiltradas = useMemo(() => {
    const lista = substances ?? [];
    if (tipo === "implante") return lista.filter((s) => s.procedureType === "implant");
    return lista.filter((s) => s.procedureType === "iv" || s.procedureType === "im" || s.procedureType === "sc");
  }, [substances, tipo]);

  const selectedProfessional = professionals?.find((p) => String(p.id) === professionalId);
  const selectedLocation = locations.find((l) => String(l.id) === locationId);
  const filledSlots = slots.filter((s) => s.substanceId > 0 && s.dose);

  const createMutation = useCreateProtocol();
  const validateMutation = useValidateProtocol();

  const isBusy = createMutation.isPending || validando;

  const addSlot = () => {
    if (slots.length >= MAX_SLOTS) return;
    setSlots((prev) => [...prev, emptySlot()]);
  };

  const removeSlot = (id: string) => {
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const updateSlot = (id: string, updates: Partial<SubstanceSlot>) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const handleSelectSubstance = (slotId: string, substanceId: string) => {
    const sub = substanciasFiltradas.find((s) => String(s.id) === substanceId);
    if (!sub) return;
    updateSlot(slotId, {
      substanceId: sub.id,
      substanceName: sub.name,
      substanceColor: sub.color,
    });
  };

  const canLaunch = professionalId && locationId && filledSlots.length > 0;

  const buildPayload = () => {
    const autoTitle =
      title ||
      `Protocolo ${cliente?.name?.split(" ")[0] ?? ""} — ${filledSlots
        .map((s) => s.substanceName)
        .join(", ")}`;
    return {
      clientId,
      title: autoTitle,
      status: "suggested" as const,
      startDate: filledSlots[0]?.startDate ?? format(new Date(), "yyyy-MM-dd"),
      serviceType: (selectedLocation?.type === "homecare" ? "homecare" : "clinic") as
        | "homecare"
        | "clinic",
      professionalId: parseInt(professionalId),
      unit: selectedLocation?.name ?? null,
      totalValue: 0,
      notes: null,
      items: filledSlots.map((s) => {
        const freq = FREQUENCY_OPTIONS.find((f) => f.value === s.frequency);
        const intervalDays = s.frequency === "custom" ? s.customDays : freq?.days ?? 7;
        return {
          substanceId: s.substanceId,
          dose: s.dose,
          totalSessions: s.totalSessions,
          intervalDays,
          frequency: s.frequency,
        };
      }),
    };
  };

  const resetForm = () => {
    setSlots([emptySlot()]);
    setTitle("");
  };

  const invalidarLista = () => {
    void queryClient.invalidateQueries({
      queryKey: ["cockpit-injetaveis-protocols", clientId],
    });
  };

  const handleLancar = async () => {
    if (!canLaunch || isBusy) return;
    try {
      await createMutation.mutateAsync({ data: buildPayload() });
      toast({
        title: "Protocolo lançado!",
        description: "Criado com status sugerido. Sessões após validação.",
      });
      invalidarLista();
      resetForm();
    } catch {
      toast({ title: "Erro ao lançar protocolo", variant: "destructive" });
    }
  };

  const handleLancarEValidar = async () => {
    if (!canLaunch || isBusy) return;
    setValidando(true);
    try {
      const created = await createMutation.mutateAsync({ data: buildPayload() });
      await validateMutation.mutateAsync({ id: created.id });
      toast({
        title: "Protocolo lançado e validado!",
        description: "Sessões geradas a partir do protocolo.",
      });
      invalidarLista();
      resetForm();
    } catch {
      toast({
        title: "Erro ao lançar e validar",
        description: "Verifique o protocolo e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setValidando(false);
    }
  };

  const TipoIcon = tipo === "implante" ? Gem : Syringe;
  const tipoLabel = tipo === "implante" ? "Implante" : "Injetável";

  return (
    <div className="space-y-4">
      {semAnamnese && (
        <div
          className="bevel-3d flex items-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-semibold"
          style={{
            background: "linear-gradient(180deg,#fff7e0,#fdeec2)",
            color: "#7a5a12",
            border: "1px solid rgba(154,123,50,0.4)",
          }}
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: GOLD }} />
          Cliente sem anamnese registrada — você é o cérebro desta consulta.
        </div>
      )}

      <div className="panel-3d rounded-md p-5">
        <div className="mb-4 flex items-center gap-2">
          <span
            className="bevel-3d inline-flex items-center gap-2 rounded px-3 py-1.5 text-[13px] font-bold uppercase tracking-wider"
            style={{ color: NAVY }}
          >
            <TipoIcon className="h-4 w-4" style={{ color: GOLD }} />
            Lançar protocolo de {tipoLabel.toLowerCase()}s
          </span>
        </div>

        {/* Profissional + Local */}
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#647c97]">
              <User className="h-3 w-3" /> Profissional *
            </Label>
            <Select value={professionalId} onValueChange={setProfessionalId}>
              <SelectTrigger className="field-engraved h-10">
                <SelectValue placeholder="Selecione o profissional" />
              </SelectTrigger>
              <SelectContent>
                {professionals?.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                    {p.crm ? ` — ${p.crm}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[#647c97]">
              <MapPin className="h-3 w-3" /> Local *
            </Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger className="field-engraved h-10">
                <SelectValue placeholder="Selecione o local" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                      <span>{l.name}</span>
                      <span className="text-xs text-[#647c97]">
                        {l.type === "homecare" ? "Domiciliar" : "Clínica"}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Título opcional */}
        <div className="mb-4 space-y-1.5">
          <Label className="text-[10px] font-bold uppercase tracking-widest text-[#647c97]">
            Título do protocolo (opcional)
          </Label>
          <Input
            className="field-engraved h-10"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Deixe vazio para gerar automaticamente"
          />
        </div>

        {/* Slots de substâncias */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#647c97]">
            Substâncias ({slots.filter((s) => s.substanceId > 0).length}/{slots.length})
          </span>
          <button
            type="button"
            onClick={addSlot}
            disabled={slots.length >= MAX_SLOTS}
            className="btn-3d-soft inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
            style={{ color: GOLD }}
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        </div>

        <div className="space-y-3">
          {slots.map((slot, idx) => (
            <div
              key={slot.id}
              className="panel-3d-sub rounded-md p-4"
              style={{
                borderLeftColor: slot.substanceId ? slot.substanceColor : undefined,
                borderLeftWidth: slot.substanceId ? 5 : 1,
              }}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {slot.substanceId ? (
                    <div
                      className="h-5 w-5 flex-shrink-0 rounded-full shadow-sm"
                      style={{ backgroundColor: slot.substanceColor }}
                    />
                  ) : (
                    <Beaker className="h-4 w-4 text-[#647c97]" />
                  )}
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#647c97]">
                    {tipoLabel} {idx + 1}
                  </span>
                </div>
                {slots.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSlot(slot.id)}
                    className="rounded p-1 text-red-500 hover:bg-red-500/10"
                    aria-label="Remover substância"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="col-span-2 space-y-1.5 md:col-span-4">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-[#647c97]">
                    Substância *
                  </Label>
                  <Select
                    value={String(slot.substanceId || "")}
                    onValueChange={(v) => handleSelectSubstance(slot.id, v)}
                  >
                    <SelectTrigger className="field-engraved h-10">
                      <SelectValue placeholder="Escolha a substância…" />
                    </SelectTrigger>
                    <SelectContent>
                      {substanciasFiltradas.length === 0 ? (
                        <div className="px-3 py-2 text-xs text-[#647c97]">
                          Nenhuma substância deste tipo cadastrada.
                        </div>
                      ) : (
                        substanciasFiltradas.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            <div className="flex items-center gap-2">
                              <div
                                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                                style={{ backgroundColor: s.color }}
                              />
                              <span>{s.name}</span>
                              {s.unit && <span className="text-xs text-[#647c97]">({s.unit})</span>}
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-[#647c97]">
                    Dose *
                  </Label>
                  <Input
                    className="field-engraved h-10"
                    value={slot.dose}
                    onChange={(e) => updateSlot(slot.id, { dose: e.target.value })}
                    placeholder="Ex: 600mg"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-[#647c97]">
                    Sessões
                  </Label>
                  <Input
                    className="field-engraved h-10"
                    type="number"
                    min={1}
                    max={52}
                    value={slot.totalSessions}
                    onChange={(e) =>
                      updateSlot(slot.id, { totalSessions: parseInt(e.target.value) || 1 })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-[#647c97]">
                    Frequência
                  </Label>
                  <Select
                    value={slot.frequency}
                    onValueChange={(v) => updateSlot(slot.id, { frequency: v })}
                  >
                    <SelectTrigger className="field-engraved h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {slot.frequency === "custom" ? (
                  <div className="space-y-1.5">
                    <Label className="text-[10px] font-bold uppercase tracking-widest text-[#647c97]">
                      Intervalo (dias)
                    </Label>
                    <Input
                      className="field-engraved h-10"
                      type="number"
                      min={1}
                      value={slot.customDays}
                      onChange={(e) =>
                        updateSlot(slot.id, { customDays: parseInt(e.target.value) || 1 })
                      }
                    />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-widest text-[#647c97]">
                    Início
                  </Label>
                  <Input
                    className="field-engraved h-10"
                    type="date"
                    value={slot.startDate}
                    onChange={(e) => updateSlot(slot.id, { startDate: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Ações */}
        <div className="mt-5 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={handleLancar}
            disabled={!canLaunch || isBusy}
            className="btn-3d-soft inline-flex items-center gap-2 rounded px-5 py-2.5 text-sm font-bold uppercase tracking-wide disabled:opacity-50"
            style={{ color: NAVY }}
          >
            {createMutation.isPending && !validando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            Lançar protocolo
          </button>
          <button
            type="button"
            onClick={handleLancarEValidar}
            disabled={!canLaunch || isBusy}
            className="btn-3d inline-flex items-center gap-2 rounded px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white disabled:opacity-50"
          >
            {validando ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Lançar e validar
          </button>
        </div>
      </div>
    </div>
  );
}

// getEndDate helper conservado para futura exibição de término (referência new.tsx).
export function getEndDate(startDate: string, frequency: string, customDays: number, totalSessions: number): string {
  const freq = FREQUENCY_OPTIONS.find((f) => f.value === frequency);
  const days = frequency === "custom" ? customDays : freq?.days ?? 7;
  const totalDays = days * (totalSessions - 1);
  return format(addDays(new Date(startDate), totalDays), "dd/MM/yyyy");
}
