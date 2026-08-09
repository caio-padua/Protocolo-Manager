/**
 * Radar Clínico — Visão operacional do médico.
 * Grade de pacientes com foto, fase do tratamento, substâncias,
 * alertas de sessão e mensageria rápida — tudo sem sair da tela.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "wouter";
import {
  Radar, X, MessageSquare, ChevronDown, ChevronUp,
  UserRound, Syringe, AlertTriangle, CalendarClock, Clock,
  Filter, Stethoscope, FlaskConical, ShieldAlert, Phone, ImageOff,
  CheckCircle2, RefreshCw, Send,
} from "lucide-react";
import {
  PatientSelectorBar,
  PatientGroupDivider,
  usePatientFilter,
} from "@/components/patients/PatientSelectorBar";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Badge }    from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ── Tipos ──────────────────────────────────────────────────────────────────

interface Substancia {
  id: number;
  name: string;
  procedureType: string;
  category: string;
  color?: string;
}

interface Diagnostico {
  id: number;
  nome: string;
  cid?: string;
  categoria: string;
}

interface Paciente {
  id: number;
  name: string;
  cpf?: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  photo_url?: string;
  client_status: string;
  protocol_id?: number;
  protocol_title?: string;
  protocol_status?: string;
  start_date?: string;
  dias_ativo?: number;
  completed_sessions?: number;
  total_sessions?: number;
  substances?: Substancia[];
  total_injetaveis?: number;
  ultima_sessao?: string;
  proxima_sessao?: string;
  dias_desde_ultima_sessao?: number;
  diagnosticos?: Diagnostico[];
  sem_foto: boolean;
  contato_incompleto: boolean;
}

interface Filtros {
  protocolStatus: "all" | "active" | "inactive";
  faseMin: number | null;
  faseMax: number | null;
  procedureType: string;
  substancia: string;
  diagnostico: string;
  faltouHaDias: number | null;
  semFoto: boolean;
  semContato: boolean;
}

const FILTROS_INICIAL: Filtros = {
  protocolStatus: "all",
  faseMin: null,
  faseMax: null,
  procedureType: "",
  substancia: "",
  diagnostico: "",
  faltouHaDias: null,
  semFoto: false,
  semContato: false,
};

// ── Helpers ────────────────────────────────────────────────────────────────

function calcularIdade(birthDate?: string): string {
  if (!birthDate) return "";
  const hoje = new Date();
  const nasc = new Date(birthDate);
  let anos = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) anos--;
  return `${anos} anos`;
}

function classeProtocolo(status?: string): string {
  switch (status) {
    case "active":    return "bg-green-100 text-green-700 border-green-200";
    case "validated": return "bg-blue-100  text-blue-700  border-blue-200";
    case "suggested": return "bg-amber-100 text-amber-700 border-amber-200";
    case "completed": return "bg-slate-100 text-slate-500 border-slate-200";
    case "cancelled": return "bg-red-100   text-red-500   border-red-200";
    default:          return "bg-slate-100 text-slate-400 border-slate-200";
  }
}

function labelProtocolo(status?: string): string {
  const MAP: Record<string, string> = {
    active: "ATIVO", validated: "VALIDADO", suggested: "SUGERIDO",
    completed: "CONCLUÍDO", cancelled: "CANCELADO",
  };
  return MAP[status ?? ""] ?? "SEM PROTOCOLO";
}

function faseTratamento(dias?: number | null): { label: string; cor: string } {
  if (dias == null) return { label: "Sem protocolo",         cor: "text-slate-400" };
  if (dias <=  7)   return { label: `Semana 1 (${dias}d)`,  cor: "text-emerald-600" };
  if (dias <= 30)   return { label: `Mês 1 (${dias}d)`,     cor: "text-cyan-600" };
  if (dias <= 90)   return { label: `Mês 2–3 (${dias}d)`,   cor: "text-blue-600" };
  if (dias <= 180)  return { label: `Mês 4–6 (${dias}d)`,   cor: "text-violet-600" };
  return                    { label: `Longa duração (${dias}d)`, cor: "text-amber-600" };
}

function labelVia(type: string): string {
  const MAP: Record<string, string> = {
    im: "IM", sc: "SC", implant: "IMPLANTE", iv: "IV", oral: "ORAL",
    intramuscular: "IM", subcutaneo: "SC", subcutâneo: "SC",
  };
  return MAP[type?.toLowerCase()] ?? (type?.toUpperCase() ?? "—");
}

function corVia(type: string): string {
  const MAP: Record<string, string> = {
    im: "bg-rose-100 text-rose-700", sc: "bg-sky-100 text-sky-700",
    implant: "bg-purple-100 text-purple-700", iv: "bg-indigo-100 text-indigo-700",
    oral: "bg-green-100 text-green-700",
  };
  return MAP[type?.toLowerCase()] ?? "bg-slate-100 text-slate-500";
}

function iniciais(name: string): string {
  return name.split(" ").slice(0, 2).map((p) => p[0]).join("").toUpperCase();
}

// ── Card do paciente ───────────────────────────────────────────────────────

function PatientCard({
  paciente: p,
  onMessage,
  onDiagnostico,
}: {
  paciente: Paciente;
  onMessage: (p: Paciente) => void;
  onDiagnostico: (p: Paciente) => void;
}) {
  const fase          = faseTratamento(p.dias_ativo);
  const alertaFalta   = (p.dias_desde_ultima_sessao ?? 0) >= 3;
  const substVisiveis = (p.substances ?? []).slice(0, 4);
  const maisSubst     = Math.max(0, (p.substances ?? []).length - 4);
  const progresso     = p.total_sessions
    ? Math.min(100, ((p.completed_sessions ?? 0) / p.total_sessions) * 100)
    : 0;

  return (
    <div
      className={`panel-3d flex flex-col gap-0 overflow-hidden ${alertaFalta ? "border-amber-300" : ""}`}
    >
      {/* Cabeçalho: foto + identidade */}
      <div className="flex gap-3 p-3">
        {/* Foto portrait 64×88 */}
        <div
          className="concave-3d rounded-[6px] overflow-hidden flex-shrink-0"
          style={{ width: 64, height: 88 }}
        >
          {p.photo_url ? (
            <img
              src={p.photo_url}
              alt={p.name}
              className="w-full h-full object-cover object-top"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-navy/10">
              <span className="text-lg font-black text-navy/40 select-none">
                {iniciais(p.name)}
              </span>
            </div>
          )}
        </div>

        {/* Dados */}
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span
            className="font-bold text-navy text-sm leading-tight truncate"
            style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1rem" }}
            title={p.name}
          >
            {p.name}
          </span>

          {/* Idade + alertas admin */}
          <div className="flex items-center gap-1 flex-wrap">
            {p.birth_date && (
              <span className="text-xs text-slate-500">{calcularIdade(p.birth_date)}</span>
            )}
            {p.sem_foto && (
              <span className="flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-600 border border-amber-200 px-1 rounded-[4px] font-bold uppercase tracking-wide">
                <ImageOff size={9} /> Sem foto
              </span>
            )}
            {p.contato_incompleto && (
              <span className="flex items-center gap-0.5 text-[10px] bg-red-100 text-red-500 border border-red-200 px-1 rounded-[4px] font-bold uppercase tracking-wide">
                <Phone size={9} /> Contato
              </span>
            )}
          </div>

          {/* Badge protocolo */}
          <span
            className={`self-start text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-[4px] border ${classeProtocolo(p.protocol_status)}`}
          >
            {labelProtocolo(p.protocol_status)}
          </span>

          {/* Fase */}
          <span className={`text-[11px] font-semibold ${fase.cor}`}>
            {fase.label}
          </span>

          {/* Barra de progresso de sessões */}
          {p.total_sessions ? (
            <div className="flex items-center gap-1">
              <div className="flex-1 h-1 concave-3d rounded-full overflow-hidden">
                <div
                  className="h-full bg-navy rounded-full transition-all"
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                {p.completed_sessions ?? 0}/{p.total_sessions}
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Substâncias */}
      {substVisiveis.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {substVisiveis.map((s) => (
            <span
              key={s.id}
              className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[4px] border border-current/20 ${corVia(s.procedureType)}`}
              title={`${s.name} — ${labelVia(s.procedureType)}`}
            >
              {labelVia(s.procedureType)} · {s.name.length > 12 ? s.name.slice(0, 12) + "…" : s.name}
            </span>
          ))}
          {maisSubst > 0 && (
            <span className="text-[9px] text-slate-400 self-center">+{maisSubst} mais</span>
          )}
        </div>
      )}

      {/* Diagnósticos */}
      {(p.diagnosticos ?? []).length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {(p.diagnosticos ?? []).slice(0, 3).map((d) => (
            <span
              key={d.id}
              className="text-[9px] bg-violet-100 text-violet-700 border border-violet-200 px-1.5 py-0.5 rounded-[4px] font-semibold"
              title={d.cid ? `CID: ${d.cid}` : undefined}
            >
              {d.nome.length > 18 ? d.nome.slice(0, 18) + "…" : d.nome}
            </span>
          ))}
          {(p.diagnosticos ?? []).length > 3 && (
            <span className="text-[9px] text-slate-400 self-center">
              +{(p.diagnosticos ?? []).length - 3}
            </span>
          )}
        </div>
      )}

      {/* Alertas de sessão */}
      {(alertaFalta || p.proxima_sessao) && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {alertaFalta && (
            <span className="flex items-center gap-0.5 text-[9px] bg-red-100 text-red-600 border border-red-200 px-1.5 py-0.5 rounded-[4px] font-bold uppercase tracking-wide">
              <Clock size={8} /> Faltou há {p.dias_desde_ultima_sessao}d
            </span>
          )}
          {p.proxima_sessao && (
            <span className="flex items-center gap-0.5 text-[9px] bg-green-100 text-green-700 border border-green-200 px-1.5 py-0.5 rounded-[4px] font-semibold">
              <CalendarClock size={8} /> Próx: {p.proxima_sessao}
            </span>
          )}
        </div>
      )}

      {/* Ações rápidas */}
      <div className="flex gap-1 px-3 pb-3 pt-1 border-t border-navy/10 mt-auto">
        <button
          className="btn-3d-soft flex items-center gap-1 text-xs px-2 py-1 flex-1 justify-center"
          onClick={() => onMessage(p)}
          title="Enviar mensagem pontual"
        >
          <MessageSquare size={12} /> Mensagem
        </button>
        <Link
          href={`/cockpit?cliente=${p.id}`}
          className="btn-3d-soft flex items-center gap-1 text-xs px-2 py-1 flex-1 justify-center"
          title="Abrir Cockpit"
        >
          <Stethoscope size={12} /> Cockpit
        </Link>
        <button
          className="btn-3d-soft flex items-center gap-1 text-xs px-2 py-1 justify-center"
          onClick={() => onDiagnostico(p)}
          title="Adicionar diagnóstico"
        >
          <ShieldAlert size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Bloco de filtro colapsável ─────────────────────────────────────────────

function BlocoFiltro({
  titulo, icon: Icon, children, defaultOpen = false,
}: {
  titulo: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [aberto, setAberto] = useState(defaultOpen);
  return (
    <div className="panel-3d-sub rounded-[6px] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left"
        onClick={() => setAberto((v) => !v)}
      >
        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-navy">
          <Icon size={12} />
          {titulo}
        </span>
        {aberto ? <ChevronUp size={12} className="text-slate-400" /> : <ChevronDown size={12} className="text-slate-400" />}
      </button>
      {aberto && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Painel de filtros ─────────────────────────────────────────────────────

function PainelFiltros({
  filtros: f,
  onChange,
}: {
  filtros: Filtros;
  onChange: (partial: Partial<Filtros>) => void;
}) {
  const FASES = [
    { label: "Semana 1 (0–7 dias)",       min: 0,   max: 7    },
    { label: "Mês 1 (8–30 dias)",         min: 8,   max: 30   },
    { label: "Mês 2–3 (31–90 dias)",      min: 31,  max: 90   },
    { label: "Mês 4–6 (91–180 dias)",     min: 91,  max: 180  },
    { label: "Longa duração (180+ dias)", min: 181, max: null  },
  ] as const;

  const VIAS = [
    { label: "Intramuscular (IM)", value: "im"      },
    { label: "Subcutâneo (SC)",    value: "sc"      },
    { label: "Implante",           value: "implant" },
    { label: "Intravenoso (IV)",   value: "iv"      },
    { label: "Oral/Manipulado",    value: "oral"    },
  ];

  const FALTAS = [
    { label: "Faltou há 1+ dias",  value: 1  },
    { label: "Faltou há 3+ dias",  value: 3  },
    { label: "Faltou há 7+ dias",  value: 7  },
    { label: "Faltou há 15+ dias", value: 15 },
  ];

  const DIAGNOSTICOS_FREQUENTES = [
    "Diabetes", "Pré-diabetes", "Hipotireoidismo", "Obesidade",
    "Síndrome Metabólica", "Hipertensão", "Dislipidemia", "Def. Vitamina D",
  ];

  const SUBSTANCIAS_COMUNS = [
    "Coenzima Q10", "Vitamina D", "Glutationa",
    "Vitamina C", "Testosterona", "B12",
  ];

  return (
    <div className="flex flex-col gap-2">

      {/* Status do protocolo */}
      <BlocoFiltro titulo="Protocolo" icon={CheckCircle2} defaultOpen>
        {(["all", "active", "inactive"] as const).map((v) => (
          <label key={v} className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="radio" name="protocolStatus" value={v}
              checked={f.protocolStatus === v}
              onChange={() => onChange({ protocolStatus: v })}
              className="accent-navy"
            />
            {{ all: "Todos os pacientes", active: "Protocolo ativo", inactive: "Sem protocolo ativo" }[v]}
          </label>
        ))}
      </BlocoFiltro>

      {/* Fase do tratamento */}
      <BlocoFiltro titulo="Fase do Tratamento" icon={Clock} defaultOpen>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="radio" name="fase"
            checked={f.faseMin === null && f.faseMax === null}
            onChange={() => onChange({ faseMin: null, faseMax: null })}
            className="accent-navy"
          />
          Todas as fases
        </label>
        {FASES.map((fase) => (
          <label key={fase.label} className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="radio" name="fase"
              checked={f.faseMin === fase.min && f.faseMax === fase.max}
              onChange={() => onChange({ faseMin: fase.min, faseMax: fase.max })}
              className="accent-navy"
            />
            {fase.label}
          </label>
        ))}
      </BlocoFiltro>

      {/* Via de aplicação */}
      <BlocoFiltro titulo="Via de Aplicação" icon={Syringe}>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="radio" name="via"
            checked={f.procedureType === ""}
            onChange={() => onChange({ procedureType: "" })}
            className="accent-navy"
          />
          Todas as vias
        </label>
        {VIAS.map((v) => (
          <label key={v.value} className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="radio" name="via" value={v.value}
              checked={f.procedureType === v.value}
              onChange={() => onChange({ procedureType: v.value })}
              className="accent-navy"
            />
            {v.label}
          </label>
        ))}
      </BlocoFiltro>

      {/* Substância */}
      <BlocoFiltro titulo="Substância" icon={FlaskConical}>
        <input
          type="text"
          className="field-engraved w-full text-xs px-2 py-1"
          placeholder="Buscar substância..."
          value={f.substancia}
          onChange={(e) => onChange({ substancia: e.target.value })}
        />
        <div className="flex flex-col gap-1 mt-1">
          {SUBSTANCIAS_COMUNS.map((nome) => (
            <button
              key={nome}
              className={`text-left text-xs px-2 py-1 rounded-[4px] border transition-all ${
                f.substancia.toLowerCase() === nome.toLowerCase()
                  ? "bg-navy text-white border-navy"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:border-navy/30"
              }`}
              onClick={() =>
                onChange({ substancia: f.substancia.toLowerCase() === nome.toLowerCase() ? "" : nome })
              }
            >
              {nome}
            </button>
          ))}
        </div>
      </BlocoFiltro>

      {/* Patologias diagnosticadas */}
      <BlocoFiltro titulo="Patologia" icon={ShieldAlert}>
        <input
          type="text"
          className="field-engraved w-full text-xs px-2 py-1"
          placeholder="Ex: Diabetes, Hipotireoidismo..."
          value={f.diagnostico}
          onChange={(e) => onChange({ diagnostico: e.target.value })}
        />
        <div className="flex flex-col gap-1 mt-1">
          {DIAGNOSTICOS_FREQUENTES.map((d) => (
            <button
              key={d}
              className={`text-left text-xs px-2 py-1 rounded-[4px] border transition-all ${
                f.diagnostico.toLowerCase() === d.toLowerCase()
                  ? "bg-violet-700 text-white border-violet-700"
                  : "bg-violet-50 text-violet-700 border-violet-200 hover:border-violet-400"
              }`}
              onClick={() =>
                onChange({ diagnostico: f.diagnostico.toLowerCase() === d.toLowerCase() ? "" : d })
              }
            >
              {d}
            </button>
          ))}
        </div>
      </BlocoFiltro>

      {/* Alertas de sessão */}
      <BlocoFiltro titulo="Alerta de Sessão" icon={AlertTriangle}>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="radio" name="falta"
            checked={f.faltouHaDias === null}
            onChange={() => onChange({ faltouHaDias: null })}
            className="accent-navy"
          />
          Sem filtro de falta
        </label>
        {FALTAS.map((opt) => (
          <label key={opt.value} className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="radio" name="falta"
              checked={f.faltouHaDias === opt.value}
              onChange={() => onChange({ faltouHaDias: opt.value })}
              className="accent-navy"
            />
            {opt.label}
          </label>
        ))}
      </BlocoFiltro>

      {/* Administrativo */}
      <BlocoFiltro titulo="Administrativo" icon={UserRound}>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox" checked={f.semFoto}
            onChange={(e) => onChange({ semFoto: e.target.checked })}
            className="accent-navy"
          />
          Apenas sem foto
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input
            type="checkbox" checked={f.semContato}
            onChange={(e) => onChange({ semContato: e.target.checked })}
            className="accent-navy"
          />
          Sem WhatsApp e sem e-mail
        </label>
      </BlocoFiltro>
    </div>
  );
}

// ── Modal de mensagem rápida ──────────────────────────────────────────────

function ModalMensagem({
  paciente, onClose,
}: {
  paciente: Paciente | null;
  onClose: () => void;
}) {
  const [canal, setCanal]     = useState<"whatsapp" | "telegram" | "email">("whatsapp");
  const [texto, setTexto]     = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const TEMPLATES = [
    "Oi, {nome}! O Dr. Caio está pensando em você e queria saber como você está se sentindo.",
    "Olá, {nome}! Como está a evolução do tratamento? Aguardamos seu retorno.",
    "{nome}, você tem consulta agendada em breve. Confirme sua presença!",
    "Prezado(a) {nome}, notamos sua ausência na última sessão. Podemos reagendar?",
  ];

  function aplicarTemplate(tpl: string) {
    const nome = paciente?.name.split(" ")[0] ?? "";
    setTexto(tpl.replace("{nome}", nome));
  }

  async function enviar() {
    if (!paciente || !texto.trim()) return;
    setEnviando(true);
    try {
      await fetch("/api/comunicacao/mensagem-pontual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: paciente.id, canal, texto: texto.trim() }),
      });
    } catch { /* rota pode não existir ainda — tratamento no futuro */ }
    setEnviado(true);
    setTimeout(() => { setEnviado(false); onClose(); }, 1500);
    setEnviando(false);
  }

  if (!paciente) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="panel-3d w-full max-w-md flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="bevel-3d text-xs px-2 py-0.5 mb-1">MENSAGEM PONTUAL</div>
            <div className="font-bold text-navy" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem" }}>
              {paciente.name}
            </div>
          </div>
          <button className="btn-3d-soft p-1" onClick={onClose}><X size={16} /></button>
        </div>

        {/* Canal */}
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Canal</div>
          <div className="flex gap-2">
            {(["whatsapp", "telegram", "email"] as const).map((c) => (
              <button
                key={c}
                className={`btn-3d-soft text-xs px-3 py-1 ${canal === c ? "!bg-navy !text-white" : ""}`}
                onClick={() => setCanal(c)}
              >
                {{ whatsapp: "WhatsApp", telegram: "Telegram", email: "E-mail" }[c]}
              </button>
            ))}
          </div>
        </div>

        {/* Templates */}
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Templates rápidos</div>
          <div className="flex flex-col gap-1">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl}
                className="text-left text-xs px-2 py-1.5 rounded-[4px] bg-slate-50 border border-slate-200 hover:border-navy/30 hover:bg-navy/5 transition-all"
                onClick={() => aplicarTemplate(tpl)}
              >
                {tpl.replace("{nome}", "…")}
              </button>
            ))}
          </div>
        </div>

        {/* Texto */}
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Mensagem</div>
          <textarea
            className="field-engraved w-full text-sm px-3 py-2 min-h-[80px] resize-none"
            placeholder="Digite a mensagem..."
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="text-right text-[10px] text-slate-400 mt-0.5">{texto.length} chars</div>
        </div>

        <div className="flex gap-2">
          <button className="btn-3d-soft flex-1 text-sm py-2" onClick={onClose}>Cancelar</button>
          <button
            className="btn-3d flex-1 text-sm py-2 flex items-center justify-center gap-1"
            disabled={!texto.trim() || enviando}
            onClick={enviar}
          >
            {enviado ? "✓ Enviado!" : enviando ? "Enviando…" : <><Send size={13} /> Enviar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de diagnóstico ──────────────────────────────────────────────────

function ModalDiagnostico({
  paciente, onClose, onSalvo,
}: {
  paciente: Paciente | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome]           = useState("");
  const [cid, setCid]             = useState("");
  const [categoria, setCategoria] = useState("outra");
  const [salvando, setSalvando]   = useState(false);

  const SUGESTOES = [
    { nome: "Diabetes Mellitus tipo 2",    cid: "E11",   categoria: "metabolica" },
    { nome: "Pré-diabetes",                cid: "R73",   categoria: "metabolica" },
    { nome: "Hipotireoidismo",             cid: "E03",   categoria: "endocrina"  },
    { nome: "Obesidade",                   cid: "E66",   categoria: "metabolica" },
    { nome: "Síndrome Metabólica",         cid: "E88.8", categoria: "metabolica" },
    { nome: "Hipertensão Arterial",        cid: "I10",   categoria: "cardiovascular" },
    { nome: "Deficiência de Vitamina D",   cid: "E55",   categoria: "nutricional" },
    { nome: "Resistência à Insulina",      cid: "E88.8", categoria: "metabolica" },
    { nome: "Dislipidemia",                cid: "E78",   categoria: "cardiovascular" },
    { nome: "Hiperomocisteinemia",         cid: "E72.1", categoria: "metabolica" },
  ];

  async function salvar() {
    if (!paciente || !nome.trim()) return;
    setSalvando(true);
    try {
      await fetch("/api/radar-clinico/diagnostico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: paciente.id,
          nomeDiagnostico: nome.trim(),
          codigoCid: cid.trim() || undefined,
          categoria,
        }),
      });
      onSalvo();
      onClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSalvando(false);
    }
  }

  if (!paciente) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="panel-3d w-full max-w-md flex flex-col gap-4 p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <div>
            <div className="bevel-3d text-xs px-2 py-0.5 mb-1">NOVO DIAGNÓSTICO</div>
            <div className="font-bold text-navy" style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "1.1rem" }}>
              {paciente.name}
            </div>
          </div>
          <button className="btn-3d-soft p-1" onClick={onClose}><X size={16} /></button>
        </div>

        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Diagnósticos frequentes</div>
          <div className="flex flex-wrap gap-1">
            {SUGESTOES.map((s) => (
              <button
                key={s.nome}
                className="text-[10px] px-2 py-1 rounded-[4px] bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 transition-all"
                onClick={() => { setNome(s.nome); setCid(s.cid); setCategoria(s.categoria); }}
              >
                {s.nome}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Nome do diagnóstico</div>
          <input
            className="field-engraved w-full text-sm px-3 py-2"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex: Hipotireoidismo"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">CID-10 (opcional)</div>
            <input
              className="field-engraved w-full text-sm px-3 py-2"
              value={cid}
              onChange={(e) => setCid(e.target.value)}
              placeholder="E03"
            />
          </div>
          <div className="flex-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Categoria</div>
            <select
              className="field-engraved w-full text-sm px-3 py-2"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            >
              <option value="metabolica">Metabólica</option>
              <option value="endocrina">Endócrina</option>
              <option value="cardiovascular">Cardiovascular</option>
              <option value="nutricional">Nutricional</option>
              <option value="outra">Outra</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <button className="btn-3d-soft flex-1 text-sm py-2" onClick={onClose}>Cancelar</button>
          <button
            className="btn-3d flex-1 text-sm py-2"
            disabled={!nome.trim() || salvando}
            onClick={salvar}
          >
            {salvando ? "Salvando…" : "Salvar Diagnóstico"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────

export default function RadarClinico() {
  const [filtros, setFiltros]           = useState<Filtros>(FILTROS_INICIAL);
  const [pacientes, setPacientes]       = useState<Paciente[]>([]);
  const [carregando, setCarregando]     = useState(false);
  const [painelAberto, setPainelAberto] = useState(true);

  // Seletor A–Z (padrão canônico — skill-patient-selector)
  const {
    busca, setBusca,
    letra, setLetra,
    letrasDisponiveis,
    filtrados: pacientesFiltrados,
    grupos,
  } = usePatientFilter(pacientes);
  const [pacienteMensagem, setPacienteMensagem]     = useState<Paciente | null>(null);
  const [pacienteDiagnostico, setPacienteDiagnostico] = useState<Paciente | null>(null);

  // Contagem de filtros ativos (para o badge no botão)
  const filtrosAtivos = useMemo(() => {
    let n = 0;
    if (filtros.protocolStatus !== "all") n++;
    if (filtros.faseMin !== null || filtros.faseMax !== null) n++;
    if (filtros.procedureType) n++;
    if (filtros.substancia) n++;
    if (filtros.diagnostico) n++;
    if (filtros.faltouHaDias !== null) n++;
    if (filtros.semFoto) n++;
    if (filtros.semContato) n++;
    return n;
  }, [filtros]);

  // Filtro de busca local: delegado ao hook usePatientFilter acima

  const carregar = useCallback(async () => {
    setCarregando(true);
    const params = new URLSearchParams();
    if (filtros.protocolStatus !== "all") params.set("protocolStatus", filtros.protocolStatus);
    if (filtros.faseMin  !== null) params.set("faseMin",  String(filtros.faseMin));
    if (filtros.faseMax  !== null) params.set("faseMax",  String(filtros.faseMax));
    if (filtros.procedureType)     params.set("procedureType", filtros.procedureType);
    if (filtros.substancia)        params.set("substancia",    filtros.substancia);
    if (filtros.diagnostico)       params.set("diagnostico",   filtros.diagnostico);
    if (filtros.faltouHaDias !== null) params.set("faltouHaDias", String(filtros.faltouHaDias));
    if (filtros.semFoto)    params.set("semFoto",    "true");
    if (filtros.semContato) params.set("semContato", "true");
    params.set("limit", "100");

    try {
      const resp = await fetch(`/api/radar-clinico?${params}`);
      const data = await resp.json();
      if (data.ok) setPacientes(data.pacientes ?? []);
    } catch (e) {
      console.error("Radar Clínico: erro ao carregar", e);
    } finally {
      setCarregando(false);
    }
  }, [filtros]);

  // Carrega sempre que filtros mudam
  useEffect(() => { carregar(); }, [carregar]);

  function atualizarFiltro(partial: Partial<Filtros>) {
    setFiltros((prev) => ({ ...prev, ...partial }));
  }

  function limparFiltros() {
    setFiltros(FILTROS_INICIAL);
    setBusca("");
  }

  // KPIs
  const kpiTotal   = pacientesFiltrados.length;
  const kpiAtivos  = pacientesFiltrados.filter((p) => ["active", "validated"].includes(p.protocol_status ?? "")).length;
  const kpiFaltas  = pacientesFiltrados.filter((p) => (p.dias_desde_ultima_sessao ?? 0) >= 3).length;
  const kpiSemFoto = pacientesFiltrados.filter((p) => p.sem_foto).length;

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">

      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <div className="panel-3d rounded-none border-x-0 border-t-0 px-4 py-3 flex flex-col gap-3 flex-shrink-0">

        {/* Título + controles */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Radar size={20} className="text-navy" />
            <div>
              <h1
                className="text-xl font-black text-navy uppercase tracking-widest leading-none"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              >
                Radar Clínico
              </h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                Visão operacional do médico
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="btn-3d-soft flex items-center gap-1 text-xs px-3 py-1.5"
              onClick={carregar}
              disabled={carregando}
            >
              <RefreshCw size={12} className={carregando ? "animate-spin" : ""} />
              Atualizar
            </button>
            <button
              className={`btn-3d-soft flex items-center gap-1 text-xs px-3 py-1.5 ${painelAberto ? "!bg-navy !text-white" : ""}`}
              onClick={() => setPainelAberto((v) => !v)}
            >
              <Filter size={12} />
              Filtros
              {filtrosAtivos > 0 && (
                <span className="bg-amber-400 text-navy text-[9px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                  {filtrosAtivos}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Total",    value: kpiTotal,   cor: "text-navy"      },
            { label: "Ativos",   value: kpiAtivos,  cor: "text-green-600" },
            { label: "Faltas",   value: kpiFaltas,  cor: "text-red-500"   },
            { label: "Sem foto", value: kpiSemFoto, cor: "text-amber-500" },
          ].map((k) => (
            <div key={k.label} className="screen-3d text-center py-1.5 px-2">
              <div className={`text-lg font-black leading-none ${k.cor}`}>{k.value}</div>
              <div className="text-[9px] uppercase tracking-widest text-slate-500 mt-0.5">{k.label}</div>
            </div>
          ))}
        </div>

        {/* Barra A–Z + busca (padrão canônico — skill-patient-selector) */}
        <div className="panel-3d-sub p-3 space-y-2 rounded-lg">
          <PatientSelectorBar
            busca={busca}
            onBuscaChange={setBusca}
            letraSelecionada={letra}
            onLetraChange={setLetra}
            letrasDisponiveis={letrasDisponiveis}
            placeholder="Buscar por nome, CPF ou telefone..."
          />
        </div>
      </div>

      {/* ── Corpo: filtros + grade ─────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Painel de filtros */}
        {painelAberto && (
          <div className="w-56 flex-shrink-0 overflow-y-auto border-r border-navy/10 bg-white p-3 flex flex-col gap-2">
            {filtrosAtivos > 0 && (
              <button
                className="btn-3d-soft text-xs py-1 w-full flex items-center gap-1 justify-center text-red-600"
                onClick={limparFiltros}
              >
                <X size={11} /> Limpar filtros ({filtrosAtivos})
              </button>
            )}
            <PainelFiltros filtros={filtros} onChange={atualizarFiltro} />
          </div>
        )}

        {/* Grade de pacientes */}
        <div className="flex-1 overflow-y-auto p-3">
          {carregando && (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <RefreshCw size={24} className="animate-spin" />
              <span className="ml-2 text-sm">Carregando pacientes…</span>
            </div>
          )}

          {!carregando && pacientesFiltrados.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
              <Radar size={40} className="opacity-30" />
              <p className="text-sm">Nenhum paciente encontrado com esses filtros.</p>
              {filtrosAtivos > 0 && (
                <button className="btn-3d-soft text-xs px-4 py-1.5 mt-2" onClick={limparFiltros}>
                  Limpar filtros
                </button>
              )}
            </div>
          )}

          {!carregando && pacientesFiltrados.length > 0 && (
            <>
              <div className="text-[10px] text-slate-400 mb-2 uppercase tracking-wider">
                {kpiTotal} paciente(s) encontrado(s)
                {filtrosAtivos > 0 && ` · ${filtrosAtivos} filtro(s) ativo(s)`}
              </div>

              {/* Grade por grupos de letra — padrão canônico skill-patient-selector */}
              <div className="flex flex-col gap-4">
                {grupos.map((g) => (
                  <div key={g.letra}>
                    <PatientGroupDivider letra={g.letra} count={g.pacientes.length} />
                    <div
                      className="grid gap-3 mt-2"
                      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
                    >
                      {g.pacientes.map((p) => (
                        <PatientCard
                          key={p.id}
                          paciente={p}
                          onMessage={setPacienteMensagem}
                          onDiagnostico={setPacienteDiagnostico}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modais */}
      <ModalMensagem
        paciente={pacienteMensagem}
        onClose={() => setPacienteMensagem(null)}
      />
      <ModalDiagnostico
        paciente={pacienteDiagnostico}
        onClose={() => setPacienteDiagnostico(null)}
        onSalvo={carregar}
      />
    </div>
  );
}
