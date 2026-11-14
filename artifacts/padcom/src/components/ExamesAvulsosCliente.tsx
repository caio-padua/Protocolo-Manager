import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Loader2, Search, X } from "lucide-react";

// Exames avulsos na Area do Cliente: escolher, pedir informacoes e orcamento.
// NAO e prescricao: a indicacao depende de avaliacao profissional.

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Exame = { codigo: string; nome: string; grupo: string | null; modalidade?: string | null; preparo: string | null };
type Solic = {
  id: number; status: string; items: Exame[]; notes: string | null; createdAt: string;
  quoteAmount: number | null; quoteNote: string | null; aviso: string;
};
const STATUS: Record<string, string> = {
  solicitado: "Aguardando o orçamento da clínica",
  orcamento_enviado: "Orçamento disponível",
  aceito: "Orçamento aceito",
  cancelado: "Cancelado",
};
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const AVISO = "A indicação depende de avaliação profissional. Escolher exames aqui não é prescrição.";

export default function ExamesAvulsosCliente({ token }: { token: string }) {
  const [list, setList] = useState<Solic[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Exame[]>([]);
  const [chosen, setChosen] = useState<Exame[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API_BASE}/api/area-paciente/exames-avulsos${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { "Content-Type": "application/json" } : {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(res.status === 401 ? "Sessão expirada. Entre novamente." : body.error ?? "Não foi possível concluir.");
    return body;
  }, [token]);

  const load = useCallback(async () => {
    try { setList(await call("")); setError(""); } catch (e) { setError((e as Error).message); }
  }, [call]);
  useEffect(() => { void load(); }, [load]);

  // Busca com espera (debounce) de 350 ms.
  useEffect(() => {
    if (q.trim().length < 2) { setFound([]); return; }
    const t = window.setTimeout(async () => {
      try { setFound((await call(`/catalogo?q=${encodeURIComponent(q.trim())}`)).itens); }
      catch (e) { setError((e as Error).message); }
    }, 350);
    return () => window.clearTimeout(t);
  }, [q, call]);

  async function send() {
    setBusy(true); setError("");
    try {
      await call("", { method: "POST", body: JSON.stringify({ codigos: chosen.map((c) => c.codigo), ...(notes.trim() ? { notes } : {}) }) });
      setChosen([]); setNotes(""); setQ(""); setOpen(false); await load();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function act(id: number, path: "aceitar" | "cancelar") {
    setBusy(true); setError("");
    try { await call(`/${id}/${path}`, { method: "POST", body: JSON.stringify(path === "aceitar" ? { confirmo: true } : {}) }); await load(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <section className="panel-3d-sub rounded-lg p-4 space-y-3" aria-labelledby="ea-titulo">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-5 h-5 text-accent" />
        <h2 id="ea-titulo" className="text-primary font-black uppercase tracking-wider text-sm flex-1">Exames avulsos: informações e orçamento</h2>
        {!open && <button type="button" onClick={() => setOpen(true)} className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider">Escolher exames</button>}
      </div>
      <p className="text-muted-foreground text-xs">{AVISO}</p>
      {error && <p role="alert" className="text-destructive text-sm">{error}</p>}

      {open && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 h-11">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar exame pelo nome (mínimo 2 letras)" aria-label="Buscar exame"
              className="flex-1 bg-transparent text-sm outline-none" />
          </label>
          {found.length > 0 && (
            <ul className="max-h-56 overflow-auto space-y-1">
              {found.filter((f) => !chosen.some((c) => c.codigo === f.codigo)).map((f) => (
                <li key={f.codigo}>
                  <button type="button" disabled={chosen.length >= 20} onClick={() => setChosen((c) => [...c, f])}
                    className="w-full text-left rounded-md border border-border px-3 py-2 text-sm hover:bg-muted">
                    <span className="font-semibold">{f.nome}</span>
                    {f.grupo && <span className="text-muted-foreground text-xs"> · {f.grupo}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {chosen.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Exames escolhidos">
              {chosen.map((c) => (
                <li key={c.codigo} className="bevel-3d inline-flex items-center gap-1 px-2 py-1 text-xs">
                  {c.nome}
                  <button type="button" aria-label={`Remover ${c.nome}`} onClick={() => setChosen((x) => x.filter((y) => y.codigo !== c.codigo))}><X className="w-3 h-3" /></button>
                </li>
              ))}
            </ul>
          )}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} aria-label="Dúvidas ou informações que deseja"
            placeholder="Opcional: dúvidas sobre preparo, prazo ou o que deseja saber."
            className="w-full rounded-md border border-border bg-background p-3 text-sm" />
          <div className="flex gap-2">
            <button type="button" disabled={busy || chosen.length === 0} onClick={send}
              className="btn-3d flex-1 h-11 text-xs font-black uppercase tracking-wider disabled:opacity-40">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `Pedir informações e orçamento (${chosen.length})`}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-3d-soft px-4 h-11 text-xs font-black uppercase tracking-wider">Fechar</button>
          </div>
        </div>
      )}

      {list === null && !error && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      {list?.length === 0 && !open && <p className="text-muted-foreground text-sm">Você ainda não pediu orçamento de exames.</p>}
      <ul className="space-y-2">
        {(list ?? []).filter((s) => s.status !== "cancelado").map((s) => (
          <li key={s.id} className="rounded-lg border border-border p-3 space-y-2">
            <p className="text-primary font-semibold text-sm">{STATUS[s.status] ?? s.status}{s.quoteAmount !== null ? ` · ${brl(s.quoteAmount)}` : ""}</p>
            <p className="text-sm break-words">{s.items.map((i) => i.nome).join(", ")}</p>
            {s.quoteNote && <p className="text-sm"><strong>Observação da clínica:</strong> {s.quoteNote}</p>}
            {s.status === "orcamento_enviado" && (
              <p className="text-muted-foreground text-xs">Ao aceitar, a clínica segue com a avaliação profissional e combina o pagamento. Nenhuma cobrança é feita agora.</p>
            )}
            <div className="flex flex-wrap gap-2">
              {s.status === "orcamento_enviado" && (
                <button type="button" disabled={busy} onClick={() => act(s.id, "aceitar")} className="btn-3d px-4 h-10 text-xs font-black uppercase tracking-wider disabled:opacity-40">Aceitar o orçamento</button>
              )}
              {(s.status === "solicitado" || s.status === "orcamento_enviado") && (
                <button type="button" disabled={busy} onClick={() => act(s.id, "cancelar")} className="btn-3d-soft px-4 h-10 text-xs font-black uppercase tracking-wider disabled:opacity-40">Cancelar</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
