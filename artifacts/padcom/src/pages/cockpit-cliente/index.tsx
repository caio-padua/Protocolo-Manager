import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useListClients,
  useGetClient,
  useListProtocols,
  useListSessions,
  useListPayments,
  getListPaymentsQueryKey,
  getGetClientQueryKey,
} from "@workspace/api-client-react";
import { ClientPicker } from "@/components/ClientPicker";
import { ClientServiceAddresses } from "@/components/ClientServiceAddresses";
import { useToast } from "@/hooks/use-toast";
import { formatStatus, getStatusColor } from "@/lib/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FlaskConical,
  Syringe,
  Gem,
  ClipboardList,
  ClipboardCheck,
  TrendingUp,
  FileText,
  UserRound,
  Activity,
  DollarSign,
  User,
  Calendar,
  Clock,
  CreditCard,
  QrCode,
  Receipt,
  Banknote,
  Zap,
  ExternalLink,
  Loader2,
  Plus,
  FolderOpen,
  Pencil,
  ChevronDown,
  ChevronRight,
  MapPin,
  Phone,
  Mail,
  Home,
  Upload,
  FolderSync,
} from "lucide-react";
import EvolucaoExamesPanel from "@/pages/cockpit/panels/EvolucaoExamesPanel";
import Injetaveis from "@/pages/cockpit/panels/Injetaveis";
import PrescricaoPage from "@/pages/prescricao";
import NovoProtocolo from "@/pages/protocols/new";
import ExamesPage from "@/pages/exames";
import DocumentosPanel from "./panels/DocumentosPanel";
import AvisoSemAnamnese from "./panels/AvisoSemAnamnese";
import AnamnesePreviaPanel from "./panels/AnamnesePreviaPanel";
import ExamesEnviadosPanel from "./panels/ExamesEnviadosPanel";
import ContratosTimelineInline from "./panels/ContratosTimelineInline";
import ClienteCracha from "./panels/ClienteCracha";
import AcompanhamentoDiarioPanel from "./panels/AcompanhamentoDiarioPanel";

// ============================================================================
// COCKPIT DA CONSULTA UNIFICADO (Onda Fusão, 23/07/2026)
// Nav sticky (fixo no scroll), 10 abas (7 originais + 3 transplantadas).
// Transplante cirúrgico dos órgãos de clients/detail.tsx:
//   Protocolos (accordion de sessões) + Financeiro (KPIs + forms) + Cadastro
// Regra Diamante: clients/detail.tsx intacto no código, rota redireciona.
// Design: bevel-3d / panel-3d-sub / concave-3d — skill-layout-paxter.
// Spec: specs/cockpit-unificado.md
// ============================================================================

const NAVY = "#16294a";
const GOLD = "#9a7b32";
const CREAM = "hsl(40 33% 96%)";

type AbaId =
  | "prescricao"
  | "injetaveis"
  | "implantes"
  | "exames"
  | "evolucao"
  | "documentos"
  | "anamnese"
  | "protocolos"
  | "financeiro"
  | "cadastro";

const ABAS: { id: AbaId; rotulo: string; Icon: typeof FlaskConical }[] = [
  { id: "prescricao", rotulo: "Prescrição", Icon: FlaskConical },
  { id: "injetaveis", rotulo: "Injetáveis", Icon: Syringe },
  { id: "implantes", rotulo: "Implantes", Icon: Gem },
  { id: "exames", rotulo: "Exames", Icon: ClipboardList },
  { id: "evolucao", rotulo: "Evolução", Icon: TrendingUp },
  { id: "documentos", rotulo: "Documentos", Icon: FileText },
  { id: "anamnese", rotulo: "Anamnese Prévia", Icon: ClipboardCheck },
  { id: "protocolos", rotulo: "Protocolos", Icon: Activity },
  { id: "financeiro", rotulo: "Financeiro", Icon: DollarSign },
  { id: "cadastro", rotulo: "Cadastro", Icon: User },
];

const LS_CLIENTE = "cockpit.clienteId";
const LS_ABA = "cockpit.aba";

function lerClienteInicial(): number | null {
  try {
    const q = new URLSearchParams(window.location.search).get("cliente");
    if (q && /^\d+$/.test(q)) return Number(q);
    const ls = localStorage.getItem(LS_CLIENTE);
    if (ls && /^\d+$/.test(ls)) return Number(ls);
  } catch { /* sem localStorage */ }
  return null;
}

function lerAbaInicial(): AbaId {
  try {
    const q = new URLSearchParams(window.location.search).get("aba");
    if (q && ABAS.some((a) => a.id === q)) return q as AbaId;
    const s = localStorage.getItem(LS_ABA);
    if (s && ABAS.some((a) => a.id === s)) return s as AbaId;
  } catch { /* ignore */ }
  return "prescricao";
}

export default function CockpitCliente({ initialClientId }: { initialClientId?: number | null } = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const apiBase = import.meta.env.VITE_API_URL || "/api";

  // ── Seleção de cliente + aba ─────────────────────────────────────────────
  // initialClientId: vem da URL /cockpit/:clientId (zero reload)
  // lerClienteInicial: fallback para ?cliente= ou localStorage
  const [clienteId, setClienteIdState] = useState<number | null>(
    initialClientId ?? lerClienteInicial
  );
  const [aba, setAbaState] = useState<AbaId>(lerAbaInicial);
  const [expandedProtocol, setExpandedProtocol] = useState<number | null>(null);

  // ── Estado do módulo Financeiro (transplantado) ──────────────────────────
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [payMethod, setPayMethod] = useState("pix");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payInstallments, setPayInstallments] = useState("1");
  const [payCardLabel, setPayCardLabel] = useState("");
  const [payDescription, setPayDescription] = useState("");
  const [showAsaasForm, setShowAsaasForm] = useState(false);
  const [asaasAmount, setAsaasAmount] = useState("");
  const [asaasDesc, setAsaasDesc] = useState("");
  const [asaasDate, setAsaasDate] = useState("");

  function selecionarCliente(id: number | null) {
    setClienteIdState(id);
    setExpandedProtocol(null);
    try {
      if (id == null) localStorage.removeItem(LS_CLIENTE);
      else localStorage.setItem(LS_CLIENTE, String(id));
      const url = new URL(window.location.href);
      if (id == null) url.searchParams.delete("cliente");
      else url.searchParams.set("cliente", String(id));
      window.history.replaceState({}, "", url.toString());
    } catch { /* ignore */ }
  }

  function selecionarAba(a: AbaId) {
    setAbaState(a);
    try {
      localStorage.setItem(LS_ABA, a);
      const url = new URL(window.location.href);
      url.searchParams.set("aba", a);
      window.history.replaceState({}, "", url.toString());
    } catch { /* ignore */ }
  }

  // ── Hooks de dados ───────────────────────────────────────────────────────
  const { data: clients } = useListClients();
  const opcoes = useMemo(
    () => (clients ?? []).map((c) => ({ id: c.id, name: c.name })),
    [clients],
  );

  const { data: client } = useGetClient(clienteId ?? 0, {
    query: { enabled: !!clienteId, queryKey: getGetClientQueryKey(clienteId ?? 0) },
  });

  const { data: protocols, isLoading: loadingProtocols } = useListProtocols(
    { clientId: clienteId ?? 0 },
    { query: { enabled: !!clienteId, queryKey: ["protocols", clienteId] } },
  );

  const { data: sessions, isLoading: loadingSessions } = useListSessions(
    { clientId: clienteId ?? 0 },
    { query: { enabled: !!clienteId, queryKey: ["sessions", clienteId] } },
  );

  const { data: payments, isLoading: loadingPayments } = useListPayments(
    { clientId: clienteId ?? 0 },
    { query: { enabled: !!clienteId, queryKey: getListPaymentsQueryKey({ clientId: clienteId ?? 0 }) } },
  );

  // Limpa seleção se o cliente saiu do banco
  useEffect(() => {
    if (clienteId != null && clients && !clients.some((c) => c.id === clienteId)) {
      selecionarCliente(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, clienteId]);

  // ── KPIs financeiros ─────────────────────────────────────────────────────
  const totalPago = useMemo(
    () => (payments ?? []).filter(p => p.status === "paid").reduce((s, p) => s + p.amount, 0),
    [payments],
  );
  const totalPendente = useMemo(
    () => (payments ?? []).filter(p => p.status === "pending" || p.status === "overdue").reduce((s, p) => s + p.amount, 0),
    [payments],
  );

  const brl = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

  // ── Mutations (transplantadas de clients/detail.tsx) ─────────────────────
  const createPayment = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clienteId,
          amount: parseFloat(payAmount),
          method: payMethod,
          status: "paid",
          paidAt: payDate,
          description: payDescription || `${payMethod.toUpperCase()} - ${payDate}`,
          installments: payMethod === "credit" ? parseInt(payInstallments) : null,
          cardLabel: payMethod === "credit" ? payCardLabel : null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pagamento registrado!" });
      queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey({ clientId: clienteId ?? 0 }) });
      setShowPaymentForm(false);
      setPayAmount(""); setPayDescription(""); setPayCardLabel(""); setPayInstallments("1");
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const createAsaasCharge = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/asaas/charge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clienteId,
          amount: parseFloat(asaasAmount),
          description: asaasDesc || undefined,
          dueDate: asaasDate || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as any).error || "Erro ao gerar cobrança");
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Cobrança gerada!", description: "Link de pagamento criado no Asaas." });
      queryClient.invalidateQueries({ queryKey: getListPaymentsQueryKey({ clientId: clienteId ?? 0 }) });
      setShowAsaasForm(false); setAsaasAmount(""); setAsaasDesc(""); setAsaasDate("");
      if (data?.invoiceUrl) window.open(data.invoiceUrl, "_blank");
    },
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const driveSetup = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/google-drive/setup-client/${clienteId}`, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data: any) =>
      toast({ title: "Google Drive", description: data.message || "Pastas criadas com sucesso!" }),
    onError: (err: Error) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen w-full font-sans" style={{ background: CREAM }}>

      {/* ── BLOCO STICKY: header navy + régua de abas ── */}
      <div className="sticky top-0 z-50">
        {/* Header */}
        <header
          className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
          style={{
            background: "linear-gradient(180deg,#1e3668 0%,#16294a 55%,#0f1e3a 100%)",
            borderBottom: "1px solid rgba(231,205,143,0.25)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
          }}
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.30em] text-slate-400">
              Padcon Conect
            </span>
            <span
              className="text-[20px] font-bold leading-tight tracking-[0.08em] uppercase"
              style={{ fontFamily: "var(--app-font-display)", color: "#e7cd8f", textShadow: "0 1px 8px rgba(0,0,0,0.55)" }}
            >
              Cockpit da Consulta
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {client && (
              <div className="flex items-center gap-2">
                <Link href={`/clients/${client.id}/edit`}>
                  <Button className="btn-3d-soft h-8 text-[10px] font-black px-3">
                    <Pencil className="w-3 h-3 mr-1.5" /> EDITAR
                  </Button>
                </Link>
                <Button
                  className="btn-3d-soft h-8 text-[10px] font-black px-3"
                  onClick={() => driveSetup.mutate()}
                  disabled={driveSetup.isPending}
                >
                  {driveSetup.isPending
                    ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                    : <FolderOpen className="w-3 h-3 mr-1.5" />}
                  DRIVE
                </Button>
                <Link href={`/protocols/new?clientId=${client.id}`}>
                  <Button className="btn-3d h-8 text-[10px] font-black px-3">
                    <Plus className="w-3 h-3 mr-1.5" /> PROTOCOLO
                  </Button>
                </Link>
              </div>
            )}
            <ClientPicker
              clientes={opcoes}
              value={clienteId}
              onChange={(id) => selecionarCliente(id)}
              placeholder="Selecionar cliente…"
              triggerClassName="min-w-[260px] bg-white/95 text-[#16294a] font-semibold shadow-lg"
            />
          </div>
        </header>

        {/* Régua de abas — barra escura com scroll horizontal em telas pequenas */}
        <nav
          className="flex items-end gap-1 px-4 pt-2 overflow-x-auto"
          style={{
            background: "linear-gradient(180deg,#0f1e3a 0%,#13233f 100%)",
            borderBottom: "2px solid rgba(231,205,143,0.22)",
            scrollbarWidth: "none",
          }}
        >
          {ABAS.map(({ id, rotulo, Icon }) => {
            const ativo = aba === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selecionarAba(id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-t-[7px] px-4 py-2.5 text-[11px] font-bold uppercase tracking-wide transition-all duration-150 ${
                  ativo ? "-translate-y-0.5 text-[#16294a]" : "text-slate-400 hover:text-slate-200"
                }`}
                style={
                  ativo
                    ? {
                        background: "linear-gradient(180deg,#fffbf0 0%,#f1e7cf 100%)",
                        borderTop: `2px solid ${GOLD}`,
                        boxShadow: "0 -4px 14px -2px rgba(231,205,143,0.45), 0 4px 0 #f1e7cf, inset 0 2px 0 rgba(255,255,255,0.95)",
                      }
                    : {
                        background: "rgba(255,255,255,0.04)",
                        boxShadow: "inset 0 2px 6px rgba(0,0,0,0.32), inset 0 -1px 0 rgba(255,255,255,0.04)",
                      }
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {rotulo}
              </button>
            );
          })}
        </nav>
      </div>
      {/* ── FIM STICKY ── */}

      {/* ── Conteúdo claro ── */}
      <main className="px-4 py-6">
        {clienteId == null ? (
          <div className="panel-3d mx-auto mt-10 max-w-xl p-8 text-center">
            <UserRound className="mx-auto mb-3 h-8 w-8" style={{ color: GOLD }} />
            <div className="text-[15px] font-bold uppercase tracking-[0.12em]" style={{ color: NAVY }}>
              Selecione o cliente
            </div>
            <p className="mt-2 text-sm text-[#647c97]">
              Escolha o cliente na faixa superior. Todas as ferramentas da consulta — prescrição,
              injetáveis, implantes, exames, evolução, anamnese, protocolos, financeiro e cadastro
              — ficam nesta tela sem trocar de página.
            </p>
          </div>
        ) : (
          <div key={clienteId} className="space-y-4">
            {/* Crachá clínico + acompanhamento diário */}
            <ClienteCracha clientId={clienteId} />
            <AcompanhamentoDiarioPanel clientId={clienteId} />

            {/* ────────────────── ABAS ORIGINAIS ────────────────── */}

            {aba === "prescricao" && <PrescricaoPage clientId={clienteId} embedded />}

            {aba === "injetaveis" && (
              <div className="space-y-6">
                <NovoProtocolo clientId={clienteId} embedded />
                <Injetaveis clientId={clienteId} filtroProcedimento="injetavel" ocultarBotaoNovo />
              </div>
            )}

            {aba === "implantes" && (
              <div className="space-y-6">
                <NovoProtocolo clientId={clienteId} embedded />
                <Injetaveis clientId={clienteId} filtroProcedimento="implante" ocultarBotaoNovo />
              </div>
            )}

            {aba === "exames" && (
              <div className="space-y-4">
                {/* Duas vias de entrada — mesmo motor de extração */}
                <div className="panel-3d border-none p-4">
                  <div className="bevel-3d px-3 py-1.5 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2 mb-3">
                    Canais de entrada de exames
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="concave-3d p-3 flex items-start gap-3">
                      <Upload className="w-4 h-4 mt-0.5 shrink-0" style={{ color: GOLD }} />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: NAVY }}>
                          Portal do Cliente
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Arquivo enviado pelo próprio cliente via link de portal. Passa pelo mesmo motor de extração.
                        </p>
                      </div>
                    </div>
                    <div className="concave-3d p-3 flex items-start gap-3">
                      <FolderSync className="w-4 h-4 mt-0.5 shrink-0" style={{ color: GOLD }} />
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest" style={{ color: NAVY }}>
                          Google Drive (automático)
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Drive-watcher verifica a pasta do cliente a cada 4h e importa PDFs novos automaticamente.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <AvisoSemAnamnese clientId={clienteId} />
                <ExamesPage clientId={clienteId} embedded />
                <ExamesEnviadosPanel clientId={clienteId} />
              </div>
            )}

            {aba === "evolucao" && <EvolucaoExamesPanel clientId={clienteId} />}

            {aba === "anamnese" && <AnamnesePreviaPanel clientId={clienteId} />}

            {aba === "documentos" && (
              <div className="space-y-6">
                <DocumentosPanel clientId={clienteId} />
                <ContratosTimelineInline clientId={clienteId} />
              </div>
            )}

            {/* ────────────────── ABAS TRANSPLANTADAS ────────────────── */}

            {/* ── PROTOCOLOS (órgão 1+2 do doador) ── */}
            {aba === "protocolos" && (
              <div className="space-y-6">
                {/* KPI row */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Total", value: protocols?.length ?? 0, color: NAVY },
                    { label: "Ativos", value: protocols?.filter(p => p.status === "active").length ?? 0, color: "#16a34a" },
                    { label: "Concluídos", value: protocols?.filter(p => p.status === "completed").length ?? 0, color: "#6b7280" },
                  ].map(k => (
                    <div key={k.label} className="panel-3d-sub p-4 text-center border-none">
                      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">{k.label}</div>
                      <div className="text-3xl font-black tabular-nums" style={{ color: k.color, fontFamily: "'Cormorant Garamond', serif" }}>{k.value}</div>
                    </div>
                  ))}
                </div>

                {/* Botão novo protocolo */}
                <div className="flex justify-end">
                  <Link href={`/protocols/new?clientId=${clienteId}`}>
                    <Button className="btn-3d">
                      <Plus className="w-4 h-4 mr-2" /> NOVO PROTOCOLO
                    </Button>
                  </Link>
                </div>

                {/* Lista com accordion de sessões */}
                {loadingProtocols ? (
                  [...Array(2)].map((_, i) => <Skeleton key={i} className="h-28 rounded-lg panel-3d-sub" />)
                ) : !protocols?.length ? (
                  <div className="text-center py-16 panel-3d border-none bg-white/50">
                    <Activity className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                    <p className="text-muted-foreground uppercase font-bold text-sm tracking-widest">Nenhum protocolo cadastrado.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {protocols.map(protocol => {
                      const isExpanded = expandedProtocol === protocol.id;
                      const protocolSessions = (sessions ?? []).filter(
                        s => (s as any).protocolId === protocol.id
                      );
                      return (
                        <div key={protocol.id} className="panel-3d-sub border-none overflow-hidden">
                          {/* Cabeçalho do protocolo — clicável para accordion */}
                          <div
                            className="p-5 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors"
                            onClick={() => setExpandedProtocol(isExpanded ? null : protocol.id)}
                          >
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                              <div className="concave-3d flex items-center justify-center w-10 h-10 shrink-0 border-none">
                                {isExpanded
                                  ? <ChevronDown className="w-4 h-4" style={{ color: GOLD }} />
                                  : <ChevronRight className="w-4 h-4" style={{ color: GOLD }} />}
                              </div>
                              <div className="min-w-0">
                                <h3 className="text-sm font-black text-primary uppercase tracking-tight truncate">{protocol.title}</h3>
                                <div className="flex items-center gap-3 mt-1 flex-wrap">
                                  <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    Início: {format(new Date(protocol.startDate), "dd/MM/yyyy")}
                                  </span>
                                  <div className="screen-3d px-2 py-0.5 text-[10px] font-black tabular-nums">
                                    {protocol.completedSessions} / {protocol.totalSessions} sessões
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex -space-x-1.5">
                                {protocol.items.slice(0, 5).map((item, i) => (
                                  <div
                                    key={i}
                                    className="w-5 h-5 rounded-[3px] border-2 border-white shadow-sm ring-1 ring-black/5"
                                    style={{ backgroundColor: item.substanceColor }}
                                    title={item.substanceName}
                                  />
                                ))}
                              </div>
                              <Badge
                                variant="outline"
                                className={`rounded-[4px] border-none px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest shadow-sm ${getStatusColor(protocol.status)}`}
                              >
                                {formatStatus(protocol.status)}
                              </Badge>
                              <Link href={`/protocols/${protocol.id}`} onClick={e => e.stopPropagation()}>
                                <Button className="btn-3d-soft h-7 text-[9px] font-black px-2">
                                  <ExternalLink className="w-3 h-3 mr-1" /> VER
                                </Button>
                              </Link>
                            </div>
                          </div>

                          {/* Accordion — sessões do protocolo */}
                          {isExpanded && (
                            <div
                              className="border-t border-border/30"
                              style={{ background: "rgba(0,0,0,0.03)" }}
                            >
                              {loadingSessions ? (
                                <div className="p-4"><Skeleton className="h-16" /></div>
                              ) : !protocolSessions.length ? (
                                <p className="p-5 text-[11px] text-muted-foreground uppercase font-bold tracking-widest text-center">
                                  Nenhuma sessão registrada neste protocolo.
                                </p>
                              ) : (
                                <div className="divide-y divide-border/20">
                                  {protocolSessions.map(session => (
                                    <div key={session.id} className="px-6 py-3 flex items-center justify-between hover:bg-muted/10">
                                      <div className="flex items-center gap-4">
                                        <div className="concave-3d flex flex-col items-center justify-center w-12 h-12 shrink-0 border-none text-center">
                                          <span className="text-[9px] uppercase font-black text-muted-foreground/60 leading-none">
                                            {format(new Date(session.scheduledDate), "MMM", { locale: ptBR })}
                                          </span>
                                          <span className="text-lg font-black text-primary leading-none tabular-nums">
                                            {format(new Date(session.scheduledDate), "dd")}
                                          </span>
                                        </div>
                                        <div>
                                          <p className="font-bold text-primary flex items-center gap-1.5 uppercase tracking-tight text-xs">
                                            <Clock className="w-3 h-3" /> {session.scheduledTime}
                                          </p>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {session.substanceApplications?.slice(0, 4).map((app, i) => (
                                              <Badge key={i} variant="secondary" className="rounded-[4px] bg-muted/50 border-none text-[9px] py-0.5 px-1.5 font-extrabold uppercase tracking-wider text-muted-foreground shadow-sm">
                                                <div className="w-1.5 h-1.5 rounded-[2px] mr-1 shadow-sm" style={{ backgroundColor: app.substanceColor }} />
                                                {app.substanceName}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                      <Badge
                                        variant="outline"
                                        className={`rounded-[4px] border-none px-2 py-1 text-[9px] font-extrabold uppercase tracking-widest shadow-sm ${getStatusColor(session.status)}`}
                                      >
                                        {formatStatus(session.status)}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── FINANCEIRO (órgão 3+5+6 do doador) ── */}
            {aba === "financeiro" && (
              <div className="space-y-6">
                {/* KPI row */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="panel-3d-sub p-5 border-none text-center">
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Total Pago</div>
                    <div
                      className="text-3xl font-black tabular-nums"
                      style={{ fontFamily: "'Cormorant Garamond', serif", color: "#16a34a", fontVariantNumeric: "lining-nums tabular-nums" }}
                    >
                      {brl(totalPago)}
                    </div>
                  </div>
                  <div className="panel-3d-sub p-5 border-none text-center">
                    <div className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-2">Pendente</div>
                    <div
                      className="text-3xl font-black tabular-nums"
                      style={{ fontFamily: "'Cormorant Garamond', serif", color: totalPendente > 0 ? "#dc2626" : "#6b7280", fontVariantNumeric: "lining-nums tabular-nums" }}
                    >
                      {brl(totalPendente)}
                    </div>
                  </div>
                </div>

                {/* Botões de ação */}
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="bevel-3d px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest inline-flex items-center gap-2 flex-1">
                    <DollarSign className="h-3 w-3 text-primary" /> Lançamentos Financeiros
                  </div>
                  <Button
                    className="btn-3d-soft h-8 text-[10px] font-black"
                    onClick={() => { setShowAsaasForm(!showAsaasForm); setShowPaymentForm(false); }}
                  >
                    <Zap className="w-3.5 h-3.5 mr-1.5 text-primary" /> COBRAR PELO ASAAS
                  </Button>
                  <Button
                    className="btn-3d h-8 text-[10px] font-black"
                    onClick={() => { setShowPaymentForm(!showPaymentForm); setShowAsaasForm(false); }}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> NOVO PAGAMENTO
                  </Button>
                </div>

                {/* Form Asaas */}
                {showAsaasForm && (
                  <Card className="panel-3d border-primary/30 animate-in zoom-in-95 duration-200">
                    <CardContent className="p-6 space-y-6">
                      <div className="bevel-3d px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest inline-flex items-center gap-2">
                        <Zap className="h-3 w-3 text-primary" /> Cobrança online (PIX / Boleto / Cartão)
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Valor (R$) — mínimo 5,00</label>
                          <Input type="number" step="0.01" min="5" placeholder="0,00" className="field-engraved h-10 text-sm font-bold" value={asaasAmount} onChange={e => setAsaasAmount(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Descrição</label>
                          <Input placeholder="Opcional" className="field-engraved h-10 text-sm font-bold" value={asaasDesc} onChange={e => setAsaasDesc(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Vencimento (opcional)</label>
                          <Input type="date" className="field-engraved h-10 text-sm font-bold" value={asaasDate} onChange={e => setAsaasDate(e.target.value)} />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3">
                        <Button className="btn-3d-soft" onClick={() => setShowAsaasForm(false)}>CANCELAR</Button>
                        <Button
                          className="btn-3d px-6"
                          onClick={() => createAsaasCharge.mutate()}
                          disabled={!asaasAmount || parseFloat(asaasAmount) < 5 || createAsaasCharge.isPending}
                        >
                          {createAsaasCharge.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                          GERAR LINK DE PAGAMENTO
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Form pagamento manual */}
                {showPaymentForm && (
                  <Card className="panel-3d border-primary/30 animate-in zoom-in-95 duration-200">
                    <CardContent className="p-6 space-y-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Modalidade</label>
                          <div className="concave-3d p-0.5">
                            <Select value={payMethod} onValueChange={setPayMethod}>
                              <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 h-9 text-sm font-bold"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="pix">PIX</SelectItem>
                                <SelectItem value="credit">Crédito</SelectItem>
                                <SelectItem value="debit">Débito</SelectItem>
                                <SelectItem value="boleto">Boleto</SelectItem>
                                <SelectItem value="cash">Dinheiro</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Valor (R$)</label>
                          <Input type="number" step="0.01" placeholder="0,00" className="field-engraved h-10 text-sm font-bold" value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Data</label>
                          <Input type="date" className="field-engraved h-10 text-sm font-bold" value={payDate} onChange={e => setPayDate(e.target.value)} />
                        </div>
                        {payMethod === "credit" && (
                          <div className="space-y-1.5">
                            <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Parcelas</label>
                            <div className="concave-3d p-0.5">
                              <Select value={payInstallments} onValueChange={setPayInstallments}>
                                <SelectTrigger className="border-none bg-transparent shadow-none focus:ring-0 h-9 text-sm font-bold"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                                    <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {payMethod === "credit" && (
                          <div className="space-y-1.5">
                            <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Cartão (identificação)</label>
                            <Input placeholder="Ex: Nubank, Itaú Mastercard…" className="field-engraved h-10 text-sm font-bold" value={payCardLabel} onChange={e => setPayCardLabel(e.target.value)} />
                          </div>
                        )}
                        <div className="space-y-1.5 flex-1">
                          <label className="text-[9px] uppercase tracking-[0.2em] font-black text-muted-foreground">Descrição</label>
                          <Input placeholder="Opcional — ex: Parcela 1/3" className="field-engraved h-10 text-sm font-bold" value={payDescription} onChange={e => setPayDescription(e.target.value)} />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3">
                        <Button className="btn-3d-soft" onClick={() => setShowPaymentForm(false)}>CANCELAR</Button>
                        <Button
                          className="btn-3d px-6"
                          onClick={() => createPayment.mutate()}
                          disabled={!payAmount || createPayment.isPending}
                        >
                          {createPayment.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <DollarSign className="w-4 h-4 mr-2" />}
                          REGISTRAR PAGAMENTO
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Histórico de pagamentos */}
                {loadingPayments ? (
                  <Skeleton className="h-64 rounded-lg panel-3d-sub" />
                ) : !payments?.length ? (
                  <div className="text-center py-16 panel-3d border-none bg-white/50">
                    <CreditCard className="mx-auto h-12 w-12 text-muted-foreground opacity-20 mb-4" />
                    <p className="text-muted-foreground uppercase font-bold text-sm tracking-widest">Nenhum registro financeiro.</p>
                  </div>
                ) : (
                  <div className="panel-3d border-none overflow-hidden">
                    <div className="divide-y divide-border/40">
                      {payments.map(payment => {
                        const methodIcon = ({
                          pix: <QrCode className="w-4 h-4" />,
                          credit: <CreditCard className="w-4 h-4" />,
                          debit: <CreditCard className="w-4 h-4" />,
                          boleto: <Receipt className="w-4 h-4" />,
                          cash: <Banknote className="w-4 h-4" />,
                          credit_card: <CreditCard className="w-4 h-4" />,
                          debit_card: <CreditCard className="w-4 h-4" />,
                          transfer: <Banknote className="w-4 h-4" />,
                        } as Record<string, JSX.Element>)[payment.method as string] || <DollarSign className="w-4 h-4" />;

                        const methodLabel = ({
                          pix: "PIX", credit: "CRÉDITO", debit: "DÉBITO", boleto: "BOLETO",
                          cash: "DINHEIRO", credit_card: "CARTÃO CRÉDITO", debit_card: "CARTÃO DÉBITO",
                          transfer: "TRANSFERÊNCIA", insurance: "CONVÊNIO", asaas: "ASAAS (LINK)",
                        } as Record<string, string>)[payment.method as string] || (payment.method as string).toUpperCase();

                        const invoiceUrl = (payment as any).asaasInvoiceUrl as string | null;

                        return (
                          <div key={payment.id} className="p-5 flex items-center justify-between hover:bg-muted/30 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className={`w-11 h-11 panel-3d-sub flex items-center justify-center border-none shadow-sm ${payment.status === "paid" ? "text-emerald-600" : "text-amber-600"}`}>
                                {methodIcon}
                              </div>
                              <div>
                                <p className="font-black text-primary flex items-center gap-2 uppercase tracking-tight text-sm">
                                  {methodLabel}
                                  {(payment as any).installments && (
                                    <span className="concave-3d px-1.5 py-0.5 text-[10px] lowercase text-muted-foreground">{(payment as any).installments}x</span>
                                  )}
                                  {(payment as any).cardLabel && (
                                    <span className="text-[10px] font-bold text-muted-foreground/60">({(payment as any).cardLabel})</span>
                                  )}
                                </p>
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">
                                  {payment.paidAt
                                    ? format(new Date(payment.paidAt), "dd/MM/yyyy")
                                    : payment.dueDate
                                    ? `Venc: ${format(new Date(payment.dueDate), "dd/MM/yyyy")}`
                                    : "—"}
                                  {payment.description && <span className="mx-2 opacity-30">|</span>}
                                  {payment.description}
                                </p>
                              </div>
                            </div>
                            <div className="text-right flex items-center gap-3">
                              {invoiceUrl && payment.status !== "paid" && (
                                <Button className="btn-3d h-8 text-[10px] font-black" onClick={() => window.open(invoiceUrl!, "_blank")}>
                                  <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> PAGAR
                                </Button>
                              )}
                              <div className="screen-3d px-3 py-1 font-black text-primary tabular-nums" style={{ fontFamily: "'Cormorant Garamond', serif", fontVariantNumeric: "lining-nums tabular-nums" }}>
                                {brl(payment.amount)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CADASTRO (órgão 4 do doador) ── */}
            {aba === "cadastro" && (
              <div className="space-y-6">
                {/* Bloco de ações rápidas */}
                {client && (
                  <div className="panel-3d border-none p-5">
                    <div className="bevel-3d px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest inline-flex items-center gap-2 mb-4">
                      <User className="h-3 w-3 text-primary" /> Ações Rápidas
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Link href={`/clients/${client.id}/edit`}>
                        <Button className="btn-3d-soft">
                          <Pencil className="w-4 h-4 mr-2" /> EDITAR CADASTRO
                        </Button>
                      </Link>
                      <Link href={`/clients/${client.id}/prontuario`}>
                        <Button className="btn-3d-soft">
                          <FileText className="w-4 h-4 mr-2" /> PRONTUÁRIO
                        </Button>
                      </Link>
                      <Button
                        className="btn-3d-soft"
                        onClick={() => driveSetup.mutate()}
                        disabled={driveSetup.isPending}
                      >
                        {driveSetup.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FolderOpen className="w-4 h-4 mr-2" />}
                        CONFIGURAR DRIVE
                      </Button>
                    </div>
                  </div>
                )}

                {/* Info pessoal */}
                {client && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card className="panel-3d border-none relative overflow-visible">
                      <div className="bevel-3d px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest inline-flex items-center gap-2 absolute -top-3 left-4">
                        <Phone className="h-3 w-3 text-primary" /> Contato
                      </div>
                      <CardContent className="pt-8 space-y-4">
                        {[
                          { icon: Phone, label: "Celular", value: client.phone },
                          { icon: Mail, label: "E-mail", value: client.email },
                          { icon: Calendar, label: "Nascimento", value: client.birthDate ? format(new Date(client.birthDate), "dd/MM/yyyy") : null },
                        ].map(row => row.value ? (
                          <div key={row.label} className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                              <row.icon className="w-3 h-3 text-primary" /> {row.label}
                            </span>
                            <span className="font-bold text-sm text-right truncate max-w-[180px]">{row.value}</span>
                          </div>
                        ) : null)}
                        {client.address && (
                          <div className="pt-3 border-t">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                              <MapPin className="w-3 h-3 text-primary" /> Endereço
                            </span>
                            <p className="text-xs font-semibold leading-relaxed text-foreground/80 concave-3d p-2">
                              {client.address}
                            </p>
                          </div>
                        )}
                        {client.notes && (
                          <div className="pt-3 border-t">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-2 mb-2">
                              <FileText className="w-3 h-3 text-primary" /> Observações Clínicas
                            </span>
                            <div className="concave-3d p-3 text-xs font-medium leading-relaxed whitespace-pre-wrap">
                              {client.notes}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <div className="space-y-6">
                      {/* Endereços de atendimento (home care, clínicas) */}
                      <Card className="panel-3d border-none relative overflow-visible">
                        <div className="bevel-3d px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest inline-flex items-center gap-2 absolute -top-3 left-4">
                          <Home className="h-3 w-3 text-primary" /> Locais de Atendimento
                        </div>
                        <CardContent className="pt-8">
                          <ClientServiceAddresses clientId={clienteId} />
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
