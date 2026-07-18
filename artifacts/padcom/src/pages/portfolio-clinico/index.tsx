import { useState } from "react";
import { useListProtocols } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FlaskConical, Smartphone, Syringe, Circle,
  ChevronRight, FolderTree,
} from "lucide-react";
import { formatStatus, getStatusColor } from "@/lib/status";

// ─── Linhas de Venda canônicas ────────────────────────────────────────────────

type LinhaKey = "magistral" | "digital" | "injetoterapia" | null;

interface LinhaConfig {
  key: LinhaKey;
  nome: string;
  subtitulo: string;
  icon: React.ElementType;
  acento: string;          // cor Tailwind (text-*)
  faixa: string;           // cor Tailwind (bg-*)
  faixaLabel: string;      // cor do label (text-*)
  bordaCard: string;       // ring-*
  glow: string;            // sombra extra no header
}

const LINHAS: LinhaConfig[] = [
  {
    key: "magistral",
    nome: "PROGRAMA MAGISTRAL",
    subtitulo: "Receituário contínuo de farmácia magistral",
    icon: FlaskConical,
    acento: "text-emerald-600",
    faixa: "bg-emerald-500",
    faixaLabel: "text-emerald-700",
    bordaCard: "ring-emerald-200",
    glow: "0 0 32px rgba(16,185,129,0.10)",
  },
  {
    key: "digital",
    nome: "PAXTER DIGITAL",
    subtitulo: "Captação por redes sociais, campanhas e links externos",
    icon: Smartphone,
    acento: "text-blue-600",
    faixa: "bg-blue-500",
    faixaLabel: "text-blue-700",
    bordaCard: "ring-blue-200",
    glow: "0 0 32px rgba(59,130,246,0.10)",
  },
  {
    key: "injetoterapia",
    nome: "INJETOTERAPIA",
    subtitulo: "IV / IM / Implante gerado em sessão presencial",
    icon: Syringe,
    acento: "text-amber-600",
    faixa: "bg-amber-500",
    faixaLabel: "text-amber-700",
    bordaCard: "ring-amber-200",
    glow: "0 0 32px rgba(245,158,11,0.10)",
  },
  {
    key: null,
    nome: "SEM CLASSIFICAÇÃO",
    subtitulo: "Protocolos aguardando atribuição de linha",
    icon: Circle,
    acento: "text-muted-foreground",
    faixa: "bg-slate-400",
    faixaLabel: "text-slate-600",
    bordaCard: "ring-slate-200",
    glow: "none",
  },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function statusFaixa(status: string): string {
  switch (status) {
    case "active":    return "bg-emerald-500";
    case "validated": return "bg-blue-500";
    case "suggested": return "bg-amber-400";
    case "completed": return "bg-slate-400";
    case "cancelled": return "bg-red-500";
    default:          return "bg-muted";
  }
}

async function atribuirLinha(protocolId: number, linhaVenda: LinhaKey) {
  await fetch(`/api/protocols/${protocolId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ linhaVenda }),
  });
}

// ─── Card compacto de protocolo ───────────────────────────────────────────────

interface ProtoCardProps {
  protocol: any;
  onNavigate: (id: number) => void;
  onReatribuir: (id: number, nova: LinhaKey) => void;
  linhaAtual: LinhaConfig;
}

function ProtoCard({ protocol, onNavigate, onReatribuir, linhaAtual }: ProtoCardProps) {
  const [mudando, setMudando] = useState(false);
  const pct = protocol.totalSessions > 0
    ? Math.round((protocol.completedSessions / protocol.totalSessions) * 100)
    : 0;

  const dataInicio = (() => {
    try { return format(new Date(protocol.startDate), "dd/MM/yy", { locale: ptBR }); }
    catch { return protocol.startDate; }
  })();

  async function handleSelect(e: React.ChangeEvent<HTMLSelectElement>) {
    const nova = (e.target.value === "null" ? null : e.target.value) as LinhaKey;
    setMudando(true);
    await atribuirLinha(protocol.id, nova);
    onReatribuir(protocol.id, nova);
    setMudando(false);
  }

  return (
    <div className="panel-3d-sub overflow-hidden flex">
      {/* Faixa de status lateral */}
      <div className={`w-1 shrink-0 ${statusFaixa(protocol.status)}`} />

      <div className="flex-1 min-w-0 px-3 py-2.5">
        {/* Linha 1 — Cliente + valor */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div
              className="text-[12px] font-black uppercase tracking-tight text-foreground truncate leading-tight cursor-pointer hover:text-primary transition-colors"
              onClick={() => onNavigate(protocol.id)}
            >
              {protocol.clientName}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className="bevel-3d px-1.5 py-0.5 inline-flex items-center">
                <span className="text-[9px] font-black uppercase tracking-widest text-primary/80 truncate max-w-[140px]">
                  {protocol.title}
                </span>
              </div>
              <div className={`concave-3d px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest shrink-0 ${getStatusColor(protocol.status)}`}>
                {formatStatus(protocol.status)}
              </div>
            </div>
          </div>
          <div className="screen-3d px-2 py-1 shrink-0">
            <span className="text-[11px] font-black tabular-nums">
              R$ {protocol.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* Linha 2 — Progresso + data + navegação */}
        <div className="flex items-center gap-2 mt-2">
          {/* Barra de progresso minimalista */}
          <div className="paxter-bar-track flex-1 h-1.5 relative rounded-sm overflow-hidden">
            <div
              className="paxter-bar-fill h-full rounded-sm"
              style={{ width: `${pct}%`, transition: "width 0.5s ease" }}
            />
          </div>
          <span className="text-[9px] font-black tabular-nums text-muted-foreground shrink-0">
            {pct}%
          </span>
          <span className="text-[9px] text-muted-foreground/60 shrink-0">{dataInicio}</span>
          <ChevronRight
            className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 cursor-pointer hover:text-primary transition-colors"
            onClick={() => onNavigate(protocol.id)}
          />
        </div>

        {/* Linha 3 — Seletor de linha de venda */}
        <div className="mt-2 flex items-center gap-1.5">
          <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50">
            Linha:
          </span>
          <div className="concave-3d flex-1">
            <select
              value={protocol.linhaVenda ?? "null"}
              onChange={handleSelect}
              disabled={mudando}
              className="w-full bg-transparent text-[9px] font-black uppercase tracking-widest text-muted-foreground px-1.5 py-0.5 outline-none cursor-pointer"
            >
              <option value="null">— sem classificação —</option>
              <option value="magistral">PROGRAMA MAGISTRAL</option>
              <option value="digital">PAXTER DIGITAL</option>
              <option value="injetoterapia">INJETOTERAPIA</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bloco de linha de venda ──────────────────────────────────────────────────

interface BlocoLinhaProps {
  config: LinhaConfig;
  protocols: any[];
  onNavigate: (id: number) => void;
  onReatribuir: (id: number, nova: LinhaKey) => void;
}

function BlocoLinha({ config, protocols, onNavigate, onReatribuir }: BlocoLinhaProps) {
  const Icon = config.icon;
  const totalValor = protocols.reduce((s, p) => s + (p.totalValue || 0), 0);
  const ativos = protocols.filter(p => p.status === "active" || p.status === "validated").length;

  return (
    <div
      className="panel-3d overflow-hidden"
      style={{ boxShadow: config.glow !== "none" ? config.glow : undefined }}
    >
      {/* ── Header do bloco ── */}
      <div className="relative flex items-center gap-3 px-4 py-3.5 border-b border-border/30">
        {/* Faixa lateral de identidade (6px) */}
        <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${config.faixa}`} />

        <div className={`bevel-3d p-2 shrink-0 ${config.acento}`}>
          <Icon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className={`text-[11px] font-black uppercase tracking-widest ${config.acento}`}>
            {config.nome}
          </div>
          <div className="text-[9px] text-muted-foreground/60 truncate mt-0.5">
            {config.subtitulo}
          </div>
        </div>

        {/* KPIs do bloco */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="screen-3d px-2.5 py-1.5 text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Total</div>
            <div className="text-[13px] font-black tabular-nums">{protocols.length}</div>
          </div>
          {ativos > 0 && (
            <div className="bevel-3d px-2.5 py-1.5 text-center">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Ativos</div>
              <div className={`text-[13px] font-black tabular-nums ${config.acento}`}>{ativos}</div>
            </div>
          )}
          {totalValor > 0 && (
            <div className="concave-3d px-2.5 py-1.5 text-center">
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50">Valor</div>
              <div className="text-[11px] font-black tabular-nums">
                {totalValor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Cards de protocolos ── */}
      <div className="p-3 space-y-2">
        {protocols.length === 0 ? (
          <div className="concave-3d px-4 py-6 text-center">
            <Icon className={`h-6 w-6 mx-auto mb-2 ${config.acento} opacity-40`} />
            <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
              Nenhum protocolo nesta linha
            </div>
          </div>
        ) : (
          protocols.map(p => (
            <ProtoCard
              key={p.id}
              protocol={p}
              onNavigate={onNavigate}
              onReatribuir={onReatribuir}
              linhaAtual={config}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────

export default function PortfolioClinico() {
  const [, navigate] = useLocation();
  const { data: rawProtocols = [], isLoading, refetch } = useListProtocols({});
  const protocols: any[] = rawProtocols as any;

  // Estado local para refletir reatribuições sem recarregar a API
  const [overrides, setOverrides] = useState<Record<number, LinhaKey>>({});

  function getLinha(p: any): LinhaKey {
    if (p.id in overrides) return overrides[p.id];
    return (p.linhaVenda ?? null) as LinhaKey;
  }

  function handleReatribuir(id: number, nova: LinhaKey) {
    setOverrides(prev => ({ ...prev, [id]: nova }));
    refetch();
  }

  // Agrupar por linha
  const grupos = LINHAS.map(cfg => ({
    config: cfg,
    protocols: protocols.filter(p => getLinha(p) === cfg.key),
  }));

  // KPIs globais
  const total = protocols.length;
  const ativos = protocols.filter(p => p.status === "active" || p.status === "validated").length;
  const receita = protocols.reduce((s, p) => s + (p.totalValue || 0), 0);
  const classificados = protocols.filter(p => getLinha(p) !== null).length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/50 animate-pulse">
          Carregando portfólio…
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">

      {/* ── Cabeçalho da tela ── */}
      <div className="panel-3d overflow-hidden">
        <div className="relative flex items-center gap-4 px-5 py-4">
          {/* Faixa de identidade teal */}
          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-primary" />

          <div className="bevel-3d p-2.5 shrink-0 text-primary">
            <FolderTree className="h-6 w-6" />
          </div>

          <div className="flex-1">
            <h1 className="text-[15px] font-black uppercase tracking-widest text-foreground">
              PORTFÓLIO CLÍNICO
            </h1>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">
              Visualize e classifique todos os protocolos por linha de venda
            </p>
          </div>

          {/* KPIs do portfólio */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            <div className="screen-3d px-3 py-2 text-center">
              <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Protocolos</div>
              <div className="text-[16px] font-black tabular-nums">{total}</div>
            </div>
            <div className="bevel-3d px-3 py-2 text-center">
              <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Ativos</div>
              <div className="text-[16px] font-black tabular-nums text-emerald-600">{ativos}</div>
            </div>
            <div className="concave-3d px-3 py-2 text-center">
              <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Receita Total</div>
              <div className="text-[13px] font-black tabular-nums">
                {receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
              </div>
            </div>
            <div className="bevel-3d px-3 py-2 text-center">
              <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Classificados</div>
              <div className="text-[16px] font-black tabular-nums text-primary">
                {total > 0 ? Math.round((classificados / total) * 100) : 0}%
              </div>
            </div>
          </div>
        </div>

        {/* Barra de distribuição por linha */}
        {total > 0 && (
          <div className="px-5 pb-4">
            <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 mb-1.5">
              DISTRIBUIÇÃO POR LINHA
            </div>
            <div className="flex h-2 rounded-sm overflow-hidden gap-px">
              {LINHAS.filter(l => l.key !== null).map(l => {
                const count = grupos.find(g => g.config.key === l.key)?.protocols.length ?? 0;
                const pct = total > 0 ? (count / total) * 100 : 0;
                return pct > 0 ? (
                  <div
                    key={String(l.key)}
                    className={`${l.faixa} transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${l.nome}: ${count}`}
                  />
                ) : null;
              })}
              {/* parte não classificada */}
              {(() => {
                const naoClass = grupos.find(g => g.config.key === null)?.protocols.length ?? 0;
                const pct = total > 0 ? (naoClass / total) * 100 : 0;
                return pct > 0 ? (
                  <div
                    className="bg-slate-300 transition-all"
                    style={{ width: `${pct}%` }}
                    title={`Sem classificação: ${naoClass}`}
                  />
                ) : null;
              })()}
            </div>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {LINHAS.map(l => {
                const count = grupos.find(g => g.config.key === l.key)?.protocols.length ?? 0;
                return count > 0 ? (
                  <div key={String(l.key)} className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-[2px] ${l.faixa}`} />
                    <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50">
                      {l.nome} ({count})
                    </span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Blocos de linhas de venda ── */}
      {grupos.map(({ config, protocols: prots }) => (
        <BlocoLinha
          key={String(config.key)}
          config={config}
          protocols={prots}
          onNavigate={(id) => navigate(`/protocols/${id}`)}
          onReatribuir={handleReatribuir}
        />
      ))}

    </div>
  );
}
