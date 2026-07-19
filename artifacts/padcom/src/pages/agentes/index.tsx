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

function BaraDim({ valor, cor }: { valor: number; cor: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="w-2.5 h-2.5 rounded-[2px]"
            style={{ backgroundColor: i <= valor ? cor : "rgba(255,255,255,0.08)" }} />
        ))}
      </div>
      <span className="text-[9px] text-muted-foreground font-mono">{valor}/5</span>
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

function AbaPersonalidade({ agentes }: { agentes: Agente[] }) {
  const [agenteSel, setAgenteSel] = useState<number | null>(null);

  const lista = agenteSel ? agentes.filter(a => a.id === agenteSel) : agentes;

  return (
    <div className="space-y-4">
      <div className="panel-3d rounded-[6px] px-4 py-2.5 flex items-center gap-3">
        <Brain className="w-4 h-4 text-purple-400" />
        <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          14 dimensões de personalidade · escala 1 – 5
        </span>
        <select value={agenteSel ?? ""} onChange={e => setAgenteSel(e.target.value ? Number(e.target.value) : null)}
          className="ml-auto text-xs bg-background border border-border rounded-[4px] px-2 py-1">
          <option value="">Todos os agentes</option>
          {agentes.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.nome}</option>)}
        </select>
      </div>

      {/* Tabela de dimensões */}
      <div className="panel-3d rounded-[6px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground w-40">Agente</th>
                {DIM_KEYS.map(k => (
                  <th key={k} className="text-center px-2 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground min-w-[80px]">
                    {DIM_LABELS[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((a, idx) => (
                <tr key={a.id} className={`border-b border-border/50 ${idx % 2 === 0 ? "bg-muted/10" : ""}`}>
                  <td className="px-3 py-2">
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
                        <BaraDim valor={val} cor={a.cor_hex} />
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
  { key: "catalogo",       label: "Catálogo",      icon: Bot           },
  { key: "identidade",     label: "Identidade",    icon: User          },
  { key: "personalidade",  label: "Personalidade", icon: Brain         },
  { key: "capacidades",    label: "Capacidades",   icon: Shield        },
  { key: "motor",          label: "Motor de Escrita", icon: Zap        },
  { key: "narrativas",     label: "Narrativas",    icon: BookOpen      },
  { key: "frases",         label: "Frases-Base",   icon: AlignLeft     },
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
            {aba === "personalidade" && <AbaPersonalidade agentes={agentes} />}
            {aba === "capacidades"   && <AbaCapacidades agentes={agentes} onReload={carregar} />}
            {aba === "motor"         && <AbaMotor agentes={agentes} />}
            {aba === "narrativas"    && <AbaNarrativas agentes={agentes} />}
            {aba === "frases"        && <AbaFrases agentes={agentes} />}
          </div>
        </>
      )}
    </div>
  );
}
