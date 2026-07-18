import { useState, useEffect, useCallback } from "react";
import { Mail, Send, FileText, RefreshCw, ChevronRight, X, AlertCircle, CheckCircle, Clock, Inbox } from "lucide-react";
import { ConsoleShell, ToolCard, StatusVela, ExplainRow, useComunicacaoStatus, BASE } from "./_shared";

// ── tipos ─────────────────────────────────────────────────────────────────

type EmailLogItem = {
  id: number;
  tipo: string;
  clienteNome: string;
  destinatario: string;
  assunto: string;
  status: "enviado" | "falhou";
  erro: string | null;
  sessionId: number | null;
  provider: string;
  criadoEm: string;
};

type EmailStats = { total: number; enviados: number; falhas: number; hoje: number };
type Periodo = "hoje" | "7d" | "30d" | "tudo";
type TipoFiltro = "todos" | "pre_sessao" | "pos_sessao" | "lembrete_semanal" | "ics_reenviado";
type StatusFiltro = "todos" | "enviado" | "falhou";

const TIPO_LABELS: Record<string, string> = {
  pre_sessao: "Pré-sessão",
  pos_sessao: "Pós-sessão",
  lembrete_semanal: "Lembrete",
  ics_reenviado: "ICS Reenviado",
};

function formatDtHr(iso: string) {
  const d = new Date(iso);
  return {
    data: d.toLocaleDateString("pt-BR"),
    hora: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="panel-3d flex items-center gap-3 p-4">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}

function DetailPanel({ item, onClose }: { item: EmailLogItem; onClose: () => void }) {
  const { data, hora } = formatDtHr(item.criadoEm);
  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-background shadow-xl border-l border-border">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Detalhe do E-mail</span>
        <button onClick={onClose} className="rounded p-1 hover:bg-muted transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Status</p>
          {item.status === "enviado"
            ? <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold"><CheckCircle className="h-4 w-4" /> Enviado</span>
            : <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400 font-semibold"><AlertCircle className="h-4 w-4" /> Falhou</span>}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Tipo</p>
          <p>{TIPO_LABELS[item.tipo] ?? item.tipo}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Cliente</p>
          <p>{item.clienteNome || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Destinatário</p>
          <p className="font-mono text-xs">{item.destinatario}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Assunto</p>
          <p className="text-xs leading-relaxed">{item.assunto || "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Data · Hora</p>
          <p>{data} às {hora}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Provider</p>
          <span className="inline-block rounded bg-muted px-2 py-0.5 text-xs font-mono">{item.provider}</span>
        </div>
        {item.sessionId && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Sessão ID</p>
            <p className="font-mono text-xs">#{item.sessionId}</p>
          </div>
        )}
        {item.erro && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-red-600 dark:text-red-400 mb-1">Erro</p>
            <pre className="rounded bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-3 text-[11px] text-red-700 dark:text-red-300 whitespace-pre-wrap break-all">{item.erro}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ComunicacaoEmails() {
  const { status, loading: statusLoading, error: statusError } = useComunicacaoStatus();
  const [fromAddress, setFromAddress] = useState<string | null>(null);
  const [logItems, setLogItems] = useState<EmailLogItem[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>("7d");
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>("todos");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const [selected, setSelected] = useState<EmailLogItem | null>(null);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/email/status`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.fromAddress) setFromAddress(d.fromAddress); })
      .catch(() => {});
  }, []);

  const fetchLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200", periodo });
      if (tipoFiltro !== "todos") params.set("tipo", tipoFiltro);
      if (statusFiltro !== "todos") params.set("status", statusFiltro);
      const [logRes, statsRes] = await Promise.all([
        fetch(`${BASE}/api/email/log?${params}`),
        fetch(`${BASE}/api/email/stats`),
      ]);
      if (logRes.ok) { const d = await logRes.json(); setLogItems(d.items ?? []); }
      if (statsRes.ok) setStats(await statsRes.json());
      setLastUpdated(new Date());
    } catch { /* silencioso */ }
    finally { setLogLoading(false); }
  }, [periodo, tipoFiltro, statusFiltro]);

  useEffect(() => { fetchLog(); }, [fetchLog]);
  useEffect(() => { const t = setInterval(fetchLog, 30_000); return () => clearInterval(t); }, [fetchLog]);

  async function enviarLembretes() {
    if (!window.confirm("Disparar os lembretes semanais por e-mail agora? Esta ação envia mensagens reais aos clientes elegíveis.")) return;
    setSending(true); setSendResult(null);
    try {
      const r = await fetch(`${BASE}/api/email/send-weekly-reminders`, { method: "POST" });
      if (r.ok) { const d = await r.json(); setSendResult(`${d.sent} enviados, ${d.failed} falhas.`); fetchLog(); }
      else setSendResult(`Falha (HTTP ${r.status}).`);
    } catch { setSendResult("Falha de rede."); }
    finally { setSending(false); }
  }

  const gmailConectado = !!status?.gmail;

  return (
    <ConsoleShell icon={Mail} title="E-mails" subtitle="Rastreio unificado de todos os disparos — pré-sessão, pós-sessão e lembretes.">

      {/* conta + lembretes */}
      <section className="grid gap-4 lg:grid-cols-2">
        <ToolCard icon={Mail} name="Conta Gmail" vela={<StatusVela on={gmailConectado} pending={statusLoading} error={statusError} labelOn="Conectada" labelOff="Não conectada" />}>
          {fromAddress ? (
            <div className="mt-1 flex items-center gap-2 rounded border border-border bg-muted/40 px-3 py-2">
              <Mail className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="font-mono text-xs font-semibold text-foreground break-all">{fromAddress}</span>
              <span className="ml-auto rounded bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Gmail OAuth</span>
            </div>
          ) : (
            <ExplainRow>Envio via integração Google (Gmail), com assunto padronizado e anexos (ex.: RAS assinado).</ExplainRow>
          )}
          <ExplainRow>Cobre e-mails de pré-sessão (código + agenda), primeira sessão (benefícios) e pós-sessão.</ExplainRow>
        </ToolCard>

        <ToolCard icon={Send} name="Lembretes semanais" accent="text-primary">
          <ExplainRow>Dispara o lote de lembretes da semana para os clientes com sessão programada.</ExplainRow>
          <button type="button" onClick={enviarLembretes} disabled={sending || !gmailConectado}
            className="btn-3d mt-1 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold disabled:opacity-50">
            <Send className="h-4 w-4" />
            {sending ? "Processando…" : "Disparar agora"}
          </button>
          {!gmailConectado && !statusLoading && <p className="text-[12px] text-amber-700 dark:text-amber-400">Conecte o Gmail para habilitar o disparo.</p>}
          {sendResult && <p className="text-[12px] text-foreground/80 mt-1">{sendResult}</p>}
        </ToolCard>
      </section>

      {/* KPIs */}
      {stats && (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard label="Total Enviados" value={stats.total} color="text-foreground" />
          <KpiCard label="Entregues" value={stats.enviados} color="text-emerald-600 dark:text-emerald-400" />
          <KpiCard label="Falhas" value={stats.falhas} color="text-red-600 dark:text-red-400" />
          <KpiCard label="Hoje" value={stats.hoje} color="text-primary" />
        </section>
      )}

      {/* filtros */}
      <section className="panel-3d p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Período:</span>
          {(["hoje", "7d", "30d", "tudo"] as Periodo[]).map(p => (
            <button key={p} onClick={() => setPeriodo(p)}
              className={`rounded px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${periodo === p ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {p === "7d" ? "7 Dias" : p === "30d" ? "30 Dias" : p === "hoje" ? "Hoje" : "Tudo"}
            </button>
          ))}

          <span className="ml-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Tipo:</span>
          {([["todos","Todos"],["pre_sessao","Pré-sessão"],["pos_sessao","Pós-sessão"],["lembrete_semanal","Lembrete"],["ics_reenviado","ICS"]] as [TipoFiltro,string][]).map(([k,lbl]) => (
            <button key={k} onClick={() => setTipoFiltro(k)}
              className={`rounded px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${tipoFiltro === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {lbl}
            </button>
          ))}

          <span className="ml-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Status:</span>
          {([["todos","Todos"],["enviado","Enviado"],["falhou","Falhou"]] as [StatusFiltro,string][]).map(([k,lbl]) => (
            <button key={k} onClick={() => setStatusFiltro(k)}
              className={`rounded px-3 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${statusFiltro === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              {lbl}
            </button>
          ))}

          <button onClick={fetchLog} disabled={logLoading}
            className="ml-auto flex items-center gap-1.5 rounded px-3 py-1 text-xs font-semibold bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${logLoading ? "animate-spin" : ""}`} /> Atualizar
          </button>
        </div>
        {lastUpdated && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" /> Atualizado: {lastUpdated.toLocaleTimeString("pt-BR")} (AUTO-REFRESH 30S)
          </p>
        )}
      </section>

      {/* tabela de log */}
      <section className="panel-3d overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Inbox className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            E-mails Recentes — {logItems.length} resultado{logItems.length !== 1 ? "s" : ""}
          </span>
        </div>
        {logItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Mail className="h-10 w-10 opacity-20" />
            <p className="text-sm">Nenhum e-mail encontrado no período selecionado.</p>
            <p className="text-xs opacity-60">Os e-mails enviados a partir de agora aparecerão aqui automaticamente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Data · Hora</th>
                  <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Cliente</th>
                  <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Destinatário</th>
                  <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Tipo</th>
                  <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider text-muted-foreground">Assunto (prévia)</th>
                  <th className="px-1 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logItems.map(item => {
                  const { data, hora } = formatDtHr(item.criadoEm);
                  return (
                    <tr key={item.id} onClick={() => setSelected(item)} className="cursor-pointer hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-2.5 font-mono"><div>{data}</div><div className="text-muted-foreground">{hora}</div></td>
                      <td className="px-4 py-2.5 font-medium">{item.clienteNome || "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-muted-foreground">{item.destinatario}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">{TIPO_LABELS[item.tipo] ?? item.tipo}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {item.status === "enviado"
                          ? <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold"><span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />Enviado</span>
                          : <span className="flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold"><span className="h-2 w-2 rounded-full bg-red-500 inline-block" />Falhou</span>}
                      </td>
                      <td className="px-4 py-2.5 max-w-[200px] truncate text-muted-foreground">{item.assunto || "—"}</td>
                      <td className="px-2 py-2.5"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* modelos */}
      <section className="panel-3d p-5">
        <ToolCard icon={FileText} name="Modelos de e-mail">
          <ExplainRow>Os textos e vídeos usados nos e-mails ficam em <strong>Configurações → Textos & Vídeos</strong>.</ExplainRow>
        </ToolCard>
      </section>

      {/* painel lateral */}
      {selected && <DetailPanel item={selected} onClose={() => setSelected(null)} />}
    </ConsoleShell>
  );
}
