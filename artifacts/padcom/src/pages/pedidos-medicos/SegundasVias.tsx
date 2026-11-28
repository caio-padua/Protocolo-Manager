import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Company = { id: number; nome: string; ativa?: boolean };
type Location = { id: number; name: string; empresaId: number; active?: string | boolean };
type DocumentTypes = {
  prescricao: boolean;
  pedido_exames: boolean;
  atestado: boolean;
  encaminhamento: boolean;
  protocolo: boolean;
  ras_fap: boolean;
  carta_tratamento: boolean;
  documento_assinado: boolean;
};
type Policy = {
  enabled: boolean;
  feeCollectionEnabled: boolean;
  requireHumanReview: boolean;
  feeAmount: number;
  documentTypes: DocumentTypes;
};
type QueueItem = {
  id: string;
  client_id: number;
  client_name: string;
  document_type: string;
  document_label: string;
  original_document_issued_at: string | null;
  requested_at: string;
  requested_by_channel: string;
  request_status: string;
  eligibility_status: string;
  eligibility_reason: string;
  membership_verification: string;
  fee_amount: string | null;
  payment_status: string;
  paid_at: string | null;
  require_human_review: boolean;
  reviewed_at: string | null;
  delivery_channel: string | null;
  delivery_status: string;
  delivery_result: string | null;
  asaas_invoice_url?: string | null;
};

const TYPE_LABELS: Array<[keyof DocumentTypes, string]> = [
  ["prescricao", "Prescrição e receitas"],
  ["pedido_exames", "Pedidos de exames"],
  ["atestado", "Atestados"],
  ["encaminhamento", "Encaminhamentos"],
  ["protocolo", "Protocolos"],
  ["ras_fap", "Relatórios RAS FAP"],
  ["carta_tratamento", "Cartas de tratamento"],
  ["documento_assinado", "Documentos assinados e consentimentos"],
];

const DEFAULT_POLICY: Policy = {
  enabled: false,
  feeCollectionEnabled: false,
  requireHumanReview: true,
  feeAmount: 15,
  documentTypes: {
    prescricao: true,
    pedido_exames: true,
    atestado: true,
    encaminhamento: true,
    protocolo: true,
    ras_fap: true,
    carta_tratamento: true,
    documento_assinado: true,
  },
};

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}/api${path}`, {
    ...init,
    cache: "no-store",
    headers: collabAuthHeaders(init?.body ? { "Content-Type": "application/json" } : {}),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Não foi possível carregar as segundas vias.");
  return body as T;
}

function brDate(value: string | null | undefined) {
  if (!value) return "Não registrada";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T12:00:00.000Z` : value);
  return Number.isNaN(date.getTime())
    ? "Data inválida"
    : dateOnly
      ? date.toLocaleDateString("pt-BR", { timeZone: "UTC" })
      : date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function currency(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "Sem cobrança";
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "Valor indisponível";
}

const statusLabel: Record<string, string> = {
  requested: "Solicitada",
  awaiting_confirmation: "Aguardando confirmação",
  awaiting_payment: "Aguardando pagamento",
  awaiting_review: "Aguardando validação humana",
  approved: "Aprovada para entrega",
  denied: "Recusada",
  delivery_pending: "Entrega em andamento",
  provider_accepted: "Aceita pelo canal",
  failed: "Falha na entrega",
  unknown: "Resultado incerto",
  cancelled: "Cancelada",
};
const paymentStatusLabel: Record<string, string> = {
  not_required: "Não se aplica",
  awaiting_consent: "Aguardando autorização da taxa",
  pending: "Aguardando pagamento",
  paid: "Pago",
  overdue: "Vencido",
  cancelled: "Cancelado",
  unverified: "Não confirmado",
};
const deliveryStatusLabel: Record<string, string> = {
  not_started: "Não iniciada",
  queued: "Aguardando envio",
  provider_accepted: "Mensagem aceita pelo canal — entrega não confirmada",
  delivered: "Mensagem entregue — confirmação do provedor",
  read: "Mensagem lida — confirmação do provedor",
  failed: "Falha de entrega",
  unknown: "Resultado incerto — não reenviar automaticamente",
};

export function SegundasVias() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [empresaId, setEmpresaId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [reviewEligibility, setReviewEligibility] = useState<Record<string, string>>({});
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});
  const [refusalReasons, setRefusalReasons] = useState<Record<string, string>>({});

  const scope = useMemo(() => {
    if (!empresaId || !locationId) return "";
    return `?empresaId=${encodeURIComponent(empresaId)}&locationId=${encodeURIComponent(locationId)}`;
  }, [empresaId, locationId]);

  useEffect(() => {
    let alive = true;
    Promise.all([
      jsonRequest<Company[]>("/empresas"),
      jsonRequest<Location[]>("/locations"),
    ]).then(([companyRows, locationRows]) => {
      if (!alive) return;
      setCompanies(companyRows.filter((row) => row.ativa !== false));
       setLocations(locationRows.filter((row) => row.active !== false && row.active !== "false"));
    }).catch((e) => {
      if (alive) setError((e as Error).message);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    if (!scope) {
      setQueue([]);
      setPolicy(DEFAULT_POLICY);
      return;
    }
    setError("");
    try {
      const [savedPolicy, rows] = await Promise.all([
        jsonRequest<Policy>(`/pedidos-medicos/segunda-via/config${scope}`),
        jsonRequest<QueueItem[]>(`/pedidos-medicos/segunda-via/fila${scope}`),
      ]);
      setPolicy(savedPolicy);
      setQueue(rows);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  async function savePolicy() {
    if (!scope) return;
    setBusy(true);
    setSaved("");
    setError("");
    try {
      const updated = await jsonRequest<Policy>(`/pedidos-medicos/segunda-via/config${scope}`, {
        method: "PUT",
        body: JSON.stringify(policy),
      });
      setPolicy(updated);
      setSaved("Controles da segunda via salvos.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function approve(item: QueueItem) {
    setBusy(true);
    setError("");
    try {
      const eligibilityOverride = reviewEligibility[item.id];
      const reason = reviewReasons[item.id]?.trim();
      if (item.eligibility_status === "human_review") {
        await jsonRequest(`/pedidos-medicos/segunda-via/${encodeURIComponent(item.id)}/resolver-revisao`, {
          method: "POST",
          body: JSON.stringify({ resolution: eligibilityOverride, reason }),
        });
        await load();
        return;
      }
      await jsonRequest(`/pedidos-medicos/segunda-via/${encodeURIComponent(item.id)}/aprovar`, {
        method: "POST",
        body: JSON.stringify({
          ...(eligibilityOverride ? { eligibilityOverride } : {}),
          ...(reason ? { reason } : {}),
        }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refuse(id: string) {
    const reason = refusalReasons[id]?.trim();
    if (!reason || reason.length < 5) {
      setError("Escreva o motivo da recusa antes de confirmar.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await jsonRequest(`/pedidos-medicos/segunda-via/${encodeURIComponent(id)}/recusar`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyPayment(id: string) {
    setBusy(true);
    setError("");
    try {
      await jsonRequest(`/pedidos-medicos/segunda-via/${encodeURIComponent(id)}/verificar-pagamento`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const locationsForCompany = locations.filter((row) => row.empresaId === Number(empresaId));

  return (
    <section className="space-y-4" aria-label="Segundas vias de documentos">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-primary">Segundas vias de documentos</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Solicitações, cobrança, validação e resultado da entrega, separados dos pedidos médicos atuais.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading || busy || !scope}
          className="btn-3d-soft inline-flex h-10 items-center gap-2 px-4 text-xs font-black uppercase tracking-wider disabled:opacity-40">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </header>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-700">{saved}</p>}

      <section className="panel-3d-sub space-y-3 rounded-lg p-4" aria-label="Clínica das segundas vias">
        <h3 className="text-xs font-black uppercase tracking-wider text-primary">Escolha a clínica</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm">
            <span>Empresa</span>
            <select value={empresaId} onChange={(event) => { setEmpresaId(event.target.value); setLocationId(""); }}
              className="w-full rounded-md border border-border bg-background p-2">
              <option value="">Selecione uma empresa</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.nome}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>Clínica ou unidade</span>
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)} disabled={!empresaId}
              className="w-full rounded-md border border-border bg-background p-2 disabled:opacity-50">
              <option value="">Selecione uma clínica</option>
              {locationsForCompany.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
        </div>
        {loading && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando clínicas.</p>}
        {!loading && companies.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma empresa ativa disponível.</p>}
      </section>

      {!scope ? (
        <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">Selecione a empresa e a clínica para consultar ou editar esta política.</p>
      ) : (
        <>
          <section className="panel-3d-sub space-y-4 rounded-lg p-4" aria-label="Configuração da segunda via">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-primary">Controles de liberação e cobrança</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  A liberação automática nunca ignora a identidade, o documento original, a autorização do cliente ou a confirmação do pagamento.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={policy.enabled}
                  onChange={(event) => setPolicy((current) => ({ ...current, enabled: event.target.checked }))} />
                Ativar solicitações de segunda via
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={policy.feeCollectionEnabled}
                  onChange={(event) => setPolicy((current) => ({ ...current, feeCollectionEnabled: event.target.checked }))} />
                Permitir criar cobranças
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={policy.requireHumanReview}
                  onChange={(event) => setPolicy((current) => ({ ...current, requireHumanReview: event.target.checked }))} />
                Exigir validação humana antes da entrega
              </label>
              <label className="block space-y-1 text-sm">
                <span>Taxa administrativa (R$)</span>
                <input type="number" min="5" max="100000" step="0.01" inputMode="decimal"
                  value={String(policy.feeAmount).replace(".", ",")}
                  onChange={(event) => {
                    const next = Number(event.target.value.replace(",", "."));
                    setPolicy((current) => ({ ...current, feeAmount: Number.isFinite(next) ? next : 0 }));
                  }}
                  className="w-full rounded-md border border-border bg-background p-2" />
              </label>
            </div>

            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-black uppercase tracking-wider text-primary">Tipos de documento permitidos</legend>
              {TYPE_LABELS.map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={policy.documentTypes[key]}
                    onChange={(event) => setPolicy((current) => ({
                      ...current,
                      documentTypes: { ...current.documentTypes, [key]: event.target.checked },
                    }))} />
                  {label}
                </label>
              ))}
            </fieldset>

            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void savePolicy()} disabled={busy || policy.feeAmount < 5}
                className="btn-3d inline-flex h-10 items-center gap-2 px-5 text-xs font-black uppercase tracking-wider disabled:opacity-40">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar controles
              </button>
              <span className="text-xs text-muted-foreground">A taxa inicial é R$ 15,00; editar este campo não altera pedidos já registrados.</span>
            </div>
          </section>

          <section className="space-y-3" aria-label="Fila de segundas vias">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-wider text-primary">Solicitações desta clínica</h3>
              <span className="text-xs text-muted-foreground">{queue.length} registros</span>
            </div>
            {queue.length === 0 && <p className="rounded-md border border-border p-3 text-sm text-muted-foreground">Ainda não há solicitações registradas.</p>}
            {queue.map((item) => (
              <article key={item.id} className="panel-3d-sub space-y-3 rounded-lg p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-primary">{item.client_name} · {item.document_label}</p>
                    <p className="text-xs text-muted-foreground">Solicitação {item.id} · {statusLabel[item.request_status] ?? item.request_status}</p>
                  </div>
                  <span className="bevel-3d rounded-md px-2 py-1 text-xs font-semibold">{currency(item.fee_amount)}</span>
                </div>
                <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
                  <div><dt className="text-muted-foreground">Documento emitido em</dt><dd>{brDate(item.original_document_issued_at)}</dd></div>
                  <div><dt className="text-muted-foreground">Segunda via solicitada em</dt><dd>{brDate(item.requested_at)}</dd></div>
                  <div><dt className="text-muted-foreground">Direito gratuito</dt><dd>{item.eligibility_status === "free_treatment" ? "Tratamento vigente" : item.eligibility_status === "free_member" ? "PaxMed Members verificado" : item.eligibility_status === "fee_required" ? "Taxa aplicável" : "Conferência humana"}</dd></div>
                  <div><dt className="text-muted-foreground">Pagamento</dt><dd>{item.payment_status === "paid" ? `Pago em ${brDate(item.paid_at)}` : paymentStatusLabel[item.payment_status] ?? item.payment_status}</dd></div>
                  <div><dt className="text-muted-foreground">Canal da solicitação</dt><dd>{item.requested_by_channel}</dd></div>
                  <div><dt className="text-muted-foreground">Entrega</dt><dd>{deliveryStatusLabel[item.delivery_status] ?? "Estado não reconhecido — conferir registro"}</dd></div>
                </dl>
                <p className="text-xs text-muted-foreground">{item.eligibility_reason}</p>
                {item.membership_verification === "unavailable" && (
                  <p className="rounded-md border border-amber-500/40 p-2 text-xs">
                    A assinatura PaxMed Members ainda não pode ser confirmada automaticamente; esta solicitação não deve ser cobrada ou liberada sem conferência.
                  </p>
                )}
                {item.asaas_invoice_url && (
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <a className="underline" href={item.asaas_invoice_url} target="_blank" rel="noreferrer">
                      Abrir cobrança registrada no provedor
                    </a>
                    {item.request_status === "awaiting_payment" && (
                      <button type="button" disabled={busy} onClick={() => void verifyPayment(item.id)}
                        className="btn-3d-soft h-8 px-3 font-bold disabled:opacity-40">
                        Verificar pagamento no Asaas
                      </button>
                    )}
                  </div>
                )}
                {item.request_status === "awaiting_review" && (
                  <div className="space-y-3 border-t border-border pt-3">
                    {item.eligibility_status === "human_review" && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        <label className="block space-y-1 text-sm">
                          <span>Resultado da conferência humana</span>
                          <select value={reviewEligibility[item.id] ?? ""}
                            onChange={(event) => setReviewEligibility((current) => ({ ...current, [item.id]: event.target.value }))}
                            className="w-full rounded-md border border-border bg-background p-2">
                            <option value="">Selecione o resultado verificado</option>
                            <option value="free_treatment">Tratamento vigente confirmado</option>
                            <option value="fee_required">Taxa necessária</option>
                          </select>
                        </label>
                        <label className="block space-y-1 text-sm">
                          <span>Motivo e evidência da validação</span>
                          <textarea value={reviewReasons[item.id] ?? ""}
                            onChange={(event) => setReviewReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                            minLength={10} maxLength={500} rows={2}
                            className="w-full rounded-md border border-border bg-background p-2"
                            placeholder="Registre como a vigência ou assinatura foi confirmada." />
                        </label>
                      </div>
                    )}
                    <label className="block space-y-1 text-sm">
                      <span>Motivo da recusa</span>
                      <textarea value={refusalReasons[item.id] ?? ""}
                        onChange={(event) => setRefusalReasons((current) => ({ ...current, [item.id]: event.target.value }))}
                        minLength={5} maxLength={500} rows={2}
                        className="w-full rounded-md border border-border bg-background p-2"
                        placeholder="Preencha somente se recusar a solicitação." />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" disabled={busy ||
                        (item.eligibility_status === "human_review" &&
                          (!reviewEligibility[item.id] || (reviewReasons[item.id] ?? "").trim().length < 10))}
                        onClick={() => void approve(item)}
                        className="btn-3d h-9 px-4 text-xs font-black uppercase tracking-wider disabled:opacity-40">
                        {item.eligibility_status === "human_review"
                          ? "Registrar conferência e pedir confirmação ao cliente"
                          : "Validar e liberar pelo Telegram"}
                      </button>
                      <button type="button" disabled={busy || (refusalReasons[item.id] ?? "").trim().length < 5}
                        onClick={() => void refuse(item.id)}
                        className="btn-3d-soft h-9 px-4 text-xs font-black uppercase tracking-wider disabled:opacity-40">
                        Recusar
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </section>
        </>
      )}
    </section>
  );
}
