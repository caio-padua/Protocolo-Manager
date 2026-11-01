import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";

const API = import.meta.env.BASE_URL + "api";
type DocumentType = "prescricao" | "pedido_exames" | "atestado" | "encaminhamento";
type Channel = "EMAIL" | "WHATSAPP" | "TELEGRAM";
type Target = { channel: Channel; recipient: string };
type DeliveryHistory = {
  id: number; createdAt: string; channel: Channel; state: string;
  recipientMasked: string; expiresAt: string | null; completedAt: string | null;
};
const channelLabels: Record<Channel, string> = { EMAIL: "E-mail", WHATSAPP: "WhatsApp", TELEGRAM: "Telegram" };
const stateLabels: Record<string, string> = {
  requested: "Aguardando resultado",
  provider_accepted: "Aceito pelo provedor; entrega não confirmada",
  simulated: "Simulado; nenhuma mensagem enviada",
  failed: "Falha confirmada",
  unknown: "Resultado incerto; confira antes de repetir",
};

export default function ClinicalDocumentResendForm({ clientId, documentType, documentId }: {
  clientId: number;
  documentType: DocumentType;
  documentId: number;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [resultMessage, setResultMessage] = useState("");

  useEffect(() => {
    if (!open) {
      setTargets([]);
      setChannels([]);
      setConfirmed(false);
      return;
    }
    const token = getCollabToken();
    if (!token) {
      setError("Faça login de colaborador para conferir os canais.");
      return;
    }
    const controller = new AbortController();
    setLoadingTargets(true);
    setHistoryLoading(true);
    setError("");
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API}/clinical-documents/delivery-targets/${clientId}`, { headers, signal: controller.signal }),
      fetch(`${API}/clinical-documents/delivery-history/${documentType}/${documentId}`, { headers, signal: controller.signal }),
    ]).then(async ([targetResponse, historyResponse]) => {
      const [targetData, historyData] = await Promise.all([
        targetResponse.json().catch(() => null),
        historyResponse.json().catch(() => null),
      ]);
      if (!targetResponse.ok) throw new Error(targetData?.error || "Não foi possível conferir os destinatários.");
      if (!historyResponse.ok) throw new Error(historyData?.error || "Não foi possível consultar os reenvios anteriores.");
      if (controller.signal.aborted) return;
      setTargets(Array.isArray(targetData?.targets) ? targetData.targets : []);
      setDeliveries(Array.isArray(historyData?.deliveries) ? historyData.deliveries : []);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Falha ao consultar os dados do documento.");
    }).finally(() => {
      if (!controller.signal.aborted) {
        setLoadingTargets(false);
        setHistoryLoading(false);
      }
    });
    return () => controller.abort();
  }, [open, clientId, documentType, documentId, historyVersion]);

  const toggleChannel = (channel: Channel) => {
    setChannels((current) => current.includes(channel) ? current.filter((item) => item !== channel) : [...current, channel]);
    setConfirmed(false);
    setResultMessage("");
  };

  async function resend() {
    if (!confirmed || !channels.length || sending) return;
    const token = getCollabToken();
    if (!token) {
      setError("Faça login de colaborador para continuar.");
      return;
    }
    setSending(true);
    setError("");
    setResultMessage("");
    try {
      const response = await fetch(`${API}/clinical-documents/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          clientId, documentType, documentId, channels,
          confirmed: true, operationKey: crypto.randomUUID(),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "O servidor não confirmou o reenvio.");
      const summary = (data.results || []).map((item: { channel: Channel; state: string; error?: string }) => {
        const label = item.channel === "EMAIL" ? "E-mail" : item.channel === "WHATSAPP" ? "WhatsApp" : "Telegram";
        if (item.state === "provider_accepted") return `${label}: aceito pelo provedor; entrega não confirmada`;
        return `${label}: ${item.error || item.state}`;
      }).join(" · ");
      const expiry = data.shareExpiresAt
        ? ` Link seguro válido até ${new Date(data.shareExpiresAt).toLocaleDateString("pt-BR")}.`
        : "";
      setResultMessage(`${summary}.${expiry}`);
      setConfirmed(false);
      setHistoryVersion((version) => version + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha no reenvio; confira o histórico antes de repetir.");
    } finally {
      setSending(false);
    }
  }

  return <div className="rounded-md border border-[#d5c58e] p-2">
    <button type="button" className="btn-3d-soft inline-flex items-center gap-1 px-2 py-1 text-xs"
      aria-expanded={open} onClick={() => { setOpen((value) => !value); setError(""); setResultMessage(""); }}>
      <RefreshCw className="h-3.5 w-3.5" /> {open ? "Fechar reenvio" : "Reenviar este PDF"}
    </button>
    {open && <div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        Será enviado exatamente o PDF já emitido. O sistema não vai gerar, assinar ou substituir outro documento.
      </p>
      {loadingTargets && <p role="status" className="text-sm">Conferindo os canais cadastrados…</p>}
      {!!targets.length && <div className="space-y-2">
        {targets.map((target) => <label key={target.channel} className="flex flex-wrap items-center gap-2 text-sm">
          <input type="checkbox" checked={channels.includes(target.channel)} disabled={sending}
            onChange={() => toggleChannel(target.channel)} />
          <span className="font-medium">{channelLabels[target.channel]}:</span>
          <span className="break-all">{target.recipient}</span>
        </label>)}
      </div>}
      {!loadingTargets && !error && !targets.length && <p className="text-sm">Não há canais com contato cadastrado para este cliente.</p>}
      {!!channels.length && <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={confirmed} disabled={sending}
          onChange={(event) => setConfirmed(event.target.checked)} />
        <span>Conferi o documento, o destinatário e autorizo o envio pelos canais marcados.</span>
      </label>}
      {!!channels.length && <button type="button" className="btn-3d px-3 py-2 text-xs disabled:opacity-50"
        disabled={!confirmed || sending || loadingTargets} onClick={() => void resend()}>
        {sending ? "Registrando reenvio…" : "Confirmar reenvio"}
      </button>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {resultMessage && <p role="status" className="text-sm">{resultMessage}</p>}
      <section className="concave-3d space-y-2 p-3" aria-label="Histórico de reenvios deste documento">
        <h4 className="text-xs font-bold uppercase tracking-wide">Reenvios anteriores deste documento</h4>
        {historyLoading && <p role="status" className="text-xs">Consultando registros…</p>}
        {!historyLoading && !deliveries.length && <p className="text-xs">Nenhum reenvio registrado.</p>}
        {!!deliveries.length && <ul className="space-y-2">
          {deliveries.map((item) => <li key={item.id} className="border-t border-current/10 pt-2 text-xs">
            <p className="font-semibold">
              {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
                .format(new Date(item.createdAt))}
              {" · "}{channelLabels[item.channel] || item.channel}
            </p>
            <p>{stateLabels[item.state] || item.state} · Destino {item.recipientMasked || "não informado"}</p>
            {item.expiresAt && <p>Link válido até {new Date(item.expiresAt).toLocaleDateString("pt-BR")}.</p>}
          </li>)}
        </ul>}
      </section>
    </div>}
  </div>;
}
