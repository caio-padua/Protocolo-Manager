import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { BASE } from "../comunicacao/_shared";

type Prescricao = { id: number; clientId: number | null; clientName: string; status: string };
type Resultado = { pending?: boolean; error?: string; destinatarios?: string[] };

async function request(path: string, method = "GET") {
  const token = localStorage.getItem("padcom_collab_token");
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || body?.message || `Falha na solicitação (HTTP ${response.status}).`);
  if (!body) throw new Error("O servidor retornou uma resposta sem confirmação.");
  return body;
}

export function PrescricoesEmitidas({ clientId, emissionId }: { clientId: number | null; emissionId?: number }) {
  const { data, isPending, error, refetch } = useQuery<Prescricao[]>({
    queryKey: ["prescricoes-emitidas", emissionId],
    queryFn: () => request("/prescriptions"),
    staleTime: 0,
  });
  const [resultados, setResultados] = useState<Record<number, Resultado>>({});
  const emAndamento = useRef(new Set<number>());

  async function reenviar(id: number) {
    if (emAndamento.current.has(id)) return;
    emAndamento.current.add(id);
    setResultados((prev) => ({ ...prev, [id]: { pending: true } }));
    try {
      const result = await request(`/prescriptions/${id}/reenviar-email`, "POST");
      if (result.emailSent !== true) {
        throw new Error(result.error || "O PDF foi gerado, mas o serviço de e-mail não confirmou o envio. O servidor não informou o motivo.");
      }
      if (!Array.isArray(result.destinatarios) || !result.destinatarios.length ||
          !result.destinatarios.every((email: unknown) => typeof email === "string")) {
        throw new Error("Envio confirmado, mas o servidor não informou os destinatários. Confira antes de reenviar novamente.");
      }
      setResultados((prev) => ({ ...prev, [id]: { destinatarios: result.destinatarios } }));
    } catch (err) {
      setResultados((prev) => ({ ...prev, [id]: { error: err instanceof Error ? err.message : "Falha desconhecida ao reenviar." } }));
    } finally {
      emAndamento.current.delete(id);
    }
  }

  const rows = data?.filter((p) => p.status === "emitted" && (clientId == null || p.clientId === clientId)) ?? [];
  return (
    <section className="no-print panel-3d p-4 space-y-3" aria-label="Prescrições emitidas">
      <h2 className="font-semibold text-primary">Prescrições emitidas — reenvio por e-mail</h2>
      {isPending && <p role="status" className="text-sm">Carregando prescrições…</p>}
      {error && <div role="alert" className="text-sm text-destructive">
        Não foi possível carregar o histórico: {error.message}
        <button type="button" className="btn-3d-soft ml-2 px-3 py-1" onClick={() => refetch()}>Tentar novamente</button>
      </div>}
      {!isPending && !error && !rows.length && <p className="text-sm text-muted-foreground">Nenhuma prescrição emitida encontrada.</p>}
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {rows.map((p) => {
          const result = resultados[p.id];
          return <div key={p.id} className="panel-3d-sub p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{p.clientName} — #{p.id}</span>
              <button type="button" className="btn-3d-soft px-3 py-2 text-xs inline-flex items-center gap-2 disabled:opacity-60"
                disabled={result?.pending} aria-busy={!!result?.pending} onClick={() => reenviar(p.id)}>
                {result?.pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {result?.pending ? "Reenviando…" : "Reenviar e-mail"}
              </button>
            </div>
            {result?.pending && <p role="status" className="text-sm text-muted-foreground">Gerando PDF e enviando e-mail. Isso pode levar dezenas de segundos; aguarde nesta tela.</p>}
            {result?.destinatarios && <p role="status" className="text-sm break-words">E-mail enviado para: {result.destinatarios.join(" · ")}</p>}
            {result?.error && <p role="alert" className="text-sm text-destructive break-words">Não foi possível confirmar o reenvio: {result.error}</p>}
          </div>;
        })}
      </div>
    </section>
  );
}
