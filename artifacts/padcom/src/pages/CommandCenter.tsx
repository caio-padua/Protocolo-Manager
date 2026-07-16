/**
 * CEO Command Center — Tela Swipe entre Clínicas (Carta 07)
 *
 * Cards horizontais com scroll-snap, um por clínica.
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

function tipoLabel(tipo: string): { label: string; cor: string } {
  const map: Record<string, { label: string; cor: string }> = {
    propria: { label: "Própria", cor: "text-[#45B8CC]" },
    sub_unidade: { label: "Sub-unidade", cor: "text-emerald-400" },
    licenciada_direta: { label: "Licenciada", cor: "text-amber-400" },
    licenciada_por_clinica: { label: "Sub-licenciada", cor: "text-purple-400" },
  };
  return map[tipo] ?? { label: tipo, cor: "text-slate-400" };
}

function KPIBox({
  icon: Icon,
  label,
  value,
  sub,
  alerta,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  sub?: string;
  alerta?: boolean;
}) {
  return (
    <div
      className={`rounded-[6px] border p-3 flex flex-col gap-1 ${
        alerta
          ? "border-red-500/40 bg-red-950/30"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          size={14}
          className={alerta ? "text-red-400" : "text-[#45B8CC]"}
        />
        <span className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">
          {label}
        </span>
      </div>
      <span
        className={`text-xl font-bold tabular-nums ${
          alerta ? "text-red-300" : "text-white"
        }`}
      >
        {value}
      </span>
      {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
    </div>
  );
}

function EmpresaCard({ empresa, ativo }: { empresa: EmpresaResumo; ativo: boolean }) {
  const tipo = tipoLabel(empresa.tipoRelacionamento);
  const temAlerta = empresa.alertas.length > 0;

  return (
    <div
      className={`snap-center shrink-0 w-[min(380px,92vw)] rounded-[6px] border transition-all duration-300 flex flex-col gap-4 p-5 ${
        ativo
          ? "border-[#45B8CC]/60 bg-[#0d2a2a] shadow-[0_0_24px_#45B8CC22]"
          : "border-white/10 bg-[#0f1f1f] opacity-70"
      }`}
    >
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <Building2 size={16} className="text-[#45B8CC] shrink-0" />
            <span className="text-white font-bold text-base leading-tight uppercase tracking-wide">
              {empresa.nick ?? empresa.nome}
            </span>
            {empresa.podeSublicenciar && (
              <Crown size={12} className="text-amber-400 shrink-0" title="Pode sub-licenciar" />
            )}
          </div>
          <span className={`text-[11px] font-medium ${tipo.cor}`}>{tipo.label}</span>
        </div>
        <span
          className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${
            empresa.status === "ATIVO"
              ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-400"
              : "border-red-500/40 bg-red-950/40 text-red-400"
          }`}
        >
          {empresa.status}
        </span>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-2">
        <KPIBox
          icon={Calendar}
          label="Consultas hoje"
          value={empresa.consultasHoje}
        />
        <KPIBox
          icon={Users}
          label="Clientes ativos"
          value={empresa.clientesAtivos}
        />
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

      {/* Estoque */}
      {empresa.estoqueCritico > 0 && (
        <KPIBox
          icon={Package}
          label="Estoque crítico"
          value={`${empresa.estoqueCritico} item(s)`}
          alerta
        />
      )}

      {/* Alertas */}
      {temAlerta && (
        <div className="rounded-[6px] border border-amber-500/30 bg-amber-950/20 p-3 flex flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={12} className="text-amber-400" />
            <span className="text-[10px] uppercase tracking-widest text-amber-400 font-semibold">
              Alertas
            </span>
          </div>
          {empresa.alertas.map((a, i) => (
            <span key={i} className="text-[11px] text-amber-300 leading-snug">
              • {a}
            </span>
          ))}
        </div>
      )}

      {/* Rodapé */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-600">
          ID {empresa.id}
        </span>
        <span className="text-[10px] text-slate-600">
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

export default function CommandCenter() {
  const [resumos, setResumos] = useState<EmpresaResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [conectado, setConectado] = useState(false);
  const [cardAtivo, setCardAtivo] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const url = `${base}/api/ceo/stream`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      setConectado(true);
      setErro(null);
    };

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

    return () => {
      es.close();
    };
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
    <div className="min-h-screen bg-[#0a1a1a] text-white flex flex-col">
      {/* Topo */}
      <div className="border-b border-white/10 bg-[#0d2a2a] px-6 py-4 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] uppercase tracking-widest text-[#45B8CC] font-semibold">
            PAXTER — Command Center
          </span>
          <h1 className="text-lg font-bold text-white leading-tight">
            Visão Geral das Clínicas
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {conectado ? (
            <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-medium">
              <Wifi size={12} />
              <span>Tempo real</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
              <WifiOff size={12} />
              <span>Reconectando…</span>
            </div>
          )}
        </div>
      </div>

      {/* Estado de carregamento */}
      {loading && !erro && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <RefreshCw size={24} className="animate-spin text-[#45B8CC]" />
          <span className="text-sm text-slate-400">Carregando clínicas…</span>
        </div>
      )}

      {erro && (
        <div className="mx-6 mt-6 rounded-[6px] border border-red-500/40 bg-red-950/20 p-4 flex items-center gap-2">
          <AlertTriangle size={16} className="text-red-400 shrink-0" />
          <span className="text-sm text-red-300">{erro}</span>
        </div>
      )}

      {/* Cards Swipe */}
      {!loading && resumos.length > 0 && (
        <div className="flex-1 flex flex-col justify-center gap-6 py-8">
          {/* Contador */}
          <div className="px-6 flex items-center justify-between">
            <span className="text-sm text-slate-400">
              <span className="text-white font-semibold">{resumos.length}</span> clínica(s) ativa(s)
            </span>
            <div className="flex items-center gap-1">
              {resumos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => scrollTo(i)}
                  className={`h-1.5 rounded-full transition-all duration-200 ${
                    i === cardAtivo ? "w-6 bg-[#45B8CC]" : "w-1.5 bg-white/20"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Carrossel */}
          <div
            ref={scrollRef}
            className="flex gap-4 overflow-x-auto snap-x snap-mandatory px-6 pb-2 scrollbar-hide"
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

          {/* Controles */}
          <div className="px-6 flex items-center justify-center gap-4">
            <button
              onClick={prev}
              disabled={cardAtivo === 0}
              className="p-2 rounded-[6px] border border-white/10 bg-white/5 text-white disabled:opacity-30 hover:bg-white/10 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm text-slate-400 tabular-nums">
              {cardAtivo + 1} / {resumos.length}
            </span>
            <button
              onClick={next}
              disabled={cardAtivo === resumos.length - 1}
              className="p-2 rounded-[6px] border border-white/10 bg-white/5 text-white disabled:opacity-30 hover:bg-white/10 transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Rodapé */}
      <div className="border-t border-white/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={12} className="text-[#45B8CC]" />
          <span className="text-[10px] text-slate-500">
            Acesso restrito — Platform Owner
          </span>
        </div>
        <span className="text-[10px] text-slate-600">
          {new Date().toLocaleDateString("pt-BR")}
        </span>
      </div>
    </div>
  );
}
