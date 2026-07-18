import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Calendar, Plus, Edit3, Trash2, Send, RefreshCw,
  ChevronDown, ChevronRight, CheckCircle2, Clock,
  AlertTriangle, X, Save, Loader2, Search, FlaskConical,
  Mail, MessageCircle, HardDrive, Globe, Smartphone,
  Settings, Play, ToggleLeft, ToggleRight, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ClientPicker, type ClientPickerOption } from "@/components/ClientPicker";

const API = import.meta.env.BASE_URL.replace(/\/$/, "");
function authHeader(): HeadersInit {
  const t = localStorage.getItem("collab_token") || "";
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
           : { "Content-Type": "application/json" };
}
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { ...opts, headers: { ...authHeader(), ...(opts?.headers ?? {}) } });
  if (!r.ok) { const txt = await r.text(); throw new Error(`HTTP ${r.status}: ${txt.slice(0, 120)}`); }
  return r.json();
}

// ─── Tipos ────────────────────────────────────────────────────────────────
type SlotFormula = {
  nome: string;
  catalogId?: string;
  ativoPrincipal?: string;
  posologia?: string;
  dose?: string;
  via?: string;
  frequencia?: string;
  observacao?: string;
};
type Slot = {
  id: number;
  agendaId: number;
  clientId: number;
  numeroSequencia: number;
  nome: string;
  dataLiberacao: string;
  formulas: SlotFormula[];
  canais: string[] | null;
  status: "AGUARDANDO" | "LIBERADA" | "ENTREGUE" | "ERRO";
  pdfUrl?: string;
  driveWebViewLink?: string;
  enviadoEmailEm?: string;
  enviadoWhatsappEm?: string;
  enviadoTelegramEm?: string;
  diasAntecedenciaOverride?: number;
  erro?: string;
};
type Agenda = {
  id: number;
  clientId: number;
  protocolId?: number;
  nome: string;
  descricao?: string;
  ativo: boolean;
  frequenciaPadraoDias: number;
  diasAntecedencia: number;
  canaisPadrao: string[];
  incluirLembretePosologia: boolean;
  slots: Slot[];
  resumo: { total: number; aguardando: number; liberados: number; erros: number };
  proximaLiberacao?: string;
  proximaNome?: string;
};
type ClienteLite = { id: number; name: string; cpf: string | null };
type ProtocoloLite = { id: number; title: string; startDate: string; totalSessions: number };
type FormulaCatalog = { id: string; nome: string; ativoPrincipal?: string; posologia?: string; via?: string };

// ─── Canais ───────────────────────────────────────────────────────────────
const CANAIS_DEF = [
  { id: "email",    label: "E-mail",    icon: Mail },
  { id: "whatsapp", label: "WhatsApp",  icon: MessageCircle },
  { id: "telegram", label: "Telegram",  icon: Smartphone },
  { id: "drive",    label: "Drive",     icon: HardDrive },
  { id: "portal",   label: "Portal",    icon: Globe },
];

function canalIcon(c: string) {
  const def = CANAIS_DEF.find((d) => d.id === c);
  if (!def) return null;
  const Icon = def.icon;
  return <Icon key={c} className="w-3.5 h-3.5" title={def.label} />;
}

// ─── Cores de status ──────────────────────────────────────────────────────
const STATUS_CFG = {
  AGUARDANDO: { faixa: "bg-slate-400",   label: "Aguardando", cls: "text-slate-600" },
  LIBERADA:   { faixa: "bg-sky-400",     label: "Liberada",   cls: "text-sky-600" },
  ENTREGUE:   { faixa: "bg-emerald-400", label: "Entregue",   cls: "text-emerald-600" },
  ERRO:       { faixa: "bg-rose-400",    label: "Erro",       cls: "text-rose-600" },
};

function fmtData(ymd?: string | null) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}
function addDias(ymd: string, n: number): string {
  const d = new Date(ymd + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().split("T")[0];
}
function toYMD(date: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  return new Date(date).toISOString().split("T")[0];
}
function hoje(): string {
  const now = new Date();
  const brt = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return brt.toISOString().split("T")[0];
}

// ─── Componente principal ─────────────────────────────────────────────────
export default function ReceituarioAutomatico() {
  const { toast } = useToast();

  // Estado global
  const [agendas, setAgendas]       = useState<Agenda[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [expandidas, setExpandidas] = useState<Set<number>>(new Set());

  // Seletor de cliente
  const [clientes, setClientes]         = useState<ClienteLite[]>([]);
  const [clienteSelId, setClienteSelId] = useState<number | null>(null);
  const clienteSel = useMemo(() => clientes.find((c) => c.id === clienteSelId) ?? null, [clientes, clienteSelId]);

  // Modal nova agenda
  const [modalAgenda, setModalAgenda] = useState(false);
  const [editandoAgenda, setEditandoAgenda] = useState<Agenda | null>(null);
  const [formAgenda, setFormAgenda] = useState({
    nome: "", descricao: "", frequenciaPadraoDias: 30,
    diasAntecedencia: 5, canaisPadrao: ["email", "whatsapp", "portal"],
    incluirLembretePosologia: true, protocolId: "",
  });
  const [protocolos, setProtocolos] = useState<ProtocoloLite[]>([]);
  const [salvandoAgenda, setSalvandoAgenda] = useState(false);

  // Modal novo/edit slot
  const [modalSlot, setModalSlot] = useState(false);
  const [agendaSlotAtual, setAgendaSlotAtual] = useState<Agenda | null>(null);
  const [editandoSlot, setEditandoSlot] = useState<Slot | null>(null);
  const [formSlot, setFormSlot] = useState({
    nome: "", dataLiberacao: hoje(),
    proximaEmDias: 30,
    formulas: [] as SlotFormula[],
    canais: null as string[] | null,
  });
  const [salvandoSlot, setSalvandoSlot] = useState(false);
  const [catalogo, setCatalogo] = useState<FormulaCatalog[]>([]);
  const [buscaFormula, setBuscaFormula] = useState("");

  // Processando worker
  const [processando, setProcessando] = useState(false);

  // ── Carregar clientes ────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/api/clients?limit=500")
      .then((d) => setClientes(Array.isArray(d) ? d : (d.clients ?? [])))
      .catch(() => setClientes([]));
    apiFetch("/api/prescription-formulas")
      .then((d) => {
        const arr = Array.isArray(d) ? d : (d.formulas ?? []);
        setCatalogo(arr.map((f: Record<string, unknown>) => ({
          id: String(f.id ?? f.code ?? f.nome),
          nome: String(f.nome ?? f.name ?? ""),
          ativoPrincipal: f.ativoPrincipal as string,
          posologia: f.posologia as string,
          via: f.via as string,
        })));
      })
      .catch(() => setCatalogo([]));
  }, []);

  // ── Carregar agendas do cliente ──────────────────────────────────────────
  const carregar = useCallback(async (cId?: number) => {
    const id = cId ?? clienteSel?.id;
    if (!id) { setAgendas([]); return; }
    setCarregando(true);
    try {
      const d = await apiFetch(`/api/receituario/agendas?clientId=${id}`);
      setAgendas(d.agendas ?? []);
    } catch { toast({ title: "Erro ao carregar agendas", variant: "destructive" }); }
    finally { setCarregando(false); }
  }, [clienteSel, toast]);

  useEffect(() => { void carregar(); }, [clienteSel]);

  // ── Selecionar cliente ───────────────────────────────────────────────────
  const selecionarCliente = async (id: number | null) => {
    setClienteSelId(id);
    if (!id) { setProtocolos([]); return; }
    try {
      const d = await apiFetch(`/api/protocols?clientId=${id}`);
      setProtocolos(Array.isArray(d) ? d : (d.protocols ?? []));
    } catch { setProtocolos([]); }
  };

  // ── Modal nova agenda ────────────────────────────────────────────────────
  const abrirNovaAgenda = () => {
    setEditandoAgenda(null);
    const proto = protocolos[0];
    setFormAgenda({
      nome: proto ? `Receituário — ${proto.title}` : "Receituário Magistral",
      descricao: "", frequenciaPadraoDias: 30, diasAntecedencia: 5,
      canaisPadrao: ["email", "whatsapp", "portal"],
      incluirLembretePosologia: true,
      protocolId: proto ? String(proto.id) : "",
    });
    setModalAgenda(true);
  };
  const abrirEditarAgenda = (a: Agenda) => {
    setEditandoAgenda(a);
    setFormAgenda({
      nome: a.nome, descricao: a.descricao ?? "",
      frequenciaPadraoDias: a.frequenciaPadraoDias,
      diasAntecedencia: a.diasAntecedencia,
      canaisPadrao: a.canaisPadrao ?? ["email", "whatsapp", "portal"],
      incluirLembretePosologia: a.incluirLembretePosologia,
      protocolId: a.protocolId ? String(a.protocolId) : "",
    });
    setModalAgenda(true);
  };

  const salvarAgenda = async () => {
    if (!clienteSel) return;
    setSalvandoAgenda(true);
    try {
      if (editandoAgenda) {
        await apiFetch(`/api/receituario/agendas/${editandoAgenda.id}`, {
          method: "PUT", body: JSON.stringify({
            nome: formAgenda.nome, descricao: formAgenda.descricao,
            frequenciaPadraoDias: formAgenda.frequenciaPadraoDias,
            diasAntecedencia: formAgenda.diasAntecedencia,
            canaisPadrao: formAgenda.canaisPadrao,
            incluirLembretePosologia: formAgenda.incluirLembretePosologia,
          }),
        });
        toast({ title: "Agenda atualizada" });
      } else {
        await apiFetch("/api/receituario/agendas", {
          method: "POST", body: JSON.stringify({
            clientId: clienteSel.id,
            protocolId: formAgenda.protocolId ? parseInt(formAgenda.protocolId) : null,
            nome: formAgenda.nome, descricao: formAgenda.descricao,
            frequenciaPadraoDias: formAgenda.frequenciaPadraoDias,
            diasAntecedencia: formAgenda.diasAntecedencia,
            canaisPadrao: formAgenda.canaisPadrao,
            incluirLembretePosologia: formAgenda.incluirLembretePosologia,
          }),
        });
        toast({ title: "Agenda criada" });
      }
      setModalAgenda(false);
      await carregar();
    } catch (e) {
      toast({ title: `Erro: ${e instanceof Error ? e.message : "desconhecido"}`, variant: "destructive" });
    } finally { setSalvandoAgenda(false); }
  };

  const toggleAtivoAgenda = async (a: Agenda) => {
    try {
      await apiFetch(`/api/receituario/agendas/${a.id}`, {
        method: "PUT", body: JSON.stringify({ ativo: !a.ativo }),
      });
      await carregar();
    } catch { toast({ title: "Erro ao alterar status", variant: "destructive" }); }
  };

  // ── Modal novo/edit slot ─────────────────────────────────────────────────
  const abrirNovoSlot = (agenda: Agenda) => {
    setAgendaSlotAtual(agenda);
    setEditandoSlot(null);
    // Calcular próxima data: último slot + frequência padrão
    const ultimo = [...agenda.slots].sort((a, b) =>
      b.dataLiberacao.localeCompare(a.dataLiberacao)
    )[0];
    const baseData = ultimo
      ? addDias(ultimo.dataLiberacao, agenda.frequenciaPadraoDias)
      : hoje();
    setFormSlot({
      nome: `Receita ${agenda.slots.length + 1} de ?`,
      dataLiberacao: baseData,
      proximaEmDias: agenda.frequenciaPadraoDias,
      formulas: [],
      canais: null,
    });
    setBuscaFormula("");
    setModalSlot(true);
  };
  const abrirEditarSlot = (agenda: Agenda, slot: Slot) => {
    setAgendaSlotAtual(agenda);
    setEditandoSlot(slot);
    setFormSlot({
      nome: slot.nome,
      dataLiberacao: slot.dataLiberacao,
      proximaEmDias: agenda.frequenciaPadraoDias,
      formulas: slot.formulas ?? [],
      canais: slot.canais ?? null,
    });
    setBuscaFormula("");
    setModalSlot(true);
  };

  const salvarSlot = async () => {
    if (!agendaSlotAtual) return;
    setSalvandoSlot(true);
    try {
      const body = {
        nome: formSlot.nome,
        dataLiberacao: formSlot.dataLiberacao,
        formulas: formSlot.formulas,
        canais: formSlot.canais,
      };
      if (editandoSlot) {
        await apiFetch(`/api/receituario/slots/${editandoSlot.id}`, {
          method: "PUT", body: JSON.stringify(body),
        });
        toast({ title: "Slot atualizado" });
      } else {
        await apiFetch(`/api/receituario/agendas/${agendaSlotAtual.id}/slots`, {
          method: "POST", body: JSON.stringify(body),
        });
        toast({ title: "Slot adicionado" });
      }
      setModalSlot(false);
      await carregar();
    } catch (e) {
      toast({ title: `Erro: ${e instanceof Error ? e.message : ""}`, variant: "destructive" });
    } finally { setSalvandoSlot(false); }
  };

  const excluirSlot = async (slotId: number) => {
    try {
      await apiFetch(`/api/receituario/slots/${slotId}`, { method: "DELETE" });
      toast({ title: "Slot removido" });
      await carregar();
    } catch { toast({ title: "Erro ao remover", variant: "destructive" }); }
  };

  const liberarSlot = async (slotId: number, nome: string) => {
    try {
      await apiFetch(`/api/receituario/slots/${slotId}/liberar`, { method: "POST" });
      toast({ title: `"${nome}" liberada` });
      await carregar();
    } catch { toast({ title: "Erro na liberação", variant: "destructive" }); }
  };

  const processarWorker = async () => {
    setProcessando(true);
    try {
      const d = await apiFetch("/api/receituario/processar", { method: "POST" });
      toast({ title: `Processado: ${d.liberados} liberados, ${d.erros} erros` });
      await carregar();
    } catch { toast({ title: "Erro ao processar", variant: "destructive" }); }
    finally { setProcessando(false); }
  };

  // ── Fórmulas do slot ─────────────────────────────────────────────────────
  const adicionarFormula = (f: FormulaCatalog) => {
    if (formSlot.formulas.some((x) => x.catalogId === f.id || x.nome === f.nome)) return;
    setFormSlot((p) => ({
      ...p,
      formulas: [...p.formulas, {
        nome: f.nome, catalogId: f.id,
        ativoPrincipal: f.ativoPrincipal,
        posologia: f.posologia, via: f.via,
      }],
    }));
  };
  const removerFormula = (idx: number) =>
    setFormSlot((p) => ({ ...p, formulas: p.formulas.filter((_, i) => i !== idx) }));
  const atualizarFormula = (idx: number, campo: keyof SlotFormula, valor: string) =>
    setFormSlot((p) => ({
      ...p,
      formulas: p.formulas.map((f, i) => i === idx ? { ...f, [campo]: valor } : f),
    }));

  // ── Derivados ─────────────────────────────────────────────────────────────
  const totalAguardando = agendas.reduce((s, a) => s + a.resumo.aguardando, 0);
  const totalLiberados  = agendas.reduce((s, a) => s + a.resumo.liberados, 0);
  const totalErros      = agendas.reduce((s, a) => s + a.resumo.erros, 0);
  const proximaGlobal   = agendas
    .map((a) => a.proximaLiberacao)
    .filter(Boolean)
    .sort()[0];

  const clientesOpts: ClientPickerOption[] = clientes.map((c) => ({ id: c.id, name: c.name, cpf: c.cpf ?? undefined }));

  const catalogoFiltrado = catalogo.filter((f) =>
    f.nome.toLowerCase().includes(buscaFormula.toLowerCase()) ||
    (f.ativoPrincipal ?? "").toLowerCase().includes(buscaFormula.toLowerCase())
  );

  const toggleExpand = (id: number) =>
    setExpandidas((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 pb-16">

      {/* ── CABEÇALHO ──────────────────────────────────────────────────── */}
      <div className="panel-3d p-5 flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 mb-2 uppercase tracking-widest text-sm font-bold">
            <Calendar className="w-4 h-4" />
            Receituário Automático
          </div>
          <p className="text-sm text-muted-foreground">
            Pré-agende receitas de fórmulas magistrais — o sistema assina e entrega automaticamente na data certa, sem o paciente ligar.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          {[
            { label: "AGUARDANDO", valor: totalAguardando, cor: "text-slate-600" },
            { label: "LIBERADOS",  valor: totalLiberados,  cor: "text-sky-600" },
            { label: "ERROS",      valor: totalErros,      cor: "text-rose-600" },
            { label: "PRÓXIMA",    valor: fmtData(proximaGlobal), cor: "text-amber-600", small: true },
          ].map((k) => (
            <div key={k.label} className="screen-3d px-3 py-2 text-center min-w-[64px]">
              <div className={`${k.small ? "text-sm" : "text-xl"} font-bold ${k.cor}`}>{k.valor}</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SELETOR DE CLIENTE ──────────────────────────────────────────── */}
      <div className="panel-3d p-4">
        <div className="bevel-3d text-[11px] px-2 py-0.5 uppercase tracking-widest mb-2 inline-block">
          Selecionar Cliente
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex-1">
            <ClientPicker
              clientes={clientesOpts}
              value={clienteSelId}
              onChange={selecionarCliente}
              placeholder="Escolha um cliente…"
            />
          </div>
          {clienteSel && (
            <Button className="btn-3d gap-2 shrink-0" onClick={abrirNovaAgenda}>
              <Plus className="w-4 h-4" /> Nova Agenda
            </Button>
          )}
          <Button className="btn-3d-soft gap-1 shrink-0" onClick={processarWorker} disabled={processando}>
            {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Processar
          </Button>
        </div>
      </div>

      {/* ── LISTA DE AGENDAS ────────────────────────────────────────────── */}
      {carregando ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-32 panel-3d animate-pulse" />)}
        </div>
      ) : !clienteSel ? (
        <div className="panel-3d p-8 text-center text-muted-foreground text-sm">
          <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Selecione um cliente para ver as agendas de receituário
        </div>
      ) : agendas.length === 0 ? (
        <div className="panel-3d p-8 text-center">
          <FlaskConical className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-muted-foreground text-sm mb-3">Nenhuma agenda criada para este cliente</p>
          <Button className="btn-3d gap-2" onClick={abrirNovaAgenda}>
            <Plus className="w-4 h-4" /> Criar Primeira Agenda
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {agendas.map((agenda) => {
            const aberta = expandidas.has(agenda.id);
            return (
              <div key={agenda.id} className={`panel-3d overflow-hidden ${!agenda.ativo ? "opacity-60" : ""}`}>

                {/* Cabeçalho da agenda */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
                  <button onClick={() => toggleExpand(agenda.id)} className="flex-1 flex items-center gap-3 text-left min-w-0">
                    {aberta ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm truncate">{agenda.nome}</span>
                        <span className="bevel-3d text-[10px] px-2 py-0.5">
                          a cada {agenda.frequenciaPadraoDias} dias
                        </span>
                        {agenda.resumo.erros > 0 && (
                          <span className="text-[10px] text-rose-600 font-bold">{agenda.resumo.erros} erro{agenda.resumo.erros > 1 ? "s" : ""}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground">
                          {agenda.resumo.total} slot{agenda.resumo.total !== 1 ? "s" : ""} · {agenda.resumo.aguardando} aguardando · {agenda.resumo.liberados} liberados
                        </span>
                        {agenda.proximaLiberacao && (
                          <span className="text-[10px] text-amber-600">próxima: {fmtData(agenda.proximaLiberacao)}</span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Ações da agenda */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      className="concave-3d w-7 h-7 flex items-center justify-center hover:text-primary"
                      title={agenda.ativo ? "Desativar" : "Ativar"}
                      onClick={() => toggleAtivoAgenda(agenda)}
                    >
                      {agenda.ativo
                        ? <ToggleRight className="w-4 h-4 text-emerald-600" />
                        : <ToggleLeft className="w-4 h-4 text-slate-400" />}
                    </button>
                    <button
                      className="concave-3d w-7 h-7 flex items-center justify-center hover:text-primary"
                      title="Editar agenda"
                      onClick={() => abrirEditarAgenda(agenda)}
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                    <Button className="btn-3d-soft h-7 text-xs gap-1 px-2" onClick={() => abrirNovoSlot(agenda)}>
                      <Plus className="w-3 h-3" /> Slot
                    </Button>
                  </div>
                </div>

                {/* Linha do tempo de slots */}
                {aberta && (
                  <div className="p-3 space-y-2">
                    {agenda.slots.length === 0 ? (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        Nenhum slot. Clique em <strong>+ Slot</strong> para adicionar a primeira receita.
                      </div>
                    ) : (
                      agenda.slots
                        .sort((a, b) => a.numeroSequencia - b.numeroSequencia)
                        .map((slot) => {
                          const scfg = STATUS_CFG[slot.status] ?? STATUS_CFG.AGUARDANDO;
                          return (
                            <div key={slot.id} className="panel-3d-sub flex overflow-hidden">
                              <div className={`w-1 shrink-0 ${scfg.faixa}`} />
                              <div className="flex-1 flex items-start gap-3 p-3 min-w-0">
                                {/* Sequência */}
                                <div className="concave-3d w-7 h-7 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                                  {slot.numeroSequencia}
                                </div>
                                {/* Conteúdo */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-medium text-sm truncate">{slot.nome}</span>
                                    <span className={`text-[10px] font-bold uppercase ${scfg.cls}`}>{scfg.label}</span>
                                  </div>
                                  <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3 h-3" /> {fmtData(slot.dataLiberacao)}
                                    </span>
                                    {slot.formulas.length > 0 && (
                                      <span className="flex items-center gap-1">
                                        <FlaskConical className="w-3 h-3" /> {slot.formulas.length} fórmula{slot.formulas.length > 1 ? "s" : ""}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                      {(slot.canais ?? agenda.canaisPadrao).map(canalIcon)}
                                    </span>
                                  </div>
                                  {slot.formulas.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {slot.formulas.map((f, i) => (
                                        <span key={i} className="concave-3d text-[10px] px-2 py-0.5">{f.nome}</span>
                                      ))}
                                    </div>
                                  )}
                                  {slot.erro && (
                                    <p className="text-[11px] text-rose-600 mt-1">⚠ {slot.erro}</p>
                                  )}
                                </div>
                                {/* Ações do slot */}
                                <div className="flex gap-1 shrink-0">
                                  {slot.status === "AGUARDANDO" && (
                                    <button
                                      className="concave-3d w-7 h-7 flex items-center justify-center hover:text-sky-600"
                                      title="Liberar agora"
                                      onClick={() => liberarSlot(slot.id, slot.nome)}
                                    >
                                      <Send className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    className="concave-3d w-7 h-7 flex items-center justify-center hover:text-primary"
                                    title="Editar slot"
                                    onClick={() => abrirEditarSlot(agenda, slot)}
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    className="concave-3d w-7 h-7 flex items-center justify-center hover:text-destructive"
                                    title="Remover slot"
                                    onClick={() => excluirSlot(slot.id)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })
                    )}
                    {/* Botão final da linha do tempo */}
                    <button
                      className="w-full border-2 border-dashed border-border/50 rounded-[6px] py-2 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-1"
                      onClick={() => abrirNovoSlot(agenda)}
                    >
                      <Plus className="w-3 h-3" /> Adicionar próxima receita ({fmtData(
                        (() => {
                          const ultimo = [...agenda.slots].sort((a, b) => b.dataLiberacao.localeCompare(a.dataLiberacao))[0];
                          return ultimo ? addDias(ultimo.dataLiberacao, agenda.frequenciaPadraoDias) : hoje();
                        })()
                      )})
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: NOVA / EDITAR AGENDA
      ═══════════════════════════════════════════════════════════════════ */}
      {modalAgenda && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalAgenda(false)} />
          <div className="relative w-full max-w-lg panel-3d shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-sm uppercase tracking-widest font-bold">
                <Calendar className="w-4 h-4" />
                {editandoAgenda ? "Editar Agenda" : "Nova Agenda de Receitas"}
              </div>
              <button className="concave-3d w-8 h-8 flex items-center justify-center" onClick={() => setModalAgenda(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {/* Nome */}
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1 block">Nome da Agenda</label>
                <input className="field-engraved w-full text-sm" value={formAgenda.nome} onChange={(e) => setFormAgenda((p) => ({ ...p, nome: e.target.value }))} placeholder="Ex: Receituário Longevidade — Jan–Jun 2026" />
              </div>

              {/* Protocolo */}
              {!editandoAgenda && protocolos.length > 0 && (
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1 block">Associar ao Protocolo (opcional)</label>
                  <select className="field-engraved w-full text-sm" value={formAgenda.protocolId} onChange={(e) => {
                    const proto = protocolos.find((p) => String(p.id) === e.target.value);
                    setFormAgenda((prev) => ({
                      ...prev,
                      protocolId: e.target.value,
                      nome: proto ? `Receituário — ${proto.title}` : prev.nome,
                    }));
                  }}>
                    <option value="">— sem protocolo —</option>
                    {protocolos.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                  </select>
                </div>
              )}

              {/* Frequência padrão */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1 block">Frequência Padrão (dias)</label>
                  <input type="number" min={1} max={365} className="field-engraved w-full text-sm" value={formAgenda.frequenciaPadraoDias} onChange={(e) => setFormAgenda((p) => ({ ...p, frequenciaPadraoDias: parseInt(e.target.value) || 30 }))} />
                  <p className="text-[10px] text-muted-foreground mt-0.5">Intervalo entre receitas</p>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1 block">Liberar X dias antes</label>
                  <input type="number" min={0} max={30} className="field-engraved w-full text-sm" value={formAgenda.diasAntecedencia} onChange={(e) => setFormAgenda((p) => ({ ...p, diasAntecedencia: parseInt(e.target.value) || 5 }))} />
                  <p className="text-[10px] text-muted-foreground mt-0.5">0 = no próprio dia</p>
                </div>
              </div>

              {/* Canais */}
              <div>
                <label className="text-xs uppercase tracking-widest text-muted-foreground mb-2 block">Canais de Entrega Padrão</label>
                <div className="flex flex-wrap gap-2">
                  {CANAIS_DEF.map((c) => {
                    const ativo = formAgenda.canaisPadrao.includes(c.id);
                    const Icon = c.icon;
                    return (
                      <button
                        key={c.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium border transition-all ${ativo ? "btn-3d" : "btn-3d-soft opacity-60"}`}
                        onClick={() => setFormAgenda((p) => ({
                          ...p,
                          canaisPadrao: ativo
                            ? p.canaisPadrao.filter((x) => x !== c.id)
                            : [...p.canaisPadrao, c.id],
                        }))}
                      >
                        <Icon className="w-3.5 h-3.5" /> {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Lembrete de posologia */}
              <div className="panel-3d-sub p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Lembrete de Posologia</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Conecta ao motor de mensageria — envia lembretes de como e quando tomar as fórmulas</p>
                </div>
                <button
                  className="concave-3d px-2 py-1 flex items-center gap-1 text-xs font-medium shrink-0"
                  onClick={() => setFormAgenda((p) => ({ ...p, incluirLembretePosologia: !p.incluirLembretePosologia }))}
                >
                  {formAgenda.incluirLembretePosologia
                    ? <><ToggleRight className="w-5 h-5 text-emerald-600" /> Ativo</>
                    : <><ToggleLeft className="w-5 h-5 text-slate-400" /> Inativo</>}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
              <Button className="btn-3d-soft" onClick={() => setModalAgenda(false)}>Cancelar</Button>
              <Button className="btn-3d gap-2" onClick={salvarAgenda} disabled={salvandoAgenda || !formAgenda.nome}>
                {salvandoAgenda ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</> : <><Save className="w-4 h-4" /> {editandoAgenda ? "Salvar" : "Criar Agenda"}</>}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODAL: NOVO / EDITAR SLOT
      ═══════════════════════════════════════════════════════════════════ */}
      {modalSlot && agendaSlotAtual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalSlot(false)} />
          <div className="relative w-full max-w-2xl panel-3d shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-sm uppercase tracking-widest font-bold">
                <FlaskConical className="w-4 h-4" />
                {editandoSlot ? "Editar Receita" : "Nova Receita na Linha do Tempo"}
              </div>
              <button className="concave-3d w-8 h-8 flex items-center justify-center" onClick={() => setModalSlot(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5">

              {/* Nome e data */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1 block">Nome da Receita</label>
                  <input className="field-engraved w-full text-sm" value={formSlot.nome} onChange={(e) => setFormSlot((p) => ({ ...p, nome: e.target.value }))} placeholder="Ex: Receita 2 — Agosto/2026" />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted-foreground mb-1 block">Data de Liberação</label>
                  <input type="date" className="field-engraved w-full text-sm" value={formSlot.dataLiberacao} onChange={(e) => setFormSlot((p) => ({ ...p, dataLiberacao: e.target.value }))} />
                </div>
              </div>

              {/* Atalho: próxima em X dias */}
              <div className="panel-3d-sub p-3 flex items-center gap-3">
                <Info className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 text-xs text-muted-foreground">
                  Próxima receita (da seguinte na lista) em
                </div>
                <input type="number" min={1} max={365} className="field-engraved w-16 text-center text-sm" value={formSlot.proximaEmDias}
                  onChange={(e) => setFormSlot((p) => ({ ...p, proximaEmDias: parseInt(e.target.value) || 30 }))} />
                <span className="text-xs text-muted-foreground">dias</span>
                <span className="text-xs text-muted-foreground">({fmtData(addDias(formSlot.dataLiberacao, formSlot.proximaEmDias))})</span>
              </div>

              {/* Seletor de fórmulas do catálogo */}
              <div>
                <div className="bevel-3d text-[11px] px-2 py-0.5 uppercase tracking-widest mb-2 inline-block">
                  Fórmulas Magistrais
                </div>

                {/* Fórmulas já selecionadas */}
                {formSlot.formulas.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {formSlot.formulas.map((f, i) => (
                      <div key={i} className="panel-3d-sub p-2.5 flex items-start gap-2">
                        <div className="w-1 bg-violet-400 self-stretch rounded-full shrink-0" />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="text-sm font-medium">{f.nome}</div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <input className="field-engraved text-xs" placeholder="Posologia" value={f.posologia ?? ""} onChange={(e) => atualizarFormula(i, "posologia", e.target.value)} />
                            <input className="field-engraved text-xs" placeholder="Dose" value={f.dose ?? ""} onChange={(e) => atualizarFormula(i, "dose", e.target.value)} />
                            <input className="field-engraved text-xs" placeholder="Via" value={f.via ?? ""} onChange={(e) => atualizarFormula(i, "via", e.target.value)} />
                            <input className="field-engraved text-xs" placeholder="Observação" value={f.observacao ?? ""} onChange={(e) => atualizarFormula(i, "observacao", e.target.value)} />
                          </div>
                        </div>
                        <button className="concave-3d w-6 h-6 flex items-center justify-center hover:text-destructive shrink-0" onClick={() => removerFormula(i)}>
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Buscar no catálogo */}
                <div className="relative mb-1.5">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  <input className="field-engraved w-full pl-8 text-xs" placeholder="Buscar fórmula no catálogo…" value={buscaFormula} onChange={(e) => setBuscaFormula(e.target.value)} />
                </div>
                <div className="panel-3d-sub max-h-40 overflow-y-auto">
                  {catalogoFiltrado.slice(0, 20).map((f) => (
                    <button
                      key={f.id}
                      className="w-full text-left px-3 py-2 hover:bg-primary/5 text-xs flex items-center gap-2 border-b border-border/30 last:border-0"
                      onClick={() => adicionarFormula(f)}
                    >
                      <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="flex-1 font-medium truncate">{f.nome}</span>
                      {f.via && <span className="text-muted-foreground shrink-0">{f.via}</span>}
                    </button>
                  ))}
                  {catalogoFiltrado.length === 0 && (
                    <p className="text-xs text-muted-foreground p-3 text-center">Nenhuma fórmula encontrada</p>
                  )}
                </div>
              </div>

              {/* Canais override */}
              <div>
                <div className="bevel-3d text-[11px] px-2 py-0.5 uppercase tracking-widest mb-2 inline-block">
                  Canais (deixe em branco para usar o padrão da agenda)
                </div>
                <div className="flex flex-wrap gap-2">
                  {CANAIS_DEF.map((c) => {
                    const efetivo  = formSlot.canais ?? agendaSlotAtual.canaisPadrao;
                    const ativo    = efetivo.includes(c.id);
                    const ehPadrao = formSlot.canais === null;
                    const Icon     = c.icon;
                    return (
                      <button
                        key={c.id}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[6px] text-xs font-medium border transition-all ${ativo ? "btn-3d" : "btn-3d-soft opacity-50"} ${ehPadrao ? "border-dashed" : ""}`}
                        onClick={() => {
                          const base = formSlot.canais ?? [...agendaSlotAtual.canaisPadrao];
                          const next = base.includes(c.id) ? base.filter((x) => x !== c.id) : [...base, c.id];
                          setFormSlot((p) => ({ ...p, canais: next }));
                        }}
                      >
                        <Icon className="w-3.5 h-3.5" /> {c.label}
                        {ehPadrao && <span className="text-[9px] opacity-60 ml-0.5">padrão</span>}
                      </button>
                    );
                  })}
                  {formSlot.canais !== null && (
                    <button className="text-[10px] text-muted-foreground hover:text-primary" onClick={() => setFormSlot((p) => ({ ...p, canais: null }))}>
                      restaurar padrão
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border">
              <Button className="btn-3d-soft" onClick={() => setModalSlot(false)}>Cancelar</Button>
              <Button className="btn-3d gap-2" onClick={salvarSlot} disabled={salvandoSlot || !formSlot.nome}>
                {salvandoSlot
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando…</>
                  : <><Save className="w-4 h-4" /> {editandoSlot ? "Salvar Receita" : "Adicionar à Linha do Tempo"}</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
