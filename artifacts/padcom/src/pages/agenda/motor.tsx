import { useEffect, useMemo, useState } from "react";
import {
  useListAgendaResources,
  useCreateAgendaResource,
  useUpdateAgendaResource,
  useListAgendaWindows,
  useReplaceAgendaWindows,
  useListAgendaExceptions,
  useCreateAgendaException,
  useDeleteAgendaException,
  useGetAgendaSettings,
  useUpdateAgendaSettings,
  useGetAgendaSlots,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarCog,
  Save,
  Plus,
  Trash2,
  Clock,
  CalendarDays,
  CalendarOff,
  SlidersHorizontal,
  Gauge,
  Layers,
  type LucideIcon,
} from "lucide-react";

type Win = { startTime: string; endTime: string };
type WindowsDraft = Record<number, Win[]>;

const WEEK_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

const KIND_LABEL: Record<string, string> = {
  enfermagem: "Enfermagem",
  medico: "Médico",
};
const MODALITY_LABEL: Record<string, string> = {
  domiciliar: "Domiciliar",
  local: "Local (clínica)",
  online: "Online",
};

function BlockTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-primary">
      <Icon className="h-4 w-4" />
      {children}
    </span>
  );
}

function nextMondayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const add = day === 1 ? 7 : (8 - day) % 7 || 7;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}

function SlotLegend() {
  const items: { cls: string; label: string }[] = [
    { cls: "bg-emerald-500", label: "Aberto" },
    { cls: "bg-cyan-500", label: "Ocupado" },
    { cls: "bg-amber-400", label: "Bloqueado (antecedência)" },
    { cls: "bg-zinc-400", label: "Bloqueado (cadeia)" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className={`inline-block h-3 w-3 ${i.cls}`} style={{ borderRadius: "2px" }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function slotColor(state: string, reason: string | null): string {
  if (state === "ocupado") return "bg-cyan-500 text-white";
  if (state === "aberto") return "bg-emerald-500 text-white";
  if (reason === "antecedencia") return "bg-amber-400 text-amber-950";
  return "bg-zinc-300 text-zinc-600";
}

export default function AgendaMotor() {
  const { toast } = useToast();

  const { data: resources, refetch: refetchResources } = useListAgendaResources();
  const { data: settings, refetch: refetchSettings } = useGetAgendaSettings();
  const { data: exceptions, refetch: refetchExceptions } = useListAgendaExceptions();

  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (resources && resources.length > 0 && selectedId === null) {
      setSelectedId(resources[0].id);
    }
  }, [resources, selectedId]);

  const selected = useMemo(
    () => resources?.find((r) => r.id === selectedId) ?? null,
    [resources, selectedId],
  );

  // ---- Identidade do recurso (draft) ----
  const [resDraft, setResDraft] = useState<{
    name: string;
    kind: string;
    modality: string;
    color: string;
    slotMinutes: number;
    active: boolean;
  } | null>(null);

  useEffect(() => {
    if (selected) {
      setResDraft({
        name: selected.name,
        kind: selected.kind,
        modality: selected.modality,
        color: selected.color,
        slotMinutes: selected.slotMinutes,
        active: selected.active,
      });
    } else {
      setResDraft(null);
    }
  }, [selected]);

  // ---- Janelas ----
  const { data: windows, refetch: refetchWindows } = useListAgendaWindows(selectedId ?? 0, {
    query: { enabled: !!selectedId },
  });
  const [windowsDraft, setWindowsDraft] = useState<WindowsDraft>({});

  useEffect(() => {
    if (windows) {
      const draft: WindowsDraft = {};
      for (const w of windows) {
        (draft[w.weekday] ||= []).push({ startTime: w.startTime, endTime: w.endTime });
      }
      for (const k of Object.keys(draft)) {
        draft[Number(k)].sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
      }
      setWindowsDraft(draft);
    }
  }, [windows]);

  // ---- Settings (motor) ----
  const [setDraft, setSetDraft] = useState<{
    blockMinutes: number;
    triggerPercent: number;
    minLeadHours: number;
  } | null>(null);

  useEffect(() => {
    if (settings) {
      setSetDraft({
        blockMinutes: settings.blockMinutes,
        triggerPercent: settings.triggerPercent,
        minLeadHours: settings.minLeadHours,
      });
    }
  }, [settings]);

  // ---- Nova exceção ----
  const [newExc, setNewExc] = useState({ date: "", kind: "feriado", description: "", resourceId: "" });

  // ---- Prova viva ----
  const [slotResource, setSlotResource] = useState<number | null>(null);
  const [slotDate, setSlotDate] = useState<string>(nextMondayISO());
  const [occupied, setOccupied] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (slotResource === null && resources && resources.length > 0) {
      setSlotResource(resources[0].id);
    }
  }, [resources, slotResource]);

  useEffect(() => {
    setOccupied(new Set());
  }, [slotResource, slotDate]);

  const { data: slotsData, isFetching: slotsFetching } = useGetAgendaSlots(
    {
      resourceId: slotResource ?? 0,
      date: slotDate,
      occupied: occupied.size ? Array.from(occupied).join(",") : undefined,
    },
    { query: { enabled: !!slotResource && !!slotDate } },
  );

  function toggleOccupied(time: string, state: string) {
    if (state !== "aberto" && state !== "ocupado") return;
    setOccupied((prev) => {
      const next = new Set(prev);
      if (next.has(time)) next.delete(time);
      else next.add(time);
      return next;
    });
  }

  // ---- Mutations ----
  const createResource = useCreateAgendaResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Recurso criado" });
        refetchResources();
      },
      onError: () => toast({ title: "Erro ao criar recurso", variant: "destructive" }),
    },
  });
  const updateResource = useUpdateAgendaResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Recurso salvo" });
        refetchResources();
      },
      onError: () => toast({ title: "Erro ao salvar recurso", variant: "destructive" }),
    },
  });
  const replaceWindows = useReplaceAgendaWindows({
    mutation: {
      onSuccess: () => {
        toast({ title: "Janelas salvas" });
        refetchWindows();
      },
      onError: () => toast({ title: "Erro ao salvar janelas", variant: "destructive" }),
    },
  });
  const createException = useCreateAgendaException({
    mutation: {
      onSuccess: () => {
        toast({ title: "Exceção adicionada" });
        setNewExc({ date: "", kind: "feriado", description: "", resourceId: "" });
        refetchExceptions();
      },
      onError: () => toast({ title: "Erro ao adicionar exceção", variant: "destructive" }),
    },
  });
  const deleteException = useDeleteAgendaException({
    mutation: {
      onSuccess: () => {
        toast({ title: "Exceção removida" });
        refetchExceptions();
      },
      onError: () => toast({ title: "Erro ao remover exceção", variant: "destructive" }),
    },
  });
  const updateSettings = useUpdateAgendaSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Parâmetros do motor salvos" });
        refetchSettings();
      },
      onError: () => toast({ title: "Erro ao salvar parâmetros", variant: "destructive" }),
    },
  });

  // ---- Handlers ----
  const [newRes, setNewRes] = useState({ name: "", kind: "enfermagem", modality: "local", color: "#3D7A7A" });

  function addResource() {
    if (!newRes.name.trim()) {
      toast({ title: "Informe o nome do recurso", variant: "destructive" });
      return;
    }
    createResource.mutate({
      data: {
        name: newRes.name.trim(),
        kind: newRes.kind,
        modality: newRes.modality,
        color: newRes.color,
        sortOrder: resources?.length ?? 0,
      },
    });
    setNewRes({ name: "", kind: "enfermagem", modality: "local", color: "#3D7A7A" });
  }

  function saveResource() {
    if (!selectedId || !resDraft) return;
    updateResource.mutate({ id: selectedId, data: resDraft });
  }

  function addWindow(weekday: number) {
    setWindowsDraft((d) => ({
      ...d,
      [weekday]: [...(d[weekday] ?? []), { startTime: "08:00", endTime: "12:00" }],
    }));
  }
  function removeWindow(weekday: number, idx: number) {
    setWindowsDraft((d) => ({
      ...d,
      [weekday]: (d[weekday] ?? []).filter((_, i) => i !== idx),
    }));
  }
  function setWindowField(weekday: number, idx: number, field: keyof Win, value: string) {
    setWindowsDraft((d) => ({
      ...d,
      [weekday]: (d[weekday] ?? []).map((w, i) => (i === idx ? { ...w, [field]: value } : w)),
    }));
  }
  function saveWindows() {
    if (!selectedId) return;
    const flat: { weekday: number; startTime: string; endTime: string }[] = [];
    for (const wd of Object.keys(windowsDraft)) {
      for (const w of windowsDraft[Number(wd)]) {
        flat.push({ weekday: Number(wd), startTime: w.startTime, endTime: w.endTime });
      }
    }
    replaceWindows.mutate({ id: selectedId, data: { windows: flat } });
  }

  function addException() {
    if (!newExc.date) {
      toast({ title: "Informe a data da exceção", variant: "destructive" });
      return;
    }
    createException.mutate({
      data: {
        date: newExc.date,
        kind: newExc.kind,
        description: newExc.description || undefined,
        resourceId: newExc.resourceId ? Number(newExc.resourceId) : undefined,
      },
    });
  }

  function saveSettings() {
    if (!setDraft) return;
    updateSettings.mutate({ data: setDraft });
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-3">
          <span className="bevel-3d inline-flex h-10 w-10 items-center justify-center text-primary">
            <CalendarCog className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wide text-foreground">Motor de Agenda</h1>
            <p className="text-sm text-muted-foreground">
              Recursos, janelas de atendimento e liberação inteligente anti-ilha de horários.
            </p>
          </div>
        </div>
      </header>

      {/* RECURSOS + IDENTIDADE + JANELAS */}
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Coluna recursos */}
        <div className="panel-3d p-4 space-y-4">
          <BlockTitle icon={Layers}>Recursos</BlockTitle>
          <div className="space-y-2">
            {(resources ?? []).map((r) => {
              const isSel = r.id === selectedId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`concave-3d flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                    isSel ? "ring-2 ring-primary" : "opacity-90 hover:opacity-100"
                  }`}
                >
                  <span
                    className="h-7 w-2 shrink-0"
                    style={{ backgroundColor: r.color, borderRadius: "2px" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{r.name}</span>
                    <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                      {KIND_LABEL[r.kind] ?? r.kind} · {MODALITY_LABEL[r.modality] ?? r.modality}
                    </span>
                  </span>
                  {!r.active && (
                    <span className="text-[10px] font-semibold uppercase text-amber-600">inativo</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="panel-3d-sub p-3 space-y-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Novo recurso
            </span>
            <Input
              className="field-engraved"
              placeholder="Nome"
              value={newRes.name}
              onChange={(e) => setNewRes((s) => ({ ...s, name: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={newRes.kind} onValueChange={(v) => setNewRes((s) => ({ ...s, kind: v }))}>
                <SelectTrigger className="field-engraved">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enfermagem">Enfermagem</SelectItem>
                  <SelectItem value="medico">Médico</SelectItem>
                </SelectContent>
              </Select>
              <Select value={newRes.modality} onValueChange={(v) => setNewRes((s) => ({ ...s, modality: v }))}>
                <SelectTrigger className="field-engraved">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="domiciliar">Domiciliar</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={newRes.color}
                onChange={(e) => setNewRes((s) => ({ ...s, color: e.target.value }))}
                className="h-9 w-12 cursor-pointer border-0 bg-transparent p-0"
                aria-label="Cor do recurso"
              />
              <Button className="btn-3d flex-1" onClick={addResource} disabled={createResource.isPending}>
                <Plus className="mr-1 h-4 w-4" /> Adicionar
              </Button>
            </div>
          </div>
        </div>

        {/* Coluna identidade + janelas */}
        <div className="space-y-6">
          {/* Identidade */}
          <div className="panel-3d p-4 space-y-4">
            <div className="flex items-center justify-between">
              <BlockTitle icon={SlidersHorizontal}>Identidade do Recurso</BlockTitle>
              <Button className="btn-3d" onClick={saveResource} disabled={!resDraft || updateResource.isPending}>
                <Save className="mr-1 h-4 w-4" /> Salvar
              </Button>
            </div>
            {resDraft ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Nome</Label>
                  <Input
                    className="field-engraved"
                    value={resDraft.name}
                    onChange={(e) => setResDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
                  <Select
                    value={resDraft.kind}
                    onValueChange={(v) => setResDraft((d) => (d ? { ...d, kind: v } : d))}
                  >
                    <SelectTrigger className="field-engraved">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="enfermagem">Enfermagem</SelectItem>
                      <SelectItem value="medico">Médico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Modalidade</Label>
                  <Select
                    value={resDraft.modality}
                    onValueChange={(v) => setResDraft((d) => (d ? { ...d, modality: v } : d))}
                  >
                    <SelectTrigger className="field-engraved">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Local</SelectItem>
                      <SelectItem value="domiciliar">Domiciliar</SelectItem>
                      <SelectItem value="online">Online</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Slot (minutos)
                  </Label>
                  <Input
                    type="number"
                    min={5}
                    step={5}
                    className="field-engraved"
                    value={resDraft.slotMinutes}
                    onChange={(e) =>
                      setResDraft((d) => (d ? { ...d, slotMinutes: Number(e.target.value) || 0 } : d))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Cor</Label>
                  <input
                    type="color"
                    value={resDraft.color}
                    onChange={(e) => setResDraft((d) => (d ? { ...d, color: e.target.value } : d))}
                    className="h-9 w-full cursor-pointer border-0 bg-transparent p-0"
                    aria-label="Cor"
                  />
                </div>
                <div className="concave-3d flex items-center gap-3 px-3 py-2 sm:col-span-2 lg:col-span-1">
                  <Switch
                    checked={resDraft.active}
                    onCheckedChange={(v) => setResDraft((d) => (d ? { ...d, active: v } : d))}
                  />
                  <Label className="text-sm">Recurso ativo</Label>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Selecione um recurso à esquerda.</p>
            )}
          </div>

          {/* Janelas */}
          <div className="panel-3d p-4 space-y-4">
            <div className="flex items-center justify-between">
              <BlockTitle icon={Clock}>Janelas de Atendimento</BlockTitle>
              <Button
                className="btn-3d"
                onClick={saveWindows}
                disabled={!selectedId || replaceWindows.isPending}
              >
                <Save className="mr-1 h-4 w-4" /> Salvar Janelas
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Horários em que o recurso atende, por dia da semana. Várias faixas por dia (manhã/tarde).
            </p>
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
              {WEEK_ORDER.map((wd) => (
                <div key={wd} className="panel-3d-sub p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                      {WEEK_LABEL[wd]}
                    </span>
                    <button
                      type="button"
                      onClick={() => addWindow(wd)}
                      className="text-primary hover:opacity-70"
                      aria-label={`Adicionar faixa em ${WEEK_LABEL[wd]}`}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {(windowsDraft[wd] ?? []).length === 0 && (
                    <span className="block text-[11px] text-muted-foreground">Fechado</span>
                  )}
                  {(windowsDraft[wd] ?? []).map((w, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <Input
                        type="time"
                        className="field-engraved h-8 px-1 text-xs"
                        value={w.startTime}
                        onChange={(e) => setWindowField(wd, idx, "startTime", e.target.value)}
                      />
                      <span className="text-muted-foreground">–</span>
                      <Input
                        type="time"
                        className="field-engraved h-8 px-1 text-xs"
                        value={w.endTime}
                        onChange={(e) => setWindowField(wd, idx, "endTime", e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeWindow(wd, idx)}
                        className="text-destructive hover:opacity-70"
                        aria-label="Remover faixa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* PARÂMETROS + EXCEÇÕES */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Parâmetros do motor */}
        <div className="panel-3d p-4 space-y-4">
          <div className="flex items-center justify-between">
            <BlockTitle icon={Gauge}>Parâmetros do Motor</BlockTitle>
            <Button className="btn-3d" onClick={saveSettings} disabled={!setDraft || updateSettings.isPending}>
              <Save className="mr-1 h-4 w-4" /> Salvar
            </Button>
          </div>
          {setDraft ? (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Sub-bloco (min)
                  </Label>
                  <Input
                    type="number"
                    min={15}
                    step={15}
                    className="field-engraved"
                    value={setDraft.blockMinutes}
                    onChange={(e) =>
                      setSetDraft((d) => (d ? { ...d, blockMinutes: Number(e.target.value) || 0 } : d))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Gatilho (%)
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    className="field-engraved"
                    value={setDraft.triggerPercent}
                    onChange={(e) =>
                      setSetDraft((d) => (d ? { ...d, triggerPercent: Number(e.target.value) || 0 } : d))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Antecedência (h)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    className="field-engraved"
                    value={setDraft.minLeadHours}
                    onChange={(e) =>
                      setSetDraft((d) => (d ? { ...d, minLeadHours: Number(e.target.value) || 0 } : d))
                    }
                  />
                </div>
              </div>
              <div className="concave-3d px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                O dia é fatiado em sub-blocos de <b>{setDraft.blockMinutes} minutos</b>. O primeiro abre
                sempre; cada bloco seguinte só abre quando o anterior atinge <b>{setDraft.triggerPercent}%</b>{" "}
                de ocupação (regra anti-ilha). Horários a menos de <b>{setDraft.minLeadHours}h</b> ficam
                bloqueados.
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          )}
        </div>

        {/* Exceções */}
        <div className="panel-3d p-4 space-y-4">
          <BlockTitle icon={CalendarOff}>Exceções / Feriados</BlockTitle>
          <div className="panel-3d-sub p-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                className="field-engraved"
                value={newExc.date}
                onChange={(e) => setNewExc((s) => ({ ...s, date: e.target.value }))}
              />
              <Select value={newExc.kind} onValueChange={(v) => setNewExc((s) => ({ ...s, kind: v }))}>
                <SelectTrigger className="field-engraved">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feriado">Feriado</SelectItem>
                  <SelectItem value="bloqueio">Bloqueio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              className="field-engraved"
              placeholder="Descrição (opcional)"
              value={newExc.description}
              onChange={(e) => setNewExc((s) => ({ ...s, description: e.target.value }))}
            />
            <Select
              value={newExc.resourceId || "all"}
              onValueChange={(v) => setNewExc((s) => ({ ...s, resourceId: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="field-engraved">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os recursos</SelectItem>
                {(resources ?? []).map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button className="btn-3d w-full" onClick={addException} disabled={createException.isPending}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar exceção
            </Button>
          </div>
          <div className="space-y-2">
            {(exceptions ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma exceção cadastrada.</p>
            )}
            {(exceptions ?? []).map((ex) => {
              const res = resources?.find((r) => r.id === ex.resourceId);
              return (
                <div key={ex.id} className="concave-3d flex items-center gap-3 px-3 py-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">
                      {ex.date.split("-").reverse().join("/")} ·{" "}
                      <span className="uppercase">{ex.kind}</span>
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {res ? res.name : "Todos os recursos"}
                      {ex.description ? ` — ${ex.description}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteException.mutate({ id: ex.id })}
                    className="text-destructive hover:opacity-70"
                    aria-label="Remover exceção"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* PROVA VIVA */}
      <div className="panel-3d p-4 space-y-4">
        <BlockTitle icon={CalendarCog}>Prova Viva — Liberação Anti-Ilha</BlockTitle>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Recurso</Label>
            <Select
              value={slotResource ? String(slotResource) : ""}
              onValueChange={(v) => setSlotResource(Number(v))}
            >
              <SelectTrigger className="field-engraved w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(resources ?? []).map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Data</Label>
            <Input
              type="date"
              className="field-engraved w-44"
              value={slotDate}
              onChange={(e) => setSlotDate(e.target.value)}
            />
          </div>
          <SlotLegend />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Clique num horário aberto para simular ocupação e ver a cadeia liberar o próximo sub-bloco. A ocupação
          real chega na marcação do cliente (etapa futura).
        </p>

        {slotsData && slotsData.reason ? (
          <div className="concave-3d px-4 py-6 text-center text-sm font-medium text-muted-foreground">
            {slotsData.reason === "excecao" && "Dia bloqueado por exceção/feriado."}
            {slotsData.reason === "sem-expediente" && "Sem janela de atendimento neste dia da semana."}
          </div>
        ) : slotsData ? (
          <div className="space-y-4">
            {slotsData.subBlocks.map((sb, i) => {
              const blockSlots = slotsData.slots.filter((s) => s.subBlockIndex === i);
              return (
                <div key={i} className="panel-3d-sub p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      Sub-bloco {sb.startTime}–{sb.endTime}
                    </span>
                    <span className="flex items-center gap-2 text-[11px] uppercase tracking-wide">
                      <span
                        className={`px-2 py-0.5 font-semibold ${
                          sb.released ? "bg-emerald-500 text-white" : "bg-zinc-300 text-zinc-600"
                        }`}
                        style={{ borderRadius: "2px" }}
                      >
                        {sb.released ? "Liberado" : "Travado"}
                      </span>
                      <span className="text-muted-foreground">
                        ocupação {sb.occupancy}% · {sb.occupied}/{sb.total}
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {blockSlots.map((s) => {
                      const clickable = s.state === "aberto" || s.state === "ocupado";
                      return (
                        <button
                          key={s.time}
                          type="button"
                          title={s.reason ?? s.state}
                          onClick={() => toggleOccupied(s.time, s.state)}
                          disabled={!clickable}
                          className={`px-2 py-1 text-xs font-medium tabular-nums transition ${slotColor(
                            s.state,
                            s.reason,
                          )} ${clickable ? "cursor-pointer hover:brightness-110" : "cursor-default"}`}
                          style={{ borderRadius: "3px" }}
                        >
                          {s.time}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {slotsData.subBlocks.length === 0 && (
              <p className="text-sm text-muted-foreground">Sem slots para este dia.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{slotsFetching ? "Calculando…" : "Selecione recurso e data."}</p>
        )}
      </div>
    </div>
  );
}
