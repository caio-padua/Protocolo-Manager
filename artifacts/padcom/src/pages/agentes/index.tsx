/**
 * PAXTER — Agentes Virtuais Hub
 * Catálogo completo dos 20 agentes (10 PAWARDS + 10 Manager).
 * 7 abas: Catálogo | Identidade | Personalidade | Capacidades | Motor | Narrativas | Frases
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bot, Users, Brain, Zap, MessageSquare, BookOpen, AlignLeft,
  ChevronRight, Shield, Clock, RefreshCw, Edit2, Save, X,
  CheckCircle2, XCircle, User, Wifi, WifiOff, Play, Pause,
  Star, AlertTriangle, Check, ChevronDown, ChevronUp,
  Send, Cpu, Sparkles, Activity, RotateCcw, Radio,
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
// ONDA B — Chat IA com streaming + animação homenzinhos
// ═══════════════════════════════════════════════════════════════════════════════

const PROVEDORES_OPCOES = [
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

// ─── Hub Principal ────────────────────────────────────────────────────────────

const ABAS = [
  { key: "catalogo",       label: "Catálogo",        icon: Bot           },
  { key: "identidade",     label: "Identidade",      icon: User          },
  { key: "personalidade",  label: "Personalidade",   icon: Brain         },
  { key: "capacidades",    label: "Capacidades",     icon: Shield        },
  { key: "chat",           label: "Chat IA",         icon: MessageSquare },
  { key: "provedores",     label: "Provedores IA",   icon: Cpu           },
  { key: "motor",          label: "Motor de Escrita",icon: Zap           },
  { key: "narrativas",     label: "Narrativas",      icon: BookOpen      },
  { key: "frases",         label: "Frases-Base",     icon: AlignLeft     },
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

      {/* Abas */}
      {!loading && (
        <>
          <div className="flex flex-wrap gap-1 border-b border-border pb-0">
            {ABAS.map(a => {
              const Icon = a.icon;
              const ativo = aba === a.key;
              return (
                <button key={a.key} onClick={() => setAba(a.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-[4px] border-b-2 transition-all ${
                    ativo
                      ? "border-sidebar-primary text-sidebar-primary bg-sidebar-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}>
                  <Icon className="w-3.5 h-3.5" />{a.label}
                </button>
              );
            })}
          </div>

          <div>
            {aba === "catalogo"      && <AbaCatalogo agentes={agentes} onSelect={selecionarAgente} />}
            {aba === "identidade"    && <AbaIdentidade agentes={agentes} />}
            {aba === "personalidade" && <AbaPersonalidade agentes={agentes} onReload={carregar} />}
            {aba === "capacidades"   && <AbaCapacidades agentes={agentes} onReload={carregar} />}
            {aba === "chat"          && <AbaChat agentes={agentes} />}
            {aba === "provedores"    && <AbaProvedores agentes={agentes} />}
            {aba === "motor"         && <AbaMotor agentes={agentes} />}
            {aba === "narrativas"    && <AbaNarrativas agentes={agentes} />}
            {aba === "frases"        && <AbaFrases agentes={agentes} />}
          </div>
        </>
      )}
    </div>
  );
}
