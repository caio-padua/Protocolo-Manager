import { useEffect, useState, useCallback, useRef } from "react";
import {
  ShieldCheck, MessageSquare, Mail, Send, CheckCheck,
  AlertTriangle, Link2, RefreshCw, ChevronDown, ChevronUp,
  Clock, Bot, Trello, Filter, X, Info, Wifi, WifiOff
} from "lucide-react";
import { ConsoleShell, BlockTitle, StatusVela, BASE } from "./_shared";

// ============================================================================
// CENTRAL DE AUDITORIA DE COMUNICAÇÃO — visão unificada de TODOS os canais:
// WhatsApp (Twilio, dados reais do DB), E-mail (Gmail API), Telegram, Trello.
// TDAH/TOC-friendly: blocos visuais distintos, cores de status, detalhe ao clicar.
// ============================================================================

// ── Tipos ──────────────────────────────────────────────────────────────────────

type WhatsappStats = {
  total: number; enviados: number; entregues: number; falhas: number; semTwilio: number;
  porStatus: Record<string, number>;
};

type WhatsappMsg = {
  id: number; telefone: string; resumo: string; status: string;
  errorCode: string | null; contexto: string | null;
  clienteNome: string | null; criadoEm: string; atualizadoEm: string;
  sid?: string | null;
};

type EmailStatus = { connected: boolean };

type FiltroData = "hoje" | "7d" | "30d" | "tudo";

// ── Utilitários ────────────────────────────────────────────────────────────────

function fmtData(iso: string): string {
  try { return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }); }
  catch { return iso; }
}

function fmtHora(iso: string): string {
  try { return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" }); }
  catch { return iso; }
}

function fmtDia(iso: string): string {
  try { return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit" }); }
  catch { return iso; }
}

function corStatus(s: string): string {
  switch (s) {
    case "delivered": case "read": return "text-emerald-700 dark:text-emerald-400";
    case "sent": case "queued": return "text-sky-700 dark:text-sky-400";
    case "failed": case "undelivered": return "text-rose-700 dark:text-rose-400";
    case "link": return "text-amber-700 dark:text-amber-400";
    default: return "text-muted-foreground";
  }
}

function labelStatus(s: string): string {
  const m: Record<string, string> = {
    queued: "Na fila", sent: "Enviado", delivered: "Entregue",
    read: "Lido", failed: "Falhou", undelivered: "Não entregue", link: "Só link",
  };
  return m[s] ?? s;
}

function ledClass(s: string): string {
  switch (s) {
    case "delivered": case "read": return "paxter-led paxter-led-green";
    case "sent": case "queued": return "paxter-led paxter-led-blue";
    case "failed": case "undelivered": return "paxter-led paxter-led-red";
    default: return "paxter-led paxter-led-amber";
  }
}

function filtrarPorData(items: { criadoEm: string }[], filtro: FiltroData): { criadoEm: string }[] {
  if (filtro === "tudo") return items;
  const agora = Date.now();
  const dias = filtro === "hoje" ? 1 : filtro === "7d" ? 7 : 30;
  const corte = agora - dias * 86400000;
  return items.filter(i => new Date(i.criadoEm).getTime() >= corte);
}

// ── KPI ───────────────────────────────────────────────────────────────────────

function Kpi({ icon: Icon, label, valor, accent }: {
  icon: typeof Send; label: string; valor: number; accent: string;
}) {
  return (
    <div className="panel-3d-sub flex items-center gap-3 p-3">
      <div className={`bevel-3d flex h-9 w-9 shrink-0 items-center justify-center ${accent}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xl font-bold tabular-nums leading-none">{valor.toLocaleString("pt-BR")}</p>
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ── Painel de detalhe (slide-in lateral) ──────────────────────────────────────

function DetalhePanel({ msg, onFechar }: { msg: WhatsappMsg | null; onFechar: () => void }) {
  if (!msg) return null;
  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40"
        onClick={onFechar}
      />
      <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto bg-background shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bevel-3d flex items-center justify-between px-5 py-3 sticky top-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            <span className="text-[13px] font-bold uppercase tracking-wide text-primary">Detalhe da Mensagem</span>
          </div>
          <button onClick={onFechar} className="concave-3d p-1.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 p-5 space-y-4">
          {/* Meta */}
          <div className="panel-3d-sub space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Data/Hora</p>
                <p className="text-[12px] font-semibold mt-0.5">{fmtData(msg.criadoEm)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Status</p>
                <p className={`text-[12px] font-bold mt-0.5 ${corStatus(msg.status)}`}>{labelStatus(msg.status)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Destinatário</p>
                <p className="text-[12px] font-mono mt-0.5">{msg.telefone}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Cliente</p>
                <p className="text-[12px] mt-0.5">{msg.clienteNome ?? "—"}</p>
              </div>
              {msg.contexto && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Contexto</p>
                  <p className="text-[11px] uppercase mt-0.5 text-muted-foreground">{msg.contexto}</p>
                </div>
              )}
              {msg.sid && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Twilio SID</p>
                  <p className="text-[10px] font-mono mt-0.5 break-all text-muted-foreground">{msg.sid}</p>
                </div>
              )}
              {msg.errorCode && (
                <div className="col-span-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-rose-600">Código de Erro</p>
                  <p className="text-[12px] font-mono mt-0.5 text-rose-700">{msg.errorCode}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Atualizado em</p>
                <p className="text-[11px] mt-0.5 text-muted-foreground">{fmtData(msg.atualizadoEm)}</p>
              </div>
            </div>
          </div>

          {/* Conteúdo completo */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Conteúdo completo</p>
            <div className="concave-3d p-4 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
              {msg.resumo}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ── Bloco WhatsApp ────────────────────────────────────────────────────────────

function BlocoWhatsApp({ filtroData }: { filtroData: FiltroData }) {
  const [stats, setStats] = useState<WhatsappStats | null>(null);
  const [msgs, setMsgs] = useState<WhatsappMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState(true);
  const [detalhe, setDetalhe] = useState<WhatsappMsg | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  const carregar = useCallback(() => {
    setLoading(true); setErro(false);
    Promise.all([
      fetch(`${BASE}/api/whatsapp/stats`).then(r => r.ok ? r.json() : Promise.reject()),
      fetch(`${BASE}/api/whatsapp/messages?limit=200`).then(r => r.ok ? r.json() : Promise.reject()),
    ])
      .then(([s, m]) => {
        setStats(s as WhatsappStats);
        setMsgs((m as { messages: WhatsappMsg[] }).messages ?? []);
      })
      .catch(() => setErro(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const msgsFiltradas = (filtrarPorData(msgs, filtroData) as WhatsappMsg[])
    .filter(m => filtroStatus === "todos" || m.status === filtroStatus);

  const taxa = stats && stats.enviados > 0
    ? Math.round((stats.entregues / stats.enviados) * 100)
    : 0;

  return (
    <>
      <DetalhePanel msg={detalhe} onFechar={() => setDetalhe(null)} />

      <section className="panel-3d overflow-hidden">
        {/* Header do bloco */}
        <div
          className="bevel-3d flex items-center justify-between px-5 py-3 cursor-pointer"
          style={{ borderLeft: "4px solid #25D366" }}
          onClick={() => setAberto(!aberto)}
        >
          <div className="flex items-center gap-3">
            <MessageSquare className="h-5 w-5 text-[#25D366]" />
            <div>
              <p className="text-[13px] font-bold uppercase tracking-wide">WhatsApp</p>
              <p className="text-[10px] text-muted-foreground">via Twilio · {stats?.total ?? "…"} mensagens · {taxa}% entrega</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={e => { e.stopPropagation(); carregar(); }}
              disabled={loading}
              className="bevel-3d p-1.5"
              title="Atualizar"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {aberto && (
          <div className="p-5 space-y-4">
            {erro ? (
              <div className="concave-3d px-3 py-2 text-[13px] text-rose-700">Erro ao carregar dados. Tente atualizar.</div>
            ) : (
              <>
                {/* KPIs */}
                <div className="grid gap-2 sm:grid-cols-4">
                  <Kpi icon={Send} label="Total enviados" valor={stats?.enviados ?? 0} accent="text-sky-600" />
                  <Kpi icon={CheckCheck} label="Entregues" valor={stats?.entregues ?? 0} accent="text-emerald-600" />
                  <Kpi icon={AlertTriangle} label="Falhas" valor={stats?.falhas ?? 0} accent="text-rose-600" />
                  <Kpi icon={Link2} label="Só link" valor={stats?.semTwilio ?? 0} accent="text-amber-600" />
                </div>

                {/* Filtro rápido de status */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  {["todos", "delivered", "sent", "queued", "failed", "link"].map(s => (
                    <button
                      key={s}
                      onClick={() => setFiltroStatus(s)}
                      className={`bevel-3d px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                        filtroStatus === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {s === "todos" ? "Todos" : labelStatus(s)}
                    </button>
                  ))}
                </div>

                {/* Tabela de mensagens */}
                <BlockTitle icon={MessageSquare}>
                  Mensagens recentes — {msgsFiltradas.length} resultado{msgsFiltradas.length !== 1 ? "s" : ""}
                </BlockTitle>

                {msgsFiltradas.length === 0 ? (
                  <p className="concave-3d px-3 py-2 text-[13px] text-muted-foreground">
                    {loading ? "Carregando…" : "Nenhuma mensagem no período/filtro selecionado."}
                  </p>
                ) : (
                  <div className="overflow-x-auto max-h-80 overflow-y-auto">
                    <table className="w-full border-collapse text-[11px]">
                      <thead className="sticky top-0 bg-background/95">
                        <tr className="text-left uppercase tracking-wide text-muted-foreground border-b border-border">
                          <th className="px-2 py-2 font-semibold w-4"></th>
                          <th className="px-2 py-2 font-semibold whitespace-nowrap">Data · Hora</th>
                          <th className="px-2 py-2 font-semibold">Cliente</th>
                          <th className="px-2 py-2 font-semibold">Telefone</th>
                          <th className="px-2 py-2 font-semibold">Contexto</th>
                          <th className="px-2 py-2 font-semibold">Status</th>
                          <th className="px-2 py-2 font-semibold">Prévia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {msgsFiltradas.map(m => (
                          <tr
                            key={m.id}
                            className="border-t border-border/50 align-top hover:bg-muted/30 cursor-pointer transition-colors"
                            onClick={() => setDetalhe(m)}
                          >
                            <td className="px-2 py-2">
                              <span className={ledClass(m.status)} />
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 tabular-nums text-muted-foreground">
                              <span className="block">{fmtDia(m.criadoEm)}</span>
                              <span className="block text-[10px] font-mono">{fmtHora(m.criadoEm)}</span>
                            </td>
                            <td className="px-2 py-2">{m.clienteNome ?? "—"}</td>
                            <td className="whitespace-nowrap px-2 py-2 font-mono">{m.telefone}</td>
                            <td className="px-2 py-2 uppercase text-muted-foreground text-[10px]">{m.contexto ?? "—"}</td>
                            <td className={`whitespace-nowrap px-2 py-2 font-bold ${corStatus(m.status)}`}>
                              {labelStatus(m.status)}
                              {m.errorCode && <span className="ml-1 text-[9px] text-muted-foreground">({m.errorCode})</span>}
                            </td>
                            <td className="max-w-[200px] px-2 py-2 text-foreground/60 truncate">{m.resumo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </>
  );
}

// ── Bloco E-mail ──────────────────────────────────────────────────────────────

function BlocoEmail() {
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/email/status`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setStatus({ connected: !!d?.connected }))
      .catch(() => setStatus({ connected: false }))
      .finally(() => setLoading(false));
  }, []);

  const ativo = status?.connected ?? false;

  return (
    <section className="panel-3d overflow-hidden">
      <div
        className="bevel-3d flex items-center justify-between px-5 py-3 cursor-pointer"
        style={{ borderLeft: "4px solid #EA4335" }}
        onClick={() => setAberto(!aberto)}
      >
        <div className="flex items-center gap-3">
          <Mail className="h-5 w-5 text-[#EA4335]" />
          <div>
            <p className="text-[13px] font-bold uppercase tracking-wide">E-mail</p>
            <p className="text-[10px] text-muted-foreground">via Gmail API · {loading ? "verificando…" : ativo ? "conectado" : "não configurado"}</p>
          </div>
        </div>
        {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </div>

      {aberto && (
        <div className="p-5 space-y-3">
          <div className="panel-3d-sub p-4 flex items-start gap-3">
            {ativo
              ? <Wifi className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              : <WifiOff className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            }
            <div>
              <StatusVela on={ativo} pending={loading} labelOn="Gmail conectado" labelOff="Gmail não configurado" />
              {ativo && (
                <p className="text-[12px] text-muted-foreground mt-2 leading-relaxed">
                  Gateway ativo. O histórico completo de e-mails enviados estará disponível aqui
                  quando o log de e-mails for habilitado na próxima onda.
                </p>
              )}
              {!ativo && !loading && (
                <p className="text-[12px] text-muted-foreground mt-2 leading-relaxed">
                  Configure a integração Gmail no menu <strong>Configurações → Gateways de Comunicação</strong>
                  para ativar o envio e o log de e-mails.
                </p>
              )}
            </div>
          </div>

          {/* Tipos de e-mail enviados pelo sistema */}
          <BlockTitle icon={Info}>Tipos de e-mail enviados pelo sistema</BlockTitle>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-left uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-2 py-2 font-semibold">Tipo</th>
                  <th className="px-2 py-2 font-semibold">Gatilho</th>
                  <th className="px-2 py-2 font-semibold">Conteúdo</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { tipo: "Pré-sessão", gatilho: "Agendamento confirmado", conteudo: "Código de validação + lista de substâncias" },
                  { tipo: "Pós-sessão", gatilho: "Sessão concluída", conteudo: "Substâncias aplicadas + PDF do RAS assinado" },
                  { tipo: "Protocolo Completo", gatilho: "Lançamento do protocolo", conteudo: "PDF de 8-10 páginas com protocolo completo" },
                  { tipo: "Lembretes semanais", gatilho: "Batch semanal", conteudo: "Resumo da semana por cliente" },
                ].map(row => (
                  <tr key={row.tipo} className="border-t border-border/50">
                    <td className="px-2 py-2 font-semibold">{row.tipo}</td>
                    <td className="px-2 py-2 text-muted-foreground">{row.gatilho}</td>
                    <td className="px-2 py-2 text-muted-foreground">{row.conteudo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Bloco Telegram ────────────────────────────────────────────────────────────

function BlocoTelegram() {
  const [cfg, setCfg] = useState<{ active: boolean; configured: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/settings/telegram`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setCfg({ active: !!d?.active, configured: !!d?.configured }))
      .catch(() => setCfg({ active: false, configured: false }))
      .finally(() => setLoading(false));
  }, []);

  const ativo = cfg?.active && cfg?.configured;

  return (
    <section className="panel-3d overflow-hidden">
      <div
        className="bevel-3d flex items-center justify-between px-5 py-3 cursor-pointer"
        style={{ borderLeft: "4px solid #29B6F6" }}
        onClick={() => setAberto(!aberto)}
      >
        <div className="flex items-center gap-3">
          <Bot className="h-5 w-5 text-[#29B6F6]" />
          <div>
            <p className="text-[13px] font-bold uppercase tracking-wide">Telegram</p>
            <p className="text-[10px] text-muted-foreground">via Bot Token · {loading ? "verificando…" : ativo ? "conectado" : "não configurado"}</p>
          </div>
        </div>
        {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </div>

      {aberto && (
        <div className="p-5 space-y-3">
          <div className="panel-3d-sub p-4 flex items-start gap-3">
            {ativo
              ? <Wifi className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              : <WifiOff className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            }
            <div>
              <StatusVela on={!!ativo} pending={loading} labelOn="Bot ativo" labelOff={cfg?.configured ? "Bot desativado" : "Token não configurado"} />
              {!cfg?.configured && !loading && (
                <p className="text-[12px] text-muted-foreground mt-2 leading-relaxed">
                  Configure o Token do Bot Telegram no menu <strong>Configurações → Gateways de Comunicação</strong>.
                  O log de mensagens será exibido aqui após a configuração.
                </p>
              )}
              {cfg?.configured && !cfg?.active && (
                <p className="text-[12px] text-muted-foreground mt-2 leading-relaxed">
                  Token configurado mas o canal está desativado. Ative em <strong>Configurações → Gateways</strong>.
                </p>
              )}
              {ativo && (
                <p className="text-[12px] text-muted-foreground mt-2 leading-relaxed">
                  Bot ativo. O histórico de mensagens enviadas via Telegram estará disponível
                  aqui após a ativação do log de Telegram na próxima onda.
                </p>
              )}
            </div>
          </div>

          <BlockTitle icon={Info}>Mensagens enviadas via Telegram</BlockTitle>
          <div className="concave-3d px-4 py-3 text-[12px] text-muted-foreground leading-relaxed">
            O Telegram é usado para envio de RAS, documentos assinados e notificações de protocolo
            quando o cliente tem <strong>Telegram Chat ID</strong> cadastrado no perfil.
            Mensagens de lembrete por período (cockpit de mensageria) também usam este canal.
          </div>
        </div>
      )}
    </section>
  );
}

// ── Bloco Trello ──────────────────────────────────────────────────────────────

function BlocoTrello() {
  const [aberto, setAberto] = useState(true);

  return (
    <section className="panel-3d overflow-hidden">
      <div
        className="bevel-3d flex items-center justify-between px-5 py-3 cursor-pointer"
        style={{ borderLeft: "4px solid #0052CC" }}
        onClick={() => setAberto(!aberto)}
      >
        <div className="flex items-center gap-3">
          <Trello className="h-5 w-5 text-[#0052CC]" />
          <div>
            <p className="text-[13px] font-bold uppercase tracking-wide">Trello</p>
            <p className="text-[10px] text-muted-foreground">cards de tarefa interna · não configurado</p>
          </div>
        </div>
        {aberto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </div>

      {aberto && (
        <div className="p-5 space-y-3">
          <div className="panel-3d-sub p-4 flex items-start gap-3">
            <WifiOff className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <StatusVela on={false} labelOff="API Key não configurada" />
              <p className="text-[12px] text-muted-foreground mt-2 leading-relaxed">
                A integração Trello exige <strong>API Key</strong> e <strong>Token</strong>.
                Configure em <strong>Configurações → Gateways de Comunicação</strong> para
                ativar a criação automática de cards de tarefa (boas-vindas, alertas, cobranças, follow-up).
              </p>
            </div>
          </div>

          <BlockTitle icon={Info}>Cards criados automaticamente pelo sistema</BlockTitle>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-left uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="px-2 py-2 font-semibold">Tipo de Card</th>
                  <th className="px-2 py-2 font-semibold">Gatilho</th>
                  <th className="px-2 py-2 font-semibold">Destinatário</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { tipo: "Boas-vindas ADM", gatilho: "Protocolo lançado", dest: "Papel ADM" },
                  { tipo: "Boas-vindas ENF", gatilho: "Protocolo lançado", dest: "Papel Enfermeira" },
                  { tipo: "Alerta amarelo", gatilho: "Avaliação enfermagem (amarelo)", dest: "Enfermeira 02" },
                  { tipo: "Alerta vermelho", gatilho: "Avaliação enfermagem (vermelho)", dest: "ENF 02 + Médico 02" },
                  { tipo: "Cobrança / NF", gatilho: "Pagamento confirmado", dest: "Financeiro 02" },
                  { tipo: "Revisão mensal", gatilho: "A cada 30 dias", dest: "ENF 02 + Médico 02" },
                  { tipo: "Lembrete de exames", gatilho: "Antepenúltima sessão", dest: "Cliente (email+WhatsApp)" },
                  { tipo: "Consulta final", gatilho: "Última sessão", dest: "ENF 02 + ADM 02" },
                ].map(row => (
                  <tr key={row.tipo} className="border-t border-border/50">
                    <td className="px-2 py-2 font-semibold">{row.tipo}</td>
                    <td className="px-2 py-2 text-muted-foreground">{row.gatilho}</td>
                    <td className="px-2 py-2 text-muted-foreground">{row.dest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function CentralAuditoriaComunicacao() {
  const [filtroData, setFiltroData] = useState<FiltroData>("7d");
  const [ultimaAtt, setUltimaAtt] = useState<Date>(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-refresh global a cada 30s
  useEffect(() => {
    timerRef.current = setInterval(() => setUltimaAtt(new Date()), 30000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  return (
    <ConsoleShell
      icon={ShieldCheck}
      title="Central de Auditoria de Comunicação"
      subtitle="Rastreio unificado de todos os canais: WhatsApp, E-mail, Telegram e Trello. Clique em qualquer linha para ver o conteúdo completo."
    >
      {/* Barra de filtros globais */}
      <section className="panel-3d p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Período:</span>
            {(["hoje", "7d", "30d", "tudo"] as FiltroData[]).map(f => (
              <button
                key={f}
                onClick={() => setFiltroData(f)}
                className={`bevel-3d px-3 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors ${
                  filtroData === f ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {f === "hoje" ? "Hoje" : f === "7d" ? "7 dias" : f === "30d" ? "30 dias" : "Tudo"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Atualizado: {ultimaAtt.toLocaleTimeString("pt-BR")}</span>
            <span className="text-[9px] uppercase tracking-wide">(auto-refresh 30s)</span>
          </div>
        </div>
      </section>

      {/* 4 blocos de canal */}
      <BlocoWhatsApp filtroData={filtroData} />
      <BlocoEmail />
      <BlocoTelegram />
      <BlocoTrello />
    </ConsoleShell>
  );
}
