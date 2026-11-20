import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { AlertTriangle, CheckCircle2, Download, Eye, FileSignature, Loader2, Pencil, RotateCcw, Send, Stethoscope } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Item = {
  id: number; kind: "receita" | "pedido_exames"; kindLabel: string; clientId: number; clientName: string;
  details: string; status: "pago" | "em_analise" | "emitido"; paidAt: string | null; createdAt: string;
  isento: boolean; draftItems: string | null; docToken: string | null;
  docSendStatus: string | null; docSentAt: string | null; docSendError: string | null;
  assignedProfessionalId: number | null; assignedReason: string | null; asResponsible: boolean;
};

const REASON: Record<string, string> = {
  habitual: "Médico habitual do cliente",
  responsavel_tecnico: "Encaminhado ao responsável técnico",
  sem_destino: "Sem médico apto: aguardando o responsável técnico",
  encaminhado: "Encaminhado pelo responsável técnico",
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api/pedidos-medicos${path}`, {
    ...init, headers: collabAuthHeaders(init?.body ? { "Content-Type": "application/json" } : {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Não foi possível concluir.");
  return body as T;
}

const linhas = (t: string | null | undefined) =>
  String(t ?? "").split(/\r?\n/).map((l) => l.replace(/^[\s\-•*\d.)]+/, "").trim()).filter(Boolean);

function Etapa({ titulo, n, cor, ativo, pulsa }: { titulo: string; n: number; cor: "red" | "gold" | "green"; ativo: boolean; pulsa?: boolean }) {
  const borda = cor === "red" ? "border-red-600 text-red-700" : cor === "gold" ? "border-amber-600 text-amber-800" : "border-emerald-700 text-emerald-800";
  return (
    <div className={`flex-1 min-w-[9rem] rounded-lg border-2 bg-background px-4 py-3 ${borda} ${ativo ? "shadow-md" : "opacity-60"} ${pulsa && ativo ? "animate-pulse" : ""}`}>
      <p className="text-[11px] font-black uppercase tracking-widest">{titulo}</p>
      <p className="text-3xl font-black leading-none mt-1">{n}</p>
    </div>
  );
}

export function FilaPedidos() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [texto, setTexto] = useState("");
  const [refusing, setRefusing] = useState<number | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try { setItems(await api<Item[]>("/fila")); setError(""); } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const pendentes = useMemo(() => (items ?? []).filter((i) => i.status !== "emitido"), [items]);
  const emitidos = useMemo(() => (items ?? []).filter((i) => i.status === "emitido"), [items]);
  const atencao = emitidos.filter((i) => i.docSendStatus === "falha" || !i.docToken).length;

  async function run(id: number, fn: () => Promise<unknown>, okMsg?: string) {
    setBusy(id); setError(""); setInfo("");
    try { await fn(); if (okMsg) setInfo(okMsg); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  }

  async function previa(id: number) {
    setError("");
    const res = await fetch(`${BASE}/api/pedidos-medicos/${id}/previa`, { headers: collabAuthHeaders() });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? "Não foi possível gerar a prévia."); return; }
    const url = URL.createObjectURL(await res.blob());
    window.open(url, "_blank", "noopener");
  }

  const baixar = (token: string) => window.open(`${BASE}/api/exam-requests/file/${token}`, "_blank", "noopener");

  return (
    <section className="space-y-4" aria-label="Linha de produção dos pedidos">
      <div className="flex flex-wrap gap-3">
        <Etapa titulo="Pendente de você" n={pendentes.length} cor="red" ativo={pendentes.length > 0} pulsa />
        <Etapa titulo="Assinado e enviado" n={emitidos.filter((i) => i.docSendStatus === "enviado").length} cor="green" ativo />
        <Etapa titulo="Exige atenção" n={atencao} cor="gold" ativo={atencao > 0} />
      </div>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
      {info && <p role="status" className="text-sm text-emerald-700">{info}</p>}
      {items === null && !error && <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />}
      {items?.length === 0 && <p className="text-sm text-muted-foreground">Nenhum pedido na linha de produção.</p>}

      {pendentes.map((it) => {
        const mine = it.assignedProfessionalId !== null && !it.asResponsible;
        const exames = it.kind === "pedido_exames";
        const itens = linhas(it.draftItems ?? it.details);
        const aba = it.kind === "receita" ? "prescricao" : "exames";
        return (
          <article key={it.id} className="relative overflow-hidden rounded-lg border-2 border-red-600 panel-3d-sub p-4 pl-6 space-y-3">
            <span className="absolute left-0 top-0 bottom-0 w-2 bg-red-600" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-red-600 text-white text-[11px] font-black uppercase tracking-widest px-2 py-0.5">Pendente</span>
              <span className="rounded border border-primary/40 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 text-primary">
                {it.isento ? "Isento por benefício Member" : "Pago"}
              </span>
              <Stethoscope className="w-4 h-4 text-accent ml-auto" />
            </div>
            <div>
              <p className="font-semibold text-primary">{it.kindLabel} · {it.clientName}</p>
              <p className="text-xs text-muted-foreground">{it.assignedReason ? REASON[it.assignedReason] ?? it.assignedReason : ""}</p>
            </div>

            {exames ? (
              editing === it.id ? (
                <div className="space-y-2">
                  <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={5} aria-label="Itens do pedido, um por linha"
                    className="w-full rounded-md border border-border bg-background p-2 text-sm" />
                  <p className="text-xs text-muted-foreground">Um exame por linha. O documento sai exatamente com esta lista.</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy === it.id || linhas(texto).length === 0} className="btn-3d px-4 h-9 text-xs font-black uppercase tracking-wider disabled:opacity-40"
                      onClick={() => run(it.id, async () => { await api(`/${it.id}/itens`, { method: "PUT", body: JSON.stringify({ itens: linhas(texto) }) }); setEditing(null); }, "Itens salvos.")}>Salvar itens</button>
                    <button type="button" className="btn-3d-soft px-4 h-9 text-xs font-black uppercase tracking-wider" onClick={() => setEditing(null)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-background/70 border border-border p-3">
                  <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-1">Pré-pronto: itens do documento</p>
                  <ol className="list-decimal pl-5 text-sm space-y-0.5">{itens.map((l, i) => <li key={i} className="break-words">{l}</li>)}</ol>
                </div>
              )
            ) : <p className="text-sm break-words">{it.details}</p>}

            <div className="flex flex-wrap items-center gap-2">
              {exames && mine && (
                <>
                  <button type="button" title="Ver prévia (sem certificado)" aria-label="Ver prévia" onClick={() => void previa(it.id)}
                    className="btn-3d-soft h-10 w-10 inline-flex items-center justify-center"><Eye className="w-4 h-4" /></button>
                  <button type="button" title="Editar itens" aria-label="Editar itens" onClick={() => { setEditing(it.id); setTexto(itens.join("\n")); }}
                    className="btn-3d-soft h-10 w-10 inline-flex items-center justify-center"><Pencil className="w-4 h-4" /></button>
                  <button type="button" disabled={busy === it.id}
                    onClick={() => { if (window.confirm(`Assinar com o seu certificado digital e enviar a ${it.clientName}?`)) void run(it.id, async () => {
                      const r = await api<{ envio: { status: string; error: string | null } }>(`/${it.id}/assinar-enviar`, { method: "POST", body: "{}" });
                      if (r.envio.status !== "enviado") throw new Error(`Documento assinado e salvo, mas o envio falhou: ${r.envio.error ?? "motivo não informado"}. Use Reenviar.`);
                    }, "Assinado e enviado ao cliente."); }}
                    className="btn-3d px-5 h-10 text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 disabled:opacity-40">
                    {busy === it.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />} Assinar e enviar
                  </button>
                </>
              )}
              {!exames && mine && (
                <>
                  <Link href={`/cockpit/${it.clientId}/${aba}`} className="btn-3d-soft px-4 h-10 text-xs font-black uppercase tracking-wider inline-flex items-center">Abrir no Cockpit</Link>
                  <button type="button" disabled={busy === it.id} className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider disabled:opacity-40"
                    onClick={() => { if (window.confirm("Confirme que a receita já foi emitida e assinada no Cockpit.")) void run(it.id, async () => {
                      if (it.status === "pago") await api(`/${it.id}/iniciar`, { method: "POST", body: "{}" });
                      await api(`/${it.id}/emitido`, { method: "POST", body: "{}" }); }); }}>Marcar receita como emitida</button>
                </>
              )}
              {mine && (
                <button type="button" onClick={() => { setRefusing(refusing === it.id ? null : it.id); setReason(""); }}
                  className="btn-3d-soft px-4 h-10 text-xs font-black uppercase tracking-wider ml-auto">Recusar</button>
              )}
              {it.asResponsible && it.assignedProfessionalId !== null && (
                <p className="text-xs text-muted-foreground">Com outro médico. Você o vê como responsável técnico.</p>
              )}
              {it.assignedProfessionalId === null && (
                <button type="button" className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider" onClick={() => run(it.id, () => api(`/${it.id}/iniciar`, { method: "POST", body: "{}" }))}>Assumir pedido</button>
              )}
            </div>
            {refusing === it.id && (
              <div className="space-y-2">
                <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} maxLength={1000} aria-label="Motivo da recusa"
                  placeholder="Motivo da recusa (o cliente verá este texto). Mínimo de 10 caracteres." className="w-full rounded-md border border-border bg-background p-2 text-sm" />
                <p className="text-xs text-muted-foreground">A recusa deixa o reembolso pendente. O sistema não devolve o dinheiro sozinho.</p>
                <button type="button" disabled={busy === it.id || reason.trim().length < 10} className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider disabled:opacity-40"
                  onClick={() => run(it.id, async () => { await api(`/${it.id}/recusar`, { method: "POST", body: JSON.stringify({ reason }) }); setRefusing(null); })}>Confirmar recusa</button>
              </div>
            )}
          </article>
        );
      })}

      {emitidos.length > 0 && <h2 className="font-black uppercase tracking-wider text-sm text-primary pt-2">Concluídos nos últimos 30 dias</h2>}
      {emitidos.map((it) => {
        const semDoc = !it.docToken;
        const falha = it.docSendStatus === "falha";
        return (
          <article key={it.id} className={`rounded-lg border-2 p-4 space-y-2 panel-3d-sub ${semDoc || falha ? "border-amber-600" : "border-emerald-700"}`}>
            <div className="flex flex-wrap items-center gap-2">
              {semDoc ? <AlertTriangle className="w-4 h-4 text-amber-700" /> : falha ? <AlertTriangle className="w-4 h-4 text-amber-700" /> : <CheckCircle2 className="w-4 h-4 text-emerald-700" />}
              <p className="font-semibold text-primary text-sm">{it.kindLabel} · {it.clientName}</p>
              <span className="ml-auto text-[11px] font-black uppercase tracking-widest">
                {semDoc ? "Marcado como emitido, sem documento" : falha ? "Assinado, envio falhou" : "Assinado e enviado"}
              </span>
            </div>
            {falha && it.docSendError && <p className="text-xs text-muted-foreground">Motivo: {it.docSendError}</p>}
            <div className="flex gap-2">
              {it.docToken && (
                <button type="button" title="Baixar documento assinado" aria-label="Baixar documento assinado" onClick={() => baixar(it.docToken!)}
                  className="btn-3d-soft h-10 w-10 inline-flex items-center justify-center"><Download className="w-4 h-4" /></button>
              )}
              {falha && (
                <button type="button" disabled={busy === it.id} onClick={() => run(it.id, async () => {
                  const r = await api<{ envio: { status: string; error: string | null } }>(`/${it.id}/reenviar`, { method: "POST", body: "{}" });
                  if (r.envio.status !== "enviado") throw new Error(r.envio.error ?? "O envio falhou de novo.");
                }, "Reenviado ao cliente.")} className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider inline-flex items-center gap-2"><Send className="w-4 h-4" /> Reenviar</button>
              )}
              {semDoc && it.kind === "pedido_exames" && (
                <button type="button" disabled={busy === it.id} onClick={() => run(it.id, () => api(`/${it.id}/reabrir`, { method: "POST", body: "{}" }), "Pedido reaberto na linha de produção.")}
                  className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider inline-flex items-center gap-2"><RotateCcw className="w-4 h-4" /> Reabrir</button>
              )}
            </div>
          </article>
        );
      })}
    </section>
  );
}
