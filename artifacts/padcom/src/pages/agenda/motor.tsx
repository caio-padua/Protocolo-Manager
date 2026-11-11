import { useEffect, useMemo, useRef, useState } from "react";
import { tituloProprio } from "@/lib/utils";
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
  useBookAgendaSession,
  useListClients,
  useGetClient,
  useListProtocols,
  useListProfessionalAreas,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { updateAgendaResource } from "@workspace/api-client-react";
import { COLLAB_EVENT } from "@/lib/collab-auth";
import { ComRegistro, LegendaRegistros } from "@/components/MarcadorVinculo";
import { ListaAgendas } from "./ListaAgendas";
import { SeletorCorVidro } from "@/components/VidroCor";
import { SeletorLocalExterno } from "./SeletorLocalExterno";
import { EnderecoExternoCampos, ENDERECO_VAZIO, enderecoCompleto, type EnderecoExternoForm } from "@/components/EnderecoExternoCampos";
import { profissionaisParaNovaAgenda } from "@/lib/agenda-profissionais";
import { AgendaIntegrationPanel } from "./AgendaIntegrationPanel";
import { JanelasAtendimento, type JanelasRascunho } from "./JanelasAtendimento";
import { dataInicialValida, exigeDataInicial } from "@/lib/agenda-repeticao";
import { AgendaChangeRequests } from "./AgendaChangeRequests";
import { useAgendaIntegration, useCollabIdentity, describeError } from "./agenda-integration-api";
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

type WindowsDraft = JanelasRascunho;

const WEEK_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const KIND_LABEL: Record<string, string> = {
  enfermagem: "Enfermagem",
  medico: "Médico",
  categoria: "Categoria profissional",
};

// Apenas apresentação: o servidor deriva e valida o tipo legado a partir da categoria.
type CategoriaOpcao = { id: number; name: string; slug: string; professionalType: string };
function classeDaCategoria(c: Pick<CategoriaOpcao, "slug" | "professionalType">): string {
  if (c.professionalType === "medico") return "medico";
  return c.slug === "enfermagem" ? "enfermagem" : "categoria";
}
// Papel gravado no registro do local (campo agenda_papel). Nada é deduzido do nome.
const PAPEL_LABEL: Record<string, string> = {
  local: "Sede", remoto: "Remoto", externo: "Externo", pessoal: "Pessoal", geral: "Geral",
};
const PAPEIS_QUE_ATENDEM = ["local", "remoto", "externo"];
const MODALITY_LABEL: Record<string, string> = {
  domiciliar: "Domiciliar (legado)",
  local: "Sede",
  externo: "Externo",
  online: "Remoto",
};
const enderecoDoRecurso = (r: { externalAddress?: { cep: string; logradouro: string; bairro: string; cidade: string; uf: string; numero: string; complemento?: string | null } | null } | null | undefined): EnderecoExternoForm =>
  r?.externalAddress ? { ...r.externalAddress, complemento: r.externalAddress.complemento ?? "" } : ENDERECO_VAZIO;

function BlockTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-primary">
      <Icon className="h-4 w-4" />
      {children}
    </span>
  );
}

function Campo({ titulo, children, className = "" }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{titulo}</Label>
      {children}
    </div>
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

  // ---- Autorizacao por local (somente apresentacao; o backend recusa de qualquer forma) ----
  const integration = useAgendaIntegration();
  const agendaByLocation = useMemo(() => {
    const map = new Map<number, { canManage: boolean; enabled: boolean | null }>();
    for (const a of integration.data?.agendas ?? []) map.set(a.id, { canManage: a.canManage, enabled: a.enabled });
    return map;
  }, [integration.data]);
  // Agenda nova não tem registro de local: a autorização vem calculada pelo servidor (canManage da própria agenda).
  const canManageResource = (r: { locationId?: number | null; canManage?: boolean } | null | undefined) =>
    r?.locationId ? !!agendaByLocation.get(r.locationId)?.canManage : r?.canManage === true;
  const canManageSelected = canManageResource(selected);
  const anyCanManage = Array.from(agendaByLocation.values()).some((a) => a.canManage)
    || (resources ?? []).some((r) => r.canManage === true) || integration.data?.canManageGlobalSettings === true;
  const globalLocked = !integration.data?.canManageGlobalSettings;
  const { data: categoriasData } = useListProfessionalAreas();
  const categorias: CategoriaOpcao[] = useMemo(
    () => (categoriasData ?? []).map((c) => ({ id: c.id, name: c.name, slug: c.slug ?? "", professionalType: c.professionalType })),
    [categoriasData],
  );
  // Registros que podem ser o local de uma agenda: papel local, remoto ou externo (o servidor valida de novo).
  const manageableAgendas = (integration.data?.agendas ?? []).filter(
    (a) => a.canManage && PAPEIS_QUE_ATENDEM.includes(a.role ?? ""),
  );
  const localDoSelecionado = selected?.locationId
    ? (integration.data?.agendas ?? []).find((a) => a.id === selected.locationId) ?? null
    : null;

  // ---- Identidade da agenda (draft) ----
  const [resDraft, setResDraft] = useState<{
    name: string;
    categoryId: number | null;
    modality: string;
    color: string;
    slotMinutes: number;
    active: boolean;
    endereco: EnderecoExternoForm;
  } | null>(null);

  useEffect(() => {
    if (selected) {
      setResDraft({
        name: selected.name,
        categoryId: selected.categoryId ?? null,
        modality: selected.modality,
        color: selected.color,
        slotMinutes: selected.slotMinutes,
        active: selected.active,
        endereco: enderecoDoRecurso(selected),
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
  const [windowsDirty, setWindowsDirty] = useState(false);
  const [windowsSnapshot, setWindowsSnapshot] = useState<{ weekday: number; startTime: string; endTime: string; repeatWeeks: number; anchorDate: string | null }[] | null>(null);
  const draftResource = useRef<number | null>(null);

  useEffect(() => {
    if (windows && selectedId && !(draftResource.current === selectedId && windowsDirty)) {
      const draft: WindowsDraft = {};
      for (const w of windows) {
        (draft[w.weekday] ||= []).push({
          startTime: w.startTime, endTime: w.endTime,
          repeatWeeks: Number(w.repeatWeeks) || 1, anchorDate: w.anchorDate ?? "",
        });
      }
      for (const k of Object.keys(draft)) {
        draft[Number(k)].sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
      }
      setWindowsDraft(draft);
      setWindowsSnapshot(windows.map(w => ({
        weekday: w.weekday, startTime: w.startTime, endTime: w.endTime,
        repeatWeeks: Number(w.repeatWeeks) || 1, anchorDate: w.anchorDate ?? null,
      })));
      draftResource.current = selectedId;
      setWindowsDirty(false);
    }
  }, [windows, selectedId, windowsDirty]);

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

  const { data: slotsData, isFetching: slotsFetching, refetch: refetchSlots } = useGetAgendaSlots(
    {
      resourceId: slotResource ?? 0,
      date: slotDate,
      occupied: occupied.size ? Array.from(occupied).join(",") : undefined,
    },
    { query: { enabled: !!slotResource && !!slotDate } },
  );

  // ---- Marcacao real (F2.3 recepcao) ----
  const [bookClient, setBookClient] = useState<number | null>(null);
  const [bookProtocol, setBookProtocol] = useState<number | null>(null);
  const [bookTime, setBookTime] = useState<string>("");
  const [bookSimulate, setBookSimulate] = useState<boolean>(true);
  const [bookSync, setBookSync] = useState<boolean>(true);

  const identity = useCollabIdentity();
  const [sessionEpoch, setSessionEpoch] = useState(0);
  useEffect(() => {
    const sessionChanged = () => setSessionEpoch(epoch => epoch + 1);
    const storageChanged = (event: StorageEvent) => {
      if (!event.key || event.key === "padcom_collab_token" || event.key === "padcom_collab_prof") sessionChanged();
    };
    window.addEventListener(COLLAB_EVENT, sessionChanged);
    window.addEventListener("storage", storageChanged);
    return () => {
      window.removeEventListener(COLLAB_EVENT, sessionChanged);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);
  const { data: clients, isError: clientsError, isPending: clientsLoading } = useListClients(undefined, {
    query: { enabled: identity !== "anonimo", queryKey: ["agenda-booking-clients", identity, sessionEpoch] },
  });
  const { data: preferredClient, isError: preferencesError } = useGetClient(bookClient ?? 0, {
    query: { enabled: !!bookClient, queryKey: ["agenda-client-preferences", identity, sessionEpoch, bookClient] },
  });
  const { data: bookProtocols } = useListProtocols(
    { clientId: bookClient ?? 0 },
    { query: { enabled: !!bookClient, queryKey: ["agenda-booking-protocols", identity, sessionEpoch, bookClient] } },
  );

  useEffect(() => {
    setBookClient(null);
    setBookProtocol(null);
    setBookTime("");
  }, [identity, sessionEpoch]);

  useEffect(() => {
    setBookProtocol(null);
  }, [bookClient]);

  useEffect(() => {
    setBookTime("");
  }, [slotResource, slotDate]);

  // A consulta da marcação nunca recebe a ocupação simulada da Prova Viva.
  const { data: bookingSlots, isFetching: bookingSlotsFetching, isError: bookingSlotsError,
    refetch: refetchBookingSlots } = useGetAgendaSlots(
    { resourceId: slotResource ?? 0, date: slotDate },
    { query: { enabled: !!slotResource && !!slotDate && identity !== "anonimo",
      queryKey: ["agenda-booking-real-slots", identity, sessionEpoch, slotResource, slotDate] } },
  );
  const openTimes = useMemo(
    () => bookingSlotsError || bookingSlotsFetching ? [] :
      (bookingSlots?.slots ?? []).filter((s) => s.state === "aberto").map((s) => s.time),
    [bookingSlots, bookingSlotsError, bookingSlotsFetching],
  );

  const bookSession = useBookAgendaSession({
    mutation: {
      onSuccess: (resp: unknown) => {
        const warn = (resp as { googleSyncWarning?: string })?.googleSyncWarning;
        const desc = warn ?? (bookSimulate ? "Evento etiquetado [SIMULACAO]." : undefined);
        toast({ title: "Cliente marcado", description: desc, variant: warn ? "destructive" : undefined });
        setBookTime("");
        refetchSlots();
        refetchBookingSlots();
      },
      onError: (err: unknown) => {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          "Não foi possível marcar.";
        toast({ title: "Marcação recusada", description: msg, variant: "destructive" });
        // 409 e afins: a régua pode ter mudado (slot encheu/cadeia). Recarrega.
        refetchSlots();
        refetchBookingSlots();
      },
    },
  });

  const bookResource = resources?.find((r) => r.id === slotResource);
  const bookReadOff = !!bookResource?.locationId && agendaByLocation.get(bookResource.locationId)?.enabled === false;
  const preferenceKind = bookResource?.kind === "medico" ? "medical" :
    bookResource?.kind === "enfermagem" ? "nursing" : null;
  const weekday = /^\d{4}-\d{2}-\d{2}$/.test(slotDate)
    ? new Date(`${slotDate}T12:00:00Z`).getUTCDay() : null;
  const preference = !preferencesError && preferenceKind && preferredClient?.id === bookClient
    ? preferredClient.visitPreferences?.[preferenceKind] : undefined;
  const preferredTimes = new Set(preference?.times.filter(t => t.weekday === weekday).map(t => t.time) ?? []);
  const preferredOrder = new Map((preference?.priority ?? [])
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
    .filter(entry => entry.weekday === weekday)
    .map(entry => [entry.time, entry.rank]));
  const preferredDay = weekday !== null && !!preference?.weekdays.includes(weekday);

  function confirmBooking() {
    if (!slotResource || !slotDate || !bookClient || !bookProtocol || !bookTime || !openTimes.includes(bookTime)) {
      toast({ title: "Faltam dados", description: "Escolha agenda, data, cliente, protocolo e horário.", variant: "destructive" });
      return;
    }
    bookSession.mutate({
      data: {
        resourceId: slotResource,
        clientId: bookClient,
        protocolId: bookProtocol,
        date: slotDate,
        time: bookTime,
        syncGoogle: bookSync,
        simulate: bookSimulate,
      },
    });
  }

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
        toast({ title: "Agenda criada" });
        refetchResources();
      },
      onError: (err: unknown) => toast({ title: "Agenda não criada", description: describeError(err, "Confira categoria, profissional e, se for externa, o endereço."), variant: "destructive" }),
    },
  });
  const updateResource = useUpdateAgendaResource({
    mutation: {
      onSuccess: () => {
        toast({ title: "Agenda salva" });
        refetchResources();
      },
      onError: (err: unknown) => toast({ title: "Agenda não salva", description: describeError(err, "Confira os dados e tente novamente."), variant: "destructive" }),
    },
  });
  const replaceWindows = useReplaceAgendaWindows({
    mutation: {
      onSuccess: () => {
        toast({ title: "Janelas salvas" });
        setWindowsDirty(false);
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

  // ---- Ordem das agendas (clique, setas e arraste) ----
  const [ordemLocal, setOrdemLocal] = useState<number[] | null>(null);
  const [salvandoOrdem, setSalvandoOrdem] = useState(false);
  const listaAgendas = useMemo(() => {
    const base = resources ?? [];
    if (!ordemLocal) return base;
    const porId = new Map(base.map((r) => [r.id, r]));
    const ordenadas = ordemLocal.filter((id) => porId.has(id)).map((id) => porId.get(id)!);
    return [...ordenadas, ...base.filter((r) => !ordemLocal.includes(r.id))];
  }, [resources, ordemLocal]);

  async function moverAgenda(id: number, paraIndice: number) {
    const atual = listaAgendas;
    const de = atual.findIndex((r) => r.id === id);
    if (de < 0 || paraIndice < 0 || paraIndice >= atual.length || de === paraIndice || salvandoOrdem) return;
    const novaOrdem = [...atual];
    const [movida] = novaOrdem.splice(de, 1);
    novaOrdem.splice(paraIndice, 0, movida);
    // Reaproveita os valores de ordem já existentes (em ordem crescente e sem repetição),
    // para que só mudem as agendas cuja posição mudou e nada colida com agendas ocultas.
    const valores = atual.map((r) => r.sortOrder).sort((x, y) => x - y);
    for (let i = 1; i < valores.length; i++) if (valores[i] <= valores[i - 1]) valores[i] = valores[i - 1] + 1;
    const mudancas = novaOrdem
      .map((r, i) => ({ r, sortOrder: valores[i] }))
      .filter(({ r, sortOrder }) => r.sortOrder !== sortOrder);
    const semPermissao = mudancas.find(({ r }) => !canManageResource(r));
    if (semPermissao) {
      toast({ title: "Ordem não alterada", description: `Você não administra a agenda “${semPermissao.r.name}”, que mudaria de posição.`, variant: "destructive" });
      return;
    }
    setOrdemLocal(novaOrdem.map((r) => r.id));
    setSalvandoOrdem(true);
    try {
      for (const { r, sortOrder } of mudancas) await updateAgendaResource(r.id, { sortOrder });
      toast({ title: "Ordem das agendas salva" });
    } catch (err) {
      toast({ title: "Ordem não salva", description: describeError(err, "Tente novamente."), variant: "destructive" });
    } finally {
      await refetchResources();
      setOrdemLocal(null);
      setSalvandoOrdem(false);
    }
  }

  // ---- Handlers ----
  const EMPTY_NEW = { name: "", categoryId: "", professionalId: "", modality: "local", color: "#16284a", endereco: ENDERECO_VAZIO };
  const [newRes, setNewRes] = useState(EMPTY_NEW);
  // Corpo Clínico ativo da clínica, comparado pelo id da categoria gravada (nunca pelo rótulo da profissão).
  const professionalsOfCategory = useMemo(
    () => profissionaisParaNovaAgenda(
      (integration.data?.professionals ?? []).map((p) => ({ id: p.id, name: p.name, active: true, areaId: p.categoryId ?? null })),
      newRes.categoryId === "" ? null : Number(newRes.categoryId),
    ),
    [integration.data, newRes.categoryId],
  );

  function addResource() {
    if (!newRes.name.trim()) {
      toast({ title: "Informe o nome da agenda", variant: "destructive" });
      return;
    }
    if (!newRes.categoryId) {
      toast({ title: "Faltam dados", description: "Escolha a categoria profissional.", variant: "destructive" });
      return;
    }
    if (newRes.modality === "externo" && !enderecoCompleto(newRes.endereco)) {
      toast({ title: "Endereço incompleto", description: "Agenda externa exige CEP e número (rua, bairro, cidade e UF vêm do CEP).", variant: "destructive" });
      return;
    }
    createResource.mutate(
      {
        data: {
          name: newRes.name.trim(),
          categoryId: Number(newRes.categoryId),
          professionalId: newRes.professionalId ? Number(newRes.professionalId) : null,
          modality: newRes.modality,
          ...(newRes.modality === "externo"
            ? { externalAddress: { ...newRes.endereco, complemento: newRes.endereco.complemento.trim() || null } }
            : {}),
          color: newRes.color,
          sortOrder: resources?.length ?? 0,
        },
      },
      // O formulário só é limpo depois da gravação confirmada pelo servidor.
      { onSuccess: () => setNewRes(EMPTY_NEW) },
    );
  }

  function saveResource() {
    if (!selectedId || !resDraft || !selected) return;
    const { categoryId, endereco, ...rest } = resDraft;
    const virouExterno = rest.modality === "externo" && selected.modality !== "externo";
    const enderecoMudou = JSON.stringify(endereco) !== JSON.stringify(enderecoDoRecurso(selected));
    if (rest.modality === "externo" && (virouExterno || enderecoMudou) && !enderecoCompleto(endereco)) {
      toast({ title: "Endereço incompleto", description: "Agenda externa exige CEP e número.", variant: "destructive" });
      return;
    }
    updateResource.mutate({
      id: selectedId,
      data: {
        ...rest,
        ...(categoryId != null && categoryId !== selected.categoryId ? { categoryId } : {}),
        ...(rest.modality === "externo" && (virouExterno || enderecoMudou)
          ? { externalAddress: { ...endereco, complemento: endereco.complemento.trim() || null } }
          : {}),
      },
    });
  }

  function changeWindows(next: WindowsDraft) {
    setWindowsDirty(true);
    setWindowsDraft(next);
  }
  function saveWindows() {
    if (!selectedId || draftResource.current !== selectedId || !windowsSnapshot) return;
    const flat: { weekday: number; startTime: string; endTime: string; repeatWeeks: number; anchorDate: string | null }[] = [];
    for (const wd of Object.keys(windowsDraft)) {
      for (const w of windowsDraft[Number(wd)]) {
        if (w.endTime <= w.startTime) {
          toast({ title: "Confira o horário", description: `${WEEK_LABEL[Number(wd)]}: o fim precisa ser depois do início.`, variant: "destructive" });
          return;
        }
        if (exigeDataInicial(w.repeatWeeks) && !dataInicialValida(w.anchorDate, Number(wd))) {
          toast({ title: "Confira a data inicial", description: `Escolha uma data válida no dia ${WEEK_LABEL[Number(wd)]}.`, variant: "destructive" });
          return;
        }
        flat.push({ weekday: Number(wd), startTime: w.startTime, endTime: w.endTime,
          repeatWeeks: w.repeatWeeks, anchorDate: exigeDataInicial(w.repeatWeeks) ? w.anchorDate : null });
      }
    }
    replaceWindows.mutate({ id: selectedId, data: { windows: flat, expectedWindows: windowsSnapshot } });
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
      <header className="panel-3d-hero flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="bevel-3d inline-flex h-11 w-11 items-center justify-center text-primary">
            <CalendarCog className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold uppercase tracking-wide text-foreground">Agenda Configuração</h1>
            <p className="text-sm text-muted-foreground">
              Agendas de atendimento por profissional, janelas de atendimento e liberação inteligente anti-ilha de horários.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="concave-3d inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <Layers className="h-3.5 w-3.5 text-primary" />
            {listaAgendas.length} {listaAgendas.length === 1 ? "agenda ativa" : "agendas ativas"}
          </span>
          <LegendaRegistros />
        </div>
      </header>

      {/* AGENDAS + IDENTIDADE + JANELAS */}
      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Coluna agendas */}
        <div className="panel-3d space-y-4 p-4 lg:self-start">
          <BlockTitle icon={Layers}>Agendas de atendimento</BlockTitle>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Clique para abrir a agenda no painel ao lado. Arraste o item, ou use as setas, para mudar a ordem; a ordem fica gravada.
          </p>
          <ListaAgendas
            itens={listaAgendas.map((r) => ({
              id: r.id, name: r.name, color: r.color, categoryName: r.categoryName,
              modalityLabel: MODALITY_LABEL[r.modality] ?? r.modality, sharing: r.sharing ?? "", active: r.active,
            }))}
            selecionadaId={selectedId}
            onSelecionar={setSelectedId}
            onMover={moverAgenda}
            ocupado={salvandoOrdem}
          />

          <div className="panel-3d-sub space-y-3 p-3">
            <span className="bevel-3d inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
              <Plus className="h-3.5 w-3.5" /> Nova agenda de atendimento
            </span>
            <Campo titulo="Nome">
              <ComRegistro codigo="A1">
                <Input className="field-engraved" placeholder="Nome" value={newRes.name}
                  onChange={(e) => setNewRes((s) => ({ ...s, name: e.target.value }))} />
              </ComRegistro>
            </Campo>
            <Campo titulo="Categoria profissional">
              <ComRegistro codigo="C1">
                <Select value={newRes.categoryId} onValueChange={(v) => v && setNewRes((s) => ({ ...s, categoryId: v, professionalId: "" }))}>
                  <SelectTrigger className="field-engraved" aria-label="Categoria profissional">
                    <SelectValue placeholder="Categoria profissional" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ComRegistro>
            </Campo>
            <Campo titulo="Profissional (Corpo Clínico)">
              <ComRegistro codigo="P1">
                <Select
                  value={newRes.professionalId}
                  onValueChange={(v) => v && setNewRes((s) => ({ ...s, professionalId: v === "nenhum" ? "" : v }))}
                  disabled={!newRes.categoryId}
                >
                  <SelectTrigger className="field-engraved" aria-label="Profissional do Corpo Clínico">
                    <SelectValue placeholder={newRes.categoryId ? "Profissional (opcional)" : "Escolha a categoria primeiro"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Sem profissional definido (agenda compartilhada)</SelectItem>
                    {professionalsOfCategory.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </ComRegistro>
            </Campo>
            {newRes.categoryId && professionalsOfCategory.length === 0 && (
              <p className="text-[10px] leading-snug text-amber-600" role="status">
                Nenhum profissional ativo do Corpo Clínico tem esta categoria. A agenda pode ser criada sem profissional.
              </p>
            )}
            <Campo titulo="Onde atende">
              <ComRegistro codigo="L1">
                <Select value={newRes.modality} onValueChange={(v) => setNewRes((s) => ({ ...s, modality: v }))}>
                  <SelectTrigger className="field-engraved" aria-label="Modalidade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Sede</SelectItem>
                    <SelectItem value="externo">Externo (outro endereço)</SelectItem>
                    <SelectItem value="online">Remoto</SelectItem>
                  </SelectContent>
                </Select>
              </ComRegistro>
            </Campo>
            {newRes.modality === "externo" && (
              <>
                <SeletorLocalExterno onEscolher={(endereco) => setNewRes((s) => ({ ...s, endereco }))} />
                <EnderecoExternoCampos value={newRes.endereco} onChange={(endereco) => setNewRes((s) => ({ ...s, endereco }))} />
              </>
            )}
            <div className="flex items-center gap-2">
              <div className="w-[8.5rem] shrink-0">
                <SeletorCorVidro rotulo="Cor da agenda" valor={newRes.color}
                  onChange={(cor) => setNewRes((s) => ({ ...s, color: cor }))} />
              </div>
              <ComRegistro codigo="A1" className="flex-1">
                <Button className="btn-3d w-full" onClick={addResource} disabled={!anyCanManage || createResource.isPending}>
                  <Plus className="mr-1 h-4 w-4" /> Adicionar
                </Button>
              </ComRegistro>
            </div>
          </div>
        </div>

        {/* Coluna identidade + janelas */}
        <div className="min-w-0 space-y-6">
          {/* Identidade */}
          <div className="panel-3d space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <BlockTitle icon={SlidersHorizontal}>Identidade da Agenda</BlockTitle>
              <div className="flex flex-wrap items-center gap-2.5">
                {resDraft && (
                  <ComRegistro codigo="A1" nota="ativa ou inativa">
                    <label
                      htmlFor="agenda-ativa"
                      className="concave-3d flex cursor-pointer items-center gap-2.5 px-3 py-1.5"
                      data-testid="toggle-agenda-ativa"
                    >
                      <Switch
                        id="agenda-ativa"
                        checked={resDraft.active}
                        onCheckedChange={(v) => setResDraft((d) => (d ? { ...d, active: v } : d))}
                      />
                      <span className="text-xs font-bold uppercase tracking-wide">
                        {resDraft.active ? "Agenda ativa" : "Agenda inativa"}
                      </span>
                    </label>
                  </ComRegistro>
                )}
                <ComRegistro codigo="A1" nota="salvar identidade">
                  <Button className="btn-3d" onClick={saveResource} disabled={!resDraft || !canManageSelected || updateResource.isPending}>
                    <Save className="mr-1 h-4 w-4" /> Salvar
                  </Button>
                </ComRegistro>
              </div>
            </div>
            {resDraft ? (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Campo titulo="Nome" className="sm:col-span-2">
                    <ComRegistro codigo="A1" nota={`id ${selected?.id}`}>
                      <Input className="field-engraved" value={resDraft.name}
                        onChange={(e) => setResDraft((d) => (d ? { ...d, name: e.target.value } : d))} />
                    </ComRegistro>
                  </Campo>
                  <Campo titulo="Duração do atendimento (min)">
                    <ComRegistro codigo="S1">
                      <Input type="number" min={5} step={5} className="field-engraved" value={resDraft.slotMinutes}
                        onChange={(e) => setResDraft((d) => (d ? { ...d, slotMinutes: Number(e.target.value) || 0 } : d))} />
                    </ComRegistro>
                  </Campo>
                  <Campo titulo="Cor">
                    <SeletorCorVidro rotulo="Cor" valor={resDraft.color}
                      onChange={(cor) => setResDraft((d) => (d ? { ...d, color: cor } : d))} />
                  </Campo>
                  <Campo titulo="Categoria profissional" className="sm:col-span-2">
                    <ComRegistro codigo="C1" pendente={selected?.categoryStatus === "pendente"}>
                      <Select
                        value={resDraft.categoryId != null ? String(resDraft.categoryId) : ""}
                        onValueChange={(v) => v && setResDraft((d) => (d ? { ...d, categoryId: Number(v) } : d))}
                      >
                        <SelectTrigger className="field-engraved" aria-label="Categoria profissional da agenda">
                          <SelectValue placeholder="Categoria pendente de conferência" />
                        </SelectTrigger>
                        <SelectContent>
                          {categorias
                            .filter((c) => !selected || classeDaCategoria(c) === selected.kind)
                            .map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </ComRegistro>
                  </Campo>
                  <Campo titulo="Modalidade" className="sm:col-span-2">
                    <ComRegistro codigo="L1">
                      <Select value={resDraft.modality} onValueChange={(v) => setResDraft((d) => (d ? { ...d, modality: v } : d))}>
                        <SelectTrigger className="field-engraved">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Sede</SelectItem>
                          <SelectItem value="externo">Externo (outro endereço)</SelectItem>
                          <SelectItem value="online">Remoto</SelectItem>
                          {(selected?.modality === "domiciliar" || resDraft.modality === "domiciliar") && (
                            <SelectItem value="domiciliar">Domiciliar (legado)</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </ComRegistro>
                  </Campo>
                </div>
                {resDraft.modality === "externo" && (
                  <div className="space-y-3">
                    <SeletorLocalExterno onEscolher={(endereco) => setResDraft((d) => (d ? { ...d, endereco } : d))} />
                    <EnderecoExternoCampos value={resDraft.endereco}
                      onChange={(endereco) => setResDraft((d) => (d ? { ...d, endereco } : d))} />
                  </div>
                )}
                {selected?.categoryStatus === "pendente" && (
                  <p className="paxter-alert paxter-alert-amber px-3 py-2 text-xs font-semibold">
                    Categoria pendente de conferência: nada foi deduzido do nome nem do tipo antigo desta agenda.
                  </p>
                )}
                <div className="grid gap-3 md:grid-cols-3">
                  <ComRegistro codigo="P1" pendente={selected?.sharing !== "individual"} nota="agenda compartilhada não tem profissional gravado">
                    <div className="concave-3d h-full space-y-1 px-3 py-2.5">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Profissional</span>
                      <span className="block text-sm font-semibold">
                        {selected?.sharing === "individual" ? "Individual (um profissional)" : "Compartilhada (sem profissional definido)"}
                      </span>
                    </div>
                  </ComRegistro>
                  <ComRegistro codigo="L1" pendente={!!selected?.locationId && !localDoSelecionado}>
                    <div className="concave-3d h-full space-y-1 px-3 py-2.5">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Local de atendimento</span>
                      <span className="block text-sm font-semibold">
                        {selected?.locationId
                          ? (localDoSelecionado ? `${localDoSelecionado.name} (${PAPEL_LABEL[localDoSelecionado.role ?? ""] ?? "sem papel"})` : "Sede vinculada (legado) não identificada nos locais que você administra")
                          : "Agenda própria da clínica"}
                      </span>
                      {selected?.modality === "externo" && (
                        selected.externalAddressText ? (
                          <span className="block text-[11px] text-muted-foreground">
                            {selected.externalAddressText}{" "}
                            {selected.mapsUrl && <a className="underline" href={selected.mapsUrl} target="_blank" rel="noreferrer">Google Maps</a>}
                            {selected.wazeUrl && <> · <a className="underline" href={selected.wazeUrl} target="_blank" rel="noreferrer">Waze</a></>}
                          </span>
                        ) : (
                          <span className="block text-[11px] font-semibold text-amber-600">Agenda externa sem endereço completo: pendente.</span>
                        )
                      )}
                    </div>
                  </ComRegistro>
                  <ComRegistro codigo="C2" pendente nota="esta tela não exibe a clínica; ligação a verificar">
                    <div className="concave-3d h-full space-y-1 px-3 py-2.5">
                      <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Clínica da sessão</span>
                      <span className="block text-sm font-semibold text-amber-600">Ligação a verificar</span>
                    </div>
                  </ComRegistro>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Selecione uma agenda à esquerda.</p>
            )}
          </div>

          {/* Janelas */}
          <div className="panel-3d space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <BlockTitle icon={Clock}>Janelas de Atendimento</BlockTitle>
              <ComRegistro codigo="J1" nota="salvar janelas">
                <Button
                  className="btn-3d"
                  onClick={saveWindows}
                  disabled={!selectedId || draftResource.current !== selectedId || !windowsSnapshot || !canManageSelected || replaceWindows.isPending}
                >
                  <Save className="mr-1 h-4 w-4" /> Salvar Janelas
                </Button>
              </ComRegistro>
            </div>
            <p className="text-xs text-muted-foreground">
              Horários em que esta agenda atende, por dia da semana. Várias faixas por dia (manhã/tarde) e repetição semanal, por várias semanas ou por posição no mês.
              {windowsDirty && <b className="paxter-alert paxter-alert-amber ml-2 px-2 py-0.5 text-[10px] uppercase">Alterações não salvas</b>}
            </p>
            {selected && !canManageSelected && (
              <p role="note" className="paxter-alert paxter-alert-amber px-3 py-2 text-xs" data-testid="text-windows-locked">
                Você não administra a sede ou a clínica desta agenda: identidade e janelas não podem ser gravadas aqui.
                Use "Mudança de expediente" abaixo para enviar uma solicitação com justificativa.
              </p>
            )}
            <JanelasAtendimento
              rascunho={windowsDraft}
              onChange={changeWindows}
              desabilitado={replaceWindows.isPending}
              onSalvar={saveWindows}
              podeSalvar={!!selectedId && draftResource.current === selectedId && !!windowsSnapshot && canManageSelected}
              salvando={replaceWindows.isPending}
              sujo={windowsDirty}
            />
          </div>
        </div>
      </div>

      {/* PARÂMETROS + EXCEÇÕES */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Parâmetros do motor */}
        <div className="panel-3d p-4 space-y-4">
          <div className="flex items-center justify-between">
            <BlockTitle icon={Gauge}>Parâmetros do Motor</BlockTitle>
            <Button className="btn-3d" onClick={saveSettings} disabled={!setDraft || globalLocked || updateSettings.isPending}>
              <Save className="mr-1 h-4 w-4" /> Salvar
            </Button>
          </div>
          {globalLocked && (
            <p role="note" className="paxter-alert paxter-alert-amber px-3 py-2 text-xs" data-testid="text-settings-locked">
              Parâmetros globais do motor são exclusivos do proprietário. Para mudar o expediente de uma agenda, envie uma solicitação.
            </p>
          )}
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
              <ComRegistro codigo="X1">
              <Input
                type="date"
                className="field-engraved"
                value={newExc.date}
                onChange={(e) => setNewExc((s) => ({ ...s, date: e.target.value }))}
              />
              </ComRegistro>
              <ComRegistro codigo="X1" nota="tipo">
              <Select value={newExc.kind} onValueChange={(v) => setNewExc((s) => ({ ...s, kind: v }))}>
                <SelectTrigger className="field-engraved">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="feriado">Feriado</SelectItem>
                  <SelectItem value="bloqueio">Bloqueio</SelectItem>
                </SelectContent>
              </Select>
              </ComRegistro>
            </div>
            <Input
              className="field-engraved"
              placeholder="Descrição (opcional)"
              value={newExc.description}
              onChange={(e) => setNewExc((s) => ({ ...s, description: e.target.value }))}
            />
            <ComRegistro codigo="A1" nota="agenda atingida pela exceção">
            <Select
              value={newExc.resourceId || "all"}
              onValueChange={(v) => setNewExc((s) => ({ ...s, resourceId: v === "all" ? "" : v }))}
            >
              <SelectTrigger className="field-engraved">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as agendas</SelectItem>
                {(resources ?? []).map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </ComRegistro>
            <ComRegistro codigo="X1" nota="adicionar exceção">
            <Button className="btn-3d w-full" onClick={addException} disabled={!(newExc.resourceId ? canManageResource(resources?.find((r) => String(r.id) === newExc.resourceId)) : !globalLocked) || createException.isPending}>
              <Plus className="mr-1 h-4 w-4" /> Adicionar exceção
            </Button>
            </ComRegistro>
          </div>
          {!(newExc.resourceId ? canManageResource(resources?.find((r) => String(r.id) === newExc.resourceId)) : !globalLocked) && (
            <p role="note" className="text-[11px] text-muted-foreground">
              Exceção para todas as agendas exige o proprietário; para uma agenda, exige administrar o local dela.
            </p>
          )}
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
                      {res ? res.name : "Todas as agendas"}
                      {ex.description ? ` — ${ex.description}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteException.mutate({ id: ex.id })}
                    className="btn-3d-soft inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-bold uppercase tracking-wide text-destructive"
                    aria-label="Remover exceção"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remover
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* PROVA VIVA */}
      <div className="panel-3d p-4 space-y-4" data-testid="agenda-simulacao">
        <BlockTitle icon={CalendarCog}>Prova Viva — Liberação Anti-Ilha</BlockTitle>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Agenda</Label>
            <ComRegistro codigo="A1" nota="agenda da prova viva">
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
            </ComRegistro>
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
          <p className="text-sm text-muted-foreground">{slotsFetching ? "Calculando…" : "Selecione a agenda e a data."}</p>
        )}
      </div>

      {/* MARCAR CLIENTE (F2.3 — recepção) */}
      <div className="panel-3d p-4 space-y-4 paxter-underglow" data-testid="agenda-marcacao-real">
        <BlockTitle icon={CalendarDays}>Marcar Cliente</BlockTitle>
        <p className="text-[11px] text-muted-foreground">
          Usa a agenda e a data escolhidas acima. Só horários <strong>abertos</strong> pelo motor podem ser
          marcados — a cadeia anti-ilha continua valendo.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="panel-3d-sub p-3 space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Cliente</Label>
            <ComRegistro codigo="K1">
            <Select
              value={bookClient ? String(bookClient) : ""}
              onValueChange={(v) => setBookClient(Number(v))}
              disabled={clientsError || clientsLoading || identity === "anonimo"}
            >
              <SelectTrigger className="field-engraved w-full">
                <SelectValue placeholder="Selecione o cliente" />
              </SelectTrigger>
              <SelectContent>
                {(clientsError ? [] : clients ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {tituloProprio(c.name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </ComRegistro>
            {(clientsError || identity === "anonimo") && <p role="alert" className="text-xs text-red-700 dark:text-red-300">
              Não foi possível carregar os clientes para este acesso. Confira a sessão e tente novamente.
            </p>}
          </div>

          <div className="panel-3d-sub p-3 space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Protocolo</Label>
            <ComRegistro codigo="T1">
            <Select
              value={bookProtocol ? String(bookProtocol) : ""}
              onValueChange={(v) => setBookProtocol(Number(v))}
              disabled={!bookClient}
            >
              <SelectTrigger className="field-engraved w-full">
                <SelectValue placeholder={bookClient ? "Selecione o protocolo" : "Escolha o cliente antes"} />
              </SelectTrigger>
              <SelectContent>
                {(bookProtocols ?? []).map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </ComRegistro>
          </div>
        </div>

        <div className="panel-3d-sub p-3 space-y-2">
          <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">Horário aberto</Label>
          {bookingSlotsError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">
            Não foi possível consultar horários reais. Nenhum horário será oferecido até a consulta funcionar.
          </p>}
          {bookingSlotsFetching && <p role="status" className="text-xs">Conferindo horários reais…</p>}
          {bookClient && preferencesError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">
            Não foi possível consultar as preferências do cliente. Confira o cadastro antes de decidir.
          </p>}
          {preferredDay && <p className="text-xs text-primary">Dia preferido pelo cliente. Preferência não garante disponibilidade.</p>}
          {openTimes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum horário aberto para esta agenda/data.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {openTimes.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBookTime(t)}
                  aria-label={preferredTimes.has(t) ? `${t}, horário preferido${preferredOrder.has(t) ? `, preferência ${preferredOrder.get(t)}` : ""}` : t}
                  className={`px-2.5 py-1 text-xs font-medium tabular-nums transition ${
                    bookTime === t
                      ? "bg-cyan-500 text-white ring-2 ring-cyan-300"
                      : preferredTimes.has(t)
                        ? "bg-emerald-700 text-white ring-2 ring-amber-400 hover:brightness-110"
                        : "bg-emerald-500 text-white hover:brightness-110"
                  }`}
                  style={{ borderRadius: "3px" }}
                >
                  {t}{preferredTimes.has(t) && <span className="ml-1 text-[9px]">
                    {preferredOrder.has(t) ? `${preferredOrder.get(t)}ª PREFERÊNCIA` : "PREFERIDO"}
                  </span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="concave-3d flex items-center gap-3 px-3 py-2.5">
            <Switch id="book-sim" checked={bookSimulate} onCheckedChange={setBookSimulate} />
            <Label htmlFor="book-sim" className="text-sm">
              Marcar como simulação <span className="text-muted-foreground">([SIMULACAO])</span>
            </Label>
          </div>
          <div className="concave-3d flex items-center gap-3 px-3 py-2.5">
            <Switch id="book-sync" checked={bookSync} onCheckedChange={setBookSync} />
            <Label htmlFor="book-sync" className="text-sm">
              Sincronizar com Google Agenda
            </Label>
          </div>
        </div>

        <ComRegistro codigo="A1" nota="marcação na agenda escolhida" className="inline-block w-full sm:w-auto">
        <Button
          className="btn-3d w-full sm:w-auto"
          onClick={confirmBooking}
          disabled={bookSession.isPending || !bookTime || bookReadOff}
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          {bookSession.isPending ? "Marcando…" : "Confirmar marcação"}
        </Button>
        </ComRegistro>
        {bookReadOff && (
          <p role="alert" className="paxter-alert paxter-alert-amber px-3 py-2 text-xs" data-testid="text-booking-blocked">
            Leitura do Google desligada neste local: marcações bloqueadas até os dados serem atualizados.
          </p>
        )}
      </div>
      {/* GOOGLE (somente leitura) + SOLICITACOES DE EXPEDIENTE */}
      <AgendaIntegrationPanel />
      <AgendaChangeRequests />
    </div>
  );
}
