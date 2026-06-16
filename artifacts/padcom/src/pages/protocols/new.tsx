import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useCreateProtocol, useListClients, useListSubstances, useListProfessionals } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientCombobox } from "@/components/ClientCombobox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, ChevronRight, Beaker, User, MapPin, CalendarDays, CheckCircle2 } from "lucide-react";
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

export default function NovoProtocolo() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: clients } = useListClients();
  const { data: substances } = useListSubstances();
  const { data: professionals } = useListProfessionals();
  const [locations, setLocations] = useState<Location[]>([]);

  const [step, setStep] = useState<"configurar" | "resumo">("configurar");
  const [clientId, setClientId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [scheduledTime, setScheduledTime] = useState("08:00");
  const [slots, setSlots] = useState<SubstanceSlot[]>([emptySlot()]);
  const [title, setTitle] = useState("");

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}api/locations`)
      .then(r => r.json())
      .then(setLocations)
      .catch(() => {});
  }, []);

  const createMutation = useCreateProtocol({
    mutation: {
      onSuccess: (data) => {
        toast({ title: "Protocolo lançado!", description: "Sessões serão geradas após validação." });
        setLocation(`/protocols/${data.id}`);
      },
      onError: () => {
        toast({ title: "Erro ao criar protocolo", variant: "destructive" });
      }
    }
  });

  const selectedClient = clients?.find(c => String(c.id) === clientId);
  const selectedProfessional = professionals?.find(p => String(p.id) === professionalId);
  const selectedLocation = locations.find(l => String(l.id) === locationId);
  const filledSlots = slots.filter(s => s.substanceId > 0 && s.dose);

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

  const handleLancar = () => {
    const autoTitle = title || `Protocolo ${selectedClient?.name?.split(" ")[0]} — ${filledSlots.map(s => s.substanceName).join(", ")}`;
    createMutation.mutate({
      data: {
        clientId: parseInt(clientId),
        title: autoTitle,
        status: "suggested",
        startDate: filledSlots[0]?.startDate ?? format(new Date(), "yyyy-MM-dd"),
        serviceType: selectedLocation?.type === "homecare" ? "homecare" : "clinic",
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
      }
    });
  };

  if (step === "resumo") {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setStep("configurar")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Revisar
          </Button>
          <h1 className="text-2xl font-bold">Resumo do Protocolo</h1>
        </div>

        <Card className="border-2 border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <CardTitle>Confirme antes de lançar</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <User className="h-3.5 w-3.5" />
                  Cliente
                </div>
                <p className="font-semibold">{selectedClient?.name}</p>
                <p className="text-xs text-muted-foreground">{selectedClient?.cpf}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <User className="h-3.5 w-3.5" />
                  Médico Responsável
                </div>
                <p className="font-semibold">{selectedProfessional?.name}</p>
                <p className="text-xs text-muted-foreground">{selectedProfessional?.crm}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <MapPin className="h-3.5 w-3.5" />
                  Local
                </div>
                <p className="font-semibold">{selectedLocation?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {selectedLocation?.type === "homecare" ? "Nurse Care Domiciliar" : "Clínica"}
                </p>
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Substâncias ({filledSlots.length})</p>
              <div className="space-y-3">
                {filledSlots.map((slot, idx) => {
                  const freq = FREQUENCY_OPTIONS.find(f => f.value === slot.frequency);
                  const days = slot.frequency === "custom" ? slot.customDays : (freq?.days ?? 7);
                  return (
                    <div key={slot.id} className="flex items-center gap-3 p-3 rounded-lg border">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: slot.substanceColor }}>
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-semibold">{slot.substanceName}</span>
                          <Badge variant="outline" className="text-xs">{slot.dose}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{slot.totalSessions} sessões</span>
                          <span>a cada {days} dias</span>
                          <span>Início: {format(new Date(slot.startDate), "dd/MM/yyyy", { locale: ptBR })}</span>
                          <span>Término: {getEndDate(slot)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="h-4 w-4 text-primary" />
                <span className="font-medium">Consolidação semanal ativa</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                O sistema agrupará automaticamente as substâncias por semana (Seg–Dom), elegendo um único dia de visita por semana. Horário padrão: <strong>{scheduledTime}</strong>.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button variant="outline" size="lg" onClick={() => setStep("configurar")}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Voltar e Editar
          </Button>
          <Button size="lg" onClick={handleLancar} disabled={createMutation.isPending} className="px-8">
            {createMutation.isPending ? "Lançando..." : "Confirmar e Lançar Protocolo"}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/protocols")}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Lançador de Protocolo</h1>
          <p className="text-muted-foreground text-sm">Preencha os dados e adicione as substâncias do protocolo.</p>
        </div>
      </div>

      {/* BLOCO 1 - DADOS GERAIS */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
            Dados Gerais
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Cliente *</Label>
              <ClientCombobox
                clients={clients ?? []}
                value={clientId}
                onChange={setClientId}
                placeholder="Selecione o cliente"
              />
            </div>
            <div className="space-y-2">
              <Label>Médico Responsável *</Label>
              <Select value={professionalId} onValueChange={setProfessionalId}>
                <SelectTrigger>
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Local de Atendimento *</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
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
                <p className="text-xs text-muted-foreground">{selectedLocation.address}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Horário Padrão das Sessões</Label>
              <Input type="time" value={scheduledTime} onChange={e => setScheduledTime(e.target.value)} />
              <p className="text-xs text-muted-foreground">Horário de referência para consolidação semanal</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Título do Protocolo (opcional)</Label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Deixe vazio para gerar automaticamente"
            />
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 2 - SUBSTÂNCIAS */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
              Substâncias ({slots.filter(s => s.substanceId > 0).length}/{slots.length})
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={addSlot}
              disabled={slots.length >= 10}
            >
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Substância
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {slots.map((slot, idx) => (
            <div key={slot.id} className="relative p-4 border rounded-xl space-y-3 transition-all"
              style={{ borderLeftColor: slot.substanceId ? slot.substanceColor : undefined, borderLeftWidth: slot.substanceId ? 4 : 1 }}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {slot.substanceId ? (
                    <div className="w-5 h-5 rounded-full flex-shrink-0" style={{ backgroundColor: slot.substanceColor }} />
                  ) : (
                    <Beaker className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium text-muted-foreground">Substância {idx + 1}</span>
                  {slot.substanceName && (
                    <span className="text-sm font-semibold">{slot.substanceName}</span>
                  )}
                </div>
                {slots.length > 1 && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => removeSlot(slot.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Substância *</Label>
                  <Select value={String(slot.substanceId || "")} onValueChange={v => handleSelectSubstance(slot.id, v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Escolha a substância..." />
                    </SelectTrigger>
                    <SelectContent>
                      {substances?.map(s => (
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
                  <Label className="text-xs">Dose *</Label>
                  <Input
                    className="h-9"
                    value={slot.dose}
                    onChange={e => updateSlot(slot.id, { dose: e.target.value })}
                    placeholder="Ex: 600mg, 15g, 500mcg"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Total de Sessões</Label>
                  <Input
                    className="h-9"
                    type="number"
                    min={1}
                    max={52}
                    value={slot.totalSessions}
                    onChange={e => updateSlot(slot.id, { totalSessions: parseInt(e.target.value) || 1 })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Frequência</Label>
                  <Select value={slot.frequency} onValueChange={v => updateSlot(slot.id, { frequency: v })}>
                    <SelectTrigger className="h-9">
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
                    <Label className="text-xs">Intervalo (dias)</Label>
                    <Input
                      className="h-9"
                      type="number"
                      min={1}
                      value={slot.customDays}
                      onChange={e => updateSlot(slot.id, { customDays: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Data de Início</Label>
                    <Input
                      className="h-9"
                      type="date"
                      value={slot.startDate}
                      onChange={e => updateSlot(slot.id, { startDate: e.target.value })}
                    />
                  </div>
                )}

                {slot.frequency === "custom" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Data de Início</Label>
                    <Input
                      className="h-9"
                      type="date"
                      value={slot.startDate}
                      onChange={e => updateSlot(slot.id, { startDate: e.target.value })}
                    />
                  </div>
                )}
              </div>

              {slot.substanceId > 0 && slot.dose && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t">
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
              className="w-full py-3 border-2 border-dashed border-muted-foreground/30 rounded-xl text-muted-foreground text-sm hover:border-primary/50 hover:text-primary transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Adicionar substância ({slots.length}/10)
            </button>
          )}
        </CardContent>
      </Card>

      {/* BOTÃO AVANÇAR */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {!canAdvance && (
            <span>Preencha: cliente, médico, local e ao menos uma substância com dose.</span>
          )}
          {canAdvance && (
            <span className="text-green-600 font-medium">Pronto para revisar — {filledSlots.length} substância{filledSlots.length !== 1 ? "s" : ""} configurada{filledSlots.length !== 1 ? "s" : ""}.</span>
          )}
        </div>
        <Button
          size="lg"
          onClick={() => setStep("resumo")}
          disabled={!canAdvance}
          className="px-8"
        >
          Ver Resumo
          <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
