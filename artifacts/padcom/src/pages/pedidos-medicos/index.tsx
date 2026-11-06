import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { FileText, Loader2, Stethoscope } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { usePermissoes } from "@/lib/permissoes";

// Fila do medico para pedidos de receita/exames pagos pelo cliente.
// A emissao do documento e feita no Cockpit, com o certificado do proprio medico logado.

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Item = {
  id: number; kind: "receita" | "pedido_exames"; kindLabel: string; clientId: number; clientName: string;
  details: string; status: "pago" | "em_analise"; paidAt: string | null; createdAt: string;
  assignedProfessionalId: number | null; assignedReason: string | null; asResponsible: boolean;
};
type Precos = { minimo: number; valores: Record<string, number | null> };

const REASON: Record<string, string> = {
  habitual: "Médico habitual do cliente",
  responsavel_tecnico: "Encaminhado ao responsável técnico",
  sem_destino: "Sem médico apto: aguardando o responsável técnico",
  encaminhado: "Encaminhado pelo responsável técnico",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/pedidos-medicos${path}`, {
    ...init,
    headers: collabAuthHeaders(init?.body ? { "Content-Type": "application/json" } : {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Não foi possível concluir.");
  return body as T;
}

export default function PedidosMedicosPage() {
  const { isCeo } = usePermissoes();
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [refusing, setRefusing] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [precos, setPrecos] = useState<Precos | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");

  const load = useCallback(async () => {
    try { setItems(await api<Item[]>("/fila")); setError(""); }
    catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!isCeo) return;
    api<Precos>("/precos").then((p) => {
      setPrecos(p);
      setDraft(Object.fromEntries(Object.entries(p.valores).map(([k, v]) => [k, v === null ? "" : String(v).replace(".", ",")])));
    }).catch((e) => setError((e as Error).message));
  }, [isCeo]);

  async function act(id: number, path: string, body?: unknown) {
    setBusyId(id); setError("");
    try {
      await api(`/${id}/${path}`, { method: "POST", body: JSON.stringify(body ?? {}) });
      setRefusing(null); setReason(""); await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusyId(null); }
  }

  async function savePrices() {
    setSaved(""); setError("");
    const payload: Record<string, number> = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v.trim() === "") continue;
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n)) { setError("Informe valores numéricos."); return; }
      payload[k] = n;
    }
    try {
      const p = await api<Precos>("/precos", { method: "PUT", body: JSON.stringify(payload) });
      setPrecos(p); setSaved("Valores salvos.");
    } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl">
      <header className="flex items-center gap-2">
        <Stethoscope className="w-6 h-6 text-accent" />
        <h1 className="text-xl font-black uppercase tracking-wider text-primary">Pedidos dos clientes</h1>
      </header>
      <p className="text-sm text-muted-foreground">
        Pedidos de receita e de exames já pagos. Você emite o documento no Cockpit, com o seu certificado, e depois marca aqui como emitido.
      </p>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}

      {isCeo && precos && (
        <section className="panel-3d-sub rounded-lg p-4 space-y-3">
          <h2 className="font-black uppercase tracking-wider text-sm text-primary">Valores cobrados do cliente</h2>
          <p className="text-xs text-muted-foreground">
            Sem valor definido, o cliente não consegue pedir. Mínimo de R$ {precos.minimo.toFixed(2).replace(".", ",")} por pedido.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {([["receita", "Receita"], ["pedido_exames", "Pedido de exames"]] as const).map(([k, label]) => (
              <label key={k} className="text-sm space-y-1 block">
                <span>{label} (R$)</span>
                <input inputMode="decimal" value={draft[k] ?? ""} placeholder="Não definido"
                  onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                  className="w-full rounded-md border border-border bg-background p-2" />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={savePrices} className="btn-3d px-5 h-10 text-xs font-black uppercase tracking-wider">Salvar valores</button>
            {saved && <span className="text-sm text-emerald-700">{saved}</span>}
          </div>
        </section>
      )}

      <section className="space-y-3">
        {items === null && !error && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
        {items?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido na fila.</p>}
        {(items ?? []).map((it) => {
          const mine = it.assignedProfessionalId !== null && !it.asResponsible;
          const canStart = it.status === "pago" && (mine || it.assignedProfessionalId === null);
          const canFinish = it.status === "em_analise" && mine;
          const aba = it.kind === "receita" ? "prescricao" : "exames";
          return (
            <article key={it.id} className="panel-3d-sub rounded-lg p-4 space-y-2">
              <div className="flex items-start gap-2">
                <FileText className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-primary text-sm">{it.kindLabel} · {it.clientName}</p>
                  <p className="text-xs text-muted-foreground">
                    {it.status === "pago" ? "Aguardando análise" : "Em análise"}
                    {it.assignedReason ? ` · ${REASON[it.assignedReason] ?? it.assignedReason}` : ""}
                  </p>
                </div>
              </div>
              <p className="text-sm break-words">{it.details}</p>
              {it.asResponsible && it.assignedProfessionalId !== null && (
                <p className="text-xs text-muted-foreground">Este pedido está com outro médico. Você o vê como responsável técnico.</p>
              )}
              <div className="flex flex-wrap gap-2">
                {canStart && (
                  <button type="button" disabled={busyId === it.id} onClick={() => act(it.id, "iniciar")}
                    className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider disabled:opacity-40">Iniciar análise</button>
                )}
                {canFinish && (
                  <>
                    <Link href={`/cockpit/${it.clientId}/${aba}`}
                      className="btn-3d-soft px-4 h-10 text-xs font-black uppercase tracking-wider inline-flex items-center">Abrir no Cockpit</Link>
                    <button type="button" disabled={busyId === it.id}
                      onClick={() => { if (window.confirm("Confirme que o documento já foi emitido e assinado no Cockpit.")) void act(it.id, "emitido"); }}
                      className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider disabled:opacity-40">Marcar como emitido</button>
                  </>
                )}
                {(canStart || canFinish) && mine && (
                  <button type="button" onClick={() => { setRefusing(refusing === it.id ? null : it.id); setReason(""); }}
                    className="btn-3d-soft px-4 h-10 text-xs font-black uppercase tracking-wider">Recusar</button>
                )}
              </div>
              {refusing === it.id && (
                <div className="space-y-2">
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000}
                    placeholder="Motivo da recusa (o cliente verá este texto). Mínimo de 10 caracteres."
                    className="w-full rounded-md border border-border bg-background p-2 text-sm" aria-label="Motivo da recusa" />
                  <p className="text-xs text-muted-foreground">A recusa deixa o reembolso pendente. O sistema não devolve o dinheiro sozinho.</p>
                  <button type="button" disabled={busyId === it.id || reason.trim().length < 10}
                    onClick={() => act(it.id, "recusar", { reason })}
                    className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider disabled:opacity-40">Confirmar recusa</button>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
}
