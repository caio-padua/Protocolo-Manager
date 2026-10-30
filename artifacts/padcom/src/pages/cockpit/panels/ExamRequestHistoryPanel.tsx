import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ExamRequestHistory, ExamDocumentDispatchResult } from "@workspace/api-client-react";
import { getCollabToken } from "@/lib/collab-auth";
import { BASE } from "../../comunicacao/_shared";
import { examDispatchKey } from "@/lib/exam-dispatch-key";

type Channel = "EMAIL" | "WHATSAPP" | "TELEGRAM";
const labels: Record<Channel, string> = { EMAIL: "E-mail", WHATSAPP: "WhatsApp", TELEGRAM: "Telegram" };
const states: Record<string, string> = {
  requested: "Iniciado; resultado ainda não confirmado",
  provider_accepted: "Aceito pelo provedor; entrega não confirmada",
  simulated: "Simulação; não enviado",
  failed: "Falha no envio",
  unknown: "Resultado indefinido; confira antes de repetir",
};
const emptyIds: number[] = [];

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getCollabToken();
  if (!token) throw new Error("Faça login de colaborador.");
  const response = await fetch(`${BASE}/api${path}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data;
}

export default function ExamRequestHistoryPanel({ clientId, professionalId, enabled, email, phone, recentIds = emptyIds }: {
  clientId: number; professionalId?: number; enabled: boolean; recentIds?: number[];
  email?: string | null; phone?: string | null;
}) {
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ExamDocumentDispatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sendingRef = useRef(false);
  const contextRef = useRef({ clientId, professionalId });
  contextRef.current = { clientId, professionalId };
  const history = useQuery<ExamRequestHistory>({
    queryKey: ["exam-request-history", professionalId, clientId, offset, recentIds],
    enabled, retry: false, staleTime: 0,
    queryFn: async ({ signal }) => {
      const data = await api<ExamRequestHistory>(`/exam-requests/${clientId}/history?offset=${offset}`, { signal });
      if (!Array.isArray(data.documents)) throw new Error("O histórico retornou um formato inesperado.");
      return data;
    },
  });
  useEffect(() => {
    setSelected(recentIds); setOffset(0); setConfirmed(false); setResult(null); setError(null);
  }, [recentIds, clientId, professionalId]);
  const toggleDocument = (id: number) => {
    setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
    setConfirmed(false); setResult(null);
  };
  const toggleChannel = (channel: Channel) => {
    setChannels(values => values.includes(channel) ? values.filter(value => value !== channel) : [...values, channel]);
    setConfirmed(false); setResult(null);
  };
  const send = async () => {
    if (!enabled || sendingRef.current || (!confirmed && !result) || !selected.length || !channels.length) return;
    sendingRef.current = true;
    setSending(true); setError(null); setResult(null);
    try {
      const operationKey = await examDispatchKey(professionalId, clientId, selected, channels);
      const data = await api<ExamDocumentDispatchResult>("/exam-requests/send", {
        method: "POST", body: JSON.stringify({ operationKey, clientId, documentIds: selected, channels, confirmed: true }),
      });
      if (clientId !== contextRef.current.clientId || professionalId !== contextRef.current.professionalId) return;
      setResult(data); setConfirmed(false);
    } catch (reason) {
      if (clientId !== contextRef.current.clientId || professionalId !== contextRef.current.professionalId) return;
      setError(`${reason instanceof Error ? reason.message : "Falha ao enviar."} Se o envio chegou a iniciar, confirme novamente a mesma seleção para consultar a operação anterior, sem reenviar.`);
      setConfirmed(false);
    } finally { sendingRef.current = false; setSending(false); void history.refetch(); }
  };
  if (!enabled) return null;
  return (
    <section className="panel-3d-sub col-span-full space-y-4 p-4" aria-label="Histórico de pedidos de exames">
      <div className="flex items-center justify-between gap-3">
        <h3 className="bevel-3d px-3 py-2 text-sm font-bold uppercase tracking-wide">Pedidos anteriores e envio</h3>
        <button type="button" className="btn-3d-soft px-3 py-2 text-xs" disabled={history.isFetching || sending}
          onClick={() => void history.refetch()}>Atualizar histórico</button>
      </div>
      {history.isPending ? <p role="status">Carregando histórico…</p> : history.error ? (
        <p role="alert" className="text-sm text-red-600">{history.error.message}</p>
      ) : (
        <div className="concave-3d overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-amber-50 text-slate-800"><tr>
              <th className="p-3">Selecionar</th><th className="p-3">Data</th>
              <th className="p-3">Documento</th><th className="p-3">Exames</th><th className="p-3">Visualizar</th>
            </tr></thead>
            <tbody>{history.data?.documents.map(doc => (
              <tr key={doc.id} className="border-t border-current/10">
                <td className="p-3"><input type="checkbox" disabled={sending} checked={selected.includes(doc.id)}
                  aria-label={`Selecionar documento ${doc.id} para envio`} onChange={() => toggleDocument(doc.id)} /></td>
                <td className="whitespace-nowrap p-3">{new Intl.DateTimeFormat("pt-BR", {
                  dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
                }).format(new Date(doc.createdAt))}</td>
                <td className="p-3"><p className="font-semibold">{doc.tipoLabel}</p><p className="max-w-sm truncate text-xs" title={doc.fileName}>{doc.fileName}</p></td>
                <td className="p-3">{doc.examCount}</td>
                <td className="p-3"><a href={doc.url} target="_blank" rel="noopener noreferrer" className="btn-3d-soft inline-block px-3 py-2 text-xs">Abrir</a></td>
              </tr>
            ))}</tbody>
          </table>
          {!history.data?.documents.length && <p className="p-4 text-sm">Nenhum pedido registrado para este cliente.</p>}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 text-xs">
        <button type="button" className="btn-3d-soft px-3 py-2" disabled={offset === 0 || sending || history.isFetching}
          onClick={() => setOffset(value => Math.max(0, value - 20))}>Mais recentes</button>
        <span>{selected.length} documento(s) selecionado(s)</span>
        <button type="button" className="btn-3d-soft px-3 py-2" disabled={history.data?.nextOffset == null || sending || history.isFetching}
          onClick={() => setOffset(history.data?.nextOffset ?? offset)}>Mais antigos</button>
      </div>
      <fieldset disabled={sending} className="concave-3d space-y-3 p-3">
        <legend className="px-2 text-xs font-bold uppercase">Enviar documentos já gerados</legend>
        <p className="text-xs text-muted-foreground">Os destinos são os dados cadastrados deste cliente, conferidos pelo servidor.</p>
        {channels.includes("EMAIL") && <p className="text-sm">E-mail: <strong>{email || "Não cadastrado"}</strong></p>}
        {channels.includes("WHATSAPP") && <p className="text-sm">WhatsApp: <strong>{phone || "Não cadastrado"}</strong></p>}
        {channels.includes("TELEGRAM") && <p className="text-sm">Telegram: conta vinculada ao cadastro deste cliente, validada antes do envio.</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(Object.keys(labels) as Channel[]).map(channel => <label key={channel} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={channels.includes(channel)} onChange={() => toggleChannel(channel)} />{labels[channel]}
          </label>)}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          Conferi os documentos e autorizo o envio nos canais marcados.
        </label>
        <button type="button" className="btn-3d px-4 py-2 text-sm disabled:opacity-40"
          disabled={!selected.length || !channels.length || !confirmed || sending} onClick={() => void send()}>
          {sending ? "Enviando…" : "Confirmar envio"}
        </button>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {result && <div className="concave-3d space-y-2 p-3 text-sm" role="status">
        <p className="font-semibold">{result.replayed ? "Operação anterior" : "Operação registrada"}</p>
        <p>{result.message}</p>
        <p className="break-all text-xs">Operação: {result.operationKey}</p>
        {result.needsReview && <p role="alert">Confira o histórico e o provedor. Uma consulta não inicia outro envio.</p>}
        <button type="button" className="btn-3d-soft px-3 py-2 text-xs" disabled={sending}
          onClick={() => void send()}>Consultar esta operação</button>
        {result.results.map(item => <p key={item.channel}>
          <strong>{labels[item.channel]}:</strong> {item.success ? "Aceito pelo provedor; entrega ao destinatário ainda não confirmada." : item.error || "Não enviado."}
          <span className="block text-xs text-muted-foreground">Registro de auditoria: {item.auditId}</span>
        </p>)}
      </div>}
      {!!history.data?.dispatches.length && <div className="concave-3d overflow-x-auto">
        <h4 className="p-3 text-xs font-bold uppercase">Últimos vinte registros de envio</h4>
        <table className="w-full text-left text-sm">
          <thead className="bg-amber-50 text-slate-800"><tr>
            <th className="p-3">Data</th><th className="p-3">Canal</th><th className="p-3">Documentos</th><th className="p-3">Resultado</th>
          </tr></thead>
          <tbody>{history.data.dispatches.map(record => <tr key={record.id} className="border-t border-current/10">
            <td className="whitespace-nowrap p-3">{new Intl.DateTimeFormat("pt-BR", {
              dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo",
            }).format(new Date(record.createdAt))}</td>
            <td className="p-3">{labels[record.channel as Channel] ?? record.channel}</td>
            <td className="p-3">{record.documentIds.join(", ")}</td>
            <td className="p-3">{states[record.state] ?? "Estado indisponível"}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
  );
}
