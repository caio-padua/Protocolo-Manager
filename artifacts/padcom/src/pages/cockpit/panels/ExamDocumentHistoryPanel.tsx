import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ExamRequestHistory } from "@workspace/api-client-react";
import { getCollabToken } from "@/lib/collab-auth";
import ClinicalHistoryToggle from "@/components/ClinicalHistoryToggle";
import ClinicalDocumentResendForm from "@/components/ClinicalDocumentResendForm";

const labels: Record<string, string> = { EMAIL: "E-mail", WHATSAPP: "WhatsApp", TELEGRAM: "Telegram" };

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
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState(0);
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
      !!query.state.data?.pendingOperations.length ? 10_000 : false,
    refetchIntervalInBackground: false,
    queryFn: ({ signal }) => api<ExamRequestHistory>(`/exam-requests/${clientId}/history?offset=${offset}`, signal),
  });
  useEffect(() => { setOffset(0); }, [clientId]);
  if (!enabled) return null;

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
