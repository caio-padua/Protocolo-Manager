import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, QrCode, CreditCard, Copy, X } from "lucide-react";

// Pedido de receita ou de exames na Area do Cliente. O cliente descreve o que precisa,
// paga, e acompanha. Quem decide e assina o documento e o medico, no login dele.

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Kind = "receita" | "pedido_exames";
type Pedido = {
  id: number; kind: Kind; kindLabel: string; details: string; status: string;
  amount: number | null; invoiceUrl: string | null; paidAt: string | null;
  createdAt: string; refusalNote: string | null;
  pixQrImage?: string; pixPayload?: string;
};

const STATUS: Record<string, { label: string; hint: string }> = {
  aguardando_pagamento: { label: "Aguardando pagamento", hint: "Pague para o pedido seguir ao seu médico." },
  pago: { label: "Pago, na fila do médico", hint: "Seu médico vai analisar o pedido." },
  em_analise: { label: "Em análise pelo médico", hint: "O médico está avaliando o pedido." },
  emitido: { label: "Emitido", hint: "O documento foi emitido. Ele chega a você pelos canais da clínica." },
  recusado: { label: "Não aceito pelo médico", hint: "Veja o motivo abaixo. A clínica entrará em contato sobre o valor pago." },
  cancelado: { label: "Cancelado", hint: "" },
};

const brl = (v: number | null) =>
  v === null ? "" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PedidosMedicosCliente({ token }: { token: string }) {
  const [list, setList] = useState<Pedido[] | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<Kind>("receita");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [pay, setPay] = useState<Record<number, Pedido>>({});
  const timer = useRef<number | null>(null);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API_BASE}/api/area-paciente/pedidos-medicos${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 401 ? "Sessão expirada. Entre novamente." : body.error ?? "Não foi possível concluir.");
    return body;
  }, [token]);

  const load = useCallback(async () => {
    try { setList(await call("")); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, [call]);

  useEffect(() => { void load(); }, [load]);

  // Enquanto houver cobranca gerada e nao paga, consulta o estado a cada 6 s.
  useEffect(() => {
    const waiting = (list ?? []).filter((p) => p.status === "aguardando_pagamento" && p.invoiceUrl);
    if (waiting.length === 0) return;
    timer.current = window.setInterval(async () => {
      for (const p of waiting) {
        try { await call(`/${p.id}`); } catch { /* proxima rodada */ }
      }
      void load();
    }, 6000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [list, call, load]);

  async function create() {
    setBusy(true); setError("");
    try {
      await call("", { method: "POST", body: JSON.stringify({ kind, details }) });
      setDetails(""); setOpen(false); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function charge(p: Pedido, method: "pix" | "card") {
    setBusy(true); setError("");
    try {
      const r: Pedido = await call(`/${p.id}/cobranca`, { method: "POST", body: JSON.stringify({ method }) });
      if (method === "card" && r.invoiceUrl) window.open(r.invoiceUrl, "_blank", "noopener,noreferrer");
      setPay((s) => ({ ...s, [p.id]: r }));
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function cancel(p: Pedido) {
    setBusy(true); setError("");
    try { await call(`/${p.id}/cancelar`, { method: "POST", body: "{}" }); await load(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section className="panel-3d-sub rounded-lg p-4 space-y-3" aria-labelledby="pm-titulo">
      <div className="flex items-center gap-2">
        <FileText className="w-5 h-5 text-accent" />
        <h2 id="pm-titulo" className="text-primary font-black uppercase tracking-wider text-sm flex-1">
          Pedir receita ou exames
        </h2>
        {!open && (
          <button type="button" onClick={() => setOpen(true)} className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider">
            Novo pedido
          </button>
        )}
      </div>

      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}

      {open && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de pedido">
            {(["receita", "pedido_exames"] as Kind[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={`${kind === k ? "btn-3d" : "btn-3d-soft"} h-11 text-xs font-black uppercase tracking-wider`}>
                {k === "receita" ? "Receita" : "Pedido de exames"}
              </button>
            ))}
          </div>
          <textarea value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} rows={4}
            placeholder="Descreva o que você precisa. Exemplo: renovar a receita da minha fórmula atual."
            className="w-full rounded-md border border-border bg-background p-3 text-sm" aria-label="O que você precisa" />
          <p className="text-muted-foreground text-xs">
            O médico decide o conteúdo do documento. O valor é mostrado ao gerar a cobrança.
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={busy || details.trim().length < 5} onClick={create}
              className="btn-3d flex-1 h-11 text-xs font-black uppercase tracking-wider disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Enviar pedido"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-3d-soft px-4 h-11 text-xs font-black uppercase tracking-wider">
              Fechar
            </button>
          </div>
        </div>
      )}

      {list === null && !error && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      {list?.length === 0 && !open && <p className="text-muted-foreground text-sm">Você ainda não fez pedidos.</p>}

      <ul className="space-y-2">
        {(list ?? []).map((p) => {
          const st = STATUS[p.status] ?? { label: p.status, hint: "" };
          const shown = pay[p.id] ?? p;
          return (
            <li key={p.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-primary font-semibold text-sm">{p.kindLabel} · {brl(p.amount)}</p>
                  <p className="text-muted-foreground text-xs">{st.label}</p>
                </div>
              </div>
              <p className="text-sm break-words">{p.details}</p>
              {st.hint && <p className="text-muted-foreground text-xs">{st.hint}</p>}
              {p.refusalNote && <p className="text-sm"><strong>Motivo:</strong> {p.refusalNote}</p>}

              {p.status === "aguardando_pagamento" && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={busy} onClick={() => charge(p, "pix")}
                      className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40">
                      <QrCode className="w-4 h-4" /> Pagar com PIX
                    </button>
                    <button type="button" disabled={busy} onClick={() => charge(p, "card")}
                      className="btn-3d-soft px-4 h-10 text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40">
                      <CreditCard className="w-4 h-4" /> Cartão
                    </button>
                    {!p.invoiceUrl && (
                      <button type="button" disabled={busy} onClick={() => cancel(p)}
                        className="btn-3d-soft px-4 h-10 text-xs font-black uppercase tracking-wider flex items-center gap-2 disabled:opacity-40">
                        <X className="w-4 h-4" /> Cancelar
                      </button>
                    )}
                  </div>
                  {shown.pixPayload && (
                    <div className="space-y-2">
                      {shown.pixQrImage && (
                        <img alt="QR Code do PIX" className="w-44 h-44 bg-white p-2 rounded"
                          src={`data:image/png;base64,${shown.pixQrImage}`} />
                      )}
                      <button type="button" className="btn-3d-soft px-3 h-9 text-xs font-black uppercase tracking-wider flex items-center gap-2"
                        onClick={() => navigator.clipboard?.writeText(shown.pixPayload ?? "")}>
                        <Copy className="w-4 h-4" /> Copiar código PIX
                      </button>
                      <p className="text-muted-foreground text-xs">Assim que o pagamento for confirmado, esta tela se atualiza.</p>
                    </div>
                  )}
                  {p.invoiceUrl && !shown.pixPayload && (
                    <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer" className="text-accent text-xs underline">
                      Abrir a cobrança
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
