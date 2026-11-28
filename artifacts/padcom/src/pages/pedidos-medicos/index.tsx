import { useCallback, useEffect, useState } from "react";
import "./pedidos-tecido.css";
import { BarraGrupo } from "@/components/ui/barra-grupo";
import { PlacaTitulo } from "@/components/ui/placa-titulo";
import { SanfonaVertical } from "@/components/ui/sanfona-vertical";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { usePermissoes } from "@/lib/permissoes";
import { SegundasVias } from "./SegundasVias";
import { FilaPedidos } from "./FilaPedidos";

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

type Avulso = {
  id: number; clientName: string; status: string; items: Array<{ codigo: string; nome: string }>; notes: string | null;
  quoteAmount: number | null; quoteNote: string | null;
};

// Orcamentos de exames avulsos: so o titular informa/edita o valor e publica (confirmacao explicita).
function ExamesAvulsosFila() {
  const [rows, setRows] = useState<Avulso[] | null>(null);
  const [draft, setDraft] = useState<Record<number, { valor: string; nota: string }>>({});
  const [msg, setMsg] = useState("");
  const [hidden, setHidden] = useState(false);
  const [aberto, setAberto] = useState(true);
  const load = useCallback(async () => {
    const res = await fetch(`${BASE}/api/exames-avulsos/fila`, { headers: collabAuthHeaders() });
    if (res.status === 403 || res.status === 401) { setHidden(true); return; }
    if (res.ok) setRows(await res.json());
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (hidden) return null;
  async function publish(a: Avulso) {
    const d = draft[a.id];
    const valor = Number((d?.valor ?? "").replace(",", "."));
    if (!Number.isFinite(valor) || valor <= 0) { setMsg("Informe um valor maior que zero."); return; }
    if (!window.confirm(`Enviar o orçamento de ${valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para ${a.clientName}? O cliente passa a ver este valor no aplicativo.`)) return;
    const res = await fetch(`${BASE}/api/exames-avulsos/${a.id}/orcamento`, {
      method: "PUT", headers: collabAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ valor, nota: d?.nota || undefined, confirmo: true }),
    });
    const b = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Orçamento enviado ao cliente." : b.error ?? "Não foi possível enviar o orçamento.");
    await load();
  }
  return (
    <section className="panel-3d p-4 space-y-3" aria-label="Exames avulsos">
      <BarraGrupo titulo="Exames avulsos: orçamento para o cliente" aberto={aberto} onAlternar={() => setAberto(!aberto)} />
      <SanfonaVertical aberta={aberto}><div className="space-y-3 pt-1">
      <p className="text-xs text-muted-foreground">O cliente escolheu exames sem pedido médico. Você informa o valor e envia o orçamento. O cliente vê o valor no aplicativo e decide se aceita. Você pode corrigir o valor até ele aceitar.</p>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {rows?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma solicitação.</p>}
      {(rows ?? []).map((a) => (
        <article key={a.id} className="panel-3d-sub rounded-lg p-4 space-y-2">
          <p className="font-semibold text-primary text-sm">{a.clientName} · {a.status === "solicitado" ? "Aguardando orçamento" : a.status === "orcamento_enviado" ? "Orçamento enviado ao cliente" : "Aceito pelo cliente"}</p>
          <p className="text-sm break-words">{a.items.map((i) => i.nome).join(", ")}</p>
          {a.notes && <p className="text-sm text-muted-foreground">Observação do cliente: {a.notes}</p>}
          {a.status !== "aceito" && (
            <div className="grid sm:grid-cols-[10rem_1fr_auto] gap-2 items-end">
              <label className="text-xs space-y-1 block"><span>Valor (R$)</span>
                <input inputMode="decimal" value={draft[a.id]?.valor ?? (a.quoteAmount !== null ? String(a.quoteAmount).replace(".", ",") : "")}
                  onChange={(e) => setDraft((d) => ({ ...d, [a.id]: { valor: e.target.value, nota: d[a.id]?.nota ?? a.quoteNote ?? "" } }))}
                  className="w-full rounded-md border border-border bg-background p-2" /></label>
              <label className="text-xs space-y-1 block"><span>Observação ao cliente (opcional)</span>
                <input maxLength={500} value={draft[a.id]?.nota ?? a.quoteNote ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [a.id]: { valor: d[a.id]?.valor ?? (a.quoteAmount !== null ? String(a.quoteAmount).replace(".", ",") : ""), nota: e.target.value } }))}
                  className="w-full rounded-md border border-border bg-background p-2" /></label>
              <button type="button" onClick={() => publish(a)} className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider">Enviar orçamento ao cliente</button>
            </div>
          )}
          {a.status === "aceito" && a.quoteAmount !== null && <p className="text-sm">Valor aceito: {a.quoteAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Cobrança e emissão seguem o fluxo próprio.</p>}
        </article>
      ))}
      </div></SanfonaVertical>
    </section>
  );
}

export default function PedidosMedicosPage() {
  const { isCeo } = usePermissoes();
  const [error, setError] = useState("");
  const [precos, setPrecos] = useState<Precos | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState("");
  const [abertoPrecos, setAbertoPrecos] = useState(false);

  useEffect(() => {
    if (!isCeo) return;
    api<Precos>("/precos").then((p) => {
      setPrecos(p);
      setDraft(Object.fromEntries(Object.entries(p.valores).map(([k, v]) => [k, v === null ? "" : String(v).replace(".", ",")])));
    }).catch((e) => setError((e as Error).message));
  }, [isCeo]);

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
    <div className="pm-tecido">
      <div className="space-y-4 max-w-6xl mx-auto">
        <header className="panel-3d p-4 space-y-2">
          <PlacaTitulo titulo="Curadoria Clínica" />
          <p className="text-sm text-muted-foreground">
            Cada pedido chega pré-pronto. Veja a prévia, confira os itens e assine e envie num clique, com o seu certificado digital.
          </p>
        </header>
        {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        <FilaPedidos />
        {isCeo && precos && (
          <section className="panel-3d p-4 space-y-3">
            <BarraGrupo titulo="Valores cobrados do cliente" aberto={abertoPrecos} onAlternar={() => setAbertoPrecos(!abertoPrecos)} />
            <SanfonaVertical aberta={abertoPrecos}><div className="space-y-3 pt-1">
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
                {saved && <span className="text-sm text-primary">{saved}</span>}
              </div>
            </div></SanfonaVertical>
          </section>
        )}
        <ExamesAvulsosFila />
        {isCeo && <section className="panel-3d p-4"><SegundasVias /></section>}
      </div>
    </div>
  );
}
