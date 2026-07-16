import { useState } from "react";
import { useListProtocols } from "@workspace/api-client-react";
import { CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatus, getStatusColor } from "@/lib/status";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, ChevronRight, Activity, Home, Building2, Calendar, UserRound, Circle } from "lucide-react";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Frequência no formato prescritivo: totalSessions/intervalDays dias.
 *  Ex.: 8 sessões a cada 7 dias → "8/7 dias" */
function freqLabel(totalSessions: number, intervalDays: number): string {
  const suffix = intervalDays === 1 ? "dia" : "dias";
  return `${totalSessions}/${intervalDays} ${suffix}`;
}

/** Faixa lateral (4px) colorida por status — âncora visual do card. */
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

/** Cor dos segmentos por fase de progresso — muda à medida que avança. */
function segColor(idx: number, total: number, completed: number): string {
  if (idx >= completed) return "bg-muted/25"; // futuro: vazio suave
  const pct = completed / total;
  if (pct < 0.34) return "bg-amber-500/80";   // início: âmbar
  if (pct < 0.67) return "bg-blue-500/80";     // meio: azul
  if (pct < 1)    return "bg-emerald-500/80";  // final: verde
  return "bg-gradient-to-r from-yellow-600 to-amber-400"; // 100%: ouro
}

/** Cor do % de progresso exibido. */
function pctColor(pct: number): string {
  if (pct === 0)   return "text-muted-foreground/50";
  if (pct < 34)    return "text-amber-500";
  if (pct < 67)    return "text-blue-500";
  if (pct < 100)   return "text-emerald-500";
  return "text-yellow-500";
}

// ─── ProgressBar segmentada ──────────────────────────────────────────────────

interface SegBarProps {
  completed: number;
  total: number;
}

function SegBar({ completed, total }: SegBarProps) {
  if (total <= 0) return null;
  const pct = Math.round((completed / total) * 100);
  // Máximo 16 segmentos visíveis; acima disso proporção contínua
  const MAX_SEGS = 16;
  const useSegs = total <= MAX_SEGS;
  const milestones = [Math.round(total * 0.25), Math.round(total * 0.5), Math.round(total * 0.75)];

  return (
    <div className="flex items-center gap-2">
      {/* Barra */}
      <div className="flex-1 relative">
        {useSegs ? (
          /* Modo segmentado: 1 retângulo por sessão */
          <div className="flex gap-[2px] items-end h-4">
            {Array.from({ length: total }).map((_, i) => (
              <div
                key={i}
                className={`relative flex-1 rounded-[1px] transition-all duration-500 ${segColor(i, total, completed)}`}
                style={{ height: milestones.includes(i + 1) ? "100%" : "70%" }}
              >
                {/* Marcador de milestone (segmento mais alto nas posições 25%/50%/75%) */}
                {milestones.includes(i + 1) && i + 1 <= completed && (
                  <div className="absolute -top-[3px] left-1/2 -translate-x-1/2 w-[3px] h-[3px] rounded-full bg-white/70" />
                )}
              </div>
            ))}
          </div>
        ) : (
          /* Modo contínuo: barra única com marcas de milestone */
          <div className="h-2 rounded-[2px] bg-muted/25 overflow-hidden relative shadow-inner">
            <div
              className={`h-full rounded-[2px] transition-all duration-700 ${pct < 34 ? "bg-amber-500/80" : pct < 67 ? "bg-blue-500/80" : pct < 100 ? "bg-emerald-500/80" : "bg-gradient-to-r from-yellow-600 to-amber-400"}`}
              style={{ width: `${pct}%` }}
            />
            {[25, 50, 75].map(m => (
              <div key={m} className="absolute top-0 bottom-0 w-px bg-white/20" style={{ left: `${m}%` }} />
            ))}
          </div>
        )}
      </div>

      {/* % e contagem — concave-3d alinhados à direita */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`text-[11px] font-black tabular-nums ${pctColor(pct)}`}>
          {pct}%
        </span>
        <div className="concave-3d px-2 py-0.5">
          <span className="text-[11px] font-black tabular-nums text-foreground/80">
            {completed}<span className="text-muted-foreground/60">/{total}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── MetaChip (bevel-3d com ícone) ──────────────────────────────────────────

interface MetaChipProps {
  icon: React.ElementType;
  label: string;
  value: string | null | undefined;
}

function MetaChip({ icon: Icon, label, value }: MetaChipProps) {
  if (!value) return null;
  return (
    <div className="bevel-3d flex items-center gap-1.5 px-2.5 py-1 min-w-0">
      <Icon className="h-3 w-3 shrink-0 text-primary/70" />
      <div className="min-w-0">
        <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/60 leading-none">
          {label}
        </div>
        <div className="text-[10px] font-black uppercase tracking-tight text-foreground truncate leading-tight">
          {value}
        </div>
      </div>
    </div>
  );
}

// ─── ProtocolCard ─────────────────────────────────────────────────────────────

interface Protocol {
  id: number;
  clientName: string;
  clientCpf: string;
  title: string;
  status: string;
  startDate: string;
  totalValue: number;
  unit?: string | null;
  serviceType?: string;
  professionalName?: string | null;
  totalSessions: number;
  completedSessions: number;
  items: Array<{
    id: number;
    substanceName: string;
    substanceColor: string;
    totalSessions: number;
    completedSessions: number;
    intervalDays: number;
    frequency?: string | null;
  }>;
}

interface ProtocolCardProps {
  protocol: Protocol;
  onClick: () => void;
}

function ProtocolCard({ protocol, onClick }: ProtocolCardProps) {
  const pct = protocol.totalSessions > 0
    ? Math.round((protocol.completedSessions / protocol.totalSessions) * 100)
    : 0;

  const clinicLabel = protocol.serviceType === "homecare" ? "Nurse Care" : (protocol.unit ?? "Clínica");
  const startFormatted = format(new Date(protocol.startDate), "dd/MM/yyyy", { locale: ptBR });

  return (
    <div
      className="panel-3d-sub cursor-pointer pw-hover-luxury transition-all overflow-hidden"
      onClick={onClick}
    >
      <div className="flex h-full">

        {/* ─ Faixa lateral de status (4px, cor por estado) ────────────── */}
        <div className={`w-1 shrink-0 ${statusFaixa(protocol.status)}`} />

        {/* ─ Corpo do card ─────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 p-0">

          {/* ZONA 1 + 2: Identidade — nome do paciente + nome do protocolo */}
          <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2">
            <div className="flex-1 min-w-0">
              {/* Linha 1 — nome completo do paciente (Grade Imaginária: fonte preto, maiúsculo) */}
              <div className="text-[15px] font-black uppercase tracking-tight text-foreground truncate leading-tight">
                {protocol.clientName}
              </div>
              {/* Linha 2 — nome do protocolo em destaque secundário */}
              <div className="flex items-center gap-2 mt-0.5">
                <div className="bevel-3d px-2 py-0.5 inline-flex items-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary/90 truncate">
                    {protocol.title}
                  </span>
                </div>
                {/* Badge de status — ao lado do título, nunca no canto */}
                <div className={`concave-3d px-2 py-0.5 text-[9px] font-black uppercase tracking-widest shrink-0 ${getStatusColor(protocol.status)}`}>
                  {formatStatus(protocol.status)}
                </div>
              </div>
            </div>

            {/* Valor em screen-3d + seta de navegação */}
            <div className="flex flex-col items-end gap-1.5 shrink-0">
              <div className="screen-3d px-3 py-1.5">
                <span className="text-sm font-black tabular-nums">
                  R$ {protocol.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {/* Mini anel de progresso — kaizen: indicador visual rápido */}
                <div className="relative w-5 h-5">
                  <svg viewBox="0 0 20 20" className="w-full h-full -rotate-90">
                    <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/20" />
                    <circle
                      cx="10" cy="10" r="7"
                      fill="none"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 7}`}
                      strokeDashoffset={`${2 * Math.PI * 7 * (1 - pct / 100)}`}
                      className={pct === 0 ? "text-muted/30" : pct < 34 ? "text-amber-500" : pct < 67 ? "text-blue-500" : pct < 100 ? "text-emerald-500" : "text-yellow-500"}
                      stroke="currentColor"
                      style={{ transition: "stroke-dashoffset 0.7s ease" }}
                    />
                  </svg>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground/60" />
              </div>
            </div>
          </div>

          {/* ZONA 3: Meta chips — clínica, médico, data (bevel-3d) */}
          <div className="flex flex-wrap gap-1.5 px-4 pb-2.5">
            <MetaChip
              icon={protocol.serviceType === "homecare" ? Home : Building2}
              label="Local"
              value={clinicLabel}
            />
            {protocol.professionalName && (
              <MetaChip
                icon={UserRound}
                label="Médico"
                value={protocol.professionalName}
              />
            )}
            <MetaChip
              icon={Calendar}
              label="Início"
              value={startFormatted}
            />
          </div>

          {/* ZONA 4: Itens — bevel-3d empilhados com linha imaginária vertical */}
          {protocol.items.length > 0 && (
            <div className="concave-3d mx-4 mb-3 p-2 space-y-1.5">
              {protocol.items.map(item => {
                const itemPct = item.totalSessions > 0
                  ? Math.round((item.completedSessions / item.totalSessions) * 100)
                  : 0;
                return (
                  <div
                    key={item.id}
                    className="bevel-3d grid items-center gap-x-2 px-2.5 py-1.5"
                    style={{ gridTemplateColumns: "10px 1fr 1px 36px 76px" }}
                  >
                    {/* Dot de cor da substância */}
                    <span
                      className="h-2.5 w-2.5 rounded-[2px] shrink-0 ring-1 ring-black/10"
                      style={{ backgroundColor: item.substanceColor }}
                    />
                    {/* Nome da substância — truncado, fonte nítida e escura */}
                    <span className="text-[11px] font-black uppercase tracking-tight text-foreground truncate">
                      {item.substanceName}
                    </span>
                    {/* Divisor vertical imaginário */}
                    <span className="h-full w-px bg-foreground/12 justify-self-center self-stretch my-0.5" />
                    {/* Sessões do item — alinhadas pela linha imaginária */}
                    <span className="text-[10px] font-black tabular-nums text-right text-primary whitespace-nowrap">
                      {item.completedSessions}<span className="text-muted-foreground/60">/{item.totalSessions}</span>
                    </span>
                    {/* Frequência — formato prescritivo: totalSessions/intervalDays dias */}
                    <span className="text-[9px] font-black uppercase tracking-wide text-muted-foreground/70 text-right whitespace-nowrap">
                      {freqLabel(item.totalSessions, item.intervalDays)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* ZONA 5: Barra de progresso segmentada */}
          {protocol.totalSessions > 0 && (
            <div className="px-4 pb-3.5">
              <div className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50 mb-1">
                Evolução
              </div>
              <SegBar completed={protocol.completedSessions} total={protocol.totalSessions} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function Protocols() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { data: protocols, isLoading } = useListProtocols(statusFilter ? { status: statusFilter } : {});
  const [, setLocation] = useLocation();

  const statuses = ["", "suggested", "validated", "active", "completed", "cancelled"];
  const statusLabels: Record<string, string> = {
    "": "Todos",
    suggested: "Sugeridos",
    validated: "Validados",
    active: "Ativos",
    completed: "Concluídos",
    cancelled: "Cancelados",
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Protocolos</h1>
          <p className="text-muted-foreground text-sm">Gerencie os protocolos de injeção dos pacientes.</p>
        </div>
        <Button className="btn-3d" onClick={() => setLocation("/protocols/new")}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Protocolo
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {statuses.map(s => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            className={statusFilter === s ? "btn-3d" : "btn-3d-soft"}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {statusLabels[s]}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      ) : !protocols?.length ? (
        <div className="panel-3d">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Activity className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhum protocolo encontrado</p>
            <p className="text-muted-foreground text-sm mb-4">Crie o primeiro protocolo para começar.</p>
            <Button className="btn-3d" onClick={() => setLocation("/protocols/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Protocolo
            </Button>
          </CardContent>
        </div>
      ) : (
        <div className="space-y-3">
          {(protocols as Protocol[]).map(protocol => (
            <ProtocolCard
              key={protocol.id}
              protocol={protocol}
              onClick={() => setLocation(`/protocols/${protocol.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
