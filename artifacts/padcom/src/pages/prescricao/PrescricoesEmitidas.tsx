import { useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { BASE } from "../comunicacao/_shared";
import type { ClinicalDeliveryContext, ClinicalDeliveryTarget } from "@workspace/api-client-react";

type Prescricao = { id: number; clientId: number | null; clientName: string; status: string };
type Target = ClinicalDeliveryTarget;
type Delivery = ClinicalDeliveryContext;

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("padcom_collab_token") ?? ""}` };
}
async function request(path: string, body?: unknown) {
  const response = await fetch(`${BASE}/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Falha na solicitação (HTTP ${response.status}).`);
  if (!data) throw new Error("O servidor não confirmou o resultado.");
  return data;
}

const statusLabel: Record<string, string> = {
  accepted: "Aceito pelo provedor — entrega não confirmada",
  delivered: "Entrega confirmada pelo provedor",
  failed: "Falhou — envio não confirmado",
  pending: "Resultado pendente — confira o provedor antes de repetir",
  unknown: "Resultado desconhecido — confira o provedor antes de repetir",
  sent: "Registrado no histórico antigo — entrega não verificada",
};
function attemptDetail(raw: string | null) {
  try {
    const d = JSON.parse(raw || "{}");
    return [d.label, d.recipient, d.error].filter(Boolean).join(" · ");
  } catch { return raw || ""; }
}

function DeliveryRow({ p }: { p: Prescricao }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [lastAttemptId, setLastAttemptId] = useState<number | null>(null);
  const lock = useRef(false);
  const { data, error, isPending, refetch } = useQuery<Delivery>({
    queryKey: ["prescription-delivery", p.id],
    queryFn: () => request(`/prescriptions/${p.id}/delivery`),
    enabled: open, staleTime: 0, refetchInterval: open ? 30000 : false,
  });
  const key = (t: Target) => `${t.channel}:${t.pharmacyId ?? "patient"}:${t.recipient}`;
  const target = data?.targets.find(t => key(t) === selected);
  const latestAttempt = data?.history.find(h => h.id === lastAttemptId);
  const latestMessage = latestAttempt && ["failed", "delivered"].includes(latestAttempt.status)
    ? `${statusLabel[latestAttempt.status]} · ${attemptDetail(latestAttempt.detail)}` : message;
  async function send() {
    if (lock.current || !confirmed || !target) return;
    lock.current = true; setPending(true); setMessage(""); setConfirmed(false); setLastAttemptId(null);
    try {
      const result = await request(`/prescriptions/${p.id}/delivery`, {
        confirmed: true, channel: target.channel, recipient: target.recipient,
        ...(target.pharmacyId ? { pharmacyId: target.pharmacyId } : {}),
      });
      setMessage(`${statusLabel[result.status] || "Envio não confirmado"}${result.error ? `: ${result.error}` : ""}`);
      setLastAttemptId(result.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Falha desconhecida. Não repita antes de conferir o histórico.");
    } finally {
      lock.current = false; setPending(false);
      await refetch();
    }
  }
  return <div className="panel-3d-sub p-3 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-medium">{p.clientName} — #{p.id}</span>
      <button type="button" className="btn-3d-soft px-3 py-2 text-xs" onClick={() => setOpen(!open)}>
        {open ? "Fechar envios" : "Revisar destinatários e envios"}
      </button>
    </div>
    {open && <>
      {isPending && <p role="status">Carregando destinatários autorizados…</p>}
      {error && <p role="alert" className="text-destructive">{error.message}
        <button type="button" className="btn-3d-soft ml-2 px-2" onClick={() => refetch()}>Tentar novamente</button>
      </p>}
      {data && !error && <>
        <label className="block text-sm space-y-1">
          <span>Canal e destinatário</span>
          <select className="concave-3d w-full p-2" value={target ? selected : ""} disabled={pending}
            onChange={e => { setSelected(e.target.value); setConfirmed(false); setMessage(""); setLastAttemptId(null); }}>
            <option value="">Selecione um destinatário…</option>
            {data.targets.map(t => <option key={key(t)} value={key(t)}>{t.channel.toUpperCase()} · {t.label} · {t.recipient}</option>)}
          </select>
        </label>
        {!data.targets.length && <p className="text-sm">Nenhum contato disponível. Confira o cadastro.</p>}
        {target && <label className="flex gap-2 text-sm break-words">
          <input type="checkbox" checked={confirmed} disabled={pending} onChange={e => setConfirmed(e.target.checked)} />
          <span>Confirmo o envio único por {target.channel} para {target.label}: {target.recipient}. Não haverá cópias nem ativação de lembretes.</span>
        </label>}
        <button type="button" className="btn-3d-soft px-3 py-2 text-xs disabled:opacity-60 inline-flex items-center gap-2"
          disabled={pending || !confirmed || !target} onClick={send}>
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {pending ? "Aguardando provedor…" : "Confirmar e enviar"}
        </button>
        {latestMessage && <p role="status" className="text-sm break-words">{latestMessage}</p>}
        <div className="space-y-1 text-sm" aria-label="Resultados por canal">
          <h3 className="font-medium">Histórico por canal</h3>
          {!data.history.length && <p>Nenhum envio registrado.</p>}
          {data.history.map(h => <p key={h.id} className="concave-3d p-2 break-words">
            {h.channel.toUpperCase()} · {statusLabel[h.status] || h.status}<br />{attemptDetail(h.detail)}
          </p>)}
        </div>
      </>}
    </>}
  </div>;
}

export function PrescricoesEmitidas({ clientId, emissionId }: { clientId: number | null; emissionId?: number }) {
  const { data, isPending, error, refetch } = useQuery<Prescricao[]>({
    queryKey: ["prescricoes-emitidas", clientId, emissionId], queryFn: () => request("/prescriptions"),
    staleTime: 0, refetchInterval: 30000,
  });
  const rows = data?.filter(p => p.status === "emitted" && (clientId == null || p.clientId === clientId)) ?? [];
  return <section className="no-print panel-3d p-4 space-y-3" aria-label="Prescrições emitidas">
    <h2 className="font-semibold text-primary">Prescrições emitidas — envios confirmados</h2>
    <p className="text-sm text-muted-foreground">Emitir não envia mensagens. Revise e confirme cada destinatário abaixo. Lembretes recorrentes precisam de autorização na Central de Lembretes.</p>
    {isPending && <p role="status">Carregando prescrições…</p>}
    {error && <div role="alert" className="text-sm text-destructive">
      Não foi possível carregar o histórico: {error.message}
      <button type="button" className="btn-3d-soft ml-2 px-3 py-1" onClick={() => refetch()}>Tentar novamente</button>
    </div>}
    {!isPending && !error && !rows.length && <p className="text-sm text-muted-foreground">Nenhuma prescrição emitida encontrada.</p>}
    <div className="space-y-2 max-h-96 overflow-y-auto">{rows.map(p => <DeliveryRow key={`${clientId}:${p.id}`} p={p} />)}</div>
  </section>;
}

/** Bearer-protected PDFs cannot be opened through an unauthenticated anchor. */
export function PrescriptionPdfLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const [error, setError] = useState("");
  async function open() {
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setError("");
    try {
      const response = await fetch(href, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível abrir o PDF autorizado.");
      const url = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = url;
      else { URL.revokeObjectURL(url); throw new Error("Permita abrir uma nova aba para visualizar a receita."); }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      tab?.close(); setError((err as Error).message);
    }
  }
  return <><button type="button" className={className} onClick={open}>{children}</button>
    {error && <span role="alert" className="text-sm text-destructive">{error}</span>}</>;
}
