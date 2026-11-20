import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExamRequestHistory } from "@workspace/api-client-react";
import { getCollabToken } from "@/lib/collab-auth";
import ClinicalHistoryToggle from "@/components/ClinicalHistoryToggle";
import ClinicalDocumentResendForm from "@/components/ClinicalDocumentResendForm";

const labels: Record<string, string> = { EMAIL: "E-mail", WHATSAPP: "WhatsApp", TELEGRAM: "Telegram" };
const followupLabels: Record<string, string> = {
  awaiting_dispatch: "Conferindo o envio original",
  receipt_pending: "Pergunta sobre recebimento programada",
  receipt_sending: "Enviando pergunta sobre recebimento",
  receipt_waiting: "Aguardando resposta sobre recebimento",
  booking_pending: "Pergunta sobre agendamento programada",
  booking_sending: "Enviando pergunta sobre agendamento",
  booking_waiting: "Aguardando resposta sobre agendamento",
  completed: "Cliente informou que agendou",
  closed: "Encerrado pela equipe",
  cancelled: "Cancelado",
  needs_review: "Requer conferência da equipe",
};
const followupReasons: Record<string, string> = {
  clinic_disabled: "A clínica desativou o acompanhamento",
  telegram_disabled: "O canal Telegram foi desativado",
  human_takeover: "A equipe assumiu a conversa",
  client_not_received: "O cliente informou que não recebeu",
  client_not_booked: "O cliente informou que ainda não agendou",
  client_help: "O cliente pediu ajuda",
  client_ambiguous: "A resposta precisa de interpretação humana",
  pedido_cancelado: "Pedido cancelado pela equipe",
  cliente_resolveu: "Cliente resolveu por outro meio",
  encerrado_pela_equipe: "Encerrado pela equipe",
};
const followupDeliveryLabels: Record<string, string> = {
  not_sent: "ainda não enviada",
  sending: "envio em andamento",
  accepted: "Telegram aceitou o envio; leitura não confirmada",
  simulated: "simulação, não enviado ao cliente",
  failed: "falha confirmada",
  unknown: "resultado incerto; conferir antes de agir",
};

async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const token = getCollabToken();
  if (!token) throw new Error("Faça login de colaborador.");
  const response = await fetch(`${import.meta.env.BASE_URL}api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "Não foi possível carregar o histórico.");
  return data as T;
}

export default function ExamDocumentHistoryPanel({ clientId, enabled, historyScope }: {
  clientId: number;
  enabled: boolean;
  historyScope?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
  const [closingId, setClosingId] = useState<number | null>(null);
  const [closeReason, setCloseReason] = useState("pedido_cancelado");
  const [savingClose, setSavingClose] = useState(false);
  const [closeError, setCloseError] = useState("");
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === "visible");
  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const history = useQuery<ExamRequestHistory>({
    queryKey: ["exam-request-history-view", historyScope, clientId, offset],
    enabled: enabled && open && pageVisible,
    retry: false,
    staleTime: 0,
    refetchInterval: (query) => enabled && open && pageVisible &&
      (!!query.state.data?.pendingOperations.length ||
       !!query.state.data?.followups.some((item) => ["receipt_pending", "receipt_sending", "booking_pending", "booking_sending"].includes(item.state)))
      ? 10_000 : false,
    refetchIntervalInBackground: false,
    queryFn: ({ signal }) => api<ExamRequestHistory>(`/exam-requests/${clientId}/history?offset=${offset}`, signal),
  });
  useEffect(() => { setOffset(0); }, [clientId]);
  if (!enabled) return null;
  async function encerrarAcompanhamento(followupId: number) {
    const token = getCollabToken();
    if (!token) {
      setCloseError("Faça login de colaborador.");
      return;
    }
    setSavingClose(true);
    setCloseError("");
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/exam-requests/${clientId}/followups/${followupId}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: closeReason }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Não foi possível encerrar o acompanhamento.");
      setClosingId(null);
      await queryClient.invalidateQueries({ queryKey: ["exam-request-history-view", historyScope, clientId, offset] });
      await history.refetch();
    } catch (error) {
      setCloseError(error instanceof Error ? error.message : "Falha ao encerrar o acompanhamento.");
    } finally {
      setSavingClose(false);
    }
  }

  return <section className="panel-3d-sub col-span-full min-w-0 space-y-4 p-4" aria-label="Histórico de pedidos de exames">
    <ClinicalHistoryToggle label="Histórico de pedidos de exames" open={open} onOpenChange={setOpen} />
    {open && <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Cada arquivo pode ser aberto, baixado ou reenviado individualmente.</p>
        <button type="button" className="btn-3d-soft px-3 py-2 text-xs" disabled={history.isFetching}
          onClick={() => void history.refetch()}>Atualizar histórico</button>
      </div>
      {history.isPending && <p role="status">Carregando histórico…</p>}
      {history.error && <p role="alert" className="text-sm text-destructive">{history.error.message}</p>}
      {!!history.data?.pendingOperations.length && <div className="bevel-3d paxter-alert-amber space-y-2 p-3 text-sm" role="alert">
        <h3 className="font-bold uppercase">Envios anteriores pendentes de conferência</h3>
        <p>Confira o provedor antes de repetir um envio antigo. A consulta do histórico não inicia novo envio.</p>
        {history.data.pendingOperations.map((operation) => <div key={operation.operationKey} className="concave-3d space-y-1 p-2">
          <p>Operação {operation.operationKey} · {operation.state === "needs_review" ? "requer conferência" : "sem conclusão registrada"}</p>
          <p>Arquivos: {operation.documentIds.join(", ") || "não informados"}</p>
          <p>Canais: {operation.channels.map((channel) => labels[channel] || channel).join(", ") || "não informados"}</p>
        </div>)}
      </div>}
      {!!history.data?.followups.length && <div className="concave-3d space-y-3 p-3" data-testid="acompanhamentos-telegram-exames">
        <div>
          <h3 className="text-xs font-bold uppercase">Acompanhamento pelo Telegram</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            O aceite do provedor não confirma que o cliente leu a mensagem. Encerrar o acompanhamento não altera o pedido de exames.
          </p>
        </div>
        {closeError && <p role="alert" className="bevel-3d p-2 text-xs text-destructive">{closeError}</p>}
        <div className="space-y-2">
          {history.data.followups.map((followup) => {
            const terminal = ["completed", "closed", "cancelled"].includes(followup.state);
            const deliveryInProgress = ["awaiting_dispatch", "receipt_sending", "booking_sending"].includes(followup.state);
            const dueAt = followup.state === "receipt_pending" || followup.state === "receipt_sending"
              ? followup.receiptDueAt
              : followup.state === "booking_pending" || followup.state === "booking_sending" || followup.state === "receipt_waiting"
                ? followup.bookingDueAt
                : null;
            const needsAckReview = ["failed", "unknown", "simulated"].includes(followup.receiptDeliveryState)
              || ["failed", "unknown", "simulated"].includes(followup.bookingDeliveryState)
              || ["failed", "unknown", "simulated"].includes(followup.receiptAckState)
              || ["failed", "unknown", "simulated"].includes(followup.bookingAckState)
              || ["failed", "unknown", "simulated"].includes(followup.teamAlertState);
            return <article key={followup.id} className={`bevel-3d space-y-2 p-3 ${followup.state === "needs_review" || needsAckReview ? "paxter-alert-amber" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-xs">{followupLabels[followup.state] ?? followup.state}</strong>
                <span className="text-[11px] text-muted-foreground">
                  {followup.providerAcceptedAt ? `Envio confirmado: ${new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
                  }).format(new Date(followup.providerAcceptedAt))}` : "Envio original sem confirmação"}
                </span>
              </div>
              {dueAt && <p className="text-xs">Próxima etapa prevista: {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
              }).format(new Date(dueAt))}</p>}
              {[
                ["Pergunta sobre recebimento", followup.receiptDeliveryState],
                ["Pergunta sobre agendamento", followup.bookingDeliveryState],
                ["Confirmação da resposta", followup.receiptAckState],
                ["Confirmação final", followup.bookingAckState],
              ].filter(([, state]) => state !== "not_sent").map(([label, state]) =>
                <p key={label} className="text-xs">{label}: {followupDeliveryLabels[state] ?? state}</p>)}
              {followup.receiptAnswer && <p className="text-xs">Resposta sobre recebimento: {followup.receiptAnswer === "received" ? "recebeu" : followup.receiptAnswer === "not_received" ? "não recebeu" : followup.receiptAnswer === "help" ? "pediu ajuda" : "precisa de conferência"}</p>}
              {followup.bookingAnswer && <p className="text-xs">Resposta sobre agendamento: {followup.bookingAnswer === "booked" ? "agendou" : followup.bookingAnswer === "not_booked" ? "ainda não agendou" : followup.bookingAnswer === "help" ? "pediu ajuda" : "precisa de conferência"}</p>}
              {followup.closeReason && <p className="text-xs">Motivo: {followupReasons[followup.closeReason] ?? followup.closeReason}</p>}
              {followup.requiresReview && <p className="text-xs text-amber-800">
                O envio ou a confirmação precisa ser conferido. Não haverá repetição automática.
              </p>}
              {followup.teamAlertState === "failed" && <p role="alert" className="text-xs text-destructive">
                O aviso à equipe não foi confirmado. Confira a conversa manualmente.
              </p>}
              {!terminal && deliveryInProgress && <p className="text-xs text-muted-foreground">
                O envio está em andamento. Aguarde a confirmação antes de encerrar.
              </p>}
              {!terminal && !deliveryInProgress && (closingId === followup.id ? <div className="space-y-2 border-t border-current/10 pt-2">
                <label className="block text-xs" htmlFor={`motivo-encerrar-followup-${followup.id}`}>Motivo do encerramento</label>
                <select
                  id={`motivo-encerrar-followup-${followup.id}`}
                  data-testid={`motivo-encerrar-followup-${followup.id}`}
                  value={closeReason}
                  onChange={(event) => setCloseReason(event.target.value)}
                  className="concave-3d h-10 w-full rounded-md bg-transparent px-3 text-sm"
                >
                  <option value="pedido_cancelado">Pedido cancelado</option>
                  <option value="cliente_resolveu">Cliente resolveu por outro meio</option>
                  <option value="encerrado_pela_equipe">Encerrado pela equipe</option>
                </select>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-3d min-h-10 px-3 text-xs"
                    data-testid={`confirmar-encerrar-followup-${followup.id}`}
                    disabled={savingClose} onClick={() => void encerrarAcompanhamento(followup.id)}>
                    {savingClose ? "Salvando…" : "Confirmar encerramento"}
                  </button>
                  <button type="button" className="bevel-3d min-h-10 px-3 text-xs"
                    disabled={savingClose} onClick={() => { setClosingId(null); setCloseError(""); }}>
                    Manter aberto
                  </button>
                </div>
              </div> : <button type="button" className="btn-3d-soft min-h-10 px-3 text-xs"
                data-testid={`abrir-encerrar-followup-${followup.id}`}
                onClick={() => { setClosingId(followup.id); setCloseReason("pedido_cancelado"); setCloseError(""); }}>
                Encerrar acompanhamento
              </button>)}
            </article>;
          })}
        </div>
      </div>}
      {!history.isPending && !history.error && <div className="concave-3d overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-amber-50 text-slate-800">
            <tr><th className="p-3">Data</th><th className="p-3">Arquivo</th><th className="p-3">Exames</th><th className="p-3">Ações</th></tr>
          </thead>
          <tbody>{history.data?.documents.map((doc) => <tr key={doc.id} className="border-t border-current/10 align-top">
            <td className="whitespace-nowrap p-3">{new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
            }).format(new Date(doc.createdAt))}</td>
            <td className="p-3"><p className="font-semibold">{doc.tipoLabel}</p><p className="max-w-xs break-words text-xs">{doc.fileName}</p></td>
            <td className="p-3">{doc.examCount}</td>
            <td className="min-w-[260px] space-y-2 p-3">
              <ExamPdfActions documentId={doc.id} fileName={doc.fileName} />
              <ClinicalDocumentResendForm clientId={clientId} documentType="pedido_exames" documentId={doc.id} />
            </td>
          </tr>)}</tbody>
        </table>
        {!history.data?.documents.length && <p className="p-4 text-sm">Nenhum pedido registrado para este cliente.</p>}
      </div>}
      <div className="flex items-center justify-between gap-3 text-xs">
        <button type="button" className="btn-3d-soft px-3 py-2" disabled={offset === 0 || history.isFetching}
          onClick={() => setOffset((value) => Math.max(0, value - 20))}>Mais recentes</button>
        <button type="button" className="btn-3d-soft px-3 py-2" disabled={history.data?.nextOffset == null || history.isFetching}
          onClick={() => setOffset(history.data?.nextOffset ?? offset)}>Mais antigos</button>
      </div>
      {!!history.data?.dispatches.length && <div className="concave-3d overflow-x-auto">
        <h3 className="p-3 text-xs font-bold uppercase">Registros anteriores de envio</h3>
        <table className="w-full text-left text-sm">
          <thead className="bg-amber-50 text-slate-800"><tr><th className="p-3">Data</th><th className="p-3">Canal</th><th className="p-3">Arquivos</th><th className="p-3">Resultado</th></tr></thead>
          <tbody>{history.data.dispatches.map((record) => <tr key={record.id} className="border-t border-current/10">
            <td className="whitespace-nowrap p-3">{new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
            }).format(new Date(record.createdAt))}</td>
            <td className="p-3">{labels[record.channel] ?? record.channel}</td>
            <td className="p-3">{record.documentIds.join(", ")}</td>
            <td className="p-3">{record.state === "provider_accepted" ? "Aceito pelo provedor; entrega não confirmada" : record.state}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
  </section>;
}

function ExamPdfActions({ documentId, fileName }: { documentId: number; fileName: string }) {
  const [error, setError] = useState("");
  async function openPdf(download: boolean) {
    const token = getCollabToken();
    if (!token) throw new Error("Faça login de colaborador.");
    const tab = download ? null : window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const base = `${import.meta.env.BASE_URL}api/clinical-documents/pedido_exames/${documentId}/pdf`;
      const response = await fetch(`${base}${download ? "?download=1" : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Não foi possível abrir o pedido de exame.");
      const objectUrl = URL.createObjectURL(await response.blob());
      if (download) {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } else if (tab) tab.location.href = objectUrl;
      else throw new Error("Permita abrir uma nova aba para visualizar o PDF.");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (reason) {
      tab?.close();
      throw reason;
    }
  }
  return <div className="flex flex-wrap gap-2">
    <button type="button" className="btn-3d-soft px-3 py-2 text-xs" onClick={() => {
      setError(""); void openPdf(false).catch((reason) => setError(reason instanceof Error ? reason.message : "Falha ao abrir PDF."));
    }}>Abrir</button>
    <button type="button" className="btn-3d-soft px-3 py-2 text-xs" onClick={() => {
      setError(""); void openPdf(true).catch((reason) => setError(reason instanceof Error ? reason.message : "Falha ao baixar PDF."));
    }}>Baixar</button>
    {error && <p role="alert" className="w-full text-xs text-destructive">{error}</p>}
  </div>;
}
