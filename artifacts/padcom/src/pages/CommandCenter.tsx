/**
 * CEO Command Center — Tela Swipe entre Clínicas (Carta 07)
 *
 * Design: sistema PAXTER (panel-3d / bevel-3d / screen-3d / concave-3d).
 * Fundo: padrão do app (branco/creme). Chrome: navy + ouro.
 * SSE mantém dados em tempo real (push a cada 30s do servidor).
 */

import { useEffect, useRef, useState } from "react";
import {
  Building2, Users, Calendar, TrendingUp, AlertTriangle,
  Wifi, WifiOff, RefreshCw, ChevronLeft, ChevronRight,
  ShieldCheck, Package, CreditCard, Crown,
} from "lucide-react";

interface EmpresaResumo {
  id: number;
  nome: string;
  nick: string | null;
  status: string;
  tipoRelacionamento: string;
  podeSublicenciar: boolean;
  consultasHoje: number;
  clientesAtivos: number;
  caixaHoje: string;
  pagamentosPendentes: number;
  estoqueCritico: number;
  alertas: string[];
  atualizadoEm: string;
}

function formatBRL(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function tipoLabel(tipo: string): { label: string; classe: string } {
  const map: Record<string, { label: string; classe: string }> = {
    propria:              { label: "Própria",        classe: "text-[#45B8CC]"    },
    sub_unidade:          { label: "Sub-unidade",    classe: "text-emerald-600"  },
    licenciada_direta:    { label: "Licenciada",     classe: "text-amber-700"    },
    licenciada_por_clinica: { label: "Sub-licenciada", classe: "text-purple-600" },
  };
  return map[tipo] ?? { label: tipo, classe: "text-muted-foreground" };
}

// ── KPI com relevo saliente (screen-3d) ───────────────────────────────────────
function KPIBox({
  icon: Icon,
  label,
  value,
  alerta,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  alerta?: boolean;
}) {
  return (
    <div className={alerta ? "paxter-alert paxter-alert-red p-3 flex flex-col gap-1.5" : "concave-3d p-3 flex flex-col gap-1.5"}>
      <div className="flex items-center gap-1.5">
        <Icon
          size={13}
          className={alerta ? "text-red-600 shrink-0" : "text-primary shrink-0"}
        />
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">
          {label}
        </span>
      </div>
      <span className={`text-2xl font-bold tabular-nums leading-none ${alerta ? "text-red-700" : "text-primary"}`}>
        {value}
      </span>
    </div>
  );
}

// ── Card de cada clínica ──────────────────────────────────────────────────────
function EmpresaCard({ empresa, ativo }: { empresa: EmpresaResumo; ativo: boolean }) {
  const tipo = tipoLabel(empresa.tipoRelacionamento);
  const temAlerta = empresa.alertas.length > 0;
  const nome = empresa.nick?.trim() || empresa.nome;

  return (
    <div
      className={`snap-center shrink-0 w-[min(360px,90vw)] flex flex-col gap-4 transition-all duration-300 ${
        ativo ? "panel-3d-active" : "panel-3d opacity-75"
      } p-0 overflow-hidden`}
    >
      {/* Faixa-cabeçalho navy */}
      <div className="bg-primary px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 size={14} className="text-white/70 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-white font-bold text-sm leading-tight uppercase tracking-wide truncate">
              {nome}
            </span>
            <span className={`text-[10px] font-semibold ${tipo.classe}`}>
              {tipo.label}
              {empresa.podeSublicenciar && (
                <Crown size={9} className="inline ml-1 text-amber-400" />
              )}
            </span>
          </div>
        </div>
        <span
          className={`shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-[4px] uppercase tracking-widest border ${
            empresa.status === "ATIVO"
              ? "bg-green-100 border-green-400 text-green-700"
              : "bg-red-100 border-red-400 text-red-700"
          }`}
        >
          {empresa.status}
        </span>
      </div>

      {/* KPI Grid */}
      <div className="px-4 grid grid-cols-2 gap-2">
        <KPIBox icon={Calendar} label="Consultas hoje" value={empresa.consultasHoje} />
        <KPIBox icon={Users}    label="Clientes ativos" value={empresa.clientesAtivos} />
        <KPIBox
          icon={TrendingUp}
          label="Caixa hoje"
          value={formatBRL(empresa.caixaHoje)}
        />
        <KPIBox
          icon={CreditCard}
          label="Pend. pag."
          value={empresa.pagamentosPendentes}
          alerta={empresa.pagamentosPendentes > 5}
        />
      </div>

      {/* Estoque crítico */}
      {empresa.estoqueCritico > 0 && (
        <div className="px-4">
          <KPIBox
            icon={Package}
            label="Estoque crítico"
            value={`${empresa.estoqueCritico} item(s)`}
            alerta
          />
        </div>
      )}

      {/* Alertas */}
      {temAlerta && (
        <div className="mx-4 mb-1">
          <div className="bevel-3d px-3 py-2 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <AlertTriangle size={11} className="text-amber-600 shrink-0" />
              <span className="text-[9px] uppercase tracking-widest text-amber-700 font-bold">
                Alertas
              </span>
            </div>
            {empresa.alertas.map((a, i) => (
              <span key={i} className="text-[11px] text-amber-800 leading-snug font-medium">
                • {a}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Rodapé */}
      <div className="px-4 pb-3 flex items-center justify-between">
        <span className="text-[9px] text-muted-foreground uppercase tracking-widest">
          ID {empresa.id}
        </span>
        <span className="text-[9px] text-muted-foreground">
          Atualizado{" "}
          {new Date(empresa.atualizadoEm).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function CommandCenter() {
  const [resumos, setResumos] = useState<EmpresaResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const [cardAtivo, setCardAtivo] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const url = `${base}/api/ceo/stream`;
    const es = new EventSource(url);

    es.onopen = () => { setConectado(true); setErro(null); };

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data) as { ok: boolean; data?: EmpresaResumo[]; error?: string };
        if (payload.ok && payload.data) {
          setResumos(payload.data);
          setLoading(false);
        } else if (!payload.ok) {
          setErro(payload.error ?? "Erro desconhecido");
        }
      } catch {
        setErro("Falha ao processar dados do servidor.");
      }
    };

    es.onerror = () => {
      setConectado(false);
      setErro("Conexão perdida. Reconectando…");
    };

    return () => es.close();
  }, []);

  const scrollTo = (idx: number) => {
    const container = scrollRef.current;
    if (!container) return;
    const card = container.children[idx] as HTMLElement | undefined;
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    setCardAtivo(idx);
  };

  const prev = () => scrollTo(Math.max(0, cardAtivo - 1));
  const next = () => scrollTo(Math.min(resumos.length - 1, cardAtivo + 1));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Cabeçalho — mesmo padrão das outras páginas */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Command Center</h1>
          <p className="text-muted-foreground font-medium uppercase tracking-wider text-[10px] mt-1">
            Visão Geral das Clínicas — Tempo real
          </p>
        </div>
        <div className="flex items-center gap-2">
          {conectado ? (
            <div className="bevel-3d px-3 py-1.5 flex items-center gap-1.5 text-emerald-700 text-[11px] font-semibold">
              <Wifi size={12} />
              <span className="uppercase tracking-wider">Tempo real</span>
            </div>
          ) : (
            <div className="concave-3d px-3 py-1.5 flex items-center gap-1.5 text-muted-foreground text-[11px]">
              <WifiOff size={12} />
              <span>Reconectando…</span>
            </div>
          )}
        </div>
      </div>

      {/* Linha separadora com contador */}
      {resumos.length > 0 && (
        <div className="flex items-center justify-between">
          <div className="bevel-3d px-3 py-1.5 inline-flex items-center gap-2">
            <ShieldCheck size={13} className="text-primary" />
            <span className="text-[11px] uppercase tracking-widest font-bold text-primary">
              {resumos.length} clínica(s) ativa(s)
            </span>
          </div>
          {/* Paginação pontinhos */}
          <div className="flex items-center gap-1">
            {resumos.map((_, i) => (
              <button
                key={i}
                onClick={() => scrollTo(i)}
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  i === cardAtivo ? "w-6 bg-primary" : "w-1.5 bg-primary/20"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Carregando */}
      {loading && !erro && (
        <div className="panel-3d p-12 flex flex-col items-center gap-3">
          <RefreshCw size={24} className="animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Carregando clínicas…</span>
        </div>
      )}

      {/* Erro */}
      {erro && (
        <div className="paxter-alert paxter-alert-red px-4 py-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-600 shrink-0" />
          <span className="text-sm text-red-700 font-medium">{erro}</span>
        </div>
      )}

      {/* Carrossel de cards */}
      {!loading && resumos.length > 0 && (
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2"
          style={{ scrollbarWidth: "none" }}
          onScroll={(e) => {
            const container = e.currentTarget;
            const scrollLeft = container.scrollLeft;
            const cardWidth = container.scrollWidth / resumos.length;
            setCardAtivo(Math.round(scrollLeft / cardWidth));
          }}
        >
          {resumos.map((emp, i) => (
            <EmpresaCard key={emp.id} empresa={emp} ativo={i === cardAtivo} />
          ))}
        </div>
      )}

      {/* Controles de navegação */}
      {resumos.length > 1 && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={prev}
            disabled={cardAtivo === 0}
            className="btn-3d-soft p-2 disabled:opacity-30"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="screen-3d px-4 py-1.5 text-sm font-bold text-primary tabular-nums">
            {cardAtivo + 1} / {resumos.length}
          </span>
          <button
            onClick={next}
            disabled={cardAtivo === resumos.length - 1}
            className="btn-3d-soft p-2 disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

    </div>
  );
}
