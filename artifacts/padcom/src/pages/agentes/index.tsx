/**
 * PAXTER — Agentes Virtuais Hub
 * Catálogo completo dos 20 agentes (10 PAWARDS + 10 Manager).
 * 7 abas: Catálogo | Identidade | Personalidade | Capacidades | Motor | Narrativas | Frases
 */

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Bot, Users, Brain, Zap, MessageSquare, BookOpen, AlignLeft,
  ChevronRight, Shield, Clock, RefreshCw, Edit2, Save, X,
  CheckCircle2, XCircle, User, Wifi, WifiOff, Play, Pause,
  Star, AlertTriangle, Check, ChevronDown, ChevronUp,
  Send, Cpu, Sparkles, Activity, RotateCcw, Radio,
  Thermometer, Copy, ThumbsUp, ThumbsDown, Hash, TrendingUp,
  DollarSign, Trash2, Plus, Settings, Globe, Lock, Crown,
  Award, Target, BarChart2, MessageCircle, Sliders, Download,
  ChevronLeft, Search, PlusCircle, LayoutGrid, Layers, Loader2,
  Webhook, Smartphone, ExternalLink, ToggleLeft, ToggleRight, Key,
} from "lucide-react";

// ─── Helper ──────────────────────────────────────────────────────────────────

const BASE = import.meta.env.BASE_URL ?? "/";
async function apiFetch(path: string, opts?: RequestInit) {
  const token = localStorage.getItem("collaborator_token") ?? "";
  const res = await fetch(`${BASE}api${path}`, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Agente {
  id: number;
  codigo: string;
  nome: string;
  cargo: string;
  grupo: string;
  emoji: string;
  cor_hex: string;
  sla_minutos: number;
  status_prontidao: string;
  tom_voz: string | null;
  nao_faz: string | null;
  regras_tdah: string | null;
  perfil_mensagem: string | null;
  frases_escalada: string[];
  descricao: string | null;
  // joins
  formalidade?: number;
  empatia?: number;
  autoridade?: number;
  velocidade_resposta?: number;
  verbosidade?: number;
  clareza?: number;
  proatividade?: number;
  threshold_escalada?: number;
  criatividade?: number;
  rigor_protocolo?: number;
  tolerancia_ambiguidade?: number;
  tom_emocional?: number;
  foco_tarefa?: number;
  adaptabilidade?: number;
  // capacidades
  pode_whatsapp?: boolean;
  pode_email?: boolean;
  pode_prontuario?: boolean;
  pode_criar_agendamento?: boolean;
  pode_ver_financeiro?: boolean;
  pode_criar_demanda?: boolean;
  pode_escalar?: boolean;
  pode_ver_exames?: boolean;
  pode_editar_protocolo?: boolean;
  pode_ver_ras?: boolean;
  pode_enviar_lembrete?: boolean;
  pode_criar_cobranca?: boolean;
  pode_acesso_total?: boolean;
}

interface Frase { id: number; tipo_frase: string; texto: string; agente_id: number; agente_nome?: string; agente_codigo?: string; cor_hex?: string; }
interface Template { id: number; tipo_template: string; template_texto: string; max_chars: number; estilo: string; agente_nome?: string; cor_hex?: string; emoji?: string; }
interface Narrativa { id: number; titulo: string; contexto: string | null; roteiro: Array<{ papel: string; texto: string }>; agente_id: number; agente_nome?: string; cor_hex?: string; emoji?: string; cargo?: string; }

// ─── Constantes visuais ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cor: string; icon: typeof Wifi }> = {
  disponivel:   { label: "Disponível",   cor: "text-emerald-400", icon: Wifi      },
  ocupado:      { label: "Ocupado",       cor: "text-amber-400",   icon: Pause     },
  pausa:        { label: "Pausa",         cor: "text-sky-400",     icon: Pause     },
  treinamento:  { label: "Treinamento",   cor: "text-purple-400",  icon: Brain     },
  standby:      { label: "Stand-by",      cor: "text-zinc-400",    icon: WifiOff   },
  desativado:   { label: "Desativado",    cor: "text-red-400",     icon: WifiOff   },
};

const GRUPO_CONFIG: Record<string, { label: string; cor: string }> = {
  pawards: { label: "PAWARDS",  cor: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  manager: { label: "MANAGER",  cor: "bg-sky-500/20 text-sky-400 border-sky-500/30"      },
};

const DIM_LABELS: Record<string, string> = {
  formalidade:            "Formalidade",
  empatia:                "Empatia",
  autoridade:             "Autoridade",
  velocidade_resposta:    "Velocidade",
  verbosidade:            "Verbosidade",
  clareza:                "Clareza",
  proatividade:           "Proatividade",
  threshold_escalada:     "Limiar Escalada",
  criatividade:           "Criatividade",
  rigor_protocolo:        "Rigor de Protocolo",
  tolerancia_ambiguidade: "Tolerância Ambiguidade",
  tom_emocional:          "Tom Emocional",
  foco_tarefa:            "Foco na Tarefa",
  adaptabilidade:         "Adaptabilidade",
};
const DIM_KEYS = Object.keys(DIM_LABELS);

const CAP_LABELS: Record<string, string> = {
  pode_whatsapp:          "WhatsApp",
  pode_email:             "E-mail",
  pode_prontuario:        "Prontuário",
  pode_criar_agendamento: "Criar Agenda",
  pode_ver_financeiro:    "Ver Financeiro",
  pode_criar_demanda:     "Criar Demanda",
  pode_escalar:           "Escalar",
  pode_ver_exames:        "Ver Exames",
  pode_editar_protocolo:  "Editar Protocolo",
  pode_ver_ras:           "Ver RAS",
  pode_enviar_lembrete:   "Lembrete",
  pode_criar_cobranca:    "Criar Cobrança",
  pode_acesso_total:      "Acesso Total",
};
const CAP_KEYS = Object.keys(CAP_LABELS);

const TIPO_FRASE_CONFIG: Record<string, { label: string; cor: string }> = {
  abertura:     { label: "Abertura",     cor: "bg-sky-500/20 text-sky-400 border-sky-500/30"       },
  encerramento: { label: "Encerramento", cor: "bg-slate-500/20 text-slate-400 border-slate-500/30"  },
  escalada:     { label: "Escalada",     cor: "bg-red-500/20 text-red-400 border-red-500/30"        },
  confirmacao:  { label: "Confirmação",  cor: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  recusa:       { label: "Recusa",       cor: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  empatia:      { label: "Empatia",      cor: "bg-pink-500/20 text-pink-400 border-pink-500/30"     },
  lembrete:     { label: "Lembrete",     cor: "bg-amber-500/20 text-amber-400 border-amber-500/30"  },
  alerta:       { label: "Alerta",       cor: "bg-rose-500/20 text-rose-400 border-rose-500/30"     },
  boas_vindas:  { label: "Boas-vindas",  cor: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
};

const TEMPLATE_LABEL: Record<string, string> = {
  whatsapp_lembrete: "WhatsApp — Lembrete",
  email_pre_sessao:  "E-mail Pré-sessão",
  email_pos_sessao:  "E-mail Pós-sessão",
  alerta_interno:    "Alerta Interno",
  resposta_duvida:   "Resposta a Dúvida",
  escalamento:       "Escalamento",
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, cor: "text-zinc-400", icon: WifiOff };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest ${cfg.cor}`}>
      <Icon className="w-2.5 h-2.5" />{cfg.label}
    </span>
  );
}

// ─── Onda A: BaraDim interativo (hover + click + save) ───────────────────────
function BaraDim({
  valor, cor, onSave,
}: { valor: number; cor: string; onSave?: (novoValor: number) => Promise<void> }) {
  const [hovered, setHovered] = useState(0);
  const [atual, setAtual] = useState(valor);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setAtual(valor); }, [valor]);

  async function handleClick(n: number) {
    if (!onSave) return;
    const anterior = atual;
    setAtual(n);
    setSaving(true);
    try {
      await onSave(n);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setAtual(anterior);
    } finally {
      setSaving(false);
    }
  }

  const display = onSave ? (hovered || atual) : atual;

  return (
    <div className="flex items-center gap-1.5" onMouseLeave={() => setHovered(0)}>
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map(i => (
          <div
            key={i}
            onClick={() => handleClick(i)}
            onMouseEnter={() => onSave && setHovered(i)}
            className={`w-2.5 h-2.5 rounded-[2px] transition-all ${onSave ? "cursor-pointer hover:scale-125" : ""}`}
            style={{
              backgroundColor: i <= display ? cor : "rgba(255,255,255,0.08)",
              opacity: saving ? 0.5 : 1,
              outline: hovered > 0 && i <= hovered && onSave ? `1px solid ${cor}88` : "none",
            }}
          />
        ))}
      </div>
      <span className="text-[9px] font-mono w-6" style={{ color: saved ? "#10b981" : "rgba(255,255,255,0.4)" }}>
        {saved ? "✓" : `${atual}/5`}
      </span>
    </div>
  );
}

function AvatarAgente({ a, size = "md" }: { a: Pick<Agente, "emoji" | "cor_hex" | "nome">; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-8 h-8 text-base", md: "w-11 h-11 text-xl", lg: "w-16 h-16 text-3xl" };
  return (
    <div className={`${sizes[size]} rounded-[6px] flex items-center justify-center font-bold shrink-0`}
      style={{ backgroundColor: a.cor_hex + "33", border: `2px solid ${a.cor_hex}55` }}>
      {a.emoji}
    </div>
  );
}

// ─── Aba 1: Catálogo ─────────────────────────────────────────────────────────

function AbaCatalogo({ agentes, onSelect }: { agentes: Agente[]; onSelect: (a: Agente) => void }) {
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [filtroCargo, setFiltroCargo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");

  const cargos = [...new Set(agentes.map(a => a.cargo))].sort();
  const lista = agentes.filter(a =>
    (!filtroGrupo || a.grupo === filtroGrupo) &&
    (!filtroCargo || a.cargo === filtroCargo) &&
    (!filtroStatus || a.status_prontidao === filtroStatus)
  );
  const grupos = { pawards: lista.filter(a => a.grupo === "pawards"), manager: lista.filter(a => a.grupo === "manager") };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="panel-3d rounded-[6px] px-4 py-2.5 flex flex-wrap gap-3 items-center">
        <Bot className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {lista.length} de {agentes.length} agentes
        </span>
        <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)}
          className="ml-auto text-xs bg-background border border-border rounded-[4px] px-2 py-1">
          <option value="">Todos os grupos</option>
          <option value="pawards">PAWARDS</option>
          <option value="manager">MANAGER</option>
        </select>
        <select value={filtroCargo} onChange={e => setFiltroCargo(e.target.value)}
          className="text-xs bg-background border border-border rounded-[4px] px-2 py-1">
          <option value="">Todos os cargos</option>
          {cargos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          className="text-xs bg-background border border-border rounded-[4px] px-2 py-1">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Grid por grupo */}
      {(["pawards","manager"] as const).map(g => {
        const lista_g = grupos[g];
        if (!lista_g.length) return null;
        const cfg = GRUPO_CONFIG[g];
        return (
          <div key={g}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${cfg.cor}`}>
                {cfg.label}
              </span>
              <span className="text-xs text-muted-foreground">{lista_g.length} agentes</span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {lista_g.map(a => (
                <button key={a.id} onClick={() => onSelect(a)}
                  className="panel-3d rounded-[6px] p-3 text-left hover:border-sidebar-primary/40 transition-all group"
                  style={{ borderLeftWidth: 3, borderLeftColor: a.cor_hex }}>
                  <div className="flex items-start gap-2.5 mb-2.5">
                    <AvatarAgente a={a} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-bold leading-tight truncate">{a.nome}</p>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{a.cargo}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <StatusPill status={a.status_prontidao} />
                    <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" /> {a.sla_minutos}min
                    </span>
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">
                    {a.descricao}
                  </div>
                  <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between">
                    <span className="text-[9px] font-mono text-muted-foreground/60">{a.codigo}</span>
                    <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-sidebar-primary transition-colors" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Aba 2: Identidade ───────────────────────────────────────────────────────

function AbaIdentidade({ agentes }: { agentes: Agente[] }) {
  const [agenteId, setAgenteId] = useState<number | null>(agentes[0]?.id ?? null);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState<Partial<Agente>>({});

  const agente = agentes.find(a => a.id === agenteId);

  useEffect(() => { if (agente) setForm(agente); }, [agente]);

  async function salvar() {
    await apiFetch(`/agentes/${agenteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setEditando(false);
  }

  if (!agente) return null;
  const escalada: string[] = Array.isArray(agente.frases_escalada) ? agente.frases_escalada : [];

  return (
    <div className="space-y-4">
      {/* Seletor */}
      <div className="panel-3d rounded-[6px] px-4 py-2.5 flex flex-wrap items-center gap-3">
        <User className="w-4 h-4 text-amber-400" />
        <select value={agenteId ?? ""} onChange={e => { setAgenteId(Number(e.target.value)); setEditando(false); }}
          className="text-sm bg-background border border-border rounded-[4px] px-2 py-1.5 flex-1 max-w-xs">
          {agentes.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.nome} — {a.cargo}</option>)}
        </select>
        <div className="ml-auto flex gap-2">
          {editando ? (
            <>
              <button onClick={salvar} className="btn-3d-soft text-xs px-3 py-1.5 text-emerald-400 flex items-center gap-1"><Save className="w-3 h-3"/>Salvar</button>
              <button onClick={() => setEditando(false)} className="btn-3d-soft text-xs px-3 py-1.5 text-red-400 flex items-center gap-1"><X className="w-3 h-3"/>Cancelar</button>
            </>
          ) : (
            <button onClick={() => setEditando(true)} className="btn-3d-soft text-xs px-3 py-1.5 flex items-center gap-1"><Edit2 className="w-3 h-3"/>Editar</button>
          )}
        </div>
      </div>

      {/* Header do agente */}
      <div className="panel-3d rounded-[6px] p-4 flex items-start gap-4"
        style={{ borderLeftWidth: 4, borderLeftColor: agente.cor_hex }}>
        <AvatarAgente a={agente} size="lg" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold">{agente.nome}</h2>
            <span className={`text-[10px] font-black uppercase px-1.5 py-0.5 rounded border ${GRUPO_CONFIG[agente.grupo]?.cor}`}>
              {agente.grupo.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{agente.cargo}</p>
          <div className="flex items-center gap-4 mt-2">
            <StatusPill status={agente.status_prontidao} />
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> SLA: {agente.sla_minutos} minutos
            </span>
            <span className="text-[9px] font-mono text-muted-foreground/60">{agente.codigo}</span>
          </div>
        </div>
      </div>

      {/* Grid de identidade */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tom de Voz */}
        <div className="panel-3d rounded-[6px] p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Tom de Voz</p>
          {editando ? (
            <textarea value={form.tom_voz ?? ""} onChange={e => setForm(f => ({...f, tom_voz: e.target.value}))}
              className="w-full text-sm bg-background border border-border rounded-[4px] p-2 h-24 resize-none" />
          ) : (
            <p className="text-sm leading-relaxed">{agente.tom_voz ?? "—"}</p>
          )}
        </div>

        {/* Não Faz */}
        <div className="panel-3d rounded-[6px] p-4 space-y-2" style={{ borderLeftWidth: 3, borderLeftColor: "#ef4444" }}>
          <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Não Faz (limites rígidos)</p>
          {editando ? (
            <textarea value={form.nao_faz ?? ""} onChange={e => setForm(f => ({...f, nao_faz: e.target.value}))}
              className="w-full text-sm bg-background border border-border rounded-[4px] p-2 h-24 resize-none" />
          ) : (
            <p className="text-sm leading-relaxed">{agente.nao_faz ?? "—"}</p>
          )}
        </div>

        {/* Regras TDAH+TOC */}
        <div className="panel-3d rounded-[6px] p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-purple-400">Regras TDAH + TOC</p>
          {editando ? (
            <textarea value={form.regras_tdah ?? ""} onChange={e => setForm(f => ({...f, regras_tdah: e.target.value}))}
              className="w-full text-sm bg-background border border-border rounded-[4px] p-2 h-24 resize-none" />
          ) : (
            <p className="text-sm leading-relaxed">{agente.regras_tdah ?? "—"}</p>
          )}
        </div>

        {/* Perfil de Mensagem */}
        <div className="panel-3d rounded-[6px] p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-400">Perfil de Mensagem</p>
          {editando ? (
            <textarea value={form.perfil_mensagem ?? ""} onChange={e => setForm(f => ({...f, perfil_mensagem: e.target.value}))}
              className="w-full text-sm bg-background border border-border rounded-[4px] p-2 h-24 resize-none" />
          ) : (
            <p className="text-sm leading-relaxed">{agente.perfil_mensagem ?? "—"}</p>
          )}
        </div>
      </div>

      {/* Frases de Escalada */}
      <div className="panel-3d rounded-[6px] p-4 space-y-2" style={{ borderLeftWidth: 3, borderLeftColor: "#f97316" }}>
        <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">Frases de Escalada</p>
        <div className="space-y-1.5">
          {escalada.length ? escalada.map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <AlertTriangle className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
              <span>"{f}"</span>
            </div>
          )) : <p className="text-sm text-muted-foreground">—</p>}
        </div>
      </div>

      {/* Descrição */}
      <div className="panel-3d rounded-[6px] p-4 space-y-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Descrição</p>
        <p className="text-sm leading-relaxed">{agente.descricao ?? "—"}</p>
      </div>
    </div>
  );
}

// ─── Aba 3: Personalidade ────────────────────────────────────────────────────

function AbaPersonalidade({ agentes, onReload }: { agentes: Agente[]; onReload: () => void }) {
  const [agenteSel, setAgenteSel] = useState<number | null>(null);
  const [localAgentes, setLocalAgentes] = useState<Agente[]>(agentes);

  useEffect(() => { setLocalAgentes(agentes); }, [agentes]);

  const lista = agenteSel ? localAgentes.filter(a => a.id === agenteSel) : localAgentes;

  async function salvarDim(agenteId: number, dim: string, valor: number) {
    // Optimistic update local
    setLocalAgentes(prev => prev.map(a =>
      a.id === agenteId ? { ...a, [dim]: valor } : a
    ));
    const ok = await apiFetch(`/agentes-personalidade/${agenteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [dim]: valor }),
    });
    if (!ok) {
      // Reverte e recarrega
      onReload();
    }
  }

  return (
    <div className="space-y-4">
      <div className="panel-3d rounded-[6px] px-4 py-2.5 flex items-center gap-3">
        <Brain className="w-4 h-4 text-purple-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          14 dimensões de personalidade · escala 1–5 · clique para editar
        </span>
        <select value={agenteSel ?? ""} onChange={e => setAgenteSel(e.target.value ? Number(e.target.value) : null)}
          className="ml-auto text-xs bg-background border border-border rounded-[4px] px-2 py-1">
          <option value="">Todos os agentes</option>
          {agentes.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.nome}</option>)}
        </select>
      </div>

      {/* Tabela de dimensões — editável por clique */}
      <div className="panel-3d rounded-[6px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground w-40 sticky left-0 bg-card">Agente</th>
                {DIM_KEYS.map(k => (
                  <th key={k} className="text-center px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground min-w-[90px]">
                    {DIM_LABELS[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((a, idx) => (
                <tr key={a.id} className={`border-b border-border/50 ${idx % 2 === 0 ? "bg-muted/10" : ""}`}>
                  <td className="px-3 py-2 sticky left-0 bg-card border-r border-border/30">
                    <div className="flex items-center gap-2">
                      <AvatarAgente a={a} size="sm" />
                      <div>
                        <p className="text-[11px] font-semibold">{a.nome}</p>
                        <p className="text-[9px] text-muted-foreground">{a.cargo}</p>
                      </div>
                    </div>
                  </td>
                  {DIM_KEYS.map(k => {
                    const val = (a[k as keyof Agente] as number) ?? 3;
                    return (
                      <td key={k} className="px-2 py-2 text-center">
                        <BaraDim
                          valor={val}
                          cor={a.cor_hex}
                          onSave={(novo) => salvarDim(a.id, k, novo)}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legenda */}
      <div className="text-[10px] text-muted-foreground flex flex-wrap gap-4">
        {[1,2,3,4,5].map(n => (
          <span key={n} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-[2px] bg-sidebar-primary" style={{ opacity: n * 0.2 }} />
            {n} — {["Mínimo","Baixo","Médio","Alto","Máximo"][n-1]}
          </span>
        ))}
        <span className="ml-auto text-muted-foreground/60">✏ Passe o mouse e clique para editar</span>
      </div>
    </div>
  );
}

// ─── Aba 4: Capacidades ──────────────────────────────────────────────────────

function AbaCapacidades({ agentes, onReload }: { agentes: Agente[]; onReload: () => void }) {
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [caps, setCaps] = useState<Record<number, Partial<Agente>>>({});

  async function toggleCap(agente: Agente, cap: string) {
    const curVal = (agente[cap as keyof Agente] as boolean) ?? false;
    await apiFetch(`/agentes-capacidades/${agente.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [cap]: !curVal }),
    });
    onReload();
  }

  return (
    <div className="space-y-4">
      <div className="panel-3d rounded-[6px] px-4 py-2.5 flex items-center gap-3">
        <Shield className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          13 capacidades booleanas · clique para editar
        </span>
      </div>

      <div className="panel-3d rounded-[6px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground w-44 sticky left-0 bg-card">Agente</th>
                {CAP_KEYS.map(k => (
                  <th key={k} className="text-center px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground min-w-[72px]">
                    {CAP_LABELS[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agentes.map((a, idx) => (
                <tr key={a.id} className={`border-b border-border/50 ${idx % 2 === 0 ? "bg-muted/10" : ""}`}>
                  <td className="px-3 py-2 sticky left-0 bg-card border-r border-border">
                    <div className="flex items-center gap-2">
                      <AvatarAgente a={a} size="sm" />
                      <div>
                        <p className="text-[11px] font-semibold">{a.nome}</p>
                        <p className="text-[9px] text-muted-foreground">{a.grupo.toUpperCase()}</p>
                      </div>
                    </div>
                  </td>
                  {CAP_KEYS.map(k => {
                    const val = (a[k as keyof Agente] as boolean) ?? false;
                    return (
                      <td key={k} className="px-2 py-2 text-center">
                        <button onClick={() => toggleCap(a, k)}
                          className={`w-6 h-6 rounded-[4px] flex items-center justify-center mx-auto transition-all ${
                            val ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30" : "bg-red-500/10 text-red-400/50 hover:bg-red-500/20"
                          }`}>
                          {val ? <Check className="w-3.5 h-3.5" /> : <X className="w-3 h-3" />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        <Check className="w-3 h-3 inline text-emerald-400" /> = capacidade ativa ·
        <X className="w-3 h-3 inline text-red-400/60 ml-1" /> = bloqueado · Clique para alterar
      </p>
    </div>
  );
}

// ─── Aba 5: Motor de Escrita ─────────────────────────────────────────────────

function AbaMotor({ agentes }: { agentes: Agente[] }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [agenteId, setAgenteId] = useState<number | null>(null);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [editTexto, setEditTexto] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(`/agentes-motor${agenteId ? `?agente_id=${agenteId}` : ""}`);
    setTemplates(r?.items ?? []);
    setLoading(false);
  }, [agenteId]);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvarTemplate(id: number) {
    await apiFetch(`/agentes-motor/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_texto: editTexto }),
    });
    setEditandoId(null);
    carregar();
  }

  return (
    <div className="space-y-4">
      <div className="panel-3d rounded-[6px] px-4 py-2.5 flex flex-wrap items-center gap-3">
        <Zap className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Motor de Escrita — templates por agente
        </span>
        <select value={agenteId ?? ""} onChange={e => setAgenteId(e.target.value ? Number(e.target.value) : null)}
          className="ml-auto text-xs bg-background border border-border rounded-[4px] px-2 py-1">
          <option value="">Todos os agentes</option>
          {agentes.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.nome}</option>)}
        </select>
        <button onClick={carregar} className="btn-3d-soft px-3 py-1 text-xs flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Atualizar
        </button>
      </div>

      {loading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando templates…</p>}
      {!loading && templates.length === 0 && (
        <div className="panel-3d rounded-[6px] p-8 text-center text-muted-foreground text-sm">
          Nenhum template cadastrado ainda.
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {templates.map(t => (
            <div key={t.id} className="panel-3d rounded-[6px] p-3 space-y-2"
              style={{ borderLeftWidth: 3, borderLeftColor: t.cor_hex ?? "#45B8CC" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span>{t.emoji}</span>
                  <span className="text-[10px] font-bold">{t.agente_nome}</span>
                  <span className="text-[9px] text-muted-foreground px-1.5 py-0.5 bg-muted rounded">
                    {TEMPLATE_LABEL[t.tipo_template] ?? t.tipo_template}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-muted-foreground">{t.max_chars} chars</span>
                  {editandoId === t.id ? (
                    <>
                      <button onClick={() => salvarTemplate(t.id)} className="text-emerald-400 p-1"><Save className="w-3 h-3" /></button>
                      <button onClick={() => setEditandoId(null)} className="text-red-400 p-1"><X className="w-3 h-3" /></button>
                    </>
                  ) : (
                    <button onClick={() => { setEditandoId(t.id); setEditTexto(t.template_texto); }}
                      className="text-muted-foreground hover:text-foreground p-1"><Edit2 className="w-3 h-3" /></button>
                  )}
                </div>
              </div>
              {editandoId === t.id ? (
                <textarea value={editTexto} onChange={e => setEditTexto(e.target.value)}
                  className="w-full text-xs bg-background border border-border rounded-[4px] p-2 h-28 resize-none font-mono" />
              ) : (
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed bg-muted/20 rounded-[4px] p-2">
                  {t.template_texto}
                </pre>
              )}
              <div className="text-[9px] text-muted-foreground/60">
                Estilo: {t.estilo}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Aba 6: Narrativas ───────────────────────────────────────────────────────

function AbaNarrativas({ agentes }: { agentes: Agente[] }) {
  const [narrativas, setNarrativas] = useState<Narrativa[]>([]);
  const [loading, setLoading] = useState(true);
  const [agenteId, setAgenteId] = useState<number | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch(`/agentes-narrativas${agenteId ? `?agente_id=${agenteId}` : ""}`);
    setNarrativas(r?.items ?? []);
    setLoading(false);
  }, [agenteId]);

  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="space-y-4">
      <div className="panel-3d rounded-[6px] px-4 py-2.5 flex flex-wrap items-center gap-3">
        <BookOpen className="w-4 h-4 text-sky-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Narrativas — roteiros de conversa completos
        </span>
        <select value={agenteId ?? ""} onChange={e => setAgenteId(e.target.value ? Number(e.target.value) : null)}
          className="ml-auto text-xs bg-background border border-border rounded-[4px] px-2 py-1">
          <option value="">Todos os agentes</option>
          {agentes.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.nome}</option>)}
        </select>
      </div>

      {loading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando narrativas…</p>}
      {!loading && narrativas.length === 0 && (
        <div className="panel-3d rounded-[6px] p-8 text-center text-muted-foreground text-sm">
          Nenhuma narrativa cadastrada.
        </div>
      )}

      <div className="space-y-3">
        {narrativas.map(n => {
          const roteiro: Array<{ papel: string; texto: string }> = Array.isArray(n.roteiro) ? n.roteiro : [];
          const isAberta = aberta === n.id;
          return (
            <div key={n.id} className="panel-3d rounded-[6px] overflow-hidden"
              style={{ borderLeftWidth: 3, borderLeftColor: n.cor_hex ?? "#45B8CC" }}>
              <button className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors"
                onClick={() => setAberta(isAberta ? null : n.id)}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{n.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold">{n.titulo}</p>
                    <p className="text-[10px] text-muted-foreground">{n.agente_nome} · {n.cargo} · {roteiro.length} turnos</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {n.contexto && <span className="text-[10px] text-muted-foreground italic max-w-xs truncate hidden sm:block">{n.contexto}</span>}
                  {isAberta ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>
              {isAberta && (
                <div className="px-4 pb-4 space-y-2 border-t border-border">
                  {n.contexto && (
                    <p className="text-[11px] text-muted-foreground italic mt-3 pb-2 border-b border-border">
                      Contexto: {n.contexto}
                    </p>
                  )}
                  {roteiro.map((linha, i) => (
                    <div key={i} className={`flex gap-2 ${linha.papel === "agente" ? "" : "flex-row-reverse"}`}>
                      <div className={`text-[9px] font-black uppercase shrink-0 mt-1.5 ${linha.papel === "agente" ? "text-sidebar-primary" : "text-amber-400"}`}>
                        {linha.papel === "agente" ? (n.emoji ?? "🤖") : "👤"}
                      </div>
                      <div className={`max-w-[75%] rounded-[6px] px-3 py-2 text-[12px] leading-relaxed ${
                        linha.papel === "agente"
                          ? "bg-sidebar-primary/10 text-foreground"
                          : "bg-amber-500/10 text-foreground ml-auto"
                      }`}>
                        {linha.texto}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Aba 7: Frases-Base ──────────────────────────────────────────────────────

function AbaFrases({ agentes }: { agentes: Agente[] }) {
  const [frases, setFrases] = useState<Frase[]>([]);
  const [loading, setLoading] = useState(true);
  const [agenteId, setAgenteId] = useState<number | null>(null);
  const [tipoSel, setTipoSel] = useState("");
  const [novaTexto, setNovaTexto] = useState("");
  const [novoTipo, setNovoTipo] = useState("abertura");
  const [adicionando, setAdicionando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (agenteId) params.set("agente_id", String(agenteId));
    if (tipoSel) params.set("tipo", tipoSel);
    const r = await apiFetch(`/agentes-frases?${params}`);
    setFrases(r?.items ?? []);
    setLoading(false);
  }, [agenteId, tipoSel]);

  useEffect(() => { carregar(); }, [carregar]);

  async function adicionarFrase() {
    if (!agenteId || !novaTexto.trim()) return;
    await apiFetch("/agentes-frases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agente_id: agenteId, tipo_frase: novoTipo, texto: novaTexto.trim() }),
    });
    setNovaTexto("");
    setAdicionando(false);
    carregar();
  }

  async function desativarFrase(id: number) {
    await apiFetch(`/agentes-frases/${id}`, { method: "DELETE" });
    carregar();
  }

  const porTipo = Object.entries(TIPO_FRASE_CONFIG).map(([key, cfg]) => ({
    key, cfg, lista: frases.filter(f => f.tipo_frase === key),
  })).filter(g => g.lista.length > 0);

  return (
    <div className="space-y-4">
      <div className="panel-3d rounded-[6px] px-4 py-2.5 flex flex-wrap items-center gap-3">
        <AlignLeft className="w-4 h-4 text-pink-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Frases-Base — {frases.length} frases ativas
        </span>
        <select value={agenteId ?? ""} onChange={e => setAgenteId(e.target.value ? Number(e.target.value) : null)}
          className="ml-auto text-xs bg-background border border-border rounded-[4px] px-2 py-1">
          <option value="">Todos os agentes</option>
          {agentes.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.nome}</option>)}
        </select>
        <select value={tipoSel} onChange={e => setTipoSel(e.target.value)}
          className="text-xs bg-background border border-border rounded-[4px] px-2 py-1">
          <option value="">Todos os tipos</option>
          {Object.entries(TIPO_FRASE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={() => setAdicionando(!adicionando)}
          className="btn-3d-soft px-3 py-1 text-xs text-amber-400 flex items-center gap-1">
          + Nova
        </button>
      </div>

      {/* Formulário de nova frase */}
      {adicionando && (
        <div className="panel-3d rounded-[6px] p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400">Nova Frase-Base</p>
          <div className="flex gap-2">
            <select value={novoTipo} onChange={e => setNovoTipo(e.target.value)}
              className="text-xs bg-background border border-border rounded-[4px] px-2 py-1.5">
              {Object.entries(TIPO_FRASE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {!agenteId && <span className="text-xs text-amber-400">Selecione um agente primeiro</span>}
          </div>
          <textarea value={novaTexto} onChange={e => setNovaTexto(e.target.value)}
            placeholder="Digite a frase aqui…"
            className="w-full text-sm bg-background border border-border rounded-[4px] p-2 h-20 resize-none" />
          <div className="flex gap-2">
            <button onClick={adicionarFrase} disabled={!agenteId}
              className="btn-3d-soft px-3 py-1.5 text-xs text-emerald-400 disabled:opacity-40">Adicionar</button>
            <button onClick={() => setAdicionando(false)} className="btn-3d-soft px-3 py-1.5 text-xs text-red-400">Cancelar</button>
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-muted-foreground py-4 text-center">Carregando frases…</p>}

      {/* Por tipo */}
      {!loading && frases.length === 0 && (
        <div className="panel-3d rounded-[6px] p-8 text-center text-muted-foreground text-sm">
          Nenhuma frase encontrada.
        </div>
      )}
      {!loading && (
        <div className="space-y-4">
          {porTipo.map(({ key, cfg, lista }) => (
            <div key={key}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${cfg.cor}`}>{cfg.label}</span>
                <span className="text-xs text-muted-foreground">{lista.length} frases</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {lista.map(f => (
                  <div key={f.id} className="panel-3d rounded-[6px] px-3 py-2.5 flex items-start gap-2 group">
                    <div className="text-sm shrink-0"
                      style={{ color: (agentes.find(a => a.id === f.agente_id))?.cor_hex ?? "#45B8CC" }}>
                      {(agentes.find(a => a.id === f.agente_id))?.emoji ?? "🤖"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground mb-0.5">{f.agente_nome}</p>
                      <p className="text-[12px] leading-relaxed">"{f.texto}"</p>
                    </div>
                    <button onClick={() => desativarFrase(f.id)}
                      className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all shrink-0">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ONDA B — Chat IA Profissional (nível Claude.ai / ChatGPT)
// ═══════════════════════════════════════════════════════════════════════════════

const MODELOS_CHAT = [
  { id: "claude-sonnet-4-6",               label: "Claude Sonnet 4.6 (Anthropic)" },
  { id: "claude-opus-4-8",                 label: "Claude Opus 4.8 (Mais poderoso)" },
  { id: "claude-haiku-4-5",                label: "Claude Haiku 4.5 (Veloz)" },
  { id: "gpt-5.6-terra",                   label: "GPT-5.6 Terra (OpenAI)" },
  { id: "gpt-5.6-sol",                     label: "GPT-5.6 Sol (OpenAI Max)" },
  { id: "gemini-3.1-pro-preview",          label: "Gemini 3.1 Pro (Google)" },
  { id: "mistralai/mixtral-8x7b-instruct", label: "Mixtral 8x7B (OpenRouter)" },
  { id: "deepseek/deepseek-r1",            label: "DeepSeek R1 Raciocínio" },
  { id: "x-ai/grok-3",                     label: "Grok 3 (xAI)" },
];

/* ── Animação Homenzinhos Trabalhando ──────────────────────────────────────── */
function HomenzinhosAnimacao({ cor }: { cor: string }) {
  return (
    <div className="flex items-end gap-3 px-4 py-3">
      {[0,1,2].map(i => (
        <div key={i} className="flex flex-col items-center" style={{ animationDelay: `${i * 0.2}s` }}>
          {/* Monitor */}
          <div className="w-8 h-6 rounded-[3px] border-2 mb-0.5 flex items-center justify-center"
            style={{ borderColor: cor + "88", backgroundColor: cor + "15" }}>
            <div className="space-y-0.5">
              {[0,1,2].map(j => (
                <div key={j} className="h-0.5 rounded-full" style={{
                  backgroundColor: cor,
                  width: j === 1 ? "16px" : "12px",
                  opacity: 0.7,
                  animation: `pulse 1.2s ease-in-out ${(i * 0.4 + j * 0.1)}s infinite`,
                }} />
              ))}
            </div>
          </div>
          {/* Homenzinho SVG */}
          <svg width="20" height="28" viewBox="0 0 20 28" fill="none"
            style={{ animation: `homemWork 0.8s ease-in-out ${i * 0.27}s infinite alternate` }}>
            {/* Cabeça */}
            <circle cx="10" cy="5" r="4" fill={cor} fillOpacity="0.85" />
            {/* Corpo */}
            <rect x="6" y="10" width="8" height="9" rx="2" fill={cor} fillOpacity="0.7" />
            {/* Braço esquerdo (digitando) */}
            <line x1="6" y1="13" x2="1" y2="16" stroke={cor} strokeWidth="2.5" strokeLinecap="round"
              style={{ transformOrigin: "6px 13px", animation: `bracoEsq 0.8s ease-in-out ${i * 0.27}s infinite alternate` }}/>
            {/* Braço direito */}
            <line x1="14" y1="13" x2="19" y2="16" stroke={cor} strokeWidth="2.5" strokeLinecap="round"
              style={{ transformOrigin: "14px 13px", animation: `bracoDirW 0.8s ease-in-out ${i * 0.27 + 0.4}s infinite alternate` }}/>
            {/* Pernas */}
            <line x1="8" y1="19" x2="6" y2="26" stroke={cor} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.6"/>
            <line x1="12" y1="19" x2="14" y2="26" stroke={cor} strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.6"/>
          </svg>
          {/* Teclado */}
          <div className="w-10 h-2 rounded-[2px] mt-0.5" style={{ backgroundColor: cor + "30", border: `1px solid ${cor}40` }} />
        </div>
      ))}
      {/* Balão de pensamento */}
      <div className="ml-2 flex flex-col items-start gap-0.5 pb-2">
        <div className="text-[10px] font-semibold" style={{ color: cor }}>Processando…</div>
        <div className="flex gap-1 items-center">
          {[0,1,2].map(d => (
            <div key={d} className="w-2 h-2 rounded-full" style={{
              backgroundColor: cor,
              animation: `bounce 1.2s ease-in-out ${d * 0.2}s infinite`,
            }} />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes homemWork {
          from { transform: translateY(0px); }
          to   { transform: translateY(-2px); }
        }
        @keyframes bracoEsq {
          from { transform: rotate(0deg); }
          to   { transform: rotate(20deg); }
        }
        @keyframes bracoDirW {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-20deg); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); opacity: 1; }
          50%       { transform: translateY(-4px); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

interface MsgChat { role: "user" | "assistant"; content: string; }

function AbaChat({ agentes }: { agentes: Agente[] }) {
  const [agenteId, setAgenteId] = useState<number>(agentes[0]?.id ?? 0);
  const [modelo, setModelo] = useState("claude-sonnet-4-6");
  const [mensagens, setMensagens] = useState<MsgChat[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [textoStreaming, setTextoStreaming] = useState("");
  const [convId, setConvId] = useState<number | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const agente = agentes.find(a => a.id === agenteId) ?? agentes[0];

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [mensagens, textoStreaming]);

  async function enviar() {
    const texto = input.trim();
    if (!texto || streaming || !agente) return;
    setInput("");

    const novaMsg: MsgChat = { role: "user", content: texto };
    const historico = [...mensagens, novaMsg];
    setMensagens(historico);
    setStreaming(true);
    setTextoStreaming("");

    // Cria conversa se não existe
    let cid = convId;
    if (!cid) {
      const token = localStorage.getItem("collaborator_token") ?? "";
      const r = await fetch(`${BASE}api/agentes-chat/conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agente_id: agente.id, title: texto.slice(0, 60), provedor: modelo }),
      });
      const data = await r.json();
      cid = data.id;
      setConvId(cid);
    }

    // Salva msg do usuário
    const token = localStorage.getItem("collaborator_token") ?? "";
    await fetch(`${BASE}api/agentes-chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ conversation_id: cid, role: "user", content: texto }),
    });

    // Inicia streaming SSE
    let acumulado = "";
    try {
      const resp = await fetch(`${BASE}api/agentes-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          agente_id: agente.id,
          mensagens: historico,
          conversation_id: cid,
        }),
      });

      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("stream inválido");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const linhas = chunk.split("\n");
        for (const linha of linhas) {
          if (!linha.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(linha.slice(6));
            if (evt.content) {
              acumulado += evt.content;
              setTextoStreaming(acumulado);
            }
            if (evt.done || evt.error) break;
          } catch { /* ignora JSON inválido */ }
        }
      }
    } catch (err) {
      acumulado = "Erro ao conectar com a IA. Verifique a configuração dos provedores.";
    }

    setMensagens(prev => [...prev, { role: "assistant", content: acumulado }]);
    setTextoStreaming("");
    setStreaming(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); }
  }

  function limpar() {
    setMensagens([]);
    setConvId(null);
    setTextoStreaming("");
    setStreaming(false);
  }

  if (!agente) return <div className="text-center text-muted-foreground py-12">Nenhum agente cadastrado.</div>;

  return (
    <div className="space-y-4">
      {/* Barra de configuração */}
      <div className="panel-3d rounded-[6px] px-4 py-2.5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <AvatarAgente a={agente} size="sm" />
          <select value={agenteId} onChange={e => { setAgenteId(Number(e.target.value)); limpar(); }}
            className="text-xs bg-background border border-border rounded-[4px] px-2 py-1 font-semibold">
            {agentes.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.nome} — {a.cargo}</option>)}
          </select>
        </div>
        <select value={modelo} onChange={e => setModelo(e.target.value)}
          className="text-xs bg-background border border-border rounded-[4px] px-2 py-1">
          {PROVEDORES_OPCOES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button onClick={limpar} className="btn-3d-soft px-2 py-1 text-xs flex items-center gap-1 text-muted-foreground">
          <RotateCcw className="w-3 h-3" /> Limpar
        </button>
      </div>

      {/* Área de chat */}
      <div className="panel-3d rounded-[6px] overflow-hidden flex flex-col"
        style={{ height: "520px", borderLeftWidth: 3, borderLeftColor: agente.cor_hex }}>

        {/* Cabeçalho do agente */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-muted/20">
          <AvatarAgente a={agente} size="md" />
          <div>
            <p className="font-bold text-sm">{agente.nome}</p>
            <p className="text-[10px] text-muted-foreground">{agente.cargo} · {modelo}</p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-semibold">ONLINE</span>
          </div>
        </div>

        {/* Mensagens */}
        <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
          {mensagens.length === 0 && !streaming && (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">{agente.emoji}</div>
              <p className="text-sm font-semibold">{agente.nome} está pronto para conversar</p>
              <p className="text-xs text-muted-foreground mt-1">{agente.descricao}</p>
              <p className="text-[10px] text-muted-foreground mt-4 italic">
                Dica: use o tom correto — este agente responde com{" "}
                <span style={{ color: agente.cor_hex }}>personalidade calibrada</span>
              </p>
            </div>
          )}
          {mensagens.map((m, i) => (
            <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              {m.role === "assistant" && <AvatarAgente a={agente} size="sm" />}
              {m.role === "user" && (
                <div className="w-8 h-8 rounded-[6px] bg-muted border border-border flex items-center justify-center text-xs font-bold">
                  Dr
                </div>
              )}
              <div className={`max-w-[75%] rounded-[6px] px-3 py-2.5 text-sm leading-relaxed ${
                m.role === "user"
                  ? "bg-sidebar-primary/10 border border-sidebar-primary/20 ml-auto"
                  : "bg-muted/30 border border-border"
              }`}>
                {m.content}
              </div>
            </div>
          ))}

          {/* Homenzinhos + streaming */}
          {streaming && (
            <div className="flex gap-2.5">
              <AvatarAgente a={agente} size="sm" />
              <div className="flex-1">
                {!textoStreaming && <HomenzinhosAnimacao cor={agente.cor_hex} />}
                {textoStreaming && (
                  <div className="bg-muted/30 border border-border rounded-[6px] px-3 py-2.5 text-sm leading-relaxed">
                    {textoStreaming}
                    <span className="inline-block w-0.5 h-4 bg-sidebar-primary ml-0.5 animate-pulse align-middle" />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border bg-muted/10">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Fale com ${agente.nome}… (Enter para enviar, Shift+Enter para nova linha)`}
              disabled={streaming}
              rows={2}
              className="flex-1 text-sm bg-background border border-border rounded-[6px] px-3 py-2 resize-none focus:outline-none focus:border-sidebar-primary/50 disabled:opacity-50"
            />
            <button
              onClick={enviar}
              disabled={streaming || !input.trim()}
              className="btn-3d-soft px-4 py-2 flex items-center gap-1.5 text-sm disabled:opacity-40"
              style={{ color: agente.cor_hex }}>
              <Send className="w-4 h-4" />
              {streaming ? "…" : "Enviar"}
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 px-1">
            Sistema usa Anthropic Claude via Replit AI Integrations — sem chave própria necessária
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ONDA C — Painel de Provedores de IA
// ═══════════════════════════════════════════════════════════════════════════════

interface Provedor {
  id: string; nome: string; empresa: string; modelo_padrao: string;
  modelos: Array<{ id: string; nome: string; forca: number; velocidade: number; custo: number }>;
  ativo: boolean; cor: string; casos_de_uso: string[]; latencia_estimada_ms: number;
}

const MODELO_COMPARATIVO = [
  { modelo: "claude-opus-4-8",        provedor: "Anthropic", contexto: "200k", forca: 5, velocidade: 3, custo: 5, uso: "Raciocínio clínico complexo" },
  { modelo: "claude-sonnet-4-6",      provedor: "Anthropic", contexto: "200k", forca: 4, velocidade: 4, custo: 3, uso: "Uso geral recomendado" },
  { modelo: "gpt-5.6-terra",          provedor: "OpenAI",    contexto: "128k", forca: 4, velocidade: 4, custo: 3, uso: "Tarefas gerais, rápido" },
  { modelo: "gpt-5.6-sol",            provedor: "OpenAI",    contexto: "128k", forca: 5, velocidade: 3, custo: 5, uso: "Máxima capacidade OpenAI" },
  { modelo: "gemini-3.1-pro-preview", provedor: "Google",    contexto: "1M",   forca: 5, velocidade: 3, custo: 3, uso: "Contexto gigante, multimodal" },
  { modelo: "gemini-3-flash-preview", provedor: "Google",    contexto: "1M",   forca: 3, velocidade: 5, custo: 1, uso: "Alto volume, baixo custo" },
  { modelo: "gpt-5.6-luna",           provedor: "OpenAI",    contexto: "128k", forca: 3, velocidade: 5, custo: 1, uso: "Volume, custo baixo" },
  { modelo: "deepseek/deepseek-r1",   provedor: "OpenRouter",contexto: "64k",  forca: 5, velocidade: 2, custo: 2, uso: "Raciocínio open-source" },
  { modelo: "x-ai/grok-3",            provedor: "OpenRouter",contexto: "128k", forca: 4, velocidade: 3, custo: 2, uso: "Alternativa xAI" },
  { modelo: "meta-llama/llama-3.3-70b-instruct", provedor: "OpenRouter", contexto: "128k", forca: 4, velocidade: 4, custo: 1, uso: "Open-source Llama" },
  { modelo: "claude-haiku-4-5",       provedor: "Anthropic", contexto: "200k", forca: 3, velocidade: 5, custo: 1, uso: "Ultra-rápido, triagem" },
  { modelo: "o4-mini",                provedor: "OpenAI",    contexto: "128k", forca: 5, velocidade: 2, custo: 4, uso: "Raciocínio step-by-step" },
];

function EstrelinhasIA({ n, max = 5, cor }: { n: number; max?: number; cor?: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} className="w-2 h-2 rounded-[1px]"
          style={{ backgroundColor: i < n ? (cor ?? "#45B8CC") : "rgba(255,255,255,0.08)" }} />
      ))}
    </div>
  );
}

function AbaProvedores({ agentes }: { agentes: Agente[] }) {
  const [provedores, setProvedores] = useState<Provedor[]>([]);
  const [loadingP, setLoadingP] = useState(true);
  const [testando, setTestando] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Record<string, { latencia_ms: number; status: string }>>({});
  const [mostrarComparativo, setMostrarComparativo] = useState(false);

  const carregar = useCallback(async () => {
    setLoadingP(true);
    const r = await apiFetch("/agentes-provedores");
    setProvedores(Array.isArray(r) ? r : []);
    setLoadingP(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function testar(provedorId: string) {
    setTestando(provedorId);
    const token = localStorage.getItem("collaborator_token") ?? "";
    try {
      const r = await fetch(`${BASE}api/agentes-provedores/testar`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ provedor: provedorId }),
      });
      const data = await r.json();
      setResultados(prev => ({ ...prev, [provedorId]: data }));
    } catch {
      setResultados(prev => ({ ...prev, [provedorId]: { latencia_ms: 0, status: "ERRO" } }));
    } finally {
      setTestando(null);
    }
  }

  const COR_PROVEDOR: Record<string, string> = {
    anthropic: "#D97706", openai: "#10B981", gemini: "#4285F4", openrouter: "#7C3AED",
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="panel-3d rounded-[6px] px-4 py-2.5 flex items-center gap-3">
        <Cpu className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          4 Provedores de IA — via Replit AI Integrations · sem chave própria
        </span>
        <button onClick={carregar} className="ml-auto btn-3d-soft px-2 py-1 text-xs flex items-center gap-1">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Cards dos 4 provedores */}
      {loadingP && <p className="text-sm text-center text-muted-foreground py-8">Carregando provedores…</p>}
      {!loadingP && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {provedores.map(p => {
            const res = resultados[p.id];
            const cor = COR_PROVEDOR[p.id] ?? p.cor;
            return (
              <div key={p.id} className="panel-3d rounded-[6px] p-4 space-y-3 flex flex-col"
                style={{ borderLeftWidth: 3, borderLeftColor: cor }}>
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.ativo ? "#22c55e" : "#6b7280" }} />
                      <span className={`text-[9px] font-black uppercase tracking-widest ${p.ativo ? "text-emerald-400" : "text-zinc-500"}`}>
                        {p.ativo ? "ATIVO" : "INATIVO"}
                      </span>
                    </div>
                    <p className="text-sm font-black" style={{ color: cor }}>{p.nome}</p>
                    <p className="text-[10px] text-muted-foreground">{p.empresa}</p>
                  </div>
                  <div className="text-2xl">
                    {p.id === "anthropic" && "🔮"}
                    {p.id === "openai" && "🌐"}
                    {p.id === "gemini" && "💎"}
                    {p.id === "openrouter" && "🔀"}
                  </div>
                </div>

                {/* Modelo padrão */}
                <div className="concave-3d rounded-[4px] px-2 py-1.5">
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest mb-0.5">Modelo Padrão</p>
                  <p className="text-[11px] font-semibold font-mono truncate" style={{ color: cor }}>{p.modelo_padrao}</p>
                </div>

                {/* Casos de uso */}
                <div className="flex flex-wrap gap-1">
                  {p.casos_de_uso.map(c => (
                    <span key={c} className="text-[9px] px-1.5 py-0.5 rounded border"
                      style={{ borderColor: cor + "40", color: cor, backgroundColor: cor + "10" }}>
                      {c}
                    </span>
                  ))}
                </div>

                {/* Latência */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] text-muted-foreground">Latência estimada</p>
                    <p className="text-xs font-mono" style={{ color: cor }}>
                      {res ? `${res.latencia_ms}ms REAL` : `~${p.latencia_estimada_ms}ms`}
                    </p>
                  </div>
                  {res && (
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${res.status === "ATIVO" ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>
                      {res.status}
                    </span>
                  )}
                </div>

                {/* Modelos disponíveis */}
                <div className="space-y-1 flex-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{p.modelos.length} Modelos</p>
                  {p.modelos.slice(0, 3).map(m => (
                    <div key={m.id} className="flex items-center gap-2">
                      <span className="text-[10px] truncate flex-1" title={m.id}>{m.nome}</span>
                      <EstrelinhasIA n={m.forca} cor={cor} />
                    </div>
                  ))}
                </div>

                {/* Botão testar */}
                <button
                  onClick={() => testar(p.id)}
                  disabled={testando === p.id || !p.ativo}
                  className="btn-3d-soft py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40 w-full"
                  style={{ color: cor }}>
                  {testando === p.id
                    ? <><Activity className="w-3 h-3 animate-spin" /> Testando…</>
                    : <><Radio className="w-3 h-3" /> Medir Latência Real</>}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Tabela Comparativa de Modelos Modernos */}
      <div className="panel-3d rounded-[6px] overflow-hidden">
        <button
          onClick={() => setMostrarComparativo(!mostrarComparativo)}
          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/20 transition-colors">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-black uppercase tracking-widest text-amber-400">
            O Que Há de Mais Moderno — 12 Modelos Comparados
          </span>
          <span className="ml-auto text-muted-foreground text-xs">{mostrarComparativo ? "▲" : "▼"}</span>
        </button>
        {mostrarComparativo && (
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/20 border-b border-border">
                  <th className="text-left px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Modelo</th>
                  <th className="text-center px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Provedor</th>
                  <th className="text-center px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Contexto</th>
                  <th className="text-center px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Raciocínio</th>
                  <th className="text-center px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Velocidade</th>
                  <th className="text-center px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Custo</th>
                  <th className="text-left px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Ideal Para</th>
                </tr>
              </thead>
              <tbody>
                {MODELO_COMPARATIVO.map((m, i) => {
                  const cor = m.provedor === "Anthropic" ? "#D97706"
                    : m.provedor === "OpenAI" ? "#10B981"
                    : m.provedor === "Google" ? "#4285F4"
                    : "#7C3AED";
                  return (
                    <tr key={m.modelo} className={`border-b border-border/40 ${i % 2 === 0 ? "bg-muted/5" : ""}`}>
                      <td className="px-3 py-2 font-mono text-[10px]" style={{ color: cor }}>{m.modelo.split("/").pop()}</td>
                      <td className="px-2 py-2 text-center">
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: cor + "20", color: cor }}>{m.provedor}</span>
                      </td>
                      <td className="px-2 py-2 text-center text-[10px] font-mono">{m.contexto}</td>
                      <td className="px-2 py-2 text-center"><EstrelinhasIA n={m.forca} cor={cor} /></td>
                      <td className="px-2 py-2 text-center"><EstrelinhasIA n={m.velocidade} cor="#22c55e" /></td>
                      <td className="px-2 py-2 text-center"><EstrelinhasIA n={m.custo} cor="#f97316" max={5} /></td>
                      <td className="px-3 py-2 text-[10px] text-muted-foreground">{m.uso}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Plano de Lançamento */}
      <div className="panel-3d rounded-[6px] overflow-hidden" style={{ borderLeftWidth: 3, borderLeftColor: "#22c55e" }}>
        <div className="px-4 py-3 border-b border-border bg-emerald-500/5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-black uppercase tracking-widest text-emerald-400">
              Plano de Lançamento — Como Começar a Operar e Vender Licenças
            </span>
          </div>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              passo: "PASSO 1",
              titulo: "Operar Internamente (Agora)",
              cor: "#45B8CC",
              itens: [
                "Cadastre os primeiros 5 clientes reais no PAXTER",
                "Lance um protocolo completo com RAS FAP",
                "Configure os Agentes Virtuais para sua equipe",
                "Use o sistema por 2–4 semanas para dominar o fluxo",
                "Documente o antes × depois em números",
              ],
            },
            {
              passo: "PASSO 2",
              titulo: "Primeira Venda de Licença",
              cor: "#D97706",
              itens: [
                "Monte uma demo com dados reais (não fictícios)",
                "Identifique 3 clínicas parceiras do seu network",
                "Preço sugerido: R$ 497/mês (básico) ou R$ 997/mês (IA + WhatsApp)",
                "Venda direta via WhatsApp — sem landing page ainda",
                "Contrato simples: 3 meses mínimo, cancelamento com 30 dias",
              ],
            },
            {
              passo: "PASSO 3",
              titulo: "Portal de Vendas (Futuro)",
              cor: "#7C3AED",
              itens: [
                "Criar tela pública /pricing com planos",
                "Checkout via Asaas (já integrado no sistema)",
                "Onboarding automático ao pagar",
                "Painel multi-clínica (spec já arquitetada)",
                "Meta: 10 clínicas pagas até 60 dias do lançamento",
              ],
            },
          ].map(b => (
            <div key={b.passo} className="space-y-2">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: b.cor }}>{b.passo}</span>
                <p className="text-sm font-bold mt-0.5">{b.titulo}</p>
              </div>
              <ul className="space-y-1.5">
                {b.itens.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: b.cor }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHAT PRO — Console de IA Profissional (nível Claude.ai / ChatGPT)
// Painel 3 zonas: Histórico | Conversa | Configurações
// ═══════════════════════════════════════════════════════════════════════════════

interface ConvHistorico {
  id: number; agente_id: number; title: string; provedor: string;
  agente_nome: string; emoji: string; cor_hex: string;
  total_mensagens: number; created_at: string;
}
interface MsgPro { id?: number; role: "user"|"assistant"; content: string; feedback?: "up"|"down"|null; }

function copiarTexto(texto: string) {
  navigator.clipboard.writeText(texto).catch(() => null);
}

function AbaChatPro({ agentes }: { agentes: Agente[] }) {
  const [agenteId, setAgenteId]       = useState<number>(agentes[0]?.id ?? 0);
  const [modelo, setModelo]           = useState("claude-sonnet-4-6");
  const [temperatura, setTemperatura] = useState(0.7);
  const [maxTokens, setMaxTokens]     = useState(4096);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory]   = useState(true);

  const [mensagens, setMensagens]     = useState<MsgPro[]>([]);
  const [input, setInput]             = useState("");
  const [streaming, setStreaming]     = useState(false);
  const [textoStream, setTextoStream] = useState("");
  const [convId, setConvId]           = useState<number | null>(null);
  const [conversas, setConversas]     = useState<ConvHistorico[]>([]);
  const [buscaConv, setBuscaConv]     = useState("");
  const [tokensUso, setTokensUso]     = useState({ input: 0, output: 0 });
  const [custoSessao, setCustoSessao] = useState(0);
  const [feedbacks, setFeedbacks]     = useState<Record<number, "up"|"down">>({});
  const [copiado, setCopiado]         = useState<number | null>(null);
  const [msgEditando, setMsgEditando] = useState<number | null>(null);
  const [quickReplies, setQuickReplies] = useState<Array<{id:number;texto:string;ordem:number;ativo:boolean}>>([]);
  const [novoQR, setNovoQR]           = useState("");
  const [salvandoQR, setSalvandoQR]   = useState(false);
  const chatRef   = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const agente = useMemo(() => agentes.find(a => a.id === agenteId) ?? agentes[0], [agentes, agenteId]);

  const carregarConversas = useCallback(async () => {
    const r = await apiFetch(`/agentes-chat/conversations?agente_id=${agenteId}`);
    setConversas(Array.isArray(r) ? r : []);
    return Array.isArray(r) ? r : [];
  }, [agenteId]);

  const carregarQuickReplies = useCallback(async (id: number) => {
    const r = await apiFetch(`/agentes/${id}/quick-replies`);
    setQuickReplies(r?.items?.filter((q: any) => q.ativo) ?? []);
  }, []);

  useEffect(() => {
    carregarConversas().then(lista => {
      // Kaizen A: ao trocar agente, auto-restaurar a conversa mais recente
      if (lista.length > 0 && !convId) {
        carregarConversa(lista[0]);
      }
    });
  }, [carregarConversas]); // eslint-disable-line

  useEffect(() => { if (agenteId) carregarQuickReplies(agenteId); }, [agenteId, carregarQuickReplies]);
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [mensagens, textoStream]);

  async function carregarConversa(conv: ConvHistorico) {
    setConvId(conv.id);
    const msgs = await apiFetch(`/agentes-chat/conversation/${conv.id}/messages`);
    setMensagens(Array.isArray(msgs) ? msgs : []);
    setAgenteId(conv.agente_id);
    setTextoStream("");
  }

  async function novaConversa() {
    setMensagens([]); setConvId(null); setTextoStream("");
    setTokensUso({ input: 0, output: 0 }); setCustoSessao(0);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function deletarConversa(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    const token = localStorage.getItem("collaborator_token") ?? "";
    await fetch(`${BASE}api/agentes-chat/conversation/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (convId === id) novaConversa();
    carregarConversas();
  }

  async function enviar() {
    const texto = input.trim();
    if (!texto || streaming || !agente) return;
    setInput("");
    const novaMsg: MsgPro = { role: "user", content: texto };
    const historico = [...mensagens, novaMsg];
    setMensagens(historico);
    setStreaming(true); setTextoStream("");

    const token = localStorage.getItem("collaborator_token") ?? "";

    let cid = convId;
    if (!cid) {
      const r = await fetch(`${BASE}api/agentes-chat/conversation`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agente_id: agente.id, title: texto.slice(0, 60), provedor: modelo }),
      });
      const data = await r.json();
      cid = data.id; setConvId(cid);
    }

    await fetch(`${BASE}api/agentes-chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ conversation_id: cid, role: "user", content: texto }),
    });

    let acumulado = "";
    try {
      const resp = await fetch(`${BASE}api/agentes-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agente_id: agente.id, mensagens: historico, conversation_id: cid, temperatura, max_tokens: maxTokens }),
      });
      const reader = resp.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("stream inválido");
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const linha of chunk.split("\n")) {
          if (!linha.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(linha.slice(6));
            if (evt.content) { acumulado += evt.content; setTextoStream(acumulado); }
            if (evt.done) {
              setTokensUso(prev => ({ input: prev.input + (evt.tokens?.input ?? 0), output: prev.output + (evt.tokens?.output ?? 0) }));
              setCustoSessao(prev => prev + (evt.custo_usd ?? 0));
            }
          } catch { /* json parcial */ }
        }
      }
    } catch { acumulado = "Erro ao conectar com a IA. Verifique os provedores."; }

    setMensagens(prev => [...prev, { role: "assistant", content: acumulado }]);
    setTextoStream(""); setStreaming(false);
    carregarConversas();
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  function regerarUltima() {
    const ultimo = [...mensagens].reverse().find(m => m.role === "user");
    if (!ultimo) return;
    const idx = mensagens.lastIndexOf(ultimo);
    setMensagens(mensagens.slice(0, idx));
    setInput(ultimo.content);
  }

  function copiar(i: number, texto: string) {
    copiarTexto(texto);
    setCopiado(i);
    setTimeout(() => setCopiado(null), 2000);
  }

  function feedback(i: number, tipo: "up"|"down") {
    setFeedbacks(prev => ({ ...prev, [i]: prev[i] === tipo ? undefined! : tipo }));
  }

  const convsFiltradas = conversas.filter(c =>
    c.title.toLowerCase().includes(buscaConv.toLowerCase()) ||
    c.agente_nome.toLowerCase().includes(buscaConv.toLowerCase())
  );

  const estimTokensInput = useMemo(() =>
    Math.round(input.length / 4), [input]);

  if (!agente) return <div className="text-center text-muted-foreground py-12">Nenhum agente cadastrado.</div>;

  return (
    <div className="flex gap-3" style={{ height: "680px" }}>

      {/* ── PAINEL ESQUERDO: Histórico de Conversas ── */}
      {showHistory && (
        <div className="flex flex-col w-64 shrink-0 panel-3d rounded-[6px] overflow-hidden">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-border bg-muted/20 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Histórico</span>
            <button onClick={novaConversa}
              className="w-6 h-6 rounded-[4px] bg-sidebar-primary/20 border border-sidebar-primary/30 flex items-center justify-center hover:bg-sidebar-primary/30 transition-colors">
              <Plus className="w-3 h-3 text-sidebar-primary" />
            </button>
          </div>
          {/* Busca */}
          <div className="px-2 py-1.5 border-b border-border">
            <div className="flex items-center gap-1.5 bg-background rounded-[4px] border border-border px-2 py-1">
              <Search className="w-3 h-3 text-muted-foreground" />
              <input value={buscaConv} onChange={e => setBuscaConv(e.target.value)}
                placeholder="Buscar conversa…" className="flex-1 text-[11px] bg-transparent outline-none" />
            </div>
          </div>
          {/* Lista */}
          <div className="flex-1 overflow-y-auto">
            {convsFiltradas.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-[11px]">
                Nenhuma conversa ainda.<br />Clique em + para começar.
              </div>
            )}
            {convsFiltradas.map(c => (
              <div key={c.id}
                onClick={() => carregarConversa(c)}
                className={`group px-3 py-2 cursor-pointer border-b border-border/30 hover:bg-muted/20 transition-colors flex items-start gap-2 ${
                  convId === c.id ? "bg-sidebar-primary/10 border-l-2 border-l-sidebar-primary" : ""
                }`}>
                <span className="text-base shrink-0 mt-0.5">{c.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold truncate">{c.title}</p>
                  <p className="text-[9px] text-muted-foreground">{c.agente_nome} · {c.total_mensagens} msgs</p>
                </div>
                <button onClick={e => deletarConversa(c.id, e)}
                  className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all p-0.5 shrink-0">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          {/* Seletor de agente */}
          <div className="p-2 border-t border-border bg-muted/10">
            <select value={agenteId}
              onChange={e => { setAgenteId(Number(e.target.value)); novaConversa(); }}
              className="w-full text-[11px] bg-background border border-border rounded-[4px] px-2 py-1">
              {agentes.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.nome}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* ── CENTRO: Área de Chat ── */}
      <div className="flex-1 flex flex-col panel-3d rounded-[6px] overflow-hidden min-w-0"
        style={{ borderLeftWidth: 3, borderLeftColor: agente.cor_hex }}>

        {/* Cabeçalho */}
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-3 bg-muted/10">
          <button onClick={() => setShowHistory(!showHistory)}
            className="text-muted-foreground hover:text-foreground transition-colors">
            {showHistory ? <ChevronLeft className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
          <AvatarAgente a={agente} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">{agente.nome}</p>
            <p className="text-[10px] text-muted-foreground truncate">{agente.cargo} · {modelo}</p>
          </div>
          {/* Stats de token e custo */}
          <div className="hidden md:flex items-center gap-3 text-[10px] text-muted-foreground">
            {tokensUso.input > 0 && (
              <>
                <span className="flex items-center gap-1">
                  <Hash className="w-3 h-3" />
                  {(tokensUso.input + tokensUso.output).toLocaleString("pt-BR")} tokens
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3" />
                  US$ {custoSessao.toFixed(5)}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-400 font-semibold hidden sm:block">ONLINE</span>
          </div>
          <button onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-[4px] transition-colors ${showSettings ? "bg-sidebar-primary/20 text-sidebar-primary" : "text-muted-foreground hover:text-foreground"}`}>
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mensagens */}
        <div ref={chatRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
          {mensagens.length === 0 && !streaming && (
            <div className="text-center py-12">
              <div className="text-5xl mb-3">{agente.emoji}</div>
              <p className="text-sm font-semibold">{agente.nome} pronto</p>
              <p className="text-xs text-muted-foreground mt-1">{agente.descricao}</p>
              <div className="mt-6 grid grid-cols-2 gap-2 max-w-sm mx-auto">
                {[
                  "Quais são suas capacidades?",
                  "Como posso te usar na clínica?",
                  "Resumo do meu protocolo mais recente",
                  "Dicas para melhorar o atendimento",
                ].map(s => (
                  <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }}
                    className="text-left text-[11px] panel-3d rounded-[6px] px-3 py-2 hover:bg-muted/30 transition-colors text-muted-foreground hover:text-foreground">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {mensagens.map((m, i) => (
            <div key={i} className={`group flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              {m.role === "assistant" && <AvatarAgente a={agente} size="sm" />}
              {m.role === "user" && (
                <div className="w-8 h-8 rounded-[6px] bg-muted border border-border flex items-center justify-center text-xs font-black">DR</div>
              )}
              <div className="flex flex-col gap-1 max-w-[78%]">
                <div className={`rounded-[6px] px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-sidebar-primary/10 border border-sidebar-primary/20 ml-auto"
                    : "bg-muted/30 border border-border"
                }`}>
                  {m.content}
                </div>
                {/* Ações da mensagem */}
                <div className={`flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                  <button onClick={() => copiar(i, m.content)}
                    className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors">
                    {copiado === i ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copiado === i ? "Copiado!" : "Copiar"}
                  </button>
                  {m.role === "assistant" && (
                    <>
                      <button onClick={() => feedback(i, "up")}
                        className={`p-1 rounded transition-colors ${feedbacks[i] === "up" ? "text-emerald-400" : "text-muted-foreground hover:text-emerald-400"}`}>
                        <ThumbsUp className="w-3 h-3" />
                      </button>
                      <button onClick={() => feedback(i, "down")}
                        className={`p-1 rounded transition-colors ${feedbacks[i] === "down" ? "text-red-400" : "text-muted-foreground hover:text-red-400"}`}>
                        <ThumbsDown className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  {m.role === "assistant" && i === mensagens.length - 1 && (
                    <button onClick={regerarUltima}
                      className="text-[10px] flex items-center gap-1 text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded transition-colors">
                      <RotateCcw className="w-3 h-3" /> Regerar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {streaming && (
            <div className="flex gap-2.5">
              <AvatarAgente a={agente} size="sm" />
              <div className="flex-1">
                {!textoStream
                  ? <HomenzinhosAnimacao cor={agente.cor_hex} />
                  : (
                    <div className="bg-muted/30 border border-border rounded-[6px] px-3.5 py-2.5 text-sm leading-relaxed">
                      {textoStream}
                      <span className="inline-block w-0.5 h-4 bg-sidebar-primary ml-0.5 animate-pulse align-middle" />
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>

        {/* Quick-reply chips (Kaizen D) */}
        {quickReplies.length > 0 && (
          <div className="px-3 pb-0 pt-1 border-t border-border bg-muted/5 flex flex-wrap gap-1.5">
            {quickReplies.slice(0, 6).map(qr => (
              <button key={qr.id}
                onClick={() => { setInput(qr.texto); inputRef.current?.focus(); }}
                disabled={streaming}
                className="text-[10px] px-2.5 py-1 rounded-full border border-border bg-muted/30 hover:bg-muted/60 hover:border-sidebar-primary/40 transition-all text-muted-foreground hover:text-foreground disabled:opacity-40">
                {qr.texto}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="p-3 border-t border-border bg-muted/5">
          <div className="flex gap-2">
            <div className="flex-1 flex flex-col">
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
                placeholder={`Fale com ${agente.nome}… (Enter=enviar · Shift+Enter=nova linha)`}
                disabled={streaming} rows={2}
                className="w-full text-sm bg-background border border-border rounded-[6px] px-3 py-2 resize-none focus:outline-none focus:border-sidebar-primary/50 disabled:opacity-50"
              />
              <div className="flex items-center gap-3 mt-1 px-1">
                <span className="text-[10px] text-muted-foreground">
                  ~{estimTokensInput} tokens · R$ {(estimTokensInput / 1_000_000 * 3.0 * 5.5).toFixed(5)} estimado
                </span>
                {mensagens.length > 0 && (
                  <button onClick={regerarUltima}
                    className="text-[10px] text-muted-foreground hover:text-amber-400 flex items-center gap-1 transition-colors ml-auto">
                    <RotateCcw className="w-3 h-3" /> Regerar
                  </button>
                )}
              </div>
            </div>
            <button onClick={enviar} disabled={streaming || !input.trim()}
              className="btn-3d-soft px-4 flex items-center gap-1.5 text-sm disabled:opacity-40 self-start mt-0.5"
              style={{ color: agente.cor_hex, paddingTop: "9px", paddingBottom: "9px" }}>
              <Send className="w-4 h-4" />
              {streaming ? "…" : "Enviar"}
            </button>
          </div>
        </div>
      </div>

      {/* ── PAINEL DIREITO: Configurações ── */}
      {showSettings && (
        <div className="w-64 shrink-0 flex flex-col panel-3d rounded-[6px] overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border bg-muted/20">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Configurações</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-5">

            {/* Modelo */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Modelo de IA</p>
              <select value={modelo} onChange={e => setModelo(e.target.value)}
                className="w-full text-[11px] bg-background border border-border rounded-[4px] px-2 py-1.5">
                {MODELOS_CHAT.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>

            {/* Temperatura */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <Thermometer className="w-3 h-3" /> Temperatura
                </p>
                <span className="text-[11px] font-mono text-sidebar-primary">{temperatura.toFixed(1)}</span>
              </div>
              <input type="range" min="0" max="1" step="0.1" value={temperatura}
                onChange={e => setTemperatura(Number(e.target.value))}
                className="w-full accent-sidebar-primary" />
              <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                <span>Preciso (0.0)</span><span>Criativo (1.0)</span>
              </div>
            </div>

            {/* Max Tokens */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                  <Hash className="w-3 h-3" /> Max Tokens
                </p>
                <span className="text-[11px] font-mono text-sidebar-primary">{maxTokens.toLocaleString("pt-BR")}</span>
              </div>
              <input type="range" min="256" max="16384" step="256" value={maxTokens}
                onChange={e => setMaxTokens(Number(e.target.value))}
                className="w-full accent-sidebar-primary" />
              <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
                <span>256</span><span>16.384</span>
              </div>
            </div>

            {/* Personalidade */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Calibragem Ativa</p>
              {[
                { label: "Formalidade", val: agente.formalidade ?? 3 },
                { label: "Empatia",     val: agente.empatia     ?? 3 },
                { label: "Autoridade",  val: agente.autoridade  ?? 3 },
                { label: "Clareza",     val: agente.clareza     ?? 3 },
              ].map(d => (
                <div key={d.label} className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] text-muted-foreground w-20 shrink-0">{d.label}</span>
                  <div className="flex gap-0.5 flex-1">
                    {[1,2,3,4,5].map(n => (
                      <div key={n} className="flex-1 h-1.5 rounded-full"
                        style={{ backgroundColor: n <= d.val ? agente.cor_hex : "rgba(255,255,255,0.08)" }} />
                    ))}
                  </div>
                  <span className="text-[10px] font-mono" style={{ color: agente.cor_hex }}>{d.val}/5</span>
                </div>
              ))}
            </div>

            {/* System Prompt Preview */}
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">System Prompt</p>
              <div className="concave-3d rounded-[4px] p-2 text-[10px] text-muted-foreground leading-relaxed max-h-32 overflow-y-auto">
                Você é <strong className="text-foreground">{agente.nome}</strong>, {agente.cargo}.<br/>
                Tom: <em>{agente.tom_voz ?? "Profissional"}</em><br/>
                Não faz: {agente.nao_faz ?? "N/D"}
              </div>
            </div>

            {/* Exportar */}
            <button onClick={() => {
              const txt = mensagens.map(m => `[${m.role.toUpperCase()}]\n${m.content}`).join("\n\n---\n\n");
              const blob = new Blob([txt], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `conversa-${agente.nome}.txt`; a.click();
            }} className="w-full btn-3d-soft py-1.5 text-xs flex items-center justify-center gap-1.5 text-muted-foreground">
              <Download className="w-3 h-3" /> Exportar Conversa
            </button>

            {/* Respostas Rápidas (Kaizen D) */}
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Respostas Rápidas</p>
              <div className="space-y-1">
                {quickReplies.map(qr => (
                  <div key={qr.id} className="flex items-center gap-1 group">
                    <span className="text-[10px] flex-1 truncate text-muted-foreground">{qr.texto}</span>
                    <button onClick={async () => {
                      await apiFetch(`/agentes/${agenteId}/quick-replies/${qr.id}`, { method: "DELETE" });
                      carregarQuickReplies(agenteId);
                    }} className="opacity-0 group-hover:opacity-100 text-red-400/60 hover:text-red-400 transition-all">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              {quickReplies.length < 6 && (
                <div className="flex gap-1">
                  <input value={novoQR} onChange={e => setNovoQR(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === "Enter" && novoQR.trim()) {
                        setSalvandoQR(true);
                        await apiFetch(`/agentes/${agenteId}/quick-replies`, {
                          method: "POST",
                          body: JSON.stringify({ texto: novoQR.trim(), ordem: quickReplies.length + 1 }),
                        });
                        setNovoQR(""); carregarQuickReplies(agenteId); setSalvandoQR(false);
                      }
                    }}
                    placeholder="Nova resposta… (Enter)" maxLength={120}
                    className="flex-1 text-[10px] bg-background border border-border rounded px-2 py-1 outline-none" />
                  {salvandoQR && <Loader2 className="w-3 h-3 animate-spin self-center text-muted-foreground" />}
                </div>
              )}
              {quickReplies.length >= 6 && (
                <p className="text-[9px] text-muted-foreground">Limite de 6 atingido.</p>
              )}
            </div>

            {/* Ações de Integração */}
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Integrações</p>
              <AcaoTrelloCard
                agenteId={agente.id}
                agenteCor={agente.cor_hex}
                conversationId={convId ?? undefined}
              />
              <AcaoWppNotificar
                agenteId={agente.id}
                agenteCor={agente.cor_hex}
                conversationId={convId ?? undefined}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mini-componente: botão Criar Card Trello ─────────────────────────────────
function AcaoTrelloCard({ agenteId, agenteCor, conversationId }: {
  agenteId: number; agenteCor: string; conversationId?: number;
}) {
  const [estado, setEstado] = useState<"idle"|"loading"|"ok"|"err"|"nconf">("idle");
  const [url, setUrl]       = useState<string | null>(null);

  async function criar() {
    setEstado("loading");
    const r = await apiFetch("/agentes-trello/card", {
      method: "POST",
      body: JSON.stringify({ agente_id: agenteId, conversation_id: conversationId }),
    });
    if (r?.configurado === false) { setEstado("nconf"); return; }
    if (r?.ok) { setEstado("ok"); setUrl(r.url); }
    else setEstado("err");
  }

  return (
    <button onClick={criar} disabled={estado === "loading"}
      className="w-full btn-3d-soft py-1.5 text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
      style={{ color: estado === "ok" ? "#22c55e" : estado === "nconf" ? "#f59e0b" : agenteCor }}>
      {estado === "loading" && <Loader2 className="w-3 h-3 animate-spin" />}
      {estado === "ok"      && <Check className="w-3 h-3 text-emerald-400" />}
      {estado === "nconf"   && <Settings className="w-3 h-3 text-amber-400" />}
      {estado === "err"     && <X className="w-3 h-3 text-red-400" />}
      {estado === "idle"    && <Layers className="w-3 h-3" />}
      {estado === "idle"    && "Criar Card Trello"}
      {estado === "loading" && "Criando card…"}
      {estado === "ok"      && "Card criado!"}
      {estado === "nconf"   && "Trello não configurado"}
      {estado === "err"     && "Erro — ver Integrações"}
      {estado === "ok" && url && (
        <a href={url} target="_blank" rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="ml-1 underline text-cyan-400">Abrir</a>
      )}
    </button>
  );
}

// ─── Mini-componente: botão Notificar por WhatsApp ────────────────────────────
function AcaoWppNotificar({ agenteId, agenteCor, conversationId }: {
  agenteId: number; agenteCor: string; conversationId?: number;
}) {
  const [estado, setEstado] = useState<"idle"|"loading"|"ok"|"err"|"nconf">("idle");
  const [link, setLink]     = useState<string | null>(null);

  async function notificar() {
    setEstado("loading");
    const r = await apiFetch("/agentes-wpp/notificar", {
      method: "POST",
      body: JSON.stringify({ agente_id: agenteId, conversation_id: conversationId }),
    });
    if (r?.configurado === false) {
      setEstado("nconf");
      setLink(r.link_fallback ?? null);
      return;
    }
    if (r?.ok) setEstado("ok");
    else { setEstado("err"); setLink(r?.link_fallback ?? null); }
  }

  return (
    <div className="space-y-1">
      <button onClick={notificar} disabled={estado === "loading"}
        className="w-full btn-3d-soft py-1.5 text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
        style={{ color: estado === "ok" ? "#22c55e" : estado === "nconf" ? "#f59e0b" : agenteCor }}>
        {estado === "loading" && <Loader2 className="w-3 h-3 animate-spin" />}
        {estado === "ok"      && <Check className="w-3 h-3 text-emerald-400" />}
        {estado === "nconf"   && <Settings className="w-3 h-3 text-amber-400" />}
        {estado === "err"     && <X className="w-3 h-3 text-red-400" />}
        {estado === "idle"    && <MessageCircle className="w-3 h-3" />}
        {estado === "idle"    && "Notificar por WhatsApp"}
        {estado === "loading" && "Enviando…"}
        {estado === "ok"      && "WhatsApp enviado!"}
        {estado === "nconf"   && "WPP não configurado"}
        {estado === "err"     && "Erro — ver link abaixo"}
      </button>
      {link && (
        <a href={link} target="_blank" rel="noreferrer"
          className="block text-center text-[10px] text-cyan-400 underline">
          Abrir no WhatsApp (fallback manual)
        </a>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// USO & CUSTO — Dashboard de Analytics da IA
// ═══════════════════════════════════════════════════════════════════════════════

function AbaUso() {
  const [stats, setStats] = useState<Record<string, number> & {
    top_agentes?: Array<{ nome: string; emoji: string; cor_hex: string; conversas: number }>;
    custo_usd_estimado?: number; custo_brl_estimado?: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/agentes-chat/stats").then(r => { setStats(r); setLoading(false); });
  }, []);

  if (loading) return <div className="text-center py-12 text-muted-foreground text-sm">Carregando analytics…</div>;
  if (!stats) return <div className="text-center py-12 text-muted-foreground text-sm">Sem dados ainda.</div>;

  const kpis = [
    { label: "Total de Conversas",    val: stats.total_conversas?.toLocaleString("pt-BR") ?? "0", cor: "#45B8CC", icon: MessageCircle },
    { label: "Últimos 30 Dias",       val: stats.conversas_30d?.toLocaleString("pt-BR") ?? "0",  cor: "#22c55e", icon: TrendingUp },
    { label: "Últimos 7 Dias",        val: stats.conversas_7d?.toLocaleString("pt-BR") ?? "0",   cor: "#f59e0b", icon: Activity },
    { label: "Total de Mensagens",    val: stats.total_msgs?.toLocaleString("pt-BR") ?? "0",      cor: "#8b5cf6", icon: Hash },
    { label: "Tokens Consumidos",     val: ((stats.tokens_input_total ?? 0) + (stats.tokens_output_total ?? 0)).toLocaleString("pt-BR"), cor: "#f97316", icon: Layers },
    { label: "Custo Estimado (BRL)",  val: `R$ ${(stats.custo_brl_estimado ?? 0).toFixed(2)}`, cor: "#10B981", icon: DollarSign },
  ];

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(k => {
          const Icon = k.icon;
          return (
            <div key={k.label} className="panel-3d rounded-[6px] p-3 text-center"
              style={{ borderTopWidth: 2, borderTopColor: k.cor }}>
              <Icon className="w-4 h-4 mx-auto mb-1.5" style={{ color: k.cor }} />
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">{k.label}</p>
              <p className="text-lg font-black" style={{ color: k.cor }}>{k.val}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Agentes */}
        <div className="panel-3d rounded-[6px] overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/10">
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
              <Award className="w-3.5 h-3.5" /> Top 5 Agentes por Conversas
            </span>
          </div>
          <div className="p-4 space-y-3">
            {(stats.top_agentes ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma conversa registrada ainda.</p>
            )}
            {(stats.top_agentes ?? []).map((ag, i) => (
              <div key={ag.nome} className="flex items-center gap-3">
                <span className="text-[10px] font-black w-4 text-muted-foreground">{i + 1}º</span>
                <span className="text-lg">{ag.emoji}</span>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[11px] font-semibold">{ag.nome}</span>
                    <span className="text-[10px] font-mono" style={{ color: ag.cor_hex }}>{ag.conversas}</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-muted/30">
                    <div className="h-1.5 rounded-full" style={{
                      width: `${Math.max(4, ((ag.conversas / Math.max(1, (stats.top_agentes ?? [])[0]?.conversas ?? 1)) * 100))}%`,
                      backgroundColor: ag.cor_hex,
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Breakdown de Tokens */}
        <div className="panel-3d rounded-[6px] overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/10">
            <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400 flex items-center gap-2">
              <BarChart2 className="w-3.5 h-3.5" /> Detalhamento de Custo
            </span>
          </div>
          <div className="p-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-1.5 text-[9px] font-black uppercase text-muted-foreground">Item</th>
                  <th className="text-right py-1.5 text-[9px] font-black uppercase text-muted-foreground">Quantidade</th>
                  <th className="text-right py-1.5 text-[9px] font-black uppercase text-muted-foreground">Custo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                <tr>
                  <td className="py-2">Tokens de entrada (input)</td>
                  <td className="text-right font-mono">{(stats.tokens_input_total ?? 0).toLocaleString("pt-BR")}</td>
                  <td className="text-right font-mono text-emerald-400">
                    US$ {((stats.tokens_input_total ?? 0) / 1_000_000 * 3.0).toFixed(4)}
                  </td>
                </tr>
                <tr>
                  <td className="py-2">Tokens de saída (output)</td>
                  <td className="text-right font-mono">{(stats.tokens_output_total ?? 0).toLocaleString("pt-BR")}</td>
                  <td className="text-right font-mono text-amber-400">
                    US$ {((stats.tokens_output_total ?? 0) / 1_000_000 * 15.0).toFixed(4)}
                  </td>
                </tr>
                <tr className="font-bold">
                  <td className="py-2 text-sidebar-primary">Total (USD)</td>
                  <td></td>
                  <td className="text-right font-mono text-sidebar-primary">
                    US$ {(stats.custo_usd_estimado ?? 0).toFixed(4)}
                  </td>
                </tr>
                <tr className="font-bold">
                  <td className="py-2 text-amber-400">Total (BRL ~5,5x)</td>
                  <td></td>
                  <td className="text-right font-mono text-amber-400">
                    R$ {(stats.custo_brl_estimado ?? 0).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="text-[9px] text-muted-foreground mt-4 text-center">
              Preços referentes ao Claude Sonnet 4.6 (US$ 3/M input · US$ 15/M output). Cotação BRL estimada.
            </p>
          </div>
        </div>
      </div>

      {/* Alerta de economia */}
      <div className="panel-3d rounded-[6px] p-4 flex items-start gap-3" style={{ borderLeftWidth: 3, borderLeftColor: "#22c55e" }}>
        <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-emerald-400">Custo via Replit AI Integrations</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Este sistema usa o proxy do Replit para as chamadas de IA — <strong>você não precisa de uma chave própria da Anthropic</strong>.
            O custo real é incluído na sua assinatura Replit. Ao vender licenças do PAXTER,
            inclua uma margem de segurança de <strong>20–30%</strong> sobre o custo de IA estimado acima.
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMERCIAL — Monetização e Venda de Licenças
// ═══════════════════════════════════════════════════════════════════════════════

const PLANOS = [
  {
    id: "basico",
    nome: "Básico",
    preco: 497,
    cor: "#45B8CC",
    icon: Globe,
    descricao: "Para clínicas de 1 médico",
    recursos: [
      "Até 50 clientes ativos",
      "Agenda + Protocolos + RAS",
      "3 Agentes Virtuais",
      "Chat IA (Claude Haiku — rápido)",
      "WhatsApp via Twilio",
      "Google Drive integrado",
      "Suporte por e-mail",
    ],
    nao_inclui: ["IA avançada (Opus/GPT-5)", "Multi-clínica", "API própria"],
  },
  {
    id: "pro",
    nome: "Profissional",
    preco: 997,
    cor: "#D97706",
    icon: Crown,
    destaque: true,
    descricao: "Para clínicas estruturadas",
    recursos: [
      "Clientes ilimitados",
      "Todos os módulos clínicos",
      "20 Agentes Virtuais completos",
      "Chat IA (todos os 4 provedores)",
      "RAS FAP + Assinatura Digital ICP-Brasil",
      "Financeiro + Asaas integrado",
      "Análise de exames por IA",
      "Prioridade no suporte",
    ],
    nao_inclui: ["Multi-clínica", "White-label"],
  },
  {
    id: "enterprise",
    nome: "Enterprise",
    preco: 2497,
    cor: "#7C3AED",
    icon: Award,
    descricao: "Redes e franquias",
    recursos: [
      "Multi-clínica (até 10 unidades)",
      "White-label (sua marca)",
      "Painel central de comando",
      "API REST própria documentada",
      "SLA garantido 99,5%",
      "Onboarding dedicado",
      "Treinamento da equipe",
      "Gestor de conta exclusivo",
    ],
    nao_inclui: [],
  },
];

function AbaComercial() {
  const [pitchCopiado, setPitchCopiado] = useState<string | null>(null);
  const [planoSel, setPlanoSel] = useState("pro");
  const [nomeClinica, setNomeClinica] = useState("");
  const [nomeMedico, setNomeMedico] = useState("");

  function gerarPitch(planoId: string) {
    const plano = PLANOS.find(p => p.id === planoId)!;
    const clinica = nomeClinica || "sua clínica";
    const medico = nomeMedico || "Dr(a).";
    return `Olá, ${medico}! 👋

Quero te apresentar o *PAXTER* — o sistema de gestão clínica mais completo para protocolos injetáveis do Brasil.

*${plano.nome} — R$ ${plano.preco.toLocaleString("pt-BR")}/mês*

✅ ${plano.recursos.slice(0, 4).join("\n✅ ")}

Para ${clinica}, isso significa:
• Protocolos e RAS digitais com assinatura ICP-Brasil
• Agenda integrada ao Google Calendar
• Agentes de IA que respondem seus clientes automaticamente
• Tudo rodando do celular, sem instalação

📲 Posso agendar uma demo de 20min esta semana?

_PAXTER — Clinical Intelligence System_`;
  }

  function copiarPitch(planoId: string) {
    const txt = gerarPitch(planoId);
    copiarTexto(txt);
    setPitchCopiado(planoId);
    setTimeout(() => setPitchCopiado(null), 3000);
  }

  return (
    <div className="space-y-4">

      {/* Planos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANOS.map(p => {
          const Icon = p.icon;
          return (
            <div key={p.id} className={`panel-3d rounded-[6px] overflow-hidden flex flex-col ${(p as Record<string,unknown>).destaque ? "ring-2" : ""}`}
              style={{
                borderTopWidth: 3, borderTopColor: p.cor,
                ...(((p as Record<string,unknown>).destaque) ? { outlineColor: p.cor } : {}),
              }}>
              {((p as Record<string,unknown>).destaque) && (
                <div className="text-center py-1 text-[9px] font-black uppercase tracking-widest"
                  style={{ backgroundColor: p.cor + "30", color: p.cor }}>
                  MAIS POPULAR
                </div>
              )}
              <div className="p-4 flex-1 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-[6px] flex items-center justify-center"
                    style={{ backgroundColor: p.cor + "20", borderWidth: 1, borderColor: p.cor + "40" }}>
                    <Icon className="w-4 h-4" style={{ color: p.cor }} />
                  </div>
                  <div>
                    <p className="font-black text-sm" style={{ color: p.cor }}>{p.nome}</p>
                    <p className="text-[10px] text-muted-foreground">{p.descricao}</p>
                  </div>
                </div>
                <div>
                  <span className="text-3xl font-black" style={{ color: p.cor }}>
                    R$ {p.preco.toLocaleString("pt-BR")}
                  </span>
                  <span className="text-xs text-muted-foreground">/mês</span>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    = R$ {(p.preco / 30).toFixed(0)}/dia · {(p.preco / 30 / 8).toFixed(1)} por hora de clínica
                  </p>
                </div>
                <ul className="space-y-1.5">
                  {p.recursos.map(r => (
                    <li key={r} className="flex items-start gap-1.5 text-[11px]">
                      <Check className="w-3 h-3 mt-0.5 shrink-0 text-emerald-400" />
                      {r}
                    </li>
                  ))}
                  {p.nao_inclui.map(r => (
                    <li key={r} className="flex items-start gap-1.5 text-[11px] text-muted-foreground/50">
                      <X className="w-3 h-3 mt-0.5 shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="p-3 border-t border-border">
                <button onClick={() => copiarPitch(p.id)}
                  className="w-full btn-3d-soft py-2 text-xs font-semibold flex items-center justify-center gap-1.5"
                  style={{ color: p.cor }}>
                  {pitchCopiado === p.id ? <><Check className="w-3 h-3 text-emerald-400" /> Copiado!</> : <><Copy className="w-3 h-3" /> Copiar Pitch WhatsApp</>}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Gerador de Pitch Personalizado */}
      <div className="panel-3d rounded-[6px] overflow-hidden" style={{ borderLeftWidth: 3, borderLeftColor: "#D97706" }}>
        <div className="px-4 py-3 border-b border-border bg-amber-500/5">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
            <Target className="w-3.5 h-3.5" /> Gerador de Pitch Personalizado
          </span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Plano</label>
                <select value={planoSel} onChange={e => setPlanoSel(e.target.value)}
                  className="w-full text-xs bg-background border border-border rounded-[4px] px-2 py-1.5">
                  {PLANOS.map(p => <option key={p.id} value={p.id}>{p.nome} — R$ {p.preco}/mês</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Nome do Médico</label>
                <input value={nomeMedico} onChange={e => setNomeMedico(e.target.value)}
                  placeholder="Dr. João Silva"
                  className="w-full text-xs bg-background border border-border rounded-[4px] px-2 py-1.5" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Nome da Clínica</label>
                <input value={nomeClinica} onChange={e => setNomeClinica(e.target.value)}
                  placeholder="Clínica Bela Forma"
                  className="w-full text-xs bg-background border border-border rounded-[4px] px-2 py-1.5" />
              </div>
              <button onClick={() => copiarPitch(planoSel)}
                className="w-full btn-3d-soft py-2 text-xs font-semibold flex items-center justify-center gap-1.5 text-amber-400">
                {pitchCopiado === planoSel ? <><Check className="w-3 h-3 text-emerald-400" /> Copiado!</> : <><Copy className="w-3 h-3" /> Copiar Pitch</>}
              </button>
            </div>
            <div className="md:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Prévia do Pitch</p>
              <pre className="concave-3d rounded-[6px] p-3 text-[11px] whitespace-pre-wrap leading-relaxed text-foreground font-mono overflow-y-auto"
                style={{ maxHeight: "220px" }}>
                {gerarPitch(planoSel)}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* Roteiro de Vendas */}
      <div className="panel-3d rounded-[6px] overflow-hidden" style={{ borderLeftWidth: 3, borderLeftColor: "#22c55e" }}>
        <div className="px-4 py-3 border-b border-border bg-emerald-500/5">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5" /> Roteiro de Venda — 5 Etapas para a Primeira Licença
          </span>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 text-[9px] font-black uppercase text-muted-foreground w-8">Etapa</th>
                <th className="text-left py-2 text-[9px] font-black uppercase text-muted-foreground">Ação</th>
                <th className="text-left py-2 text-[9px] font-black uppercase text-muted-foreground">Ferramenta</th>
                <th className="text-left py-2 text-[9px] font-black uppercase text-muted-foreground">Prazo</th>
                <th className="text-left py-2 text-[9px] font-black uppercase text-muted-foreground">Meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {[
                { e:"1", acao:"Operar 2 semanas com dados reais (protocolos + agenda + RAS)", ferr:"PAXTER internamente", prazo:"Semanas 1-2", meta:"Dominar o fluxo clínico" },
                { e:"2", acao:"Gravar vídeo de 3min mostrando o sistema em uso real", ferr:"Celular + Loom", prazo:"Dia 14", meta:"Prova social visual" },
                { e:"3", acao:"Listar 10 médicos conhecidos do seu network (WhatsApp)", ferr:"Contatos pessoais", prazo:"Dia 15", meta:"Pipeline de 10 leads" },
                { e:"4", acao:"Enviar pitch personalizado para os 10 (usar gerador acima)", ferr:"WhatsApp + pitch desta aba", prazo:"Dias 15-17", meta:"3+ respostas positivas" },
                { e:"5", acao:"Agendar demo de 20min e fechar contrato de 3 meses mínimo", ferr:"Google Meet + contrato simples", prazo:"Semana 3", meta:"1ª licença paga" },
              ].map((r, i) => (
                <tr key={i} className={i % 2 === 0 ? "bg-muted/5" : ""}>
                  <td className="py-2 font-black text-emerald-400">{r.e}</td>
                  <td className="py-2">{r.acao}</td>
                  <td className="py-2 text-muted-foreground">{r.ferr}</td>
                  <td className="py-2 font-mono text-sidebar-primary">{r.prazo}</td>
                  <td className="py-2 text-amber-400">{r.meta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── KPI Cards ───────────────────────────────────────────────────────────────

function KPICards({ agentes }: { agentes: Agente[] }) {
  const total = agentes.length;
  const disponiveis = agentes.filter(a => a.status_prontidao === "disponivel").length;
  const pawards = agentes.filter(a => a.grupo === "pawards").length;
  const manager = agentes.filter(a => a.grupo === "manager").length;
  const comAcessoTotal = agentes.filter(a => a.pode_acesso_total).length;

  const kpis = [
    { label: "Total de Agentes",    valor: total,         cor: "#45B8CC" },
    { label: "Disponíveis Agora",   valor: disponiveis,   cor: "#22c55e" },
    { label: "Grupo PAWARDS",       valor: pawards,       cor: "#f59e0b" },
    { label: "Grupo MANAGER",       valor: manager,       cor: "#647c97" },
    { label: "Acesso Total",        valor: comAcessoTotal, cor: "#f97316" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
      {kpis.map(k => (
        <div key={k.label} className="panel-3d rounded-[6px] p-3 text-center">
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">{k.label}</p>
          <p className="text-2xl font-black concave-3d rounded-[4px] py-1" style={{ color: k.cor }}>{k.valor}</p>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRAÇÕES — Status Trello + WhatsApp + toggles por agente
// ═══════════════════════════════════════════════════════════════════════════════

interface TrelloStatus {
  configurado: boolean;
  webhook_interno: string;
  webhook_externo: string;
  board_id: string | null;
  instrucoes: string[];
}
interface WppStatus { configurado: boolean; instrucoes: string[] | null; }
interface GitHubPatInfo {
  status: "conectado" | "expirado_em_breve" | "erro" | "nao_configurado";
  expira_em: string | null;
  login: string | null;
}
interface TrelloLista { id: string; name: string; }
interface TrelloConfig {
  agente_id: number;
  trello_interno_ativo: boolean;
  trello_externo_ativo: boolean;
  wpp_proativo_ativo: boolean;
  trello_list_id_default: string | null;
}

function AbaIntegracoes() {
  const [trello,     setTrello]     = useState<TrelloStatus  | null>(null);
  const [wpp,        setWpp]        = useState<WppStatus     | null>(null);
  const [githubPat,  setGithubPat]  = useState<GitHubPatInfo | null>(null);
  const [listas,     setListas]     = useState<TrelloLista[]>([]);
  const [agentes,    setAgentes]    = useState<Agente[]>([]);
  const [configs,    setConfigs]    = useState<Record<number, TrelloConfig>>({});
  const [salvando,   setSalvando]   = useState<Record<number, boolean>>({});
  const [copied,     setCopied]     = useState<string | null>(null);
  const [loading,    setLoading]    = useState(true);

  // Kaizen B — toggle boas-vindas WPP
  const [boasVindasAtivo, setBoasVindasAtivo] = useState(true);
  const [salvandoBV,      setSalvandoBV]      = useState(false);

  // Kaizen C — dashboard ao vivo
  interface DashKPIs { trello: { total_cards: number; hoje: number; ultima_atividade: string|null }; wpp: { total_enviadas: number; hoje: number; ultima_atividade: string|null }; log_recente: Array<{ tipo: string; status: string; created_at: string; detalhe: any }> }
  const [dash,       setDash]       = useState<DashKPIs | null>(null);
  const [dashTick,   setDashTick]   = useState(0);

  // Histórico do Monitor de LLMs
  interface LlmHistReg {
    id: number;
    geradoEmBrt: string;
    periodoHoras: number;
    totalChamadas: number;
    totalCustoUsd: number;
    mudancasPlanilha: number;
    canal: "slack" | "telegram" | "ambos" | "nenhum";
    enviadoOk: boolean;
    erro: string | null;
  }
  const [llmHist,      setLlmHist]      = useState<LlmHistReg[]>([]);
  const [llmHistLoad,  setLlmHistLoad]  = useState(true);
  const [llmHistDias,  setLlmHistDias]  = useState(7);

  const carregarDash = useCallback(async () => {
    const r = await apiFetch("/agentes-integracoes/dashboard");
    setDash(r);
  }, []);

  const carregarLlmHist = useCallback(async (dias: number) => {
    setLlmHistLoad(true);
    const r = await apiFetch(`/padaxor/slack/historico?dias=${dias}`);
    setLlmHist(r?.registros ?? []);
    setLlmHistLoad(false);
  }, []);

  useEffect(() => {
    Promise.all([
      apiFetch("/agentes-trello/status"),
      apiFetch("/agentes-wpp/status"),
      apiFetch("/agentes-trello/listas"),
      apiFetch("/agentes"),
      apiFetch("/settings/boas_vindas_wpp"),
      fetch(`${BASE}api/health`).then(r => r.ok ? r.json() : null).catch(() => null),
    ]).then(([t, w, l, a, bv, h]) => {
      setTrello(t);
      setWpp(w);
      setGithubPat(h?.github_pat_detalhe ?? null);
      setListas(l?.listas ?? []);
      const lista: Agente[] = a?.items ?? [];
      setAgentes(lista);
      setBoasVindasAtivo(bv?.valor !== "false");
      const cfgs: Record<number, TrelloConfig> = {};
      lista.forEach((ag: Agente) => {
        cfgs[ag.id] = {
          agente_id: ag.id,
          trello_interno_ativo: false,
          trello_externo_ativo: false,
          wpp_proativo_ativo: false,
          trello_list_id_default: null,
        };
      });
      setConfigs(cfgs);
      setLoading(false);
      lista.forEach(async (ag: Agente) => {
        const r = await apiFetch(`/agentes-trello/config/${ag.id}`);
        if (r) setConfigs(prev => ({ ...prev, [ag.id]: { ...prev[ag.id], ...r } }));
      });
    });
    carregarDash();
  }, [carregarDash]);

  // Auto-refresh do dashboard a cada 30s (Kaizen C)
  useEffect(() => {
    const id = setInterval(() => { setDashTick(n => n + 1); }, 30_000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { carregarDash(); }, [dashTick, carregarDash]);

  // Carregar histórico de LLMs ao montar e quando o filtro de dias muda
  useEffect(() => { carregarLlmHist(llmHistDias); }, [llmHistDias, carregarLlmHist]);

  function copiar(texto: string, chave: string) {
    navigator.clipboard.writeText(texto);
    setCopied(chave);
    setTimeout(() => setCopied(null), 2000);
  }

  async function salvarConfig(agenteId: number) {
    const cfg = configs[agenteId];
    if (!cfg) return;
    setSalvando(p => ({ ...p, [agenteId]: true }));
    await apiFetch("/agentes-trello/config", { method: "POST", body: JSON.stringify(cfg) });
    setSalvando(p => ({ ...p, [agenteId]: false }));
  }

  function toggleCfg(agenteId: number, campo: keyof TrelloConfig, valor: boolean) {
    setConfigs(p => ({ ...p, [agenteId]: { ...p[agenteId], [campo]: valor } }));
  }

  async function toggleBoasVindas(novo: boolean) {
    setSalvandoBV(true);
    setBoasVindasAtivo(novo);
    await apiFetch("/settings/boas_vindas_wpp", {
      method: "PUT",
      body: JSON.stringify({ valor: String(novo) }),
    });
    setSalvandoBV(false);
  }

  const COR_OK  = "#22c55e";
  const COR_ERR = "#ef4444";
  const COR_AVS = "#f59e0b"; // amber — aviso

  // Semáforo: calcula estado geral
  const estadoGeral: "ok" | "parcial" | "pendente" =
    trello?.configurado && wpp?.configurado ? "ok" :
    trello?.configurado || wpp?.configurado ? "parcial" : "pendente";
  const corSemaforo = estadoGeral === "ok" ? COR_OK : estadoGeral === "parcial" ? COR_AVS : COR_ERR;
  const labelSemaforo = estadoGeral === "ok" ? "TUDO OPERACIONAL" : estadoGeral === "parcial" ? "PARCIAL" : "PENDENTE";

  function fmtTipo(tipo: string) {
    const mapa: Record<string,string> = {
      trello_card:   "Trello Card", wpp_proativo: "WPP Proativo",
      wpp_boasvindas: "WPP Boas-vindas", trello_externo: "Trello Externo",
    };
    return mapa[tipo] ?? tipo;
  }
  function fmtData(iso: string) {
    return new Date(iso).toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
  }

  return (
    <div className="space-y-5 p-4 max-w-3xl mx-auto">

      {/* ══════════════════════════════════════════════════════
          PAINEL VISUAL — COMO FUNCIONA (glossário + fluxo + semáforo)
      ══════════════════════════════════════════════════════ */}
      <div className="panel-3d-sub rounded-[6px] overflow-hidden">
        {/* Cabeçalho com semáforo */}
        <div className="px-4 py-3 border-b border-border flex items-center gap-3 bg-muted/10">
          <div className="flex items-center gap-2 flex-1">
            <Activity className="w-4 h-4" style={{ color: corSemaforo }} />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Como Funciona</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: corSemaforo }} />
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: corSemaforo }}>
              {loading ? "…" : labelSemaforo}
            </span>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Fluxo Blueprint */}
          <div className="concave-3d rounded-[4px] p-3 overflow-x-auto">
            <div className="flex items-center gap-1 text-[10px] whitespace-nowrap min-w-max">
              {[
                { label: "Gatilho", desc: "Evento clínico", cor: "#3D7A7A" },
                { label: "Agente IA", desc: "Detecta oportunidade", cor: "#45B8CC" },
                { label: "Trello", desc: "Card registrado", cor: "#0052CC" },
                { label: "WhatsApp", desc: "Msg ao cliente", cor: "#25D366" },
                { label: "Log", desc: "Histórico salvo", cor: "#8B5CF6" },
              ].map((passo, i, arr) => (
                <div key={passo.label} className="flex items-center gap-1">
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="px-2 py-1 rounded-[4px] border font-black uppercase tracking-wider"
                      style={{ borderColor: passo.cor, color: passo.cor, fontSize: "9px" }}>
                      {passo.label}
                    </div>
                    <span className="text-muted-foreground" style={{ fontSize: "8px" }}>{passo.desc}</span>
                  </div>
                  {i < arr.length - 1 && <span className="text-muted-foreground px-0.5">→</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Glossário técnico/leigo */}
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr style={{ backgroundColor: "rgba(69,184,204,0.08)" }}>
                <th className="text-left p-1.5 text-[10px] uppercase tracking-wider font-black">Termo Técnico</th>
                <th className="text-left p-1.5 text-[10px] uppercase tracking-wider font-black">O que é (leigo)</th>
                <th className="text-left p-1.5 text-[10px] uppercase tracking-wider font-black">Gatilho / Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                ["Webhook", "Canal de escuta", "Trello avisa o PAXTER quando algo muda no quadro"],
                ["Card Trello", "Cartão de tarefa", "Criado automaticamente quando o agente age"],
                ["WPP Proativo", "Mensagem ativa no WhatsApp", "Agente envia msg ao cliente sem que ele pergunte"],
                ["Boas-vindas WPP", "Primeira mensagem automática", "Enviada ao cadastrar um cliente novo com telefone"],
                ["Toggle", "Chave liga/desliga", "Controla cada integração por agente individualmente"],
                ["Log de Atividade", "Registro histórico", "Todo disparo fica gravado com status e detalhe"],
                ["Status PENDENTE", "Integração não configurada", "Secreto ausente — seguir os passos de configuração"],
                ["Auto-refresh 30s", "Atualização automática", "O dashboard relê os dados a cada 30 segundos"],
              ].map(([termo, leigo, acao]) => (
                <tr key={termo} className="hover:bg-muted/10">
                  <td className="p-1.5 font-semibold text-sidebar-primary">{termo}</td>
                  <td className="p-1.5 text-muted-foreground">{leigo}</td>
                  <td className="p-1.5 text-muted-foreground">{acao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          KAIZEN B — TOGGLE BOAS-VINDAS WPP
      ══════════════════════════════════════════════════════ */}
      <div className="panel-3d-sub rounded-[6px] p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-sm font-bold">Boas-vindas automático via WhatsApp</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Envia mensagem de boas-vindas ao cadastrar um cliente novo que tenha telefone.
              Só dispara se o WhatsApp estiver configurado.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {salvandoBV && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
            <button onClick={() => toggleBoasVindas(!boasVindasAtivo)}
              disabled={!wpp?.configurado}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-40 ${
                boasVindasAtivo ? "bg-emerald-500" : "bg-muted"
              }`}>
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                boasVindasAtivo ? "translate-x-4" : "translate-x-0.5"
              }`} />
            </button>
            <span className="text-[10px] font-black uppercase tracking-wider"
              style={{ color: boasVindasAtivo ? COR_OK : COR_ERR }}>
              {boasVindasAtivo ? "ATIVO" : "OFF"}
            </span>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          KAIZEN C — DASHBOARD AO VIVO
      ══════════════════════════════════════════════════════ */}
      <div className="panel-3d-sub rounded-[6px] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-muted/10">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Dashboard de Integrações</span>
          <span className="text-[9px] text-muted-foreground flex items-center gap-1">
            <RotateCcw className="w-2.5 h-2.5" /> auto-refresh 30s
          </span>
        </div>
        <div className="p-4 space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Cards Trello",   valor: dash?.trello.total_cards ?? "—",   cor: "#0052CC", icon: <Layers className="w-3.5 h-3.5" /> },
              { label: "Cards Hoje",     valor: dash?.trello.hoje ?? "—",           cor: "#3D7A7A", icon: <Activity className="w-3.5 h-3.5" /> },
              { label: "WPP Enviados",   valor: dash?.wpp.total_enviadas ?? "—",   cor: "#25D366", icon: <Smartphone className="w-3.5 h-3.5" /> },
              { label: "WPP Hoje",       valor: dash?.wpp.hoje ?? "—",             cor: "#45B8CC", icon: <MessageSquare className="w-3.5 h-3.5" /> },
            ].map(k => (
              <div key={k.label} className="concave-3d rounded-[4px] p-3 text-center">
                <div className="flex justify-center mb-1" style={{ color: k.cor }}>{k.icon}</div>
                <p className="text-xl font-black" style={{ color: k.cor }}>{String(k.valor)}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Tabela de log recente */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2">Últimas Atividades</p>
            {!dash || dash.log_recente.length === 0 ? (
              <div className="text-[11px] text-muted-foreground text-center py-4 concave-3d rounded-[4px]">
                Nenhuma atividade registrada ainda.
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ backgroundColor: "rgba(61,122,122,0.08)" }}>
                    <th className="text-left p-1.5 text-[9px] uppercase tracking-wider font-black">Tipo</th>
                    <th className="text-left p-1.5 text-[9px] uppercase tracking-wider font-black">Status</th>
                    <th className="text-left p-1.5 text-[9px] uppercase tracking-wider font-black">Data/Hora</th>
                    <th className="text-left p-1.5 text-[9px] uppercase tracking-wider font-black">Detalhe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dash.log_recente.map((lg, i) => (
                    <tr key={i} className="hover:bg-muted/10">
                      <td className="p-1.5 font-semibold">{fmtTipo(lg.tipo)}</td>
                      <td className="p-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase"
                          style={{
                            backgroundColor: lg.status === "ok" ? "rgba(34,197,94,0.15)" : lg.status === "skip" ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)",
                            color:           lg.status === "ok" ? COR_OK                : lg.status === "skip" ? COR_AVS               : COR_ERR,
                          }}>
                          {lg.status}
                        </span>
                      </td>
                      <td className="p-1.5 text-muted-foreground">{fmtData(lg.created_at)}</td>
                      <td className="p-1.5 text-muted-foreground text-[10px] truncate max-w-[180px]">
                        {lg.detalhe?.motivo ?? lg.detalhe?.sid ?? lg.detalhe?.erro ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          STATUS + WEBHOOKS DAS INTEGRAÇÕES
      ══════════════════════════════════════════════════════ */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
          Status das Integrações
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="panel-3d-sub rounded-[6px] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" style={{ color: trello?.configurado ? COR_OK : COR_ERR }} />
              <span className="font-bold text-sm">Trello</span>
              <span className="ml-auto text-[10px] font-black uppercase tracking-wider"
                style={{ color: trello?.configurado ? COR_OK : COR_ERR }}>
                {loading ? "…" : trello?.configurado ? "CONFIGURADO" : "PENDENTE"}
              </span>
            </div>
            {trello && (
              <div className="space-y-1.5">
                <WebhookUrlRow label="Webhook Interno" url={trello.webhook_interno} copied={copied} onCopy={copiar} chave="wi" />
                <WebhookUrlRow label="Webhook Externo" url={trello.webhook_externo} copied={copied} onCopy={copiar} chave="we" />
              </div>
            )}
            {!trello?.configurado && trello?.instrucoes && (
              <ol className="text-[10px] text-muted-foreground space-y-0.5 mt-2 list-decimal list-inside">
                {trello.instrucoes.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}
          </div>
          <div className="panel-3d-sub rounded-[6px] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4" style={{ color: wpp?.configurado ? COR_OK : COR_ERR }} />
              <span className="font-bold text-sm">WhatsApp</span>
              <span className="ml-auto text-[10px] font-black uppercase tracking-wider"
                style={{ color: wpp?.configurado ? COR_OK : COR_ERR }}>
                {loading ? "…" : wpp?.configurado ? "CONFIGURADO" : "PENDENTE"}
              </span>
            </div>
            {wpp?.configurado ? (
              <p className="text-[11px] text-muted-foreground">
                Twilio conectado via TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN. Notificações proativas disponíveis por agente.
              </p>
            ) : (
              <ol className="text-[10px] text-muted-foreground space-y-0.5 list-decimal list-inside">
                {(wpp?.instrucoes ?? ["Configure TWILIO_ACCOUNT_SID e TWILIO_AUTH_TOKEN nos Secrets."]).map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}
          </div>

          {/* GitHub PAT — card full-width */}
          <div className="col-span-2 panel-3d-sub rounded-[6px] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4" style={{
                color: loading ? undefined
                  : githubPat?.status === "conectado"        ? COR_OK
                  : githubPat?.status === "expirado_em_breve"? COR_AVS
                  : githubPat?.status === "nao_configurado"  ? "#6b7280"
                  : COR_ERR,
              }} />
              <span className="font-bold text-sm">GitHub PAT</span>
              <span className="ml-auto text-[10px] font-black uppercase tracking-wider" style={{
                color: loading ? undefined
                  : githubPat?.status === "conectado"        ? COR_OK
                  : githubPat?.status === "expirado_em_breve"? COR_AVS
                  : githubPat?.status === "nao_configurado"  ? "#6b7280"
                  : COR_ERR,
              }}>
                {loading ? "…"
                  : githubPat?.status === "conectado"         ? "CONECTADO"
                  : githubPat?.status === "expirado_em_breve" ? "EXPIRA EM BREVE"
                  : githubPat?.status === "nao_configurado"   ? "NÃO CONFIGURADO"
                  : "ERRO"}
              </span>
            </div>
            {!loading && githubPat && githubPat.status !== "nao_configurado" && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-muted-foreground">
                {githubPat.login && (
                  <span>Login: <span className="font-semibold text-foreground">{githubPat.login}</span></span>
                )}
                {githubPat.expira_em && (
                  <span>
                    Expira em:{" "}
                    <span className={`font-semibold ${githubPat.status === "expirado_em_breve" ? "text-amber-500" : "text-foreground"}`}>
                      {new Date(githubPat.expira_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </span>
                  </span>
                )}
                {githubPat.status === "expirado_em_breve" && (
                  <span className="text-amber-500 font-semibold">⚠ Renove o token antes de expirar para não perder acesso ao repositório.</span>
                )}
                {githubPat.status === "erro" && (
                  <span className="text-red-500 font-semibold">Token inválido ou revogado. Configure GITHUB_PAT nos Secrets.</span>
                )}
              </div>
            )}
            {!loading && (!githubPat || githubPat.status === "nao_configurado") && (
              <p className="text-[11px] text-muted-foreground">Configure a variável GITHUB_PAT nos Secrets para habilitar integrações com o repositório.</p>
            )}
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          CONFIGURAÇÃO POR AGENTE
      ══════════════════════════════════════════════════════ */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
          Configuração por Agente
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm p-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando agentes…
          </div>
        ) : (
          <div className="space-y-2">
            {agentes.map(ag => {
              const cfg = configs[ag.id];
              if (!cfg) return null;
              return (
                <div key={ag.id} className="panel-3d-sub rounded-[6px] p-3 flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 w-44 shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: ag.cor_hex }} />
                    <span className="text-xs font-bold truncate">{ag.nome}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 flex-1">
                    <ToggleItem label="Trello Int."  ativo={cfg.trello_interno_ativo} disabled={!trello?.configurado} onChange={v => toggleCfg(ag.id, "trello_interno_ativo", v)} />
                    <ToggleItem label="Trello Ext."  ativo={cfg.trello_externo_ativo} disabled={!trello?.configurado} onChange={v => toggleCfg(ag.id, "trello_externo_ativo", v)} />
                    <ToggleItem label="WPP Proativo" ativo={cfg.wpp_proativo_ativo}   disabled={!wpp?.configurado}   onChange={v => toggleCfg(ag.id, "wpp_proativo_ativo",   v)} />
                    {trello?.configurado && listas.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Lista padrão</span>
                        <select value={cfg.trello_list_id_default ?? ""}
                          onChange={e => setConfigs(p => ({ ...p, [ag.id]: { ...p[ag.id], trello_list_id_default: e.target.value || null } }))}
                          className="text-[10px] bg-muted/40 border border-border rounded px-1.5 py-0.5">
                          <option value="">— nenhuma —</option>
                          {listas.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <button onClick={() => salvarConfig(ag.id)} disabled={salvando[ag.id]}
                    className="btn-3d-soft px-3 py-1 text-[10px] font-black uppercase tracking-wider disabled:opacity-40 flex items-center gap-1">
                    {salvando[ag.id] ? <><Loader2 className="w-3 h-3 animate-spin" /> Salvando</> : <><Save className="w-3 h-3" /> Salvar</>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          HISTÓRICO DO MONITOR DE LLMs
      ══════════════════════════════════════════════════════ */}
      <div className="panel-3d-sub rounded-[6px] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center justify-between bg-muted/10">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Histórico — Monitor de LLMs
          </span>
          <div className="flex items-center gap-2">
            <select value={llmHistDias} onChange={e => setLlmHistDias(Number(e.target.value))}
              className="text-[10px] bg-muted/40 border border-border rounded px-1.5 py-0.5">
              <option value={1}>Último dia</option>
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
            </select>
            <button onClick={() => carregarLlmHist(llmHistDias)}
              className="btn-3d-soft px-2 py-0.5 text-[10px] flex items-center gap-1">
              <RefreshCw className="w-2.5 h-2.5" /> Atualizar
            </button>
          </div>
        </div>
        <div className="p-4">
          {llmHistLoad ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm justify-center py-6">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando histórico…
            </div>
          ) : llmHist.length === 0 ? (
            <div className="text-center py-6 text-[11px] text-muted-foreground concave-3d rounded-[4px]">
              Nenhum relatório gravado nos últimos {llmHistDias} dias.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr style={{ backgroundColor: "rgba(69,184,204,0.08)" }}>
                    <th className="text-left p-1.5 text-[9px] uppercase tracking-wider font-black">Data/Hora (BRT)</th>
                    <th className="text-left p-1.5 text-[9px] uppercase tracking-wider font-black">Canal</th>
                    <th className="text-left p-1.5 text-[9px] uppercase tracking-wider font-black">Status</th>
                    <th className="text-right p-1.5 text-[9px] uppercase tracking-wider font-black">Chamadas IA</th>
                    <th className="text-right p-1.5 text-[9px] uppercase tracking-wider font-black">Custo</th>
                    <th className="text-right p-1.5 text-[9px] uppercase tracking-wider font-black">Δ Planilha</th>
                    <th className="text-left p-1.5 text-[9px] uppercase tracking-wider font-black">Erro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {llmHist.map(r => (
                    <tr key={r.id} className="hover:bg-muted/10">
                      <td className="p-1.5 text-muted-foreground whitespace-nowrap">{r.geradoEmBrt}</td>
                      <td className="p-1.5">
                        <LlmCanalBadge canal={r.canal} />
                      </td>
                      <td className="p-1.5">
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase"
                          style={{
                            backgroundColor: r.enviadoOk ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                            color:           r.enviadoOk ? "#22c55e"               : "#ef4444",
                          }}>
                          {r.enviadoOk ? "OK" : "FALHA"}
                        </span>
                      </td>
                      <td className="p-1.5 text-right font-mono">{r.totalChamadas.toLocaleString("pt-BR")}</td>
                      <td className="p-1.5 text-right font-mono text-emerald-400">
                        U$ {Number(r.totalCustoUsd).toFixed(4)}
                      </td>
                      <td className="p-1.5 text-right font-mono">
                        {r.mudancasPlanilha > 0
                          ? <span className="text-amber-400">+{r.mudancasPlanilha}</span>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-1.5 text-muted-foreground text-[10px] truncate max-w-[180px]" title={r.erro ?? ""}>
                        {r.erro ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componentes utilitários de AbaIntegracoes ───────────────────────────

function WebhookUrlRow({ label, url, copied, onCopy, chave }: {
  label: string; url: string; copied: string | null;
  onCopy: (u: string, k: string) => void; chave: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Webhook className="w-3 h-3 text-muted-foreground shrink-0" />
      <span className="text-[9px] text-muted-foreground uppercase tracking-wider w-24 shrink-0">{label}</span>
      <span className="text-[10px] text-cyan-400 truncate flex-1 font-mono" title={url}>
        {url.replace("https://", "").slice(0, 45)}…
      </span>
      <button onClick={() => onCopy(url, chave)}
        className="shrink-0 p-0.5 hover:text-foreground text-muted-foreground">
        {copied === chave
          ? <Check className="w-3 h-3 text-emerald-400" />
          : <Copy className="w-3 h-3" />}
      </button>
    </div>
  );
}

function ToggleItem({ label, ativo, disabled, onChange }: {
  label: string; ativo: boolean; disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!ativo)}
      className="flex items-center gap-1 text-[10px] disabled:opacity-40"
      title={disabled ? "Integração não configurada" : undefined}>
      {ativo
        ? <ToggleRight className="w-4 h-4 text-emerald-400" />
        : <ToggleLeft  className="w-4 h-4 text-muted-foreground" />}
      <span className={ativo ? "text-emerald-400 font-bold" : "text-muted-foreground"}>{label}</span>
    </button>
  );
}

/**
 * Badge visual para o campo `canal` da tabela llm_reports_history.
 * Exibe label distinto e cor semântica para cada um dos 4 valores possíveis:
 *   ambos    → verde   (ambos os canais entregaram)
 *   slack    → ciano   (só Slack entregou)
 *   telegram → azul    (só Telegram entregou)
 *   nenhum   → vermelho com borda (erro — nenhum canal entregou)
 */
function LlmCanalBadge({ canal }: { canal: "slack" | "telegram" | "ambos" | "nenhum" }) {
  const cfg: Record<string, { label: string; bg: string; color: string; border?: string }> = {
    ambos:    { label: "Slack + Telegram", bg: "rgba(34,197,94,0.15)",   color: "#22c55e" },
    slack:    { label: "Slack",            bg: "rgba(69,184,204,0.15)",  color: "#45B8CC" },
    telegram: { label: "Telegram",         bg: "rgba(14,165,233,0.15)",  color: "#0ea5e9" },
    nenhum:   { label: "Nenhum canal",     bg: "rgba(239,68,68,0.2)",    color: "#ef4444", border: "1px solid rgba(239,68,68,0.5)" },
  };
  const c = cfg[canal] ?? cfg["nenhum"];
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase"
      style={{ backgroundColor: c.bg, color: c.color, border: c.border }}>
      {c.label}
    </span>
  );
}

// ─── Hub Principal ────────────────────────────────────────────────────────────

const ABAS = [
  { key: "catalogo",       label: "Catálogo",        icon: Bot,          grupo: "agentes"    },
  { key: "identidade",     label: "Identidade",      icon: User,         grupo: "agentes"    },
  { key: "personalidade",  label: "Personalidade",   icon: Brain,        grupo: "agentes"    },
  { key: "capacidades",    label: "Capacidades",     icon: Shield,       grupo: "agentes"    },
  { key: "motor",          label: "Motor de Escrita",icon: Zap,          grupo: "agentes"    },
  { key: "narrativas",     label: "Narrativas",      icon: BookOpen,     grupo: "agentes"    },
  { key: "frases",         label: "Frases-Base",     icon: AlignLeft,    grupo: "agentes"    },
  { key: "chat",           label: "Chat IA",         icon: MessageSquare,grupo: "ia"         },
  { key: "chatpro",        label: "Console IA Pro",  icon: Sparkles,     grupo: "ia"         },
  { key: "provedores",     label: "Provedores",      icon: Cpu,          grupo: "ia"         },
  { key: "integracoes",    label: "Integrações",     icon: Webhook,      grupo: "ia"         },
  { key: "uso",            label: "Uso & Custo",     icon: BarChart2,    grupo: "comercial"  },
  { key: "comercial",      label: "Comercial",       icon: DollarSign,   grupo: "comercial"  },
] as const;

type AbaKey = typeof ABAS[number]["key"];

export default function AgentesHub() {
  const [aba, setAba] = useState<AbaKey>("catalogo");
  const [agentes, setAgentes] = useState<Agente[]>([]);
  const [loading, setLoading] = useState(true);
  const [agenteDestaque, setAgenteDestaque] = useState<Agente | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const r = await apiFetch("/agentes");
    setAgentes(r?.items ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function selecionarAgente(a: Agente) {
    setAgenteDestaque(a);
    setAba("identidade");
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px]">
      {/* Cabeçalho */}
      <div className="panel-3d rounded-[6px] px-5 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[6px] bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Bot className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-wider">Agentes Virtuais</h1>
              <p className="text-xs text-muted-foreground">
                Catálogo completo · 10 PAWARDS + 10 Manager · 14 dimensões de personalidade
              </p>
            </div>
          </div>
        </div>
        <button onClick={carregar} className="btn-3d-soft px-3 py-1.5 text-xs flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Recarregar
        </button>
      </div>

      {/* KPIs */}
      {!loading && <KPICards agentes={agentes} />}
      {loading && <div className="text-sm text-muted-foreground py-4 text-center">Carregando agentes…</div>}

      {/* Abas — agrupadas em 3 faixas */}
      {!loading && (
        <>
          {/* Faixa de grupos */}
          <div className="space-y-0">
            {[
              { id: "agentes",   label: "Agentes",   cor: "#45B8CC" },
              { id: "ia",        label: "IA",         cor: "#D97706" },
              { id: "comercial", label: "Comercial",  cor: "#22c55e" },
            ].map(grupo => {
              const abasGrupo = ABAS.filter(a => a.grupo === grupo.id);
              const temAtivo = abasGrupo.some(a => a.key === aba);
              return (
                <div key={grupo.id} className="mb-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[9px] font-black uppercase tracking-widest px-1.5"
                      style={{ color: grupo.cor }}>
                      {grupo.label}
                    </span>
                    <div className="flex-1 h-px" style={{ backgroundColor: grupo.cor + "30" }} />
                  </div>
                  <div className="flex flex-wrap gap-0.5">
                    {abasGrupo.map(a => {
                      const Icon = a.icon;
                      const ativo = aba === a.key;
                      return (
                        <button key={a.key} onClick={() => setAba(a.key)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-[4px] border transition-all ${
                            ativo
                              ? "border-b-2 text-foreground bg-muted/20"
                              : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/10"
                          }`}
                          style={ativo ? { borderBottomColor: grupo.cor, color: grupo.cor } : {}}>
                          <Icon className="w-3 h-3" />{a.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-2">
            {aba === "catalogo"      && <AbaCatalogo agentes={agentes} onSelect={selecionarAgente} />}
            {aba === "identidade"    && <AbaIdentidade agentes={agentes} />}
            {aba === "personalidade" && <AbaPersonalidade agentes={agentes} onReload={carregar} />}
            {aba === "capacidades"   && <AbaCapacidades agentes={agentes} onReload={carregar} />}
            {aba === "motor"         && <AbaMotor agentes={agentes} />}
            {aba === "narrativas"    && <AbaNarrativas agentes={agentes} />}
            {aba === "frases"        && <AbaFrases agentes={agentes} />}
            {aba === "chat"          && <AbaChat agentes={agentes} />}
            {aba === "chatpro"       && <AbaChatPro agentes={agentes} />}
            {aba === "provedores"    && <AbaProvedores agentes={agentes} />}
            {aba === "integracoes"   && <AbaIntegracoes />}
            {aba === "uso"           && <AbaUso />}
            {aba === "comercial"     && <AbaComercial />}
          </div>
        </>
      )}
    </div>
  );
}
