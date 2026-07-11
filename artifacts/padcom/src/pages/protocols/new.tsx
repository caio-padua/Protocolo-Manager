import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useCreateProtocol, useValidateProtocol, useListClients, useListSubstances, useListProfessionals } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientCombobox } from "@/components/ClientCombobox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, ChevronRight, Beaker, User, MapPin, CalendarDays, CheckCircle2, Printer, Loader2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, addMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Semanal (a cada 7 dias)", days: 7 },
  { value: "biweekly", label: "Quinzenal (a cada 15 dias)", days: 15 },
  { value: "triweekly", label: "A cada 21 dias", days: 21 },
  { value: "monthly", label: "Mensal (a cada 30 dias)", days: 30 },
  { value: "custom", label: "Personalizado", days: 0 },
];

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

function getEndDate(slot: SubstanceSlot): string {
  const freq = FREQUENCY_OPTIONS.find(f => f.value === slot.frequency);
  const days = slot.frequency === "custom" ? slot.customDays : (freq?.days ?? 7);
  const totalDays = days * (slot.totalSessions - 1);
  const start = new Date(slot.startDate);
  const end = addDays(start, totalDays);
  return format(end, "dd/MM/yyyy", { locale: ptBR });
}

interface Location { id: number; name: string; type: string; color: string; address: string | null; }

export default function NovoProtocolo({ clientId: clientIdProp, embedded, onCreated }: { clientId?: number; embedded?: boolean; onCreated?: (id: number) => void } = {}) {
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
  const { data: substances } = useListSubstances();
  const { data: professionals } = useListProfessionals();
  const [locations, setLocations] = useState<Location[]>([]);

  const [step, setStep] = useState<"configurar" | "resumo">("configurar");
  const [clientId, setClientId] = useState(clientIdProp != null ? String(clientIdProp) : "");
  const [professionalId, setProfessionalId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [slots, setSlots] = useState<SubstanceSlot[]>([emptySlot()]);
  const [title, setTitle] = useState("");
  const [comboLoading, setComboLoading] = useState(false);
  const [activeVia, setActiveVia] = useState<string>("all");
  const comboRef = useRef(false);

  useEffect(() => {
    if (clientIdProp != null) setClientId(String(clientIdProp));
  }, [clientIdProp]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/locations`)
      .then(r => r.json())
      .then(setLocations)
      .catch(() => {});
  }, []);

  const createMutation = useCreateProtocol({
    mutation: {
      onSuccess: (data) => {
        if (comboRef.current) return;
        toast({ title: "Protocolo lançado!", description: "Sessões serão geradas após validação." });
        irAoProtocolo(data.id);
      },
      onError: () => {
        if (comboRef.current) return;
        toast({ title: "Erro ao criar protocolo", variant: "destructive" });
      }
    }
  });

  const validateMutation = useValidateProtocol();

  const selectedClient = clients?.find(c => String(c.id) === clientId);
  const selectedProfessional = professionals?.find(p => String(p.id) === professionalId);
  const selectedLocation = locations.find(l => String(l.id) === locationId);
  const filledSlots = slots.filter(s => s.substanceId > 0 && s.dose);

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

  const addSlot = () => {
    if (slots.length >= 10) return;
    setSlots(prev => [...prev, emptySlot()]);
  };

  const removeSlot = (id: string) => {
    setSlots(prev => prev.filter(s => s.id !== id));
  };

  const updateSlot = (id: string, updates: Partial<SubstanceSlot>) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleSelectSubstance = (slotId: string, substanceId: string) => {
    const sub = substances?.find(s => String(s.id) === substanceId);
    if (!sub) return;
    updateSlot(slotId, {
      substanceId: sub.id,
      substanceName: sub.name,
      substanceColor: sub.color,
    });
  };

  const canAdvance = clientId && professionalId && locationId && filledSlots.length > 0;

  const buildPayload = () => {
    const autoTitle = title || `Protocolo ${selectedClient?.name?.split(" ")[0]} — ${filledSlots.map(s => s.substanceName).join(", ")}`;
    return {
      clientId: parseInt(clientId),
      title: autoTitle,
      status: "suggested" as const,
      startDate: filledSlots[0]?.startDate ?? format(new Date(), "yyyy-MM-dd"),
      serviceType: (selectedLocation?.type === "homecare" ? "homecare" : "clinic") as "homecare" | "clinic",
      professionalId: parseInt(professionalId),
      unit: selectedLocation?.name ?? null,
      totalValue: 0,
      notes: null,
      items: filledSlots.map(s => {
        const freq = FREQUENCY_OPTIONS.find(f => f.value === s.frequency);
        const intervalDays = s.frequency === "custom" ? s.customDays : (freq?.days ?? 7);
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

  const handleLancar = () => {
    createMutation.mutate({ data: buildPayload() });
  };

  const handleLancarComRasFap = async () => {
    if (comboRef.current) return;
    comboRef.current = true;
    setComboLoading(true);
    let createdId: number | null = null;
    try {
      const created = await createMutation.mutateAsync({ data: buildPayload() });
      createdId = created.id;
      await validateMutation.mutateAsync({ id: created.id });
      const resp = await fetch(`${import.meta.env.BASE_URL}api/ras/physical/${created.id}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.details || "Erro ao gerar RAS FAP");
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = resp.headers.get("Content-Disposition");
      const m = cd?.match(/filename="(.+)"/);
      a.download = m?.[1] ?? `RAS_FAP_${created.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Protocolo lançado e RAS FAP gerado!", description: "PDF baixado para impressao e enviado ao Drive do cliente." });
      comboRef.current = false;
      irAoProtocolo(created.id);
    } catch (err: any) {
      if (createdId !== null) {
        toast({
          title: "Protocolo criado, mas o RAS FAP falhou",
          description: "Abrindo o detalhe — gere o RAS FAP pelo botão da tela.",
          variant: "destructive",
        });
        comboRef.current = false;
        irAoProtocolo(createdId);
      } else {
        toast({ title: "Erro ao criar protocolo", description: err?.message ?? "Falha ao lançar com RAS FAP", variant: "destructive" });
      }
    } finally {
      comboRef.current = false;
      setComboLoading(false);
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

      <Card className="panel-3d">
        <CardHeader className="pb-3">
          <CardTitle className="bevel-3d px-3 py-1.5 uppercase tracking-wider text-sm font-bold inline-flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" /> Confirme antes de lançar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 panel-3d-sub">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-2">
                <User className="h-3.5 w-3.5" /> Cliente
              </div>
              <p className="font-bold uppercase tracking-tight text-lg leading-tight">{selectedClient?.name}</p>
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
                {selectedLocation?.type === "homecare" ? "Nurse Care Domiciliar" : "Clínica"}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-muted-foreground mb-3 uppercase tracking-widest">Substâncias ({filledSlots.length})</p>
            <div className="space-y-4">
              {filledSlots.map((slot, idx) => {
                const freq = FREQUENCY_OPTIONS.find(f => f.value === slot.frequency);
                const days = slot.frequency === "custom" ? slot.customDays : (freq?.days ?? 7);
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
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> a cada {days} dias</span>
                        <span className="tabular-nums">Início: {format(new Date(slot.startDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                        <span className="tabular-nums">Término: {getEndDate(slot)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 panel-3d-sub bg-primary/5 border-primary/20 paxter-underglow">
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span className="font-bold uppercase tracking-wide">Consolidação semanal ativa</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2 font-medium uppercase tracking-wide leading-relaxed">
              O sistema agrupará automaticamente as substâncias por semana (Seg–Dom), elegendo um único dia de visita por semana. Horário padrão: <strong className="text-foreground">{scheduledTime}</strong>.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" size="lg" className="btn-3d-soft" onClick={() => setStep("configurar")} disabled={comboLoading || createMutation.isPending}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar e Editar
        </Button>
        <Button size="lg" className="btn-3d px-8" onClick={handleLancar} disabled={createMutation.isPending || comboLoading}>
          {createMutation.isPending && !comboRef.current ? "Lançando..." : "Confirmar e Lançar Protocolo"}
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="btn-3d px-8"
          onClick={handleLancarComRasFap}
          disabled={comboLoading || createMutation.isPending}
        >
          {comboLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Printer className="h-4 w-4 mr-1" />}
          {comboLoading ? "Gerando RAS FAP..." : "Lançar + Gerar RAS FAP"}
        </Button>
      </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      {!embedded && (
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
                    {selectedClient?.name ?? "Cliente selecionado"}
                  </span>
                  {selectedClient?.cpf && (
                    <span className="ml-2 text-xs text-muted-foreground tabular-nums font-medium">{selectedClient.cpf}</span>
                  )}
                </div>
              ) : (
                <div className="field-engraved rounded-md p-1">
                  <ClientCombobox
                    clients={clients ?? []}
                    value={clientId}
                    onChange={setClientId}
                    placeholder="Selecione o cliente"
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Médico Responsável *</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger className="field-engraved">
                  <SelectValue placeholder="Selecione o médico" />
                </SelectTrigger>
                <SelectContent>
                  {professionals?.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}{p.crm ? ` — ${p.crm}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Local de Atendimento *</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="field-engraved">
                  <SelectValue placeholder="Selecione o local" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(l => (
                    <SelectItem key={l.id} value={String(l.id)}>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                        <span>{l.name}</span>
                        <span className="text-muted-foreground text-xs">{l.type === "homecare" ? "Domiciliar" : "Clínica"}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedLocation?.address && (
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mt-1">{selectedLocation.address}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Horário Padrão das Sessões</Label>
              <Input type="time" className="field-engraved" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Horário de referência para consolidação semanal</p>
            </div>
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

          {slots.map((slot, idx) => (
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
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                            <span>{s.name}</span>
                            {s.unit && <span className="text-muted-foreground text-xs">({s.unit})</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Dose *</Label>
                  <Input
                    className="field-engraved h-10"
                    value={slot.dose}
                    onChange={e => updateSlot(slot.id, { dose: e.target.value })}
                    placeholder="Ex: 600mg, 15g"
                  />
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
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Frequência</Label>
                  <Select value={slot.frequency} onValueChange={v => updateSlot(slot.id, { frequency: v })}>
                    <SelectTrigger className="field-engraved h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                      value={slot.customDays}
                      onChange={e => updateSlot(slot.id, { customDays: parseInt(e.target.value) || 1 })}
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
                    Início: {format(new Date(slot.startDate), "dd/MM/yyyy", { locale: ptBR })} ·{" "}
                    Término estimado: {getEndDate(slot)}
                  </span>
                </div>
              )}
            </div>
          ))}

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
            <span>Preencha: cliente, médico, local e ao menos uma substância com dose.</span>
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
