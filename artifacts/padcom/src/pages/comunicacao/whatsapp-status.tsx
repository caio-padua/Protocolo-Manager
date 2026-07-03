import { useEffect, useState } from "react";
import { MessageSquare, RefreshCw, CheckCheck, Send, AlertTriangle, Link2 } from "lucide-react";
import { ConsoleShell, BlockTitle, BASE } from "./_shared";

// ============================================================================
// CONSOLE DE STATUS DO WHATSAPP — rastreio de entrega de toda mensagem enviada
// via Twilio + falhas do motor de lembrete por período. Telefone SEMPRE
// mascarado (a API já entrega mascarado). Padrão visual Paxter (panel-3d).
// ============================================================================

type Stats = {
  total: number;
  enviados: number;
  entregues: number;
  falhas: number;
  semTwilio: number;
  porStatus: Record<string, number>;
};

type Mensagem = {
  id: number;
  telefone: string;
  resumo: string;
  status: string;
  errorCode: string | null;
  contexto: string | null;
  clienteNome: string | null;
  criadoEm: string;
  atualizadoEm: string;
};

type Falha = {
  id: number;
  janela: string;
  erro: string | null;
  clienteNome: string | null;
  telefone: string;
  criadoEm: string;
};

function corDoStatus(status: string): string {
  switch (status) {
    case "delivered":
    case "read":
      return "text-emerald-700 dark:text-emerald-400";
    case "sent":
    case "queued":
      return "text-sky-700 dark:text-sky-400";
    case "failed":
    case "undelivered":
      return "text-rose-700 dark:text-rose-400";
    case "link":
      return "text-amber-700 dark:text-amber-400";
    default:
      return "text-muted-foreground";
  }
}

function rotuloStatus(status: string): string {
  const mapa: Record<string, string> = {
    queued: "Na fila",
    sent: "Enviado",
    delivered: "Entregue",
    read: "Lido",
    failed: "Falhou",
    undelivered: "Não entregue",
    link: "Só link (sem Twilio)",
  };
  return mapa[status] ?? status;
}

function fmtData(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

// KPI em placa Saliente (bevel) — número grande + rótulo MAIÚSCULO.
function Kpi({ icon: Icon, label, valor, accent }: { icon: typeof Send; label: string; valor: number; accent: string }) {
  return (
    <div className="panel-3d-sub flex items-center gap-3 p-4">
      <div className={`bevel-3d flex h-10 w-10 shrink-0 items-center justify-center ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold tabular-nums leading-none">{valor}</p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function ComunicacaoWhatsappStatus() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [falhas, setFalhas] = useState<Falha[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  function carregar() {
    setLoading(true);
    setErro(false);
    Promise.all([
      fetch(`${BASE}/api/whatsapp/stats`).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch(`${BASE}/api/whatsapp/messages?limit=50`).then((r) => (r.ok ? r.json() : Promise.reject())),
      fetch(`${BASE}/api/lembretes/failures?limit=50`).then((r) => (r.ok ? r.json() : Promise.reject())),
    ])
      .then(([s, m, f]) => {
        setStats(s as Stats);
        setMensagens((m as { messages: Mensagem[] }).messages ?? []);
        setFalhas((f as { failures: Falha[] }).failures ?? []);
      })
      .catch(() => setErro(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <ConsoleShell
      icon={MessageSquare}
      title="Status do WhatsApp"
      subtitle="Rastreio de entrega de cada mensagem enviada pelo sistema e falhas dos lembretes."
    >
      <section className="panel-3d p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <BlockTitle icon={CheckCheck}>Resumo dos envios</BlockTitle>
          <button
            type="button"
            onClick={carregar}
            disabled={loading}
            className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-primary disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {erro ? (
          <div className="concave-3d px-3 py-2 text-[13px] text-rose-700 dark:text-rose-400">
            Não foi possível carregar o status. Tente atualizar.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Send} label="Enviados" valor={stats?.enviados ?? 0} accent="text-sky-600 dark:text-sky-400" />
            <Kpi icon={CheckCheck} label="Entregues" valor={stats?.entregues ?? 0} accent="text-emerald-600 dark:text-emerald-400" />
            <Kpi icon={AlertTriangle} label="Falhas" valor={stats?.falhas ?? 0} accent="text-rose-600 dark:text-rose-400" />
            <Kpi icon={Link2} label="Só link (sem Twilio)" valor={stats?.semTwilio ?? 0} accent="text-amber-600 dark:text-amber-400" />
          </div>
        )}
      </section>

      <section className="panel-3d p-5">
        <BlockTitle icon={MessageSquare}>Mensagens recentes</BlockTitle>
        {mensagens.length === 0 ? (
          <p className="concave-3d px-3 py-2 text-[13px] text-muted-foreground">
            {loading ? "Carregando…" : "Nenhuma mensagem registrada ainda."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-left uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-semibold">Data</th>
                  <th className="px-2 py-2 font-semibold">Cliente</th>
                  <th className="px-2 py-2 font-semibold">Telefone</th>
                  <th className="px-2 py-2 font-semibold">Contexto</th>
                  <th className="px-2 py-2 font-semibold">Status</th>
                  <th className="px-2 py-2 font-semibold">Mensagem</th>
                </tr>
              </thead>
              <tbody>
                {mensagens.map((m) => (
                  <tr key={m.id} className="border-t border-border/60 align-top">
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-muted-foreground">{fmtData(m.criadoEm)}</td>
                    <td className="px-2 py-2">{m.clienteNome ?? "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono">{m.telefone}</td>
                    <td className="px-2 py-2 uppercase text-muted-foreground">{m.contexto ?? "—"}</td>
                    <td className={`whitespace-nowrap px-2 py-2 font-semibold ${corDoStatus(m.status)}`}>
                      {rotuloStatus(m.status)}
                      {m.errorCode ? <span className="ml-1 text-[10px] text-muted-foreground">({m.errorCode})</span> : null}
                    </td>
                    <td className="max-w-[280px] px-2 py-2 text-foreground/70">{m.resumo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel-3d p-5">
        <BlockTitle icon={AlertTriangle}>Falhas de lembrete</BlockTitle>
        {falhas.length === 0 ? (
          <p className="concave-3d px-3 py-2 text-[13px] text-emerald-700 dark:text-emerald-400">
            {loading ? "Carregando…" : "Nenhuma falha de lembrete registrada."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-left uppercase tracking-wide text-muted-foreground">
                  <th className="px-2 py-2 font-semibold">Data</th>
                  <th className="px-2 py-2 font-semibold">Janela</th>
                  <th className="px-2 py-2 font-semibold">Cliente</th>
                  <th className="px-2 py-2 font-semibold">Telefone</th>
                  <th className="px-2 py-2 font-semibold">Erro</th>
                </tr>
              </thead>
              <tbody>
                {falhas.map((f) => (
                  <tr key={f.id} className="border-t border-border/60 align-top">
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums text-muted-foreground">{fmtData(f.criadoEm)}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono">{f.janela}</td>
                    <td className="px-2 py-2">{f.clienteNome ?? "—"}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-mono">{f.telefone}</td>
                    <td className="px-2 py-2 text-rose-700 dark:text-rose-400">{f.erro ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ConsoleShell>
  );
}
