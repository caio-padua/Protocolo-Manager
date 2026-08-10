/**
 * Radar Clínico — visão de piloto de avião para o Dr. Caio.
 * Todos os pacientes com protocolo, sessões e mensageria numa tela só.
 */
import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Camera,
  Syringe,
  Calendar,
  AlertTriangle,
  MessageCircle,
  CheckCircle2,
  Clock,
  Send,
  X,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  RefreshCw,
  Radio,
  BellOff,
  Zap,
  ArrowDownUp,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// ── Interfaces ──────────────────────────────────────────────────────────────

interface Protocolo {
  id: number;
  titulo: string | null;
  status: string | null;
  inicio: string | null;
  diasDesdeInicio: number | null;
}

interface SessoesInfo {
  ultimaData: string | null;
  ultimaStatus: string | null;
  diasDesdeUltima: number | null;
  faltou: boolean;
  proximaData: string | null;
  proximaHora: string | null;
}

interface SubstanciasInfo {
  total: number;
  temCoenzima: boolean;
  temGH: boolean;
  temTestosterona: boolean;
}

interface AlertasInfo {
  faltaHaDias: number | null;
  silencioHaDias: number | null;
}

interface Paciente {
  id: number;
  nome: string;
  dataNascimento: string | null;
  telefone: string | null;
  email: string | null;
  photoUrl: string | null;
  telegramChatId: string | null;
  protocolo: Protocolo | null;
  sessoes: SessoesInfo;
  substancias: SubstanciasInfo;
  alertas: AlertasInfo;
  ultimoContato: string | null;
}

interface RadarResponse {
  total: number;
  pagina: number;
  pageSize: number;
  totalPaginas: number;
  pacientes: Paciente[];
}

// ── Constantes e helpers ────────────────────────────────────────────────────

const API_BASE = "";
const GOLD = "#c2a05a";
const NAVY = "#16284a";

function fmtData(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function calcIdade(dataNasc: string | null | undefined): number | null {
  if (!dataNasc) return null;
  const hoje = new Date();
  const nasc = new Date(dataNasc);
  if (isNaN(nasc.getTime())) return null;
  let idade = hoje.getFullYear() - nasc.getFullYear();
  const m = hoje.getMonth() - nasc.getMonth();
  if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
  return idade;
}

function pluralDias(n: number | null | undefined, label = "dia"): string {
  if (n == null) return "—";
  return `${n} ${n === 1 ? label : label + "s"}`;
}

function statusProtocolo(status: string | null | undefined): { cor: string; label: string } {
  switch (status) {
    case "active":    return { cor: "#15803d", label: "Ativo" };
    case "validated": return { cor: "#1d4ed8", label: "Validado" };
    case "suggested": return { cor: "#b45309", label: "Sugerido" };
    case "completed": return { cor: "#475569", label: "Concluído" };
    case "cancelled": return { cor: "#b91c1c", label: "Cancelado" };
    default:          return { cor: "#64748b", label: status ?? "—" };
  }
}

// ── Card do paciente ────────────────────────────────────────────────────────

function CardPaciente({
  p,
  onMensagem,
}: {
  p: Paciente;
  onMensagem: (p: Paciente) => void;
}) {
  const [, setLocation] = useLocation();
  const prot = p.protocolo;
  const { cor: corProt, label: labelProt } = statusProtocolo(prot?.status);
  const idade = calcIdade(p.dataNascimento);

  const temAlertaFalta = p.alertas.faltaHaDias != null;
  const temAlertaSilencio =
    p.alertas.silencioHaDias != null && p.alertas.silencioHaDias >= 15;

  return (
    <div
      className="panel-3d relative flex flex-col h-full transition-all duration-200"
      style={{ minHeight: 260 }}
    >
      {/* Faixa de alerta (barra lateral esquerda com cor) */}
      {(temAlertaFalta || temAlertaSilencio) && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[6px]"
          style={{
            background: temAlertaFalta
              ? "linear-gradient(to bottom, #ef4444, #f97316)"
              : "linear-gradient(to bottom, #a855f7, #6366f1)",
          }}
        />
      )}

      <div className="p-4 pl-5 flex gap-3 flex-1">
        {/* Foto portrait 64×88 */}
        <div className="concave-3d rounded-[6px] p-1 shrink-0 self-start">
          <div className="w-16 h-[88px] rounded-[4px] overflow-hidden bg-muted flex items-center justify-center">
            {p.photoUrl ? (
              <img src={p.photoUrl} alt="Foto" className="w-full h-full object-cover" />
            ) : (
              <Camera className="w-5 h-5 text-muted-foreground/35" />
            )}
          </div>
        </div>

        {/* Dados principais */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Nome + idade */}
          <h3 className="text-sm font-bold leading-tight text-primary line-clamp-2 mb-1">
            {p.nome}
          </h3>
          <p className="text-[10px] text-muted-foreground">
            {idade != null ? `${idade} anos` : "—"}
            {p.dataNascimento && (
              <span className="text-muted-foreground/40"> · {fmtData(p.dataNascimento)}</span>
            )}
          </p>

          {/* Protocolo */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Syringe className="w-3 h-3 shrink-0" style={{ color: GOLD }} />
            {prot ? (
              <>
                <span
                  className="text-[9px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 rounded-[3px]"
                  style={{ background: `${corProt}22`, color: corProt }}
                >
                  {labelProt}
                </span>
                {prot.diasDesdeInicio != null && (
                  <span className="text-[10px] text-muted-foreground">
                    {prot.diasDesdeInicio}d ativo
                  </span>
                )}
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground/50">Sem protocolo</span>
            )}
          </div>

          {/* Sessões */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Calendar className="w-3 h-3 shrink-0 text-primary" />
            {p.sessoes.ultimaData ? (
              <span className="text-[10px] text-muted-foreground">
                Última: {fmtData(p.sessoes.ultimaData)}
                {p.sessoes.diasDesdeUltima != null && (
                  <> ({pluralDias(p.sessoes.diasDesdeUltima)} atrás)</>
                )}
              </span>
            ) : (
              <span className="text-[10px] text-muted-foreground/50">Sem sessões</span>
            )}
          </div>

          {/* Próxima sessão */}
          {p.sessoes.proximaData && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 shrink-0 text-emerald-500" />
              <span className="text-[10px] text-emerald-600 font-semibold">
                Próxima: {fmtData(p.sessoes.proximaData)}
                {p.sessoes.proximaHora && <> às {p.sessoes.proximaHora}</>}
              </span>
            </div>
          )}

          {/* Substâncias */}
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            {p.substancias.total > 0 ? (
              <>
                <div className="concave-3d px-1.5 py-0.5 text-[9px] font-bold text-foreground tabular-nums">
                  {p.substancias.total} injetável{p.substancias.total !== 1 ? "is" : ""}
                </div>
                {p.substancias.temCoenzima && (
                  <span className="text-[8px] font-bold px-1 py-0.5 rounded-[2px] bg-amber-500/15 text-amber-700 uppercase tracking-wide">
                    CoQ10
                  </span>
                )}
                {p.substancias.temGH && (
                  <span className="text-[8px] font-bold px-1 py-0.5 rounded-[2px] bg-blue-500/15 text-blue-700 uppercase tracking-wide">
                    GH
                  </span>
                )}
                {p.substancias.temTestosterona && (
                  <span className="text-[8px] font-bold px-1 py-0.5 rounded-[2px] bg-purple-500/15 text-purple-700 uppercase tracking-wide">
                    TEST
                  </span>
                )}
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground/40">Sem injetáveis ativos</span>
            )}
          </div>
        </div>
      </div>

      {/* Alertas */}
      {(temAlertaFalta || temAlertaSilencio) && (
        <div className="px-4 pl-5 pb-2 flex flex-wrap gap-1.5">
          {temAlertaFalta && (
            <div className="flex items-center gap-1 text-[9px] font-bold text-red-600 px-1.5 py-0.5 rounded-[3px] bg-red-500/10">
              <AlertTriangle className="w-2.5 h-2.5" />
              Faltou há {pluralDias(p.alertas.faltaHaDias)}
            </div>
          )}
          {temAlertaSilencio && (
            <div className="flex items-center gap-1 text-[9px] font-bold text-purple-700 px-1.5 py-0.5 rounded-[3px] bg-purple-500/10">
              <BellOff className="w-2.5 h-2.5" />
              Silêncio há {pluralDias(p.alertas.silencioHaDias)}
            </div>
          )}
        </div>
      )}

      {/* Rodapé — ações */}
      <div className="px-4 pl-5 pb-3 pt-2 border-t flex items-center justify-between gap-2">
        {/* Último contato */}
        <span className="text-[9px] text-muted-foreground/50">
          {p.ultimoContato
            ? `Contato: ${fmtData(p.ultimoContato)}`
            : "Sem histórico de contato"}
        </span>

        {/* Botões */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => onMensagem(p)}
            title="Enviar mensagem"
            className="btn-3d-soft flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wide"
          >
            <MessageCircle className="w-3 h-3" />
            Msg
          </button>
          <button
            onClick={() => setLocation(`/cockpit/${p.id}/prescricao`)}
            title="Abrir cockpit"
            className="bevel-3d flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wide"
            style={{ color: GOLD }}
          >
            <ExternalLink className="w-3 h-3" />
            Cockpit
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal de mensagem rápida ────────────────────────────────────────────────

function MsgModal({
  paciente,
  onClose,
}: {
  paciente: Paciente;
  onClose: () => void;
}) {
  const [canal, setCanal] = useState<"whatsapp" | "telegram" | "email">("whatsapp");
  const [texto, setTexto] = useState("");
  const { toast } = useToast();

  const canaisDisponiveis = [
    { id: "whatsapp" as const, label: "WhatsApp", disponivel: Boolean(paciente.telefone) },
    { id: "telegram" as const, label: "Telegram", disponivel: Boolean(paciente.telegramChatId) },
    { id: "email" as const, label: "E-mail", disponivel: Boolean(paciente.email) },
  ];

  const mutation = useMutation({
    mutationFn: async () => {
      const resp = await fetch(`${API_BASE}/api/radar-clinico/mensagem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: paciente.id, canal, mensagem: texto }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as any).error || `Erro ${resp.status}`);
      }
      return resp.json();
    },
    onSuccess: (data: { ok: boolean; historyStored?: boolean; historyError?: string }) => {
      if (data.historyStored === false) {
        toast({
          title: "Mensagem enviada, mas histórico não gravado",
          description: "O envio ocorreu com sucesso, porém o registro em 'último contato' falhou. O Radar pode não refletir este envio até o próximo contato.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Mensagem enviada com sucesso!" });
      }
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Falha ao enviar", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="panel-3d w-full max-w-md mx-4 p-5"
        style={{ background: NAVY, border: "1px solid rgba(194,160,90,0.3)" }}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#c2a05a]">
              Mensagem rápida
            </p>
            <h3 className="text-sm font-bold text-white leading-tight">{paciente.nome}</h3>
          </div>
          <button
            onClick={onClose}
            className="btn-3d-soft w-7 h-7 flex items-center justify-center rounded-full"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Seletor de canal */}
        <div className="flex gap-2 mb-4">
          {canaisDisponiveis.map((c) => (
            <button
              key={c.id}
              disabled={!c.disponivel}
              onClick={() => setCanal(c.id)}
              className={`flex-1 py-1.5 rounded-[6px] text-[10px] font-bold uppercase tracking-widest transition-all
                ${canal === c.id
                  ? "bevel-3d text-[#c2a05a]"
                  : "concave-3d text-muted-foreground"
                }
                ${!c.disponivel ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
              `}
            >
              {c.label}
              {!c.disponivel && <span className="ml-1 text-[8px]">(sem dado)</span>}
            </button>
          ))}
        </div>

        {/* Caixa de texto */}
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Digite a mensagem para o paciente…"
          rows={5}
          className="w-full concave-3d rounded-[6px] p-3 text-xs text-foreground bg-transparent resize-none outline-none placeholder:text-muted-foreground/50"
        />

        {/* Contador */}
        <p className="text-right text-[9px] text-muted-foreground/40 mb-4">
          {texto.length} caracteres
        </p>

        {/* Botão de envio */}
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !texto.trim()}
          className="w-full bevel-3d py-2.5 text-xs font-bold uppercase tracking-widest text-[#c2a05a] disabled:opacity-40"
        >
          {mutation.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Enviando…
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Send className="w-3 h-3" />
              Enviar via {canal}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────

export default function RadarClinico() {
  const [pagina, setPagina] = useState(1);
  const [protocoloStatus, setProtocoloStatus] = useState("all");
  const [tempoAtivo, setTempoAtivo] = useState("");
  const [faltaDias, setFaltaDias] = useState("");
  const [substancia, setSubstancia] = useState("");
  const [silencioDias, setSilencioDias] = useState("");
  // "urgencia" (padrão) = faltou DESC → silêncio DESC → A-Z
  const [ordenacao, setOrdenacao] = useState<"urgencia" | "az">("urgencia");
  const [pacienteMsg, setPacienteMsg] = useState<Paciente | null>(null);
  const queryClient = useQueryClient();

  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(pagina));
    params.set("ordenacao", ordenacao);
    if (protocoloStatus !== "all") params.set("protocolo_status", protocoloStatus);
    if (tempoAtivo) params.set("tempo_ativo", tempoAtivo);
    if (faltaDias) params.set("falta_dias", faltaDias);
    if (substancia) params.set("substancia", substancia);
    if (silencioDias) params.set("silencio_dias", silencioDias);
    return `${API_BASE}/api/radar-clinico?${params.toString()}`;
  }, [pagina, ordenacao, protocoloStatus, tempoAtivo, faltaDias, substancia, silencioDias]);

  const { data, isLoading, isError, refetch } = useQuery<RadarResponse>({
    queryKey: ["radar-clinico", pagina, ordenacao, protocoloStatus, tempoAtivo, faltaDias, substancia, silencioDias],
    queryFn: async () => {
      const r = await fetch(buildUrl());
      if (!r.ok) throw new Error(`Erro ${r.status} ao carregar o Radar Clínico`);
      return r.json() as Promise<RadarResponse>;
    },
    staleTime: 30_000,
  });

  const resetFiltros = () => {
    setProtocoloStatus("all");
    setTempoAtivo("");
    setFaltaDias("");
    setSubstancia("");
    setSilencioDias("");
    setPagina(1);
  };

  const temFiltro = protocoloStatus !== "all" || tempoAtivo || faltaDias || substancia || silencioDias;

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-5">

      {/* ── Cabeçalho ───────────────────────────────────────────────────────── */}
      <div className="panel-3d p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Radio className="w-4 h-4" style={{ color: GOLD }} />
              <h1 className="text-lg font-bold tracking-tight" style={{ color: GOLD }}>
                Radar Clínico
              </h1>
            </div>
            <p className="text-xs text-muted-foreground">
              Visão operacional · todos os pacientes com protocolo, sessões e mensageria
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Toggle de ordenação */}
            <div className="flex items-center gap-1 concave-3d p-1 rounded-[6px]">
              <ArrowDownUp className="w-3 h-3 ml-1 shrink-0 text-muted-foreground" />
              {(["urgencia", "az"] as const).map((op) => (
                <button
                  key={op}
                  onClick={() => { setOrdenacao(op); setPagina(1); }}
                  className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded-[4px] transition-all
                    ${ordenacao === op
                      ? "bevel-3d"
                      : "text-muted-foreground hover:text-foreground"
                    }`}
                  style={ordenacao === op ? { color: GOLD } : undefined}
                >
                  {op === "urgencia" ? "Urgência" : "A-Z"}
                </button>
              ))}
            </div>

            {data && (
              <div className="concave-3d px-3 py-1 text-xs font-bold tabular-nums">
                {data.total} paciente{data.total !== 1 ? "s" : ""}
              </div>
            )}
            <button
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ["radar-clinico"] });
                refetch();
              }}
              className="btn-3d-soft w-8 h-8 flex items-center justify-center"
              title="Atualizar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Filtros ─────────────────────────────────────────────────────────── */}
      <div className="panel-3d p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-3.5 h-3.5" style={{ color: GOLD }} />
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: GOLD }}>
            Filtros
          </span>
          {temFiltro && (
            <button
              onClick={resetFiltros}
              className="ml-auto text-[9px] font-bold uppercase tracking-widest text-destructive/70 hover:text-destructive flex items-center gap-1"
            >
              <X className="w-2.5 h-2.5" /> Limpar
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* Protocolo */}
          <div className="space-y-1">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Protocolo
            </label>
            <div className="flex flex-col gap-1">
              {[
                { v: "all", l: "Todos" },
                { v: "active", l: "Ativo" },
                { v: "inactive", l: "Inativo" },
              ].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => { setProtocoloStatus(v); setPagina(1); }}
                  className={`text-[10px] font-bold py-1 px-2 rounded-[4px] text-left transition-all
                    ${protocoloStatus === v ? "bevel-3d text-[#c2a05a]" : "concave-3d text-muted-foreground hover:text-foreground"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Tempo ativo */}
          <div className="space-y-1">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Tempo ativo
            </label>
            <div className="flex flex-col gap-1">
              {[
                { v: "", l: "Qualquer" },
                { v: "7", l: "≥ 7 dias" },
                { v: "15", l: "≥ 15 dias" },
                { v: "30", l: "≥ 30 dias" },
              ].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => { setTempoAtivo(v); setPagina(1); }}
                  className={`text-[10px] font-bold py-1 px-2 rounded-[4px] text-left transition-all
                    ${tempoAtivo === v ? "bevel-3d text-[#c2a05a]" : "concave-3d text-muted-foreground hover:text-foreground"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Falta */}
          <div className="space-y-1">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Falta
            </label>
            <div className="flex flex-col gap-1">
              {[
                { v: "", l: "Qualquer" },
                { v: "1", l: "Há ≥ 1 dia" },
                { v: "3", l: "Há ≥ 3 dias" },
                { v: "7", l: "Há ≥ 7 dias" },
              ].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => { setFaltaDias(v); setPagina(1); }}
                  className={`text-[10px] font-bold py-1 px-2 rounded-[4px] text-left transition-all
                    ${faltaDias === v ? "bevel-3d text-[#c2a05a]" : "concave-3d text-muted-foreground hover:text-foreground"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Substâncias */}
          <div className="space-y-1">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Substância
            </label>
            <div className="flex flex-col gap-1">
              {[
                { v: "", l: "Qualquer" },
                { v: "coenzima", l: "Coenzima Q10" },
                { v: "gh", l: "GH" },
                { v: "testosterona", l: "Testosterona" },
                { v: "5plus", l: "5+ injetáveis" },
              ].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => { setSubstancia(v); setPagina(1); }}
                  className={`text-[10px] font-bold py-1 px-2 rounded-[4px] text-left transition-all
                    ${substancia === v ? "bevel-3d text-[#c2a05a]" : "concave-3d text-muted-foreground hover:text-foreground"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Silêncio */}
          <div className="space-y-1">
            <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              Silêncio
            </label>
            <div className="flex flex-col gap-1">
              {[
                { v: "", l: "Qualquer" },
                { v: "15", l: "≥ 15 dias" },
                { v: "30", l: "≥ 30 dias" },
                { v: "60", l: "≥ 60 dias" },
              ].map(({ v, l }) => (
                <button
                  key={v}
                  onClick={() => { setSilencioDias(v); setPagina(1); }}
                  className={`text-[10px] font-bold py-1 px-2 rounded-[4px] text-left transition-all
                    ${silencioDias === v ? "bevel-3d text-[#c2a05a]" : "concave-3d text-muted-foreground hover:text-foreground"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Estados ─────────────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="flex items-center gap-3 text-muted-foreground">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Carregando radar…</span>
          </div>
        </div>
      )}

      {isError && (
        <div className="panel-3d p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm font-bold text-destructive">Falha ao carregar o Radar Clínico</p>
          <button onClick={() => refetch()} className="btn-3d-soft mt-3 px-3 py-1 text-xs">
            Tentar novamente
          </button>
        </div>
      )}

      {data && (data.pacientes?.length ?? 0) === 0 && !isLoading && (
        <div className="panel-3d p-10 text-center">
          <Radio className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum paciente encontrado com esses filtros</p>
          {temFiltro && (
            <button onClick={resetFiltros} className="btn-3d-soft mt-3 px-3 py-1 text-xs">
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {data && (data.pacientes?.length ?? 0) > 0 && (
        <>
          {/* KPI rápido */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Pacientes",
                valor: data.total,
                icon: <Zap className="w-3.5 h-3.5" style={{ color: GOLD }} />,
              },
              {
                label: "Falta — pág. atual",
                valor: data.pacientes.filter((p) => p.alertas.faltaHaDias != null).length,
                icon: <AlertTriangle className="w-3.5 h-3.5 text-red-500" />,
              },
              {
                label: "Silêncio ≥ 15d — pág.",
                valor: data.pacientes.filter((p) => (p.alertas.silencioHaDias ?? 0) >= 15).length,
                icon: <BellOff className="w-3.5 h-3.5 text-purple-500" />,
              },
              {
                label: "Próx. sessão — pág.",
                valor: data.pacientes.filter((p) => p.sessoes.proximaData != null).length,
                icon: <Calendar className="w-3.5 h-3.5 text-emerald-500" />,
              },
            ].map((k) => (
              <div key={k.label} className="panel-3d-sub px-3 py-2.5 flex items-center gap-2">
                {k.icon}
                <div>
                  <p className="text-lg font-bold leading-none tabular-nums">{k.valor}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-wide mt-0.5">
                    {k.label}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Grade */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.pacientes.map((p) => (
              <CardPaciente key={p.id} p={p} onMensagem={setPacienteMsg} />
            ))}
          </div>

          {/* Paginação */}
          {data.totalPaginas > 1 && (
            <div className="flex items-center justify-center gap-3 py-2">
              <button
                onClick={() => setPagina((v) => Math.max(1, v - 1))}
                disabled={pagina === 1}
                className="btn-3d-soft flex items-center gap-1 px-3 py-1.5 text-xs disabled:opacity-40"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Anterior
              </button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {pagina} / {data.totalPaginas}
              </span>
              <button
                onClick={() => setPagina((v) => Math.min(data.totalPaginas, v + 1))}
                disabled={pagina === data.totalPaginas}
                className="btn-3d-soft flex items-center gap-1 px-3 py-1.5 text-xs disabled:opacity-40"
              >
                Próxima
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Modal de mensagem */}
      {pacienteMsg && (
        <MsgModal paciente={pacienteMsg} onClose={() => setPacienteMsg(null)} />
      )}
    </div>
  );
}
