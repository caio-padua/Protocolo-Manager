/**
 * PRESCRIÇÃO AUTOMÁTICA — Linha do Tempo
 * Ferramenta premium de prescrição magistral com timeline visual.
 *
 * BLOCOS:
 *   1. Config bar  — cliente + N entregas + frequência + data início
 *   2. Construtor  — slots horizontais clicáveis + editor completo
 *   3. Linha do tempo — prévia visual com nós e setas
 *   4. Agendas salvas — ferramenta original preservada
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Calendar, Plus, Minus, ChevronLeft, ChevronRight,
  CheckCircle2, Clock, AlertTriangle, X, Save, Loader2,
  Search, FlaskConical, Trash2, Edit3, Play,
  Mail, MessageCircle, HardDrive, ChevronDown, ChevronUp,
  Send, RefreshCw, ToggleLeft, ToggleRight, Globe,
  Smartphone, Settings, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ClientPicker, type ClientPickerOption } from "@/components/ClientPicker";
import { cn } from "@/lib/utils";

// ─── helpers ──────────────────────────────────────────────────────────────────
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
function hoje() { return new Date().toISOString().slice(0, 10); }
function addDias(base: string, dias: number): string {
  const d = new Date(base + "T12:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
function fmtData(iso: string) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function uid() { return Math.random().toString(36).slice(2, 9); }

// ─── tipos ────────────────────────────────────────────────────────────────────
type FormulaCatalog = { id: string; nome: string; ativoPrincipal?: string; posologia?: string; via?: string; };
type EntregaFormula = { id: string; catalogId?: string; nome: string; dose: string; posologia: string; via: string; observacao: string; };
type EntregaExame   = { id: string; nome: string; };
type Entrega = { id: string; numero: number; dataLiberacao: string; nomeReceita: string; formulas: EntregaFormula[]; exames: EntregaExame[]; };

type SlotFormula = { nome: string; catalogId?: string; ativoPrincipal?: string; posologia?: string; dose?: string; via?: string; observacao?: string; };
type Slot = {
  id: number; agendaId: number; clientId: number; numeroSequencia: number;
  nome: string; dataLiberacao: string; formulas: SlotFormula[];
  canais: string[] | null; status: "AGUARDANDO" | "LIBERADA" | "ENTREGUE" | "ERRO";
  pdfUrl?: string; driveWebViewLink?: string;
  enviadoEmailEm?: string; enviadoWhatsappEm?: string; enviadoTelegramEm?: string;
  proximaLiberacao?: string; diasAntecedenciaOverride?: number;
};
type Agenda = {
  id: number; clientId: number; nome: string; descricao?: string;
  frequenciaPadraoDias: number; diasAntecedencia: number;
  canaisPadrao: string[]; ativo: boolean; criadoEm: string;
  proximaLiberacao?: string; slots?: Slot[];
};
type ProtocoloLite = { id: number; title: string; };
type ClienteLite   = { id: number; name: string; cpf?: string | null; };

// ─── constantes ───────────────────────────────────────────────────────────────
const VIAS = ["Oral", "Sublingual", "Tópica", "Transdérmica", "Retal", "Inalatória", "Nasal", "Outra"];
const CANAIS_TODOS = ["email", "whatsapp", "telegram", "portal"];

// ══════════════════════════════════════════════════════════════════════════════
export default function ReceituarioAutomatico() {
  const { toast } = useToast();

  // ── Config ─────────────────────────────────────────────────────────────────
  const [clientes, setClientes]         = useState<ClienteLite[]>([]);
  const [clienteSelId, setClienteSelId] = useState<number | null>(null);
  const clienteSel = useMemo(() => clientes.find((c) => c.id === clienteSelId) ?? null, [clientes, clienteSelId]);

  const [nEntregas, setNEntregas]       = useState(3);
  const [frequenciaDias, setFrequenciaDias] = useState(30);
  const [dataInicio, setDataInicio]     = useState(hoje());

  // ── Construtor ─────────────────────────────────────────────────────────────
  const [entregas, setEntregas]         = useState<Entrega[]>([]);
  const [slotAtivo, setSlotAtivo]       = useState<string | null>(null);
  const [catalogo, setCatalogo]         = useState<FormulaCatalog[]>([]);
  const [buscaFormula, setBuscaFormula] = useState("");
  const [buscaExame, setBuscaExame]     = useState("");
  const [catalogoExames, setCatalogoExames] = useState<string[]>([]);

  // ── Salvar ─────────────────────────────────────────────────────────────────
  const [nomeAgenda, setNomeAgenda]     = useState("");
  const [diasAntecedencia, setDiasAntecedencia] = useState(5);
  const [canais, setCanais]             = useState<string[]>(["email", "whatsapp", "portal"]);
  const [salvando, setSalvando]         = useState(false);
  const [protocolos, setProtocolos]     = useState<ProtocoloLite[]>([]);
  const [protocolId, setProtocolId]     = useState("");

  // ── Agendas salvas (ferramenta original) ───────────────────────────────────
  const [agendas, setAgendas]           = useState<Agenda[]>([]);
  const [carregando, setCarregando]     = useState(false);
  const [agendasAbertas, setAgendasAbertas] = useState(false);
  const [expandidas, setExpandidas]     = useState<Set<number>>(new Set());
  const [processando, setProcessando]   = useState(false);

  // ── Scroll timeline ────────────────────────────────────────────────────────
  const timelineRef = useRef<HTMLDivElement>(null);
  const slotsRef    = useRef<HTMLDivElement>(null);

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    apiFetch("/api/clients?limit=500")
      .then((d) => setClientes(Array.isArray(d) ? d : (d.clients ?? [])))
      .catch(() => {});

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
      .catch(() => {});

    apiFetch("/api/catalogos/exames")
      .then((d) => {
        const arr = Array.isArray(d) ? d : (d.exames ?? []);
        setCatalogoExames(arr.map((e: Record<string, unknown>) => String(e.nome ?? e.name ?? e)));
      })
      .catch(() => {});
  }, []);

  // ── Carga ao trocar cliente ────────────────────────────────────────────────
  useEffect(() => {
    setSlotAtivo(null);
    if (!clienteSelId) { setAgendas([]); setProtocolos([]); return; }
    setCarregando(true);
    Promise.all([
      apiFetch(`/api/receituario/agendas?clientId=${clienteSelId}`).catch(() => ({ agendas: [] })),
      apiFetch(`/api/protocols?clientId=${clienteSelId}`).catch(() => []),
    ]).then(([ag, pr]) => {
      setAgendas(ag.agendas ?? []);
      const lista = Array.isArray(pr) ? pr : (pr.protocols ?? []);
      setProtocolos(lista);
    }).finally(() => setCarregando(false));
  }, [clienteSelId]);

  // ── Gerar entregas ao mudar config ────────────────────────────────────────
  useEffect(() => {
    setEntregas((prev) => {
      const next: Entrega[] = [];
      for (let i = 0; i < nEntregas; i++) {
        const data = addDias(dataInicio, i * frequenciaDias);
        const existing = prev[i];
        next.push({
          id:           existing?.id           ?? uid(),
          numero:       i + 1,
          dataLiberacao: data,
          nomeReceita:  existing?.nomeReceita  ?? `Receita ${i + 1}`,
          formulas:     existing?.formulas     ?? [],
          exames:       existing?.exames       ?? [],
        });
      }
      return next;
    });
  }, [nEntregas, frequenciaDias, dataInicio]);

  // ── Entrega ativa ──────────────────────────────────────────────────────────
  const entrega = useMemo(() => entregas.find((e) => e.id === slotAtivo) ?? null, [entregas, slotAtivo]);

  function updateEntrega(id: string, patch: Partial<Entrega>) {
    setEntregas((prev) => prev.map((e) => e.id === id ? { ...e, ...patch } : e));
  }

  // ── Fórmulas da entrega ────────────────────────────────────────────────────
  function addFormula(eId: string, cat?: FormulaCatalog) {
    const nova: EntregaFormula = {
      id: uid(),
      catalogId:  cat?.id,
      nome:       cat?.nome    ?? "",
      dose:       "",
      posologia:  cat?.posologia ?? "",
      via:        cat?.via       ?? "Oral",
      observacao: "",
    };
    setEntregas((prev) => prev.map((e) => e.id === eId ? { ...e, formulas: [...e.formulas, nova] } : e));
    setBuscaFormula("");
  }
  function updateFormula(eId: string, fId: string, patch: Partial<EntregaFormula>) {
    setEntregas((prev) => prev.map((e) => e.id === eId
      ? { ...e, formulas: e.formulas.map((f) => f.id === fId ? { ...f, ...patch } : f) }
      : e));
  }
  function removeFormula(eId: string, fId: string) {
    setEntregas((prev) => prev.map((e) => e.id === eId
      ? { ...e, formulas: e.formulas.filter((f) => f.id !== fId) }
      : e));
  }

  // ── Exames da entrega ──────────────────────────────────────────────────────
  function addExame(eId: string, nome: string) {
    if (!nome.trim()) return;
    setEntregas((prev) => prev.map((e) => e.id === eId
      ? { ...e, exames: [...e.exames, { id: uid(), nome: nome.trim() }] }
      : e));
    setBuscaExame("");
  }
  function removeExame(eId: string, xId: string) {
    setEntregas((prev) => prev.map((e) => e.id === eId
      ? { ...e, exames: e.exames.filter((x) => x.id !== xId) }
      : e));
  }

  // ── Salvar linha do tempo ──────────────────────────────────────────────────
  const salvarLinha = async () => {
    if (!clienteSelId) { toast({ title: "Selecione um cliente", variant: "destructive" }); return; }
    if (!nomeAgenda.trim()) { toast({ title: "Dê um nome para esta linha do tempo", variant: "destructive" }); return; }
    if (entregas.every((e) => e.formulas.length === 0)) {
      toast({ title: "Adicione fórmulas em pelo menos uma entrega", variant: "destructive" }); return;
    }
    setSalvando(true);
    try {
      const ag = await apiFetch("/api/receituario/agendas", {
        method: "POST",
        body: JSON.stringify({
          clientId: clienteSelId,
          nome: nomeAgenda,
          descricao: `Linha do tempo: ${nEntregas} entregas a cada ${frequenciaDias} dias`,
          frequenciaPadraoDias: frequenciaDias,
          diasAntecedencia,
          canaisPadrao: canais,
          incluirLembretePosologia: true,
          protocolId: protocolId ? parseInt(protocolId) : undefined,
        }),
      });
      const agendaId = ag.id ?? ag.agenda?.id;
      for (const e of entregas) {
        if (e.formulas.length === 0 && e.exames.length === 0) continue;
        await apiFetch(`/api/receituario/agendas/${agendaId}/slots`, {
          method: "POST",
          body: JSON.stringify({
            nome: e.nomeReceita,
            dataLiberacao: e.dataLiberacao,
            proximaEmDias: frequenciaDias,
            formulas: e.formulas.map((f) => ({
              nome: f.nome, catalogId: f.catalogId,
              dose: f.dose, posologia: f.posologia, via: f.via, observacao: f.observacao,
            })),
            canais: null,
          }),
        });
      }
      toast({ title: `Linha do tempo "${nomeAgenda}" salva!` });
      setNomeAgenda("");
      // recarregar agendas
      const d = await apiFetch(`/api/receituario/agendas?clientId=${clienteSelId}`);
      setAgendas(d.agendas ?? []);
      setAgendasAbertas(true);
    } catch (err) {
      toast({ title: "Erro ao salvar", description: String(err), variant: "destructive" });
    } finally { setSalvando(false); }
  };

  // ── Worker ────────────────────────────────────────────────────────────────
  const processarWorker = async () => {
    setProcessando(true);
    try {
      await apiFetch("/api/receituario/processar", { method: "POST" });
      toast({ title: "Processamento concluído" });
      if (clienteSelId) {
        const d = await apiFetch(`/api/receituario/agendas?clientId=${clienteSelId}`);
        setAgendas(d.agendas ?? []);
      }
    } catch { toast({ title: "Erro no worker", variant: "destructive" }); }
    finally { setProcessando(false); }
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const catalogoFiltrado = catalogo.filter((f) =>
    f.nome.toLowerCase().includes(buscaFormula.toLowerCase()) ||
    (f.ativoPrincipal ?? "").toLowerCase().includes(buscaFormula.toLowerCase())
  ).slice(0, 12);

  const examesFiltrados = useMemo(() => {
    if (!buscaExame.trim()) return [];
    const q = buscaExame.toLowerCase();
    return catalogoExames.filter((n) => n.toLowerCase().includes(q)).slice(0, 8);
  }, [catalogoExames, buscaExame]);

  const clientesOpts: ClientPickerOption[] = clientes.map((c) => ({ id: c.id, name: c.name, cpf: c.cpf ?? undefined }));

  const statsGlobais = useMemo(() => {
    let totalFormulas = 0, totalExames = 0, entregasPreenchidas = 0;
    for (const e of entregas) {
      totalFormulas += e.formulas.length;
      totalExames += e.exames.length;
      if (e.formulas.length > 0 || e.exames.length > 0) entregasPreenchidas++;
    }
    return { totalFormulas, totalExames, entregasPreenchidas };
  }, [entregas]);

  // ── Scroll helpers ────────────────────────────────────────────────────────
  function scrollTimeline(dir: -1 | 1) {
    if (timelineRef.current) timelineRef.current.scrollLeft += dir * 300;
  }
  function scrollSlots(dir: -1 | 1) {
    if (slotsRef.current) slotsRef.current.scrollLeft += dir * 200;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-16">

      {/* ════════════════════════════════════════════════════════════════
          BLOCO 1 — CABEÇALHO + CONFIG
      ════════════════════════════════════════════════════════════════ */}
      <div className="panel-3d overflow-hidden">
        {/* título */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="bevel-3d p-2.5 rounded">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Prescrição Automática</div>
              <h1 className="text-xl font-bold uppercase tracking-tight">Linha do Tempo de Fórmulas</h1>
            </div>
          </div>
          {/* KPIs rápidos */}
          {clienteSel && (
            <div className="flex gap-3">
              {[
                { label: "Entregas",  valor: nEntregas,                       cor: "text-sky-600" },
                { label: "Fórmulas", valor: statsGlobais.totalFormulas,       cor: "text-emerald-600" },
                { label: "Exames",   valor: statsGlobais.totalExames,         cor: "text-amber-600" },
                { label: "Preench.", valor: `${statsGlobais.entregasPreenchidas}/${nEntregas}`, cor: "text-primary" },
              ].map((k) => (
                <div key={k.label} className="screen-3d px-3 py-1.5 text-center min-w-[68px]">
                  <div className={`text-xl font-bold ${k.cor}`}>{k.valor}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{k.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Config bar */}
        <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
          {/* Cliente */}
          <div className="md:col-span-2 space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Cliente *</label>
            <ClientPicker clientes={clientesOpts} value={clienteSelId} onChange={setClienteSelId} placeholder="Selecione o cliente…" />
          </div>

          {/* N entregas */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Número de Entregas</label>
            <div className="flex items-center gap-1">
              <button type="button" className="btn-3d-soft p-2" onClick={() => setNEntregas((n) => Math.max(1, n - 1))}>
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number" min={1} max={24}
                value={nEntregas}
                onChange={(e) => setNEntregas(Math.max(1, Math.min(24, parseInt(e.target.value) || 1)))}
                className="field-engraved text-center w-16 text-lg font-bold"
              />
              <button type="button" className="btn-3d-soft p-2" onClick={() => setNEntregas((n) => Math.min(24, n + 1))}>
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Frequência */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Freq. entre Entregas (dias)</label>
            <div className="flex items-center gap-1">
              <button type="button" className="btn-3d-soft p-2" onClick={() => setFrequenciaDias((n) => Math.max(1, n - 5))}>
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number" min={1} max={365}
                value={frequenciaDias}
                onChange={(e) => setFrequenciaDias(Math.max(1, parseInt(e.target.value) || 30))}
                className="field-engraved text-center w-16 text-lg font-bold"
              />
              <button type="button" className="btn-3d-soft p-2" onClick={() => setFrequenciaDias((n) => n + 5)}>
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Data início */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Primeira Entrega</label>
            <input
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
              className="field-engraved w-full text-sm"
            />
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          BLOCO 2 — CONSTRUTOR DE SLOTS
      ════════════════════════════════════════════════════════════════ */}
      <div className="panel-3d overflow-hidden">
        {/* sub-cabeçalho */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" />
            <span className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">
              Construtor de Entregas
            </span>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-3d-soft p-1.5" onClick={() => scrollSlots(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" className="btn-3d-soft p-1.5" onClick={() => scrollSlots(1)}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Faixa de slots */}
        <div className="px-4 py-5">
          <div ref={slotsRef} className="overflow-x-auto pb-3" style={{ scrollBehavior: "smooth" }}>
            <div className="flex items-start gap-0 min-w-max">
              {entregas.map((e, i) => {
                const ativa = slotAtivo === e.id;
                const temConteudo = e.formulas.length > 0 || e.exames.length > 0;
                return (
                  <div key={e.id} className="flex items-center gap-0">
                    {/* Slot card */}
                    <button
                      type="button"
                      onClick={() => setSlotAtivo(ativa ? null : e.id)}
                      className={cn(
                        "group relative flex flex-col items-center gap-2 rounded-lg px-4 py-4 transition-all duration-200 min-w-[130px]",
                        ativa
                          ? "panel-3d border-2 border-primary shadow-lg shadow-primary/20 scale-105"
                          : temConteudo
                            ? "panel-3d-sub border border-primary/40 hover:border-primary/70"
                            : "concave-3d border border-dashed border-border/50 hover:border-primary/40",
                      )}
                    >
                      {/* Número */}
                      <div className={cn(
                        "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold",
                        ativa ? "bg-primary text-primary-foreground" : temConteudo ? "bevel-3d text-primary" : "bg-muted text-muted-foreground",
                      )}>
                        {e.numero}
                      </div>

                      {/* Data */}
                      <div className="text-center">
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Entrega {e.numero}</div>
                        <div className="text-sm font-bold">{fmtData(e.dataLiberacao)}</div>
                      </div>

                      {/* Badges de conteúdo */}
                      <div className="flex gap-1.5 flex-wrap justify-center">
                        {e.formulas.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {e.formulas.length} fórm.
                          </span>
                        )}
                        {e.exames.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            {e.exames.length} exam.
                          </span>
                        )}
                        {!temConteudo && (
                          <span className="text-[10px] text-muted-foreground/50">vazio</span>
                        )}
                      </div>

                      {/* Indicador ativo */}
                      {ativa && (
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-l-transparent border-r-transparent border-t-primary" />
                      )}
                    </button>

                    {/* Seta entre slots */}
                    {i < entregas.length - 1 && (
                      <div className="flex items-center px-1">
                        <div className="w-8 h-px bg-border/60" />
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40 -ml-1" />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Botão adicionar mais */}
              <div className="flex items-center pl-3">
                <button
                  type="button"
                  onClick={() => setNEntregas((n) => Math.min(24, n + 1))}
                  className="flex flex-col items-center gap-2 rounded-lg px-4 py-4 border border-dashed border-primary/30 hover:border-primary text-muted-foreground hover:text-primary transition-colors min-w-[80px]"
                >
                  <Plus className="w-6 h-6" />
                  <span className="text-[10px] uppercase tracking-widest">Adicionar</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── EDITOR DO SLOT ATIVO ──────────────────────────────────── */}
        {entrega && (
          <div className="border-t border-border/40 bg-muted/20 px-5 py-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Coluna esquerda — cabeçalho + fórmulas */}
              <div className="space-y-4">
                {/* Identificação da entrega */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Nome da Receita</label>
                    <input
                      className="field-engraved w-full text-sm"
                      value={entrega.nomeReceita}
                      onChange={(e) => updateEntrega(entrega.id, { nomeReceita: e.target.value })}
                      placeholder={`Receita ${entrega.numero}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Data de Liberação</label>
                    <input
                      type="date"
                      className="field-engraved w-full text-sm"
                      value={entrega.dataLiberacao}
                      onChange={(e) => updateEntrega(entrega.id, { dataLiberacao: e.target.value })}
                    />
                  </div>
                </div>

                {/* Fórmulas magistrais */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="bevel-3d text-[11px] px-2 py-0.5 uppercase tracking-widest inline-flex items-center gap-1.5">
                      <FlaskConical className="w-3.5 h-3.5" />
                      Fórmulas Magistrais
                    </div>
                    <span className="text-[11px] text-muted-foreground">{entrega.formulas.length} adicionada(s)</span>
                  </div>

                  {/* Cards de fórmulas */}
                  {entrega.formulas.map((f) => (
                    <div key={f.id} className="panel-3d-sub p-3 space-y-2 border-l-2 border-l-primary/40">
                      <div className="flex items-start justify-between gap-2">
                        <input
                          className="field-engraved flex-1 text-sm font-semibold"
                          value={f.nome}
                          onChange={(e) => updateFormula(entrega.id, f.id, { nome: e.target.value })}
                          placeholder="Nome da fórmula"
                        />
                        <button type="button" onClick={() => removeFormula(entrega.id, f.id)}
                          className="p-1.5 text-muted-foreground hover:text-destructive shrink-0">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Dose</label>
                          <input className="field-engraved w-full text-sm" value={f.dose}
                            onChange={(e) => updateFormula(entrega.id, f.id, { dose: e.target.value })}
                            placeholder="Ex: 500mg" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Via</label>
                          <select className="field-engraved w-full text-sm" value={f.via}
                            onChange={(e) => updateFormula(entrega.id, f.id, { via: e.target.value })}>
                            {VIAS.map((v) => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Posologia</label>
                        <input className="field-engraved w-full text-sm" value={f.posologia}
                          onChange={(e) => updateFormula(entrega.id, f.id, { posologia: e.target.value })}
                          placeholder="Ex: 1 cápsula pela manhã em jejum" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Observação</label>
                        <input className="field-engraved w-full text-sm" value={f.observacao}
                          onChange={(e) => updateFormula(entrega.id, f.id, { observacao: e.target.value })}
                          placeholder="Instruções adicionais…" />
                      </div>
                    </div>
                  ))}

                  {/* Busca do catálogo */}
                  <div className="concave-3d p-3 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        className="field-engraved w-full pl-8 text-sm"
                        placeholder="Buscar fórmula no catálogo…"
                        value={buscaFormula}
                        onChange={(e) => setBuscaFormula(e.target.value)}
                      />
                    </div>
                    {buscaFormula && catalogoFiltrado.length > 0 && (
                      <div className="space-y-1">
                        {catalogoFiltrado.map((cat) => (
                          <button key={cat.id} type="button"
                            onClick={() => addFormula(entrega.id, cat)}
                            className="w-full text-left px-3 py-2 hover:bg-primary/10 rounded text-sm flex justify-between items-center group transition-colors">
                            <span className="font-medium">{cat.nome}</span>
                            <Plus className="w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    )}
                    <button type="button"
                      onClick={() => addFormula(entrega.id)}
                      className="btn-3d-soft w-full gap-2 text-sm">
                      <Plus className="w-4 h-4" /> Fórmula em branco
                    </button>
                  </div>
                </div>
              </div>

              {/* Coluna direita — exames + salvar */}
              <div className="space-y-4">
                {/* Exames a solicitar */}
                <div className="space-y-3">
                  <div className="bevel-3d text-[11px] px-2 py-0.5 uppercase tracking-widest inline-flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5" />
                    Exames a Solicitar
                  </div>

                  {entrega.exames.length === 0 && (
                    <p className="text-sm text-muted-foreground italic text-center py-2">
                      Nenhum exame nesta entrega
                    </p>
                  )}
                  {entrega.exames.map((x) => (
                    <div key={x.id} className="flex items-center gap-2 panel-3d-sub px-3 py-2">
                      <span className="flex-1 text-sm font-medium">{x.nome}</span>
                      <button type="button" onClick={() => removeExame(entrega.id, x.id)}
                        className="p-1 text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {/* Busca de exame */}
                  <div className="concave-3d p-3 space-y-2">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input
                        className="field-engraved w-full pl-8 text-sm"
                        placeholder="Buscar ou digitar nome do exame…"
                        value={buscaExame}
                        onChange={(e) => setBuscaExame(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { addExame(entrega.id, buscaExame); } }}
                      />
                    </div>
                    {examesFiltrados.length > 0 && (
                      <div className="space-y-1">
                        {examesFiltrados.map((n) => (
                          <button key={n} type="button"
                            onClick={() => addExame(entrega.id, n)}
                            className="w-full text-left px-3 py-1.5 hover:bg-primary/10 rounded text-sm flex justify-between items-center group transition-colors">
                            <span>{n}</span>
                            <Plus className="w-3.5 h-3.5 text-primary opacity-0 group-hover:opacity-100" />
                          </button>
                        ))}
                      </div>
                    )}
                    <button type="button"
                      onClick={() => addExame(entrega.id, buscaExame)}
                      disabled={!buscaExame.trim()}
                      className="btn-3d-soft w-full gap-2 text-sm disabled:opacity-40">
                      <Plus className="w-4 h-4" /> Adicionar exame
                    </button>
                  </div>
                </div>

                {/* Separador + info útil */}
                <div className="panel-3d-sub p-3 space-y-2 text-sm">
                  <div className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Esta entrega em resumo</div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Data de liberação</span>
                    <span className="font-bold">{fmtData(entrega.dataLiberacao)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fórmulas magistrais</span>
                    <span className="font-bold text-emerald-700">{entrega.formulas.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Exames a solicitar</span>
                    <span className="font-bold text-amber-700">{entrega.exames.length}</span>
                  </div>
                  {entrega.numero < entregas.length && (
                    <div className="flex justify-between border-t border-border/30 pt-2 mt-1">
                      <span className="text-muted-foreground">Próxima entrega em</span>
                      <span className="font-bold">{frequenciaDias} dias ({fmtData(entregas[entrega.numero]?.dataLiberacao ?? "")})</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── FORMULÁRIO DE SALVAMENTO ──────────────────────────────── */}
        <div className="border-t border-border/40 px-5 py-4 bg-muted/10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="md:col-span-2 space-y-1">
              <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Nome desta Linha do Tempo *</label>
              <input
                className="field-engraved w-full"
                placeholder="Ex: Protocolo Capilar · 2026"
                value={nomeAgenda}
                onChange={(e) => setNomeAgenda(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Antecedência de Envio (dias)</label>
              <input type="number" min={1} max={30} value={diasAntecedencia}
                onChange={(e) => setDiasAntecedencia(parseInt(e.target.value) || 5)}
                className="field-engraved w-full" />
            </div>
            <div className="flex items-end gap-2">
              <Button
                className="btn-3d w-full gap-2"
                onClick={salvarLinha}
                disabled={salvando || !clienteSelId || !nomeAgenda.trim()}
              >
                {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar Linha do Tempo
              </Button>
            </div>
          </div>

          {/* Canais */}
          <div className="mt-3 flex gap-2 flex-wrap items-center">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Canais de entrega:</span>
            {CANAIS_TODOS.map((c) => {
              const on = canais.includes(c);
              return (
                <button key={c} type="button"
                  onClick={() => setCanais(on ? canais.filter((x) => x !== c) : [...canais, c])}
                  className={cn("px-2.5 py-1 rounded border text-[11px] uppercase tracking-wider font-semibold transition-colors",
                    on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          BLOCO 3 — LINHA DO TEMPO VISUAL
      ════════════════════════════════════════════════════════════════ */}
      <div className="panel-3d overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">Prévia — Linha do Tempo</span>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn-3d-soft p-1.5" onClick={() => scrollTimeline(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" className="btn-3d-soft p-1.5" onClick={() => scrollTimeline(1)}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div
          ref={timelineRef}
          className="overflow-x-auto px-8 py-8"
          style={{ scrollBehavior: "smooth" }}
        >
          {/* Trilho + nós */}
          <div className="relative" style={{ minWidth: Math.max(800, entregas.length * 200), height: 160 }}>
            {/* Linha horizontal */}
            <div className="absolute top-12 left-0 right-0 h-0.5 bg-primary/30" />

            {/* Nós */}
            {entregas.map((e, i) => {
              const pct = entregas.length === 1 ? 0.5 : i / (entregas.length - 1);
              const left = `${pct * 100}%`;
              const temFormulas = e.formulas.length > 0;
              const temExames = e.exames.length > 0;
              const temConteudo = temFormulas || temExames;
              const isAtivo = slotAtivo === e.id;
              return (
                <div key={e.id}
                  className="absolute flex flex-col items-center"
                  style={{ left, transform: "translateX(-50%)", top: 0, width: 160 }}
                >
                  {/* Número da entrega (acima) */}
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
                    E{e.numero}
                  </div>

                  {/* Círculo nó */}
                  <button type="button"
                    onClick={() => { setSlotAtivo(isAtivo ? null : e.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className={cn(
                      "w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-sm transition-all",
                      isAtivo
                        ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/30"
                        : temConteudo
                          ? "bg-background border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                          : "bg-muted border-border text-muted-foreground hover:border-primary/60",
                    )}>
                    {e.numero}
                  </button>

                  {/* Data */}
                  <div className="text-xs font-bold mt-1">{fmtData(e.dataLiberacao)}</div>

                  {/* Mini-card de conteúdo */}
                  {temConteudo && (
                    <div className="mt-2 panel-3d-sub px-2 py-1.5 text-center w-full max-w-[140px] space-y-0.5">
                      {temFormulas && (
                        <div className="text-[11px] font-semibold text-emerald-700">
                          {e.formulas.length} fórmula{e.formulas.length !== 1 ? "s" : ""}
                        </div>
                      )}
                      {temExames && (
                        <div className="text-[11px] font-semibold text-amber-700">
                          {e.exames.length} exame{e.exames.length !== 1 ? "s" : ""}
                        </div>
                      )}
                      <div className="text-[10px] text-muted-foreground truncate max-w-full px-1">{e.nomeReceita}</div>
                    </div>
                  )}
                  {!temConteudo && (
                    <div className="mt-2 text-[10px] text-muted-foreground/50 italic text-center">vazio</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
          BLOCO 4 — AGENDAS SALVAS (ferramenta original)
      ════════════════════════════════════════════════════════════════ */}
      <div className="panel-3d overflow-hidden">
        {/* Cabeçalho colapsável */}
        <div className="flex items-center justify-between px-5 py-4">
          <div
            role="button" tabIndex={0}
            onClick={() => setAgendasAbertas((v) => !v)}
            onKeyDown={(e) => e.key === "Enter" && setAgendasAbertas((v) => !v)}
            className="flex items-center gap-3 cursor-pointer flex-1 select-none"
          >
            <Calendar className="w-4 h-4 text-primary" />
            <span className="text-[11px] uppercase tracking-widest font-bold text-muted-foreground">
              Agendas Salvas {clienteSel ? `— ${clienteSel.name}` : ""}
            </span>
            {agendas.length > 0 && (
              <span className="bevel-3d text-xs px-2 py-0.5">{agendas.length}</span>
            )}
            <span className="ml-1 text-muted-foreground">
              {agendasAbertas ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </span>
          </div>
          <Button
            className="btn-3d-soft gap-1 text-xs px-3 py-1.5 h-auto shrink-0"
            onClick={() => void processarWorker()}
            disabled={processando}
          >
            {processando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Processar Hoje
          </Button>
        </div>

        {agendasAbertas && (
          <div className="border-t border-border/40 px-5 py-4 space-y-3">
            {!clienteSel && (
              <p className="text-sm text-muted-foreground italic text-center py-4">Selecione um cliente para ver as agendas salvas.</p>
            )}
            {clienteSel && carregando && (
              <div className="flex items-center gap-2 justify-center py-6 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            )}
            {clienteSel && !carregando && agendas.length === 0 && (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                Nenhuma agenda salva para este cliente. Use o construtor acima.
              </p>
            )}
            {agendas.map((ag) => (
              <AgendaCard key={ag.id} agenda={ag}
                expandida={expandidas.has(ag.id)}
                onToggle={() => setExpandidas((prev) => {
                  const next = new Set(prev);
                  if (next.has(ag.id)) next.delete(ag.id); else next.add(ag.id);
                  return next;
                })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Sub-componente: card de agenda salva (compacto)
// ══════════════════════════════════════════════════════════════════════════════
function AgendaCard({ agenda, expandida, onToggle }: {
  agenda: Agenda;
  expandida: boolean;
  onToggle: () => void;
}) {
  const slots: Slot[] = agenda.slots ?? [];
  const temSlots = slots.length > 0;

  const statusBadge = (s: Slot["status"]) => {
    const map: Record<string, string> = {
      AGUARDANDO: "text-slate-500 border-slate-300",
      LIBERADA:   "text-sky-700  border-sky-400",
      ENTREGUE:   "text-emerald-700 border-emerald-400",
      ERRO:       "text-rose-700 border-rose-400",
    };
    return map[s] ?? "text-muted-foreground";
  };

  return (
    <div className="panel-3d-sub overflow-hidden">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/10 transition-colors">
        <div className="flex items-center gap-3">
          <div className={cn("w-2 h-8 rounded-full", agenda.ativo ? "bg-emerald-500" : "bg-slate-300")} />
          <div className="text-left">
            <div className="font-semibold text-sm">{agenda.nome}</div>
            <div className="text-[11px] text-muted-foreground">
              A cada {agenda.frequenciaPadraoDias}d · {slots.length} slot(s)
              {agenda.proximaLiberacao && ` · próxima ${agenda.proximaLiberacao}`}
            </div>
          </div>
        </div>
        {expandida ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                   : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {expandida && (
        <div className="border-t border-border/30 px-4 py-3 space-y-2">
          {!temSlots && <p className="text-sm text-muted-foreground italic">Sem receitas nesta agenda.</p>}
          {slots.map((s) => (
            <div key={s.id} className={cn("flex items-center gap-3 px-3 py-2 rounded border text-sm", statusBadge(s.status))}>
              <span className="shrink-0 font-mono text-xs border px-1.5 py-0.5 rounded">{s.status}</span>
              <span className="font-medium flex-1">{s.nome}</span>
              <span className="text-muted-foreground text-xs">{s.dataLiberacao}</span>
              {s.pdfUrl && (
                <a href={s.pdfUrl} target="_blank" rel="noreferrer"
                  className="text-primary hover:underline text-xs">PDF</a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
