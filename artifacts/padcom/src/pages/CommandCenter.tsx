/**
 * CEO Command Center — Tela Swipe entre Clínicas (Carta 07)
 *
 * Design: skill-layout-paxter — grade imaginária, bevel-3d (título), concave-3d (dados),
 * faixa lateral 4px + LED vela que respira (verde=própria, azul=licenciada, âmbar=sub, vermelho=inativa).
 * SEM faixa escura bg-primary no cabeçalho — segue padrão das telas internas.
 */

import { useEffect, useRef, useState } from "react";
import {
  Building2, Users, Calendar, TrendingUp, AlertTriangle,
  Wifi, WifiOff, RefreshCw, ChevronLeft, ChevronRight,
  ShieldCheck, Package, CreditCard, MapPin, Phone, Hash,
  BadgeCheck, Crown, Lock,
} from "lucide-react";

// ── Interface ampliada com todos os campos do CEO ────────────────────────────
interface EmpresaResumo {
  id: number;
  nome: string;
  nick: string | null;
  razaoSocial: string | null;
  cnpj: string | null;

  endereco: string | null;
  cep: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  zona: string | null;

  telefone: string | null;
  emailGeral: string | null;

  status: string;
  ativa: boolean;
  isAtiva: boolean;
  isPropria: boolean;
  isLicenciada: boolean;
  isSublicenciada: boolean;
  tipoLicenciamento: string;
  tipoRelacionamento: string;
  podeSublicenciar: boolean;
  royaltyPercent: string | null;
  valorMensalContrato: string | null;

  consultasHoje: number;
  clientesAtivos: number;
  caixaHoje: string;
  pagamentosPendentes: number;
  estoqueCritico: number;
  alertas: string[];
  atualizadoEm: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBRL(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "R$ 0,00";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatCNPJ(cnpj: string | null): string {
  if (!cnpj) return "—";
  const d = cnpj.replace(/\D/g, "");
  if (d.length !== 14) return cnpj;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

function formatCEP(cep: string | null): string {
  if (!cep) return "";
  const d = cep.replace(/\D/g, "");
  if (d.length !== 8) return cep;
  return `${d.slice(0,5)}-${d.slice(5)}`;
}

// Endereço resumido para o MetaField
function enderecoResumido(e: EmpresaResumo): string {
  const partes: string[] = [];
  if (e.endereco) partes.push(e.endereco);
  if (e.bairro) partes.push(e.bairro);
  if (e.cidade && e.estado) partes.push(`${e.cidade} - ${e.estado}`);
  else if (e.cidade) partes.push(e.cidade);
  if (e.cep) partes.push(formatCEP(e.cep));
  return partes.join(", ") || "—";
}

// ── LED Vela — configuração por tipo + status ─────────────────────────────────
//
// Verde  → isPropria (clínica do CEO)
// Azul   → isLicenciada + ativa
// Âmbar  → isSublicenciada
// Vermelho → inativa
//
interface LedConfig {
  faixaCor: string;          // classe bg-* para a faixa lateral (4px)
  ledClasses: string;        // classes paxter-led-* para o ponto que respira
  tipoLabel: string;         // texto exibido no badge
  tipoClasses: string;       // cor do texto do badge
}

function ledConfig(emp: EmpresaResumo): LedConfig {
  if (!emp.isAtiva) {
    return {
      faixaCor: "bg-red-500",
      ledClasses: "paxter-led paxter-led-red paxter-led-on",
      tipoLabel: "INATIVA",
      tipoClasses: "text-red-600",
    };
  }
  if (emp.isPropria) {
    return {
      faixaCor: "bg-emerald-500",
      ledClasses: "paxter-led paxter-led-green paxter-led-on",
      tipoLabel: "PRÓPRIA",
      tipoClasses: "text-emerald-700",
    };
  }
  if (emp.isSublicenciada) {
    return {
      faixaCor: "bg-amber-500",
      ledClasses: "paxter-led paxter-led-amber paxter-led-on",
      tipoLabel: "SUB-LICENCIADA",
      tipoClasses: "text-amber-700",
    };
  }
  // licenciada_direta (padrão)
  return {
    faixaCor: "bg-cyan-500",
    ledClasses: "paxter-led paxter-led-on",
    tipoLabel: "LICENCIADA",
    tipoClasses: "text-cyan-700",
  };
}

// ── MetaField — slot fixo com rótulo MAIÚSCULO + concave-3d ──────────────────
function MetaField({
  label,
  value,
  icon: Icon,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  icon?: typeof MapPin;
  mono?: boolean;
}) {
  const empty = value == null || value === "" || value === "—";
  return (
    <div className="concave-3d px-2.5 py-2 min-w-0">
      <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 leading-none mb-1.5">
        {label}
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        {Icon && !empty && <Icon className="h-3 w-3 shrink-0 text-muted-foreground/60" />}
        <span
          className={`text-[11px] font-bold uppercase tracking-tight leading-tight truncate ${
            empty ? "text-muted-foreground/35" : "text-foreground"
          } ${mono ? "tabular-nums font-mono" : ""}`}
        >
          {empty ? "—" : value}
        </span>
      </div>
    </div>
  );
}

// ── BoolField — campo booleano com LED e rótulo explícito ─────────────────────
function BoolField({
  label,
  valor,
  corTrue = "text-emerald-700",
  corFalse = "text-muted-foreground/50",
}: {
  label: string;
  valor: boolean;
  corTrue?: string;
  corFalse?: string;
}) {
  return (
    <div className="concave-3d px-2.5 py-2 flex items-center gap-2 min-w-0">
      <span
        className={`h-2 w-2 rounded-full shrink-0 ${valor ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
      />
      <div className="min-w-0">
        <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 leading-none mb-0.5">
          {label}
        </div>
        <span className={`text-[11px] font-black uppercase tracking-tight ${valor ? corTrue : corFalse}`}>
          {valor ? "SIM" : "NÃO"}
        </span>
      </div>
    </div>
  );
}

// ── KPI com concave-3d e número grande ───────────────────────────────────────
function KPIBox({
  icon: Icon,
  label,
  value,
  alerta = false,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  alerta?: boolean;
}) {
  return (
    <div className={`${alerta ? "paxter-alert paxter-alert-red" : "concave-3d"} p-3 flex flex-col gap-1.5`}>
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={alerta ? "text-red-600 shrink-0" : "text-muted-foreground/60 shrink-0"} />
        <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
          {label}
        </span>
      </div>
      <span className={`text-2xl font-black tabular-nums leading-none ${alerta ? "text-red-700" : "text-primary"}`}>
        {value}
      </span>
    </div>
  );
}

// ── Card de cada clínica — grade imaginária ───────────────────────────────────
//
// Zonas:
//  [FAIXA 4px + LED] | [ZONA 1: TÍTULO bevel-3d]
//                    | [ZONA 2: IDENTIDADE concave-3d × 2]
//                    | [ZONA 3: META GRID grid-cols-2]
//                    | [ZONA 4: FLAGS BOOLEANAS grid-cols-3]
//                    | [ZONA 5: KPI GRID grid-cols-2]
//                    | [ZONA 6: ALERTAS se houver]
//                    | [ZONA 7: RODAPÉ]
//
function EmpresaCard({ empresa, ativo }: { empresa: EmpresaResumo; ativo: boolean }) {
  const led = ledConfig(empresa);
  const nomeExibido = empresa.nick?.trim() || empresa.nome;
  const temAlerta = empresa.alertas.length > 0;

  return (
    <div
      className={`snap-center shrink-0 w-[min(380px,92vw)] flex overflow-hidden transition-all duration-300 ${
        ativo ? "panel-3d-active" : "panel-3d opacity-80"
      }`}
      style={{ minHeight: "620px" }}
    >
      {/* ── FAIXA LATERAL (4px) + LED VELA ──────────────────────────────── */}
      <div className="flex flex-col items-center pt-4 pb-3 gap-3 shrink-0" style={{ width: "20px" }}>
        {/* LED que respira */}
        <span className={`${led.ledClasses} shrink-0`} style={{ width: "10px", height: "10px" }} />
        {/* Faixa colorida */}
        <div className={`flex-1 w-1 rounded-full ${led.faixaCor} opacity-80`} />
      </div>

      {/* ── CONTEÚDO PRINCIPAL ───────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-0 py-3 pr-3">

        {/* ── ZONA 1: TÍTULO (bevel-3d — saliente) ─────────────────────── */}
        <div className="bevel-3d px-3 py-2.5 mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Building2 size={13} className="text-primary shrink-0" />
            <div className="min-w-0">
              <div className="text-[13px] font-black uppercase tracking-wide text-primary leading-tight truncate">
                {nomeExibido}
              </div>
              {empresa.razaoSocial && empresa.razaoSocial !== empresa.nome && (
                <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-widest truncate mt-0.5">
                  {empresa.razaoSocial}
                </div>
              )}
            </div>
          </div>
          {/* Badge de tipo — ao lado do identificador, nunca flutuante */}
          <span className={`shrink-0 text-[9px] font-black uppercase tracking-widest ${led.tipoClasses} concave-3d px-2 py-1`}>
            {led.tipoLabel}
          </span>
        </div>

        {/* ── ZONA 2: IDENTIDADE — CNPJ + STATUS (concave-3d × 2) ────────── */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <MetaField label="CNPJ" value={formatCNPJ(empresa.cnpj)} icon={Hash} mono />
          <div className="concave-3d px-2.5 py-2 flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                empresa.isAtiva ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
            <div>
              <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 leading-none mb-0.5">
                STATUS
              </div>
              <span className={`text-[11px] font-black uppercase tracking-tight ${
                empresa.isAtiva ? "text-emerald-700" : "text-red-600"
              }`}>
                {empresa.status}
              </span>
            </div>
          </div>
        </div>

        {/* ── ZONA 3: META GRID — endereço e contato ──────────────────────── */}
        <div className="grid grid-cols-1 gap-2 mb-2">
          <MetaField label="ENDEREÇO" value={enderecoResumido(empresa)} icon={MapPin} />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <MetaField label="TELEFONE" value={empresa.telefone} icon={Phone} />
          <MetaField label="E-MAIL" value={empresa.emailGeral} />
        </div>

        {/* ── ZONA 4: FLAGS BOOLEANAS EXPLÍCITAS (CEO pediu variáveis claras) */}
        <div className="mb-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1.5 pl-0.5">
            CLASSIFICAÇÃO
          </div>
          <div className="grid grid-cols-3 gap-2">
            <BoolField
              label="PRÓPRIA (CEO)"
              valor={empresa.isPropria}
              corTrue="text-emerald-700"
            />
            <BoolField
              label="LICENCIADA"
              valor={empresa.isLicenciada}
              corTrue="text-cyan-700"
            />
            <BoolField
              label="SUB-LICENCIADA"
              valor={empresa.isSublicenciada}
              corTrue="text-amber-700"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <BoolField
              label="PODE SUB-LICENCIAR"
              valor={empresa.podeSublicenciar}
              corTrue="text-primary"
            />
            <MetaField
              label="ROYALTY %"
              value={empresa.royaltyPercent ? `${empresa.royaltyPercent}%` : null}
            />
          </div>
        </div>

        {/* ── ZONA 5: KPI GRID ─────────────────────────────────────────── */}
        <div className="mb-2">
          <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 mb-1.5 pl-0.5">
            OPERAÇÃO — HOJE
          </div>
          <div className="grid grid-cols-2 gap-2">
            <KPIBox icon={Calendar}    label="CONSULTAS HOJE"  value={empresa.consultasHoje} />
            <KPIBox icon={Users}       label="CLIENTES ATIVOS" value={empresa.clientesAtivos} />
            <KPIBox icon={TrendingUp}  label="CAIXA HOJE"      value={formatBRL(empresa.caixaHoje)} />
            <KPIBox
              icon={CreditCard}
              label="PEND. PAG."
              value={empresa.pagamentosPendentes}
              alerta={empresa.pagamentosPendentes > 5}
            />
          </div>
          {empresa.estoqueCritico > 0 && (
            <div className="mt-2">
              <KPIBox
                icon={Package}
                label="ESTOQUE CRÍTICO"
                value={`${empresa.estoqueCritico} item(s)`}
                alerta
              />
            </div>
          )}
        </div>

        {/* ── ZONA 6: ALERTAS ──────────────────────────────────────────── */}
        {temAlerta && (
          <div className="mb-2">
            <div className="bevel-3d px-3 py-2 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle size={10} className="text-amber-600 shrink-0" />
                <span className="text-[9px] uppercase tracking-widest text-amber-700 font-black">
                  ALERTAS
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

        {/* ── ZONA 7: RODAPÉ ───────────────────────────────────────────── */}
        <div className="mt-auto pt-2 flex items-center justify-between">
          <span className="concave-3d px-2 py-0.5 text-[9px] text-muted-foreground/70 font-bold tabular-nums uppercase tracking-widest">
            ID {empresa.id}
          </span>
          <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest">
            {new Date(empresa.atualizadoEm).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

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

      {/* Cabeçalho */}
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

      {/* Legenda das cores do LED */}
      {resumos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="bevel-3d px-3 py-1.5 inline-flex items-center gap-2">
            <ShieldCheck size={12} className="text-primary" />
            <span className="text-[11px] uppercase tracking-widest font-bold text-primary">
              {resumos.length} clínica(s)
            </span>
          </div>
          {/* legenda LED */}
          {[
            { cor: "bg-emerald-500", txt: "Própria" },
            { cor: "bg-cyan-500",    txt: "Licenciada" },
            { cor: "bg-amber-500",   txt: "Sub-licenciada" },
            { cor: "bg-red-500",     txt: "Inativa" },
          ].map((l) => (
            <div key={l.txt} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${l.cor}`} />
              <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-semibold">
                {l.txt}
              </span>
            </div>
          ))}
          {/* Paginação pontinhos */}
          <div className="ml-auto flex items-center gap-1">
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
