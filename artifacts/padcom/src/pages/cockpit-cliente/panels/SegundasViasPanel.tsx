import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";

// Histórico de segundas vias de documentos do cliente (aba Documentos).
// Somente leitura: mostra o que foi pedido, pago, revisado e entregue.

const API = import.meta.env.BASE_URL + "api";

type Linha = {
  id: string;
  document_label: string;
  original_document_issued_at: string | null;
  requested_at: string;
  requested_by_channel: string;
  request_status: string;
  eligibility_status: string;
  eligibility_reason: string;
  fee_amount: string | null;
  payment_status: string;
  paid_at: string | null;
  reviewed_at: string | null;
  delivery_channel: string | null;
  delivery_status: string;
  delivery_result: string | null;
};

const STATUS: Record<string, string> = {
  requested: "Solicitada", awaiting_confirmation: "Aguardando autorização do cliente",
  awaiting_payment: "Aguardando pagamento", awaiting_review: "Aguardando revisão humana",
  approved: "Aprovada", denied: "Recusada", delivery_pending: "Entrega pendente",
  provider_accepted: "Entregue ao provedor", failed: "Falhou", unknown: "Resultado incerto",
  cancelled: "Cancelada",
};
const PAGAMENTO: Record<string, string> = {
  unverified: "Não verificado", awaiting_consent: "Aguardando autorização", pending: "Pendente",
  paid: "Pago", not_required: "Sem cobrança", failed: "Falhou", cancelled: "Cancelado",
};
const ELEGIBILIDADE: Record<string, string> = {
  free_treatment: "Gratuita: tratamento vigente", free_member: "Gratuita: PaxMed Members",
  fee_required: "Com taxa administrativa", human_review: "Revisão humana",
};

function data(valor: string | null, comHora = false) {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;
  return comHora ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default function SegundasViasPanel({ clientId }: { clientId: number }) {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro("");
    fetch(`${API}/clinical-document-reissues/client/${clientId}`, { headers: collabAuthHeaders() })
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `HTTP ${r.status}`);
        return r.json() as Promise<Linha[]>;
      })
      .then((rows) => { if (ativo) setLinhas(rows); })
      .catch((e: Error) => { if (ativo) setErro(e.message || "Não foi possível carregar as segundas vias."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [clientId]);

  return (
    <section className="panel-3d-sub p-4" aria-label="Segundas vias de documentos">
      <h3 className="text-sm font-semibold uppercase tracking-wide">Segundas vias solicitadas</h3>
      {carregando && <p className="mt-3 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</p>}
      {erro && <p role="alert" className="mt-3 text-sm text-red-700">{erro}</p>}
      {!carregando && !erro && linhas.length === 0 && (
        <p className="mt-3 text-sm opacity-75">Nenhuma segunda via solicitada por este cliente.</p>
      )}
      {linhas.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead>
              <tr>
                {["Documento", "Emitido em", "Solicitada em", "Situação", "Direito", "Taxa", "Pagamento", "Entrega"].map((t) => (
                  <th key={t} className="border-b px-2 py-1 font-semibold">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="border-b px-2 py-1">{l.document_label}</td>
                  <td className="border-b px-2 py-1">{data(l.original_document_issued_at)}</td>
                  <td className="border-b px-2 py-1">{data(l.requested_at, true)}</td>
                  <td className="border-b px-2 py-1">{STATUS[l.request_status] ?? l.request_status}</td>
                  <td className="border-b px-2 py-1" title={l.eligibility_reason}>{ELEGIBILIDADE[l.eligibility_status] ?? l.eligibility_status}</td>
                  <td className="border-b px-2 py-1">{l.fee_amount ? `R$ ${Number(l.fee_amount).toFixed(2).replace(".", ",")}` : "—"}</td>
                  <td className="border-b px-2 py-1">{PAGAMENTO[l.payment_status] ?? l.payment_status}{l.paid_at ? ` em ${data(l.paid_at, true)}` : ""}</td>
                  <td className="border-b px-2 py-1">{l.delivery_result ?? (l.delivery_channel ? `Via ${l.delivery_channel}` : "Não entregue")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
