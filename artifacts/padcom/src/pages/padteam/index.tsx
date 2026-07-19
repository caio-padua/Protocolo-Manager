/**
 * PADTEAM — Hub Central
 * 5 abas: Demandas · Equipe · Hierarquia · Governança · Scoring
 */

import { useState, useEffect, useCallback } from "react";
import {
  Users, ClipboardList, Network, ShieldCheck, BarChart3,
  Plus, RefreshCw, AlertTriangle, CheckCircle2, Clock,
  Flame, ChevronRight, ChevronDown, User2, Star,
  TrendingUp, Circle, Award, Mail, Copy, CheckCheck,
  FileCheck2, ThumbsUp, ThumbsDown, Table2, Link2,
  ToggleLeft, ToggleRight, Eye, Kanban, ExternalLink
} from "lucide-react";
import { Link } from "wouter";

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Demanda {
  id: number;
  titulo: string;
  descricao?: string;
  tipo: string;
  prioridade: "urgente" | "alta" | "normal" | "baixa";
  status: string;
  assigned_role?: string;
  member_nome?: string;
  cargo_nome?: string;
  cargo_cor?: string;
  client_nome?: string;
  prazo_em?: string;
  criado_em: string;
}

interface Member {
  id: number;
  nome: string;
  email?: string;
  cargo_id?: number;
  cargo_nome?: string;
  cargo_cor?: string;
  cargo_nivel?: number;
  tipo: "humano" | "agente_ia";
  status: string;
  max_demandas_simultaneas: number;
}

interface Position {
  id: number;
  nome: string;
  codigo: string;
  nivel: number;
  cor_hex: string;
  sla_horas: number;
  pode_receber_demandas: boolean;
  pode_criar_demandas: boolean;
}

interface Dashboard {
  total: number;
  abertas: number;
  urgentes: number;
  vencidas: number;
  concluidas30d: number;
  por_role: { assigned_role: string; total: number }[];
  recentes: Demanda[];
}

interface ProcessResponsibility {
  id: number;
  processo: string;
  categoria: string;
  responsavel: string;
  aprovador: string;
  consultados: string[];
  informados: string[];
  ativo: boolean;
}

interface WorkReview {
  id: number;
  member_id: number;
  demanda_id?: number;
  entrega_descricao: string;
  arquivos_links?: string;
  data_entrega: string;
  status: "pendente" | "aprovado" | "reprovado";
  notas_revisao?: string;
  revisado_por?: string;
  revisado_em?: string;
  member_nome?: string;
  cargo_nome?: string;
  cargo_cor?: string;
  demanda_titulo?: string;
  criado_em: string;
}

interface WorkRatingSummary {
  member_id: number;
  nome: string;
  cargo?: string;
  cor_hex?: string;
  total_avaliacoes: number;
  media_geral: number | null;
  media_qualidade: number | null;
  media_prazo: number | null;
  media_comunicacao: number | null;
  media_proatividade: number | null;
}

interface ScoreRow {
  id: number;
  nome: string;
  cargo: string;
  cor_hex?: string;
  total_atribuidas: number;
  concluidas: number;
  no_prazo: number;
  taxa_resolucao: number | null;
}

interface EmailAlias {
  id: number;
  email: string;
  cargo_codigo: string;
  cargo_label: string;
  modo: "local" | "remote";
  hierarquia: string;
  clinica: string;
  is_trello_main: boolean;
  member_id?: number;
  member_nome?: string;
  member_status?: string;
  status: "ativo" | "vago" | "reservado";
  observacoes?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRIORIDADE_COR: Record<string, string> = {
  urgente: "bg-red-500/15 text-red-400 border-red-500/40",
  alta: "bg-amber-500/15 text-amber-400 border-amber-500/40",
  normal: "bg-sky-500/15 text-sky-400 border-sky-500/40",
  baixa: "bg-zinc-500/15 text-zinc-400 border-zinc-500/40",
};

const STATUS_COR: Record<string, string> = {
  aberto: "bg-blue-500/15 text-blue-400",
  em_andamento: "bg-amber-500/15 text-amber-400",
  aguardando: "bg-purple-500/15 text-purple-400",
  concluido: "bg-emerald-500/15 text-emerald-400",
  cancelado: "bg-zinc-500/15 text-zinc-400",
  escalado: "bg-red-500/15 text-red-400",
};

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide border ${className}`}>
      {label}
    </span>
  );
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function isVencida(prazoEm?: string) {
  if (!prazoEm) return false;
  return new Date(prazoEm) < new Date();
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function KPICard({ label, value, sub, cor }: { label: string; value: number; sub?: string; cor?: string }) {
  return (
    <div className="panel-3d-sub rounded-[6px] px-4 py-3 flex flex-col gap-1.5 min-w-[120px]">
      <span className="bevel-3d px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground inline-block rounded-[4px] self-start">{label}</span>
      <div className="concave-3d rounded-[4px] px-3 py-1.5">
        <span className={`text-3xl font-black ${cor ?? "text-foreground"}`}>{value}</span>
      </div>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
    </div>
  );
}

function StarRating({ value, max = 5 }: { value: number | null; max?: number }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star key={i} className={`w-3 h-3 ${i < Math.round(v) ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}`} />
      ))}
      {v > 0 && <span className="text-[11px] text-muted-foreground ml-1">{Number(v).toFixed(1)}</span>}
    </div>
  );
}

const CARGO_LABEL: Record<string, string> = {
  ceo:          "CEO",
  medico_01:    "Médico Titular",
  medico_02:    "Médico Suporte",
  enfermeira_01:"Enfermeira Coord.",
  enfermeira_02:"Enfermeira Oper.",
  adm_01:       "ADM Sênior",
  adm_02:       "Administrativo",
  financeiro_01:"Financeiro Sênior",
  financeiro_02:"Financeiro",
  agente_ia:    "Agente IA",
  supervisao:   "Supervisão",
  consultoria:  "Consultoria",
  ouvidoria:    "Ouvidoria",
  "":           "— Vazio —",
};

function DemandaCard({ d, onUpdate }: { d: Demanda; onUpdate: () => void }) {
  const [expandido, setExpandido] = useState(false);

  async function concluir() {
    const resultado = prompt("Qual o resultado/ação realizada?");
    if (resultado === null) return;
    await apiFetch(`/padteam/demandas/${d.id}/concluir`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resultado }),
    });
    onUpdate();
  }

  return (
    <div
      className={`rounded-[6px] border bg-card text-card-foreground transition-all ${
        d.prioridade === "urgente" ? "border-red-500/50" : "border-border"
      }`}
      style={{ borderLeftWidth: 4, borderLeftColor: d.cargo_cor ?? "#3D7A7A" }}
    >
      <div className="flex items-start gap-3 p-3 cursor-pointer" onClick={() => setExpandido(!expandido)}>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge label={d.prioridade} className={PRIORIDADE_COR[d.prioridade] ?? ""} />
            <Badge label={d.status.replace(/_/g, " ")} className={STATUS_COR[d.status] ?? "bg-zinc-500/15 text-zinc-400"} />
            {isVencida(d.prazo_em) && d.status !== "concluido" && (
              <Badge label="VENCIDA" className="bg-red-600/25 text-red-400 border-red-600/40" />
            )}
          </div>
          <div className="font-semibold text-sm leading-tight truncate">{d.titulo}</div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
            {d.member_nome && <span className="text-[11px] text-muted-foreground">👤 {d.member_nome}</span>}
            {d.assigned_role && !d.member_nome && <span className="text-[11px] text-muted-foreground">🎯 {d.assigned_role}</span>}
            {d.client_nome && <span className="text-[11px] text-muted-foreground">🧑 {d.client_nome}</span>}
            <span className="text-[11px] text-muted-foreground">⏱ {formatDate(d.prazo_em)}</span>
          </div>
        </div>
        {expandido ? <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" /> : <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground mt-0.5" />}
      </div>
      {expandido && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          {d.descricao && <p className="text-sm text-muted-foreground">{d.descricao}</p>}
          <div className="text-[11px] text-muted-foreground">Criada em {formatDate(d.criado_em)}</div>
          {d.status !== "concluido" && d.status !== "cancelado" && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={concluir}
                className="btn-3d-soft text-xs px-3 py-1.5 flex items-center gap-1.5 text-emerald-400"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
              </button>
            </div>
          )}
          <TrelloSyncBar demandaId={d.id} />
        </div>
      )}
    </div>
  );
}

// ─── Aba 1: Demandas ─────────────────────────────────────────────────────────

function AbaDemandas() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [demandas, setDemandas] = useState<Demanda[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroPrioridade, setFiltroPrioridade] = useState("");
  const [filtroRole, setFiltroRole] = useState("");
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, dem] = await Promise.all([
        apiFetch("/padteam/dashboard"),
        apiFetch(`/padteam/demandas?${new URLSearchParams({
          ...(filtroStatus && { status: filtroStatus }),
          ...(filtroPrioridade && { prioridade: filtroPrioridade }),
          ...(filtroRole && { assigned_role: filtroRole }),
        }).toString()}`),
      ]);
      setDashboard(dash);
      setDemandas(dem.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, filtroPrioridade, filtroRole]);

  useEffect(() => { carregar(); }, [carregar]);

  const grupos = {
    aberto: demandas.filter(d => d.status === "aberto"),
    em_andamento: demandas.filter(d => d.status === "em_andamento" || d.status === "escalado"),
    concluido: demandas.filter(d => d.status === "concluido"),
  };

  return (
    <div className="space-y-5">
      {/* KPIs */}
      {dashboard && (
        <div className="flex flex-wrap gap-3">
          <KPICard label="Total" value={dashboard.total} />
          <KPICard label="Abertas" value={dashboard.abertas} cor="text-sky-400" />
          <KPICard label="Urgentes" value={dashboard.urgentes} cor="text-red-400" />
          <KPICard label="Vencidas" value={dashboard.vencidas} cor="text-amber-400" />
          <KPICard label="Concluídas (30 d)" value={dashboard.concluidas30d} cor="text-emerald-400" sub="último mês" />
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          value={filtroStatus}
          onChange={e => setFiltroStatus(e.target.value)}
          className="text-sm bg-card border border-border rounded-[6px] px-2 py-1.5 text-foreground"
        >
          <option value="">Todos os status</option>
          {["aberto","em_andamento","aguardando","concluido","cancelado","escalado"].map(s => (
            <option key={s} value={s}>{s.replace(/_/g," ")}</option>
          ))}
        </select>
        <select
          value={filtroPrioridade}
          onChange={e => setFiltroPrioridade(e.target.value)}
          className="text-sm bg-card border border-border rounded-[6px] px-2 py-1.5 text-foreground"
        >
          <option value="">Todas as prioridades</option>
          {["urgente","alta","normal","baixa"].map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button onClick={carregar} className="btn-3d-soft px-3 py-1.5 text-sm flex items-center gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Atualizar
        </button>
        <Link href="/padteam/nova">
          <button className="bevel-3d px-4 py-1.5 text-sm flex items-center gap-1.5 ml-auto">
            <Plus className="w-3.5 h-3.5" /> Nova Demanda
          </button>
        </Link>
      </div>

      {loading && <div className="text-sm text-muted-foreground py-4 text-center">Carregando...</div>}

      {/* Kanban 3 colunas */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["aberto","em_andamento","concluido"] as const).map(col => {
            const label = col === "aberto" ? "Aberto" : col === "em_andamento" ? "Em Andamento" : "Concluído";
            const cor = col === "aberto" ? "text-blue-400 border-blue-500/40" : col === "em_andamento" ? "text-amber-400 border-amber-500/40" : "text-emerald-400 border-emerald-500/40";
            return (
              <div key={col} className="space-y-2">
                <div className={`flex items-center gap-2 pb-1 border-b ${cor}`}>
                  <span className="font-bold text-sm uppercase tracking-wider">{label}</span>
                  <span className="ml-auto text-xs bg-card px-2 py-0.5 rounded-full border border-border">{grupos[col].length}</span>
                </div>
                {grupos[col].length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhuma demanda</p>
                )}
                {grupos[col].map(d => <DemandaCard key={d.id} d={d} onUpdate={carregar} />)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Aba 2: Equipe ────────────────────────────────────────────────────────────

function AbaEquipe() {
  const [members, setMembers] = useState<Member[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoMembro, setNovoMembro] = useState(false);
  const [form, setForm] = useState({ nome: "", email: "", telefone: "", cargo_id: "", tipo: "humano" });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([apiFetch("/padteam/members"), apiFetch("/padteam/positions")]);
      setMembers(m);
      setPositions(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvarMembro(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch("/padteam/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, cargo_id: form.cargo_id ? parseInt(form.cargo_id) : null }),
    });
    setNovoMembro(false);
    setForm({ nome: "", email: "", telefone: "", cargo_id: "", tipo: "humano" });
    carregar();
  }

  const grupos = positions.sort((a, b) => b.nivel - a.nivel).map(pos => ({
    pos,
    membros: members.filter(m => m.cargo_id === pos.id),
  }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{members.length} colaboradores · {positions.length} cargos</span>
        <button onClick={() => setNovoMembro(!novoMembro)} className="bevel-3d px-4 py-1.5 text-sm flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Novo Membro
        </button>
      </div>

      {novoMembro && (
        <form onSubmit={salvarMembro} className="panel-3d-sub rounded-[6px] p-4 space-y-3">
          <div className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Novo Colaborador</div>
          <div className="grid grid-cols-2 gap-3">
            <input required placeholder="Nome completo *" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})}
              className="bg-background border border-border rounded-[6px] px-3 py-2 text-sm" />
            <input placeholder="E-mail" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
              className="bg-background border border-border rounded-[6px] px-3 py-2 text-sm" />
            <input placeholder="Telefone (WhatsApp)" value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})}
              className="bg-background border border-border rounded-[6px] px-3 py-2 text-sm" />
            <select value={form.cargo_id} onChange={e => setForm({...form, cargo_id: e.target.value})}
              className="bg-background border border-border rounded-[6px] px-3 py-2 text-sm">
              <option value="">Sem cargo</option>
              {positions.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            <select value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})}
              className="bg-background border border-border rounded-[6px] px-3 py-2 text-sm">
              <option value="humano">Humano</option>
              <option value="agente_ia">Agente IA (Claude)</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bevel-3d px-4 py-1.5 text-sm">Salvar</button>
            <button type="button" onClick={() => setNovoMembro(false)} className="btn-3d-soft px-4 py-1.5 text-sm">Cancelar</button>
          </div>
        </form>
      )}

      {loading && <div className="text-sm text-muted-foreground py-4 text-center">Carregando...</div>}

      {!loading && grupos.map(({ pos, membros }) => (
        <div key={pos.id} className="rounded-[6px] border border-border bg-card overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: pos.cor_hex }}>
          <div className="px-4 py-2.5 flex items-center gap-3 border-b border-border bg-card/60">
            <span className="font-bold text-sm">{pos.nome}</span>
            <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{pos.codigo}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">SLA {pos.sla_horas}h · Nível {pos.nivel}</span>
            <span className="text-[11px] bg-card border border-border px-2 py-0.5 rounded-full">{membros.length} membro{membros.length !== 1 ? "s" : ""}</span>
          </div>
          {membros.length === 0 && (
            <p className="text-xs text-muted-foreground px-4 py-3">Nenhum colaborador neste cargo.</p>
          )}
          {membros.map(m => (
            <div key={m.id} className="flex items-center gap-3 px-4 py-2 border-b border-border last:border-0 hover:bg-accent/30 transition-colors">
              <div className="w-8 h-8 rounded-[6px] bg-muted flex items-center justify-center shrink-0">
                {m.tipo === "agente_ia"
                  ? <span className="text-[11px] font-black text-purple-400">IA</span>
                  : <User2 className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{m.nome}</div>
                {m.email && <div className="text-[11px] text-muted-foreground">{m.email}</div>}
              </div>
              <div className={`text-[11px] px-2 py-0.5 rounded-full border ${
                m.status === "ativo" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/30"
              }`}>{m.status}</div>
              <div className="text-[11px] text-muted-foreground">Máx {m.max_demandas_simultaneas} demandas</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Trello sync helper (exibido na aba Demandas) ────────────────────────────

function TrelloSyncBar({ demandaId }: { demandaId: number }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; url?: string; error?: string } | null>(null);

  async function syncTrello() {
    setSyncing(true);
    try {
      const r = await fetch("/api/padteam/sync-trello", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demanda_id: demandaId }),
      });
      const j = await r.json();
      setResult(r.ok ? { ok: true, url: j.url } : { ok: false, error: j.error });
    } catch { setResult({ ok: false, error: "Erro de rede" }); }
    finally { setSyncing(false); }
  }

  return (
    <div className="flex items-center gap-2 mt-1.5">
      <button
        onClick={syncTrello}
        disabled={syncing}
        className="btn-3d-soft text-xs px-2.5 py-1 flex items-center gap-1.5 text-purple-400 disabled:opacity-50"
      >
        <Kanban className="w-3 h-3" />
        {syncing ? "Sincronizando..." : "Enviar ao Trello"}
      </button>
      {result?.ok && result.url && (
        <a href={result.url} target="_blank" rel="noreferrer"
          className="text-xs text-emerald-400 flex items-center gap-1 hover:underline">
          <ExternalLink className="w-3 h-3" /> Ver no Trello
        </a>
      )}
      {result && !result.ok && (
        <span className="text-[11px] text-red-400">{result.error}</span>
      )}
    </div>
  );
}

// ─── Aba 3: Hierarquia Visual ─────────────────────────────────────────────────

interface NodoHierarquia {
  id: number;
  cargo: string;
  codigo: string;
  nivel: number;
  cor_hex: string;
  filhos: NodoHierarquia[];
  membros: Member[];
}

function buildTree(positions: Position[], members: Member[]): NodoHierarquia[] {
  const nivelMax = Math.max(...positions.map(p => p.nivel));
  const tops = positions.filter(p => p.nivel === nivelMax);
  function buildNode(pos: Position): NodoHierarquia {
    return {
      id: pos.id,
      cargo: pos.nome,
      codigo: pos.codigo,
      nivel: pos.nivel,
      cor_hex: pos.cor_hex,
      filhos: positions.filter(p => p.nivel === pos.nivel - 1).map(buildNode),
      membros: members.filter(m => m.cargo_id === pos.id),
    };
  }
  return tops.map(buildNode);
}

function NodoHierarquiaCard({ nodo, nivel }: { nodo: NodoHierarquia; nivel: number }) {
  const [aberto, setAberto] = useState(nivel <= 1);
  return (
    <div className={`${nivel > 0 ? "ml-6 mt-2" : ""}`}>
      <div
        className="flex items-start gap-2 cursor-pointer group"
        onClick={() => setAberto(!aberto)}
      >
        <div className="mt-1">
          {nodo.filhos.length > 0 || nodo.membros.length > 0
            ? (aberto ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />)
            : <Circle className="w-4 h-4 text-muted-foreground/30" />}
        </div>
        <div className="rounded-[6px] border border-border bg-card flex-1 px-3 py-2 group-hover:bg-accent/20 transition-colors" style={{ borderLeftWidth: 3, borderLeftColor: nodo.cor_hex }}>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm">{nodo.cargo}</span>
            <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded uppercase tracking-wider">{nodo.codigo}</span>
            {nodo.membros.length > 0 && (
              <span className="ml-auto text-[11px] text-muted-foreground">{nodo.membros.length} membro{nodo.membros.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          {aberto && nodo.membros.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {nodo.membros.map(m => (
                <div key={m.id} className="flex items-center gap-1.5 text-[11px] bg-muted/40 rounded-full px-2 py-0.5">
                  {m.tipo === "agente_ia" ? <span className="text-purple-400">🤖</span> : <User2 className="w-3 h-3" />}
                  <span>{m.nome}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {aberto && nodo.filhos.map(filho => (
        <div key={filho.id} className="relative ml-4">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
          <NodoHierarquiaCard nodo={filho} nivel={nivel + 1} />
        </div>
      ))}
    </div>
  );
}

function AbaHierarquia() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [procs, setProcs] = useState<ProcessResponsibility[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"organograma" | "raci">("organograma");
  const [saving, setSaving] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    const [p, m, r] = await Promise.all([
      apiFetch("/padteam/positions"),
      apiFetch("/padteam/members"),
      apiFetch("/padteam/process-responsibilities"),
    ]);
    setPositions(p); setMembers(m); setProcs(r);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function updateRaci(id: number, field: string, value: string) {
    setSaving(id);
    await apiFetch(`/padteam/process-responsibilities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    await carregar();
    setSaving(null);
  }

  const tree = buildTree(positions, members);
  const cargos = positions.map(p => p.codigo);
  const categorias = [...new Set(procs.map(p => p.categoria))];

  return (
    <div className="space-y-4">
      {/* Toggle Organograma / RACI */}
      <div className="flex items-center gap-2">
        <button onClick={() => setView("organograma")}
          className={`btn-3d-soft px-4 py-1.5 text-sm flex items-center gap-2 ${view === "organograma" ? "text-sidebar-primary" : ""}`}>
          <Network className="w-3.5 h-3.5" /> Organograma
        </button>
        <button onClick={() => setView("raci")}
          className={`btn-3d-soft px-4 py-1.5 text-sm flex items-center gap-2 ${view === "raci" ? "text-sidebar-primary" : ""}`}>
          <Table2 className="w-3.5 h-3.5" /> Matriz RACI
        </button>
        <span className="text-[11px] text-muted-foreground ml-2">
          {view === "raci" ? "Quem é responsável por cada processo/entrega" : "Quem reporta a quem"}
        </span>
      </div>

      {loading && <div className="text-sm text-muted-foreground py-4 text-center">Carregando...</div>}

      {/* Organograma */}
      {!loading && view === "organograma" && (
        <>
          {tree.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-8">
              Nenhum cargo cadastrado. Vá à aba Equipe.
            </div>
          )}
          {tree.map(nodo => <NodoHierarquiaCard key={nodo.id} nodo={nodo} nivel={0} />)}
        </>
      )}

      {/* Matriz RACI */}
      {!loading && view === "raci" && (
        <div className="space-y-4">
          <div className="panel-3d-sub rounded-[6px] p-3 text-[11px] text-muted-foreground flex flex-wrap gap-4">
            {[
              { cor: "text-emerald-400", label: "R = Responsável", desc: "executa" },
              { cor: "text-amber-400",   label: "A = Aprovador",   desc: "decide / assina" },
              { cor: "text-sky-400",     label: "C = Consultado",  desc: "orienta antes" },
              { cor: "text-purple-400",  label: "I = Informado",   desc: "notificado depois" },
            ].map(item => (
              <span key={item.label} className={item.cor}><strong>{item.label}</strong> — {item.desc}</span>
            ))}
          </div>

          {categorias.map(cat => (
            <div key={cat} className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1 py-1">
                {cat}
              </div>
              <div className="rounded-[6px] border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="text-left px-3 py-2">Processo / Entrega</th>
                      <th className="text-left px-3 py-2 text-emerald-400">R Responsável</th>
                      <th className="text-left px-3 py-2 text-amber-400">A Aprovador</th>
                      <th className="text-left px-3 py-2">Ativo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {procs.filter(p => p.categoria === cat).map((p, i) => (
                      <tr key={p.id} className={`${i % 2 === 0 ? "bg-card" : "bg-muted/10"} ${saving === p.id ? "opacity-60" : ""}`}>
                        <td className="px-3 py-2.5 font-medium text-sm">{p.processo}</td>
                        <td className="px-3 py-2.5">
                          <select
                            value={p.responsavel}
                            onChange={e => updateRaci(p.id, "responsavel", e.target.value)}
                            className="text-[11px] bg-card border border-border rounded-[4px] px-2 py-1 text-emerald-400 font-medium"
                          >
                            {["", ...cargos].map(c => (
                              <option key={c} value={c}>{CARGO_LABEL[c] ?? c}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <select
                            value={p.aprovador}
                            onChange={e => updateRaci(p.id, "aprovador", e.target.value)}
                            className="text-[11px] bg-card border border-border rounded-[4px] px-2 py-1 text-amber-400 font-medium"
                          >
                            {["", ...cargos].map(c => (
                              <option key={c} value={c}>{CARGO_LABEL[c] ?? c}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => updateRaci(p.id, "ativo", String(!p.ativo))}
                            title={p.ativo ? "Desativar processo" : "Ativar processo"}
                          >
                            {p.ativo
                              ? <ToggleRight className="w-5 h-5 text-emerald-400" />
                              : <ToggleLeft className="w-5 h-5 text-muted-foreground/40" />
                            }
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Aba 4: Governança ────────────────────────────────────────────────────────

function AbaGovernanca() {
  const [subAba, setSubAba] = useState<"sla"|"justificativas"|"escalamentos"|"disciplinar">("sla");
  const [slas, setSlas] = useState<Record<string, unknown>[]>([]);
  const [justs, setJusts] = useState<Record<string, unknown>[]>([]);
  const [escalamentos, setEscalamentos] = useState<Record<string, unknown>[]>([]);
  const [disciplinar, setDisciplinar] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const queries: Promise<unknown>[] = [
      apiFetch("/padteam/demandas?status=aberto").then(r => setSlas(r.items ?? [])).catch(() => {}),
      apiFetch("/padteam/demandas?status=escalado").then(r => setEscalamentos(r.items ?? [])).catch(() => {}),
    ];
    Promise.all(queries).finally(() => setLoading(false));
  }, []);

  function semaforo(d: Demanda) {
    if (!d.prazo_em) return "bg-zinc-500/15 text-zinc-400";
    const pct = (Date.now() - new Date(d.criado_em).getTime()) / (new Date(d.prazo_em).getTime() - new Date(d.criado_em).getTime()) * 100;
    if (pct >= 100) return "bg-red-500/15 text-red-400";
    if (pct >= 50) return "bg-amber-500/15 text-amber-400";
    return "bg-emerald-500/15 text-emerald-400";
  }

  const SUB_ABAS = [
    { key: "sla", label: "SLA Ativos" },
    { key: "justificativas", label: "Justificativas" },
    { key: "escalamentos", label: "Escalamentos" },
    { key: "disciplinar", label: "Disciplinar" },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap">
        {SUB_ABAS.map(sa => (
          <button key={sa.key} onClick={() => setSubAba(sa.key)}
            className={`px-3 py-1.5 text-sm rounded-[6px] border transition-colors ${
              subAba === sa.key
                ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-primary/40 font-semibold"
                : "border-border text-muted-foreground hover:bg-accent/30"
            }`}>
            {sa.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-sm text-muted-foreground py-4 text-center">Carregando...</div>}

      {!loading && subAba === "sla" && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Demandas abertas ordenadas por prazo — semáforo indica urgência.</div>
          {(slas as Demanda[]).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhuma demanda aberta com SLA ativo.</p>}
          {(slas as Demanda[]).map(d => (
            <div key={d.id} className="flex items-center gap-3 rounded-[6px] border border-border bg-card px-3 py-2">
              <div className={`w-3 h-3 rounded-full shrink-0 ${semaforo(d).split(" ")[0]}`} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{d.titulo}</div>
                <div className="text-[11px] text-muted-foreground">{d.assigned_role ?? "Sem responsável"}</div>
              </div>
              <div className="text-[11px] text-muted-foreground shrink-0">Prazo: {formatDate(d.prazo_em)}</div>
              <Badge label={d.prioridade} className={PRIORIDADE_COR[d.prioridade] ?? ""} />
            </div>
          ))}
        </div>
      )}

      {!loading && subAba === "justificativas" && (
        <div className="py-6 text-center text-sm text-muted-foreground space-y-1">
          <p>Justificativas de atraso aparecem aqui quando operadores registrarem extensão de prazo.</p>
          <p className="text-xs">Endpoint: <code className="bg-muted px-1 rounded">POST /api/padteam/demandas/:id/justificar</code></p>
        </div>
      )}

      {!loading && subAba === "escalamentos" && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Demandas escaladas — requerem atenção do gestor.</div>
          {(escalamentos as Demanda[]).length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Nenhuma demanda escalada no momento.</p>}
          {(escalamentos as Demanda[]).map(d => (
            <div key={d.id} className="flex items-center gap-3 rounded-[6px] border border-red-500/30 bg-red-500/5 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{d.titulo}</div>
                <div className="text-[11px] text-muted-foreground">{d.member_nome ?? d.assigned_role ?? "Sem responsável"}</div>
              </div>
              <div className="text-[11px] text-muted-foreground shrink-0">Criada: {formatDate(d.criado_em)}</div>
            </div>
          ))}
        </div>
      )}

      {!loading && subAba === "disciplinar" && (
        <div className="py-6 text-center text-sm text-muted-foreground space-y-1">
          <p>Registros disciplinares (advertências, demissões) aparecem aqui.</p>
          <p className="text-xs">Endpoint: <code className="bg-muted px-1 rounded">POST /api/padteam/demandas/:id/escalar</code></p>
          <p className="text-[11px] text-muted-foreground mt-2">Tabela <code>disciplinary_events</code> já criada — UI de registro em próxima onda.</p>
        </div>
      )}
    </div>
  );
}

// ─── Aba 5: Scoring ──────────────────────────────────────────────────────────

function AbaScoring() {
  const [ranking, setRanking] = useState<ScoreRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/padteam/scoring").then(setRanking).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Ranking de operadores por taxa de resolução. Considera demandas concluídas vs. total atribuído.
      </div>
      {loading && <div className="text-sm text-muted-foreground py-4 text-center">Carregando...</div>}
      {!loading && ranking.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Nenhum dado de performance disponível ainda.</p>
      )}
      {!loading && ranking.map((r, i) => (
        <div key={r.id} className="flex items-center gap-4 rounded-[6px] border border-border bg-card px-4 py-3">
          <div className="w-8 text-center">
            {i === 0 ? <Award className="w-5 h-5 text-yellow-400 mx-auto" />
              : i === 1 ? <Award className="w-5 h-5 text-zinc-400 mx-auto" />
              : i === 2 ? <Award className="w-5 h-5 text-amber-700 mx-auto" />
              : <span className="text-sm text-muted-foreground font-mono">{i + 1}</span>}
          </div>
          <div className="w-3 h-8 rounded-full shrink-0" style={{ backgroundColor: r.cor_hex ?? "#3D7A7A" }} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">{r.nome}</div>
            <div className="text-[11px] text-muted-foreground">{r.cargo ?? "Sem cargo"}</div>
          </div>
          <div className="grid grid-cols-3 gap-6 text-center shrink-0">
            <div>
              <div className="text-lg font-black text-foreground">{r.total_atribuidas}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</div>
            </div>
            <div>
              <div className="text-lg font-black text-emerald-400">{r.concluidas}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Concluídas</div>
            </div>
            <div>
              <div className={`text-lg font-black ${(r.taxa_resolucao ?? 0) >= 80 ? "text-emerald-400" : (r.taxa_resolucao ?? 0) >= 50 ? "text-amber-400" : "text-red-400"}`}>
                {r.taxa_resolucao ?? 0}%
              </div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Taxa</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Aba 6: E-mails Operacionais ──────────────────────────────────────────────

const STATUS_ALIAS: Record<string, string> = {
  ativo:     "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  vago:      "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  reservado: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

const HIERARQUIA_COR: Record<string, string> = {
  alpha: "text-amber-400",
  beta:  "text-sky-400",
  gamma: "text-purple-400",
  delta: "text-emerald-400",
  epsilon: "text-rose-400",
};

function AbaEmails() {
  const [aliases, setAliases] = useState<EmailAlias[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [scriptVisivel, setScriptVisivel] = useState(false);

  const carregar = useCallback(async () => {
    const [a, m] = await Promise.all([
      apiFetch("/padteam/email-aliases"),
      apiFetch("/padteam/members"),
    ]);
    setAliases(a);
    setMembers(m);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function copiar(texto: string) {
    navigator.clipboard.writeText(texto);
    setCopiado(texto);
    setTimeout(() => setCopiado(null), 2200);
  }

  async function atribuirMembro(aliasId: number, membroIdStr: string) {
    const memberId = membroIdStr ? parseInt(membroIdStr) : null;
    await apiFetch(`/padteam/email-aliases/${aliasId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ member_id: memberId }),
    });
    carregar();
  }

  const trelloMain = aliases.find(a => a.is_trello_main);
  const operacionais = aliases.filter(a => !a.is_trello_main);

  const scriptApps = `/**
 * PADRÃO PAWARDS — Criar Aliases no Google Workspace
 * Padrão: [cargo].[modo].[hierarquia].[clinica]@pawards.com.br
 * Princípio RBAC: o e-mail representa o CARGO, não a pessoa.
 * Quando um funcionário sai, o alias fica com a empresa.
 */
function criarAliasesOperacionais() {
  var aliases = [
${operacionais.map(a => `    "${a.email}"`).join(",\n")}
  ];

  aliases.forEach(function(email) {
    // Substitua "conta-master@pawards.com.br" pela conta principal do domínio
    AdminDirectory.Users.Aliases.insert(
      { alias: email },
      "conta-master@pawards.com.br"
    );
    Logger.log("Alias criado: " + email);
  });
}`;

  if (loading) return <div className="text-sm text-muted-foreground py-8 text-center">Carregando aliases...</div>;

  return (
    <div className="space-y-6">

      {/* Princípio RBAC */}
      <div className="panel-3d-sub rounded-[6px] p-4 border-l-4 border-sidebar-primary">
        <div className="flex items-center gap-2 mb-2">
          <Mail className="w-4 h-4 text-sidebar-primary" />
          <span className="text-xs font-semibold uppercase tracking-widest text-sidebar-primary">Princípio PAWARDS — RBAC</span>
        </div>
        <p className="text-sm text-foreground leading-relaxed">
          O e-mail representa o <strong>cargo</strong>, não a pessoa. Quando um colaborador sai,
          o alias permanece com a empresa e é reatribuído ao próximo ocupante.
          O e-mail do Trello é o elo raiz — ele cria os cards automaticamente via API.
        </p>
        <div className="mt-2.5 font-mono text-xs text-muted-foreground bg-muted/30 rounded px-2.5 py-1.5 inline-block">
          [cargo].[modo].[hierarquia].[clinica]@pawards.com.br
        </div>
      </div>

      {/* E-mail principal Trello */}
      {trelloMain && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
            E-mail Principal — Integração Trello (Board)
          </div>
          <div className="panel-3d-sub rounded-[6px] p-4 border border-purple-500/40">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="w-10 h-10 rounded-[6px] bg-purple-500/20 flex items-center justify-center shrink-0 text-xl">
                🤖
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm font-bold text-foreground select-all">{trelloMain.email}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {trelloMain.cargo_label} · Cria cards via API Trello · Propriedade permanente da empresa
                </div>
                {trelloMain.observacoes && (
                  <div className="text-[10px] text-purple-400 mt-1">{trelloMain.observacoes}</div>
                )}
              </div>
              <button
                onClick={() => copiar(trelloMain.email)}
                className="btn-3d-soft px-3 py-1.5 text-xs flex items-center gap-1.5 shrink-0"
              >
                {copiado === trelloMain.email
                  ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  : <Copy className="w-3.5 h-3.5" />
                }
                {copiado === trelloMain.email ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabela de aliases operacionais */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Aliases Operacionais — Clínica Padua ({operacionais.length} e-mails)
          </div>
          <button
            onClick={() => copiar(operacionais.map(a => a.email).join("\n"))}
            className="btn-3d-soft text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            {copiado && copiado.includes("\n")
              ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
              : <Copy className="w-3.5 h-3.5" />
            }
            Copiar todos
          </button>
        </div>

        <div className="rounded-[6px] border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40">
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">E-mail</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cargo</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Modo</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Responsável atual</th>
                <th className="text-left px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {operacionais.map((a, i) => (
                <tr key={a.id} className={i % 2 === 0 ? "bg-card" : "bg-muted/10"}>
                  {/* E-mail */}
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-foreground select-all leading-tight">{a.email}</span>
                      <button
                        onClick={() => copiar(a.email)}
                        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                        title="Copiar e-mail"
                      >
                        {copiado === a.email
                          ? <CheckCheck className="w-3 h-3 text-emerald-400" />
                          : <Copy className="w-3 h-3" />
                        }
                      </button>
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                      hierarquia: <span className={HIERARQUIA_COR[a.hierarquia] ?? "text-muted-foreground"}>
                        {a.hierarquia}
                      </span>
                    </div>
                  </td>
                  {/* Cargo */}
                  <td className="px-3 py-2.5">
                    <div className="text-xs text-foreground">{a.cargo_label}</div>
                    {a.observacoes && (
                      <div className="text-[9px] text-muted-foreground mt-0.5 leading-tight max-w-[180px]">{a.observacoes}</div>
                    )}
                  </td>
                  {/* Modo */}
                  <td className="px-3 py-2.5">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${
                      a.modo === "remote"
                        ? "bg-purple-500/15 text-purple-400"
                        : "bg-sky-500/15 text-sky-400"
                    }`}>
                      {a.modo === "remote" ? "Remote" : "Local"}
                    </span>
                  </td>
                  {/* Responsável */}
                  <td className="px-3 py-2.5">
                    <select
                      value={a.member_id ?? ""}
                      onChange={e => atribuirMembro(a.id, e.target.value)}
                      className="text-[11px] bg-card border border-border rounded-[4px] px-2 py-1 text-foreground max-w-[160px] w-full"
                    >
                      <option value="">— Vago —</option>
                      {members.filter(m => m.status === "ativo").map(m => (
                        <option key={m.id} value={m.id}>{m.nome}</option>
                      ))}
                    </select>
                  </td>
                  {/* Status */}
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${STATUS_ALIAS[a.status] ?? ""}`}>
                      {a.status}
                    </span>
                  </td>
                  {/* Ação rápida */}
                  <td className="px-2 py-2.5 text-right">
                    <button
                      onClick={() => copiar(a.email)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Copiar"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Google Apps Script */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Script Google Workspace (Apps Script)
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setScriptVisivel(v => !v)}
              className="btn-3d-soft text-xs px-3 py-1.5"
            >
              {scriptVisivel ? "Ocultar" : "Ver Script"}
            </button>
            <button
              onClick={() => copiar(scriptApps)}
              className="bevel-3d text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              {copiado === scriptApps
                ? <CheckCheck className="w-3 h-3 text-emerald-400" />
                : <Copy className="w-3 h-3" />
              }
              {copiado === scriptApps ? "Copiado!" : "Copiar Script"}
            </button>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mb-2">
          Cole este script no Google Apps Script (script.google.com) para criar todos os aliases no Google Workspace.
          Requer ativação da API <strong>Admin SDK Directory</strong> no painel de serviços.
        </p>
        {scriptVisivel && (
          <pre className="bg-zinc-900/80 text-zinc-200 rounded-[6px] p-4 text-[10px] font-mono overflow-x-auto whitespace-pre border border-zinc-700/60 leading-relaxed">
            {scriptApps}
          </pre>
        )}
      </div>

    </div>
  );
}

// ─── Aba 7: Conferência de Trabalho Remoto ────────────────────────────────────

const STATUS_REVIEW: Record<string, string> = {
  pendente:  "bg-amber-500/15 text-amber-400 border-amber-500/40",
  aprovado:  "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  reprovado: "bg-red-500/15 text-red-400 border-red-500/40",
};

function AbaConferencia() {
  const [reviews, setReviews] = useState<WorkReview[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("pendente");
  const [novaEntrega, setNovaEntrega] = useState(false);
  const [form, setForm] = useState({ member_id: "", entrega_descricao: "", arquivos_links: "" });
  const [notaModal, setNotaModal] = useState<{ id: number; status: string } | null>(null);
  const [nota, setNota] = useState("");

  const carregar = useCallback(async () => {
    setLoading(true);
    const [r, m] = await Promise.all([
      apiFetch(`/padteam/work-reviews${filtroStatus ? `?status=${filtroStatus}` : ""}`),
      apiFetch("/padteam/members"),
    ]);
    setReviews(r); setMembers(m);
    setLoading(false);
  }, [filtroStatus]);

  useEffect(() => { carregar(); }, [carregar]);

  async function registrarEntrega(e: React.FormEvent) {
    e.preventDefault();
    await apiFetch("/padteam/work-reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, member_id: parseInt(form.member_id) }),
    });
    setNovaEntrega(false);
    setForm({ member_id: "", entrega_descricao: "", arquivos_links: "" });
    carregar();
  }

  async function revisar(id: number, status: "aprovado" | "reprovado", notas?: string) {
    await apiFetch(`/padteam/work-reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notas_revisao: notas ?? null, revisado_por: "CEO" }),
    });
    setNotaModal(null);
    setNota("");
    carregar();
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho da aba */}
      <div className="panel-3d-sub rounded-[6px] p-4 border-l-4 border-purple-500/60">
        <div className="flex items-center gap-2 mb-1">
          <FileCheck2 className="w-4 h-4 text-purple-400" />
          <span className="text-xs font-semibold uppercase tracking-widest text-purple-400">Conferência de Entregas Remotas</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Registre e revise o que os colaboradores remotos entregaram. Cada entrega pode ser aprovada ou reprovada com nota.
        </p>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        {["pendente","aprovado","reprovado"].map(s => (
          <button key={s} onClick={() => setFiltroStatus(s)}
            className={`px-3 py-1.5 text-sm rounded-[6px] border transition-colors ${
              filtroStatus === s ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-primary/40 font-semibold" : "border-border text-muted-foreground hover:bg-accent/30"
            }`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <button onClick={() => setFiltroStatus("")}
          className={`px-3 py-1.5 text-sm rounded-[6px] border transition-colors ${!filtroStatus ? "bg-sidebar-accent text-sidebar-accent-foreground border-sidebar-primary/40 font-semibold" : "border-border text-muted-foreground hover:bg-accent/30"}`}>
          Todos
        </button>
        <button onClick={() => setNovaEntrega(!novaEntrega)} className="bevel-3d px-4 py-1.5 text-sm flex items-center gap-1.5 ml-auto">
          <Plus className="w-3.5 h-3.5" /> Registrar Entrega
        </button>
      </div>

      {/* Formulário de nova entrega */}
      {novaEntrega && (
        <form onSubmit={registrarEntrega} className="panel-3d-sub rounded-[6px] p-4 space-y-3">
          <div className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Nova Entrega Registrada</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select required value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })}
              className="bg-background border border-border rounded-[6px] px-3 py-2 text-sm">
              <option value="">Selecionar colaborador *</option>
              {members.filter(m => m.status === "ativo").map(m => (
                <option key={m.id} value={m.id}>{m.nome} ({m.cargo_nome ?? "Sem cargo"})</option>
              ))}
            </select>
            <input placeholder="Link do arquivo (Drive, GitHub, etc.)" value={form.arquivos_links}
              onChange={e => setForm({ ...form, arquivos_links: e.target.value })}
              className="bg-background border border-border rounded-[6px] px-3 py-2 text-sm" />
            <textarea required placeholder="Descreva o que foi entregue *" value={form.entrega_descricao}
              onChange={e => setForm({ ...form, entrega_descricao: e.target.value })}
              rows={3} className="bg-background border border-border rounded-[6px] px-3 py-2 text-sm sm:col-span-2 resize-none" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bevel-3d px-4 py-1.5 text-sm">Salvar Entrega</button>
            <button type="button" onClick={() => setNovaEntrega(false)} className="btn-3d-soft px-4 py-1.5 text-sm">Cancelar</button>
          </div>
        </form>
      )}

      {loading && <div className="text-sm text-muted-foreground py-4 text-center">Carregando...</div>}

      {/* Modal de nota de reprovação */}
      {notaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="panel-3d rounded-[8px] p-6 w-full max-w-md space-y-4">
            <div className="font-semibold uppercase tracking-wider text-red-400">Reprovar Entrega</div>
            <textarea value={nota} onChange={e => setNota(e.target.value)}
              placeholder="Motivo da reprovação (obrigatório)"
              rows={4} className="w-full bg-background border border-border rounded-[6px] px-3 py-2 text-sm resize-none" />
            <div className="flex gap-2">
              <button onClick={() => revisar(notaModal.id, "reprovado", nota)}
                disabled={!nota.trim()}
                className="bevel-3d px-4 py-1.5 text-sm text-red-400 disabled:opacity-50">
                Confirmar Reprovação
              </button>
              <button onClick={() => setNotaModal(null)} className="btn-3d-soft px-4 py-1.5 text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de entregas */}
      {!loading && reviews.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Nenhuma entrega {filtroStatus ? `com status "${filtroStatus}"` : ""} registrada.
        </p>
      )}
      {!loading && reviews.map(r => (
        <div key={r.id} className="panel-3d-sub rounded-[6px] p-4 space-y-2"
          style={{ borderLeftWidth: 4, borderLeftColor: r.cargo_cor ?? "#647c97" }}>
          <div className="flex flex-wrap items-start gap-2 justify-between">
            <div>
              <div className="font-semibold text-sm">{r.member_nome ?? "Colaborador"}</div>
              <div className="text-[11px] text-muted-foreground">{r.cargo_nome ?? "Sem cargo"} · {formatDate(r.data_entrega)}</div>
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${STATUS_REVIEW[r.status] ?? ""}`}>
              {r.status}
            </span>
          </div>
          {r.demanda_titulo && (
            <div className="text-[11px] text-sky-400 flex items-center gap-1">
              <ClipboardList className="w-3 h-3" /> Demanda: {r.demanda_titulo}
            </div>
          )}
          <p className="text-sm text-foreground/90 leading-relaxed">{r.entrega_descricao}</p>
          {r.arquivos_links && (
            <a href={r.arquivos_links} target="_blank" rel="noreferrer"
              className="text-xs text-sky-400 flex items-center gap-1 hover:underline">
              <Link2 className="w-3 h-3" /> Ver arquivo/link
            </a>
          )}
          {r.notas_revisao && (
            <div className="text-[11px] text-muted-foreground italic border-l-2 border-border pl-2">{r.notas_revisao}</div>
          )}
          {r.status === "pendente" && (
            <div className="flex gap-2 pt-1">
              <button onClick={() => revisar(r.id, "aprovado")}
                className="btn-3d-soft text-xs px-3 py-1.5 flex items-center gap-1.5 text-emerald-400">
                <ThumbsUp className="w-3.5 h-3.5" /> Aprovar
              </button>
              <button onClick={() => setNotaModal({ id: r.id, status: "reprovado" })}
                className="btn-3d-soft text-xs px-3 py-1.5 flex items-center gap-1.5 text-red-400">
                <ThumbsDown className="w-3.5 h-3.5" /> Reprovar
              </button>
            </div>
          )}
          {r.revisado_em && (
            <div className="text-[10px] text-muted-foreground">Revisado por {r.revisado_por ?? "gestor"} em {formatDate(r.revisado_em)}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Aba 8: Classificação do Trabalho ─────────────────────────────────────────

function AbaClassificacao() {
  const [summary, setSummary] = useState<WorkRatingSummary[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [reviews, setReviews] = useState<WorkReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [avaliacaoModal, setAvaliacaoModal] = useState<WorkReview | null>(null);
  const [ratingForm, setRatingForm] = useState({
    nota: 5, qualidade: 5, prazo: 5, comunicacao: 5, proatividade: 5, comentario: "",
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    const [s, m, r] = await Promise.all([
      apiFetch("/padteam/work-ratings/summary"),
      apiFetch("/padteam/members"),
      apiFetch("/padteam/work-reviews?status=aprovado"),
    ]);
    setSummary(s); setMembers(m); setReviews(r);
    setLoading(false);
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function submitRating(reviewId: number, memberId: number) {
    await apiFetch("/padteam/work-ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ review_id: reviewId, member_id: memberId, ...ratingForm, avaliado_por: "CEO" }),
    });
    setAvaliacaoModal(null);
    setRatingForm({ nota: 5, qualidade: 5, prazo: 5, comunicacao: 5, proatividade: 5, comentario: "" });
    carregar();
  }

  function StarInput({ label, field, value }: { label: string; field: keyof typeof ratingForm; value: number }) {
    return (
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground w-24">{label}</span>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => setRatingForm(f => ({ ...f, [field]: n }))}>
              <Star className={`w-5 h-5 transition-colors ${n <= value ? "text-amber-400 fill-amber-400" : "text-muted-foreground/30"}`} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="panel-3d-sub rounded-[6px] p-4 border-l-4 border-amber-500/60">
        <div className="flex items-center gap-2 mb-1">
          <Star className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">Classificação de Trabalho</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Avalie a qualidade das entregas dos colaboradores. Cada entrega aprovada pode receber uma nota em 5 dimensões.
        </p>
      </div>

      {/* Modal de avaliação */}
      {avaliacaoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="panel-3d rounded-[8px] p-6 w-full max-w-md space-y-4">
            <div className="font-semibold uppercase tracking-wider text-amber-400">Avaliar Entrega</div>
            <div className="text-sm text-foreground font-medium">{avaliacaoModal.member_nome}</div>
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{avaliacaoModal.entrega_descricao}</p>
            <div className="concave-3d rounded-[6px] p-4 space-y-3">
              <StarInput label="Nota Geral"     field="nota"        value={ratingForm.nota} />
              <StarInput label="Qualidade"      field="qualidade"   value={ratingForm.qualidade} />
              <StarInput label="Prazo"          field="prazo"       value={ratingForm.prazo} />
              <StarInput label="Comunicação"    field="comunicacao" value={ratingForm.comunicacao} />
              <StarInput label="Proatividade"   field="proatividade" value={ratingForm.proatividade} />
            </div>
            <textarea
              value={ratingForm.comentario}
              onChange={e => setRatingForm(f => ({ ...f, comentario: e.target.value }))}
              placeholder="Comentário (opcional)"
              rows={2} className="w-full bg-background border border-border rounded-[6px] px-3 py-2 text-sm resize-none" />
            <div className="flex gap-2">
              <button onClick={() => submitRating(avaliacaoModal.id, avaliacaoModal.member_id)}
                className="bevel-3d px-4 py-1.5 text-sm">Salvar Avaliação</button>
              <button onClick={() => setAvaliacaoModal(null)} className="btn-3d-soft px-4 py-1.5 text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {loading && <div className="text-sm text-muted-foreground py-4 text-center">Carregando...</div>}

      {/* Ranking por média */}
      {!loading && summary.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Ranking de Desempenho</div>
          <div className="rounded-[6px] border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Colaborador</th>
                  <th className="text-left px-3 py-2">Geral</th>
                  <th className="text-left px-3 py-2 hidden md:table-cell">Qualidade</th>
                  <th className="text-left px-3 py-2 hidden md:table-cell">Prazo</th>
                  <th className="text-left px-3 py-2 hidden lg:table-cell">Comunicação</th>
                  <th className="text-right px-3 py-2">Avaliações</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s, i) => (
                  <tr key={s.member_id} className={i % 2 === 0 ? "bg-card" : "bg-muted/10"}>
                    <td className="px-3 py-2.5 text-[11px] text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.cor_hex ?? "#647c97" }} />
                        <div>
                          <div className="font-medium text-sm">{s.nome}</div>
                          <div className="text-[10px] text-muted-foreground">{s.cargo}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><StarRating value={s.media_geral} /></td>
                    <td className="px-3 py-2.5 hidden md:table-cell"><StarRating value={s.media_qualidade} /></td>
                    <td className="px-3 py-2.5 hidden md:table-cell"><StarRating value={s.media_prazo} /></td>
                    <td className="px-3 py-2.5 hidden lg:table-cell"><StarRating value={s.media_comunicacao} /></td>
                    <td className="px-3 py-2.5 text-right text-[11px] text-muted-foreground">{s.total_avaliacoes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Entregas aprovadas sem avaliação */}
      {!loading && reviews.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Entregas Aprovadas — Aguardando Avaliação ({reviews.length})
          </div>
          {reviews.map(r => (
            <div key={r.id} className="flex items-center gap-3 rounded-[6px] border border-border bg-card px-4 py-3">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.cargo_cor ?? "#647c97" }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{r.member_nome}</div>
                <div className="text-[11px] text-muted-foreground line-clamp-1">{r.entrega_descricao}</div>
              </div>
              <div className="text-[11px] text-muted-foreground shrink-0">{formatDate(r.data_entrega)}</div>
              <button onClick={() => setAvaliacaoModal(r)}
                className="btn-3d-soft text-xs px-3 py-1.5 flex items-center gap-1.5 text-amber-400 shrink-0">
                <Star className="w-3.5 h-3.5" /> Avaliar
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && reviews.length === 0 && summary.length === 0 && (
        <div className="text-center py-10 text-sm text-muted-foreground space-y-1">
          <p>Nenhuma entrega aprovada para avaliar ainda.</p>
          <p className="text-xs">Vá à aba <strong>Conferência</strong> → aprove uma entrega → ela aparecerá aqui para avaliação.</p>
        </div>
      )}
    </div>
  );
}

// ─── Hub Principal ────────────────────────────────────────────────────────────

const ABAS = [
  { key: "demandas",       label: "Demandas",    icon: ClipboardList },
  { key: "equipe",         label: "Equipe",      icon: Users         },
  { key: "hierarquia",     label: "Hierarquia",  icon: Network       },
  { key: "governanca",     label: "Governança",  icon: ShieldCheck   },
  { key: "conferencia",    label: "Conferência", icon: FileCheck2    },
  { key: "classificacao",  label: "Classificação",icon: Star         },
  { key: "scoring",        label: "Scoring",     icon: BarChart3     },
  { key: "emails",         label: "E-mails",     icon: Mail          },
] as const;

type AbaKey = typeof ABAS[number]["key"];

export default function PadteamHub() {
  const [aba, setAba] = useState<AbaKey>("demandas");

  return (
    <div className="space-y-6 p-1">
      {/* Cabeçalho — panel-3d */}
      <div className="panel-3d rounded-[8px] px-5 py-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-black uppercase tracking-widest text-foreground">PADTEAM</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Central de demandas · Equipe remota · Hierarquia · Governança · Conferência · Classificação
          </p>
        </div>
        <Link href="/padteam/nova">
          <button className="bevel-3d px-4 py-2 text-sm flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Nova Demanda
          </button>
        </Link>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-0">
        {ABAS.map(a => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                aba === a.key
                  ? "border-sidebar-primary text-sidebar-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <Icon className="w-4 h-4" />
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      <div>
        {aba === "demandas"      && <AbaDemandas />}
        {aba === "equipe"        && <AbaEquipe />}
        {aba === "hierarquia"    && <AbaHierarquia />}
        {aba === "governanca"    && <AbaGovernanca />}
        {aba === "conferencia"   && <AbaConferencia />}
        {aba === "classificacao" && <AbaClassificacao />}
        {aba === "scoring"       && <AbaScoring />}
        {aba === "emails"        && <AbaEmails />}
      </div>
    </div>
  );
}
