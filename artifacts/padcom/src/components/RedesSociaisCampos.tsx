/**
 * Submenu "Redes sociais" — usado no cadastro de clientes e de profissionais.
 * Um campo por rede (catálogo vem do servidor). Salva só o que está nesta aba, com botão próprio.
 */
import { useEffect, useState } from "react";
import { Share2 } from "lucide-react";
import { getCollabToken } from "@/lib/collab-auth";

const API = import.meta.env.BASE_URL + "api";
type Rede = { key: string; nome: string; exemplo: string };

export default function RedesSociaisCampos({ tipo, id, aoSalvar }: {
  tipo: "clients" | "professionals"; id: number; aoSalvar?: () => void;
}) {
  const [catalogo, setCatalogo] = useState<Rede[]>([]);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [somenteLeitura, setSomenteLeitura] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const url = `${API}/${tipo}/${id}/redes-sociais`;

  useEffect(() => {
    const token = getCollabToken();
    if (!token) { setMsg({ ok: false, texto: "Faça login de colaborador para ver as redes sociais." }); setCarregando(false); return; }
    const ac = new AbortController();
    setCarregando(true); setMsg(null);
    fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error(d?.error || "Não foi possível carregar as redes sociais.");
        setCatalogo(d.catalogo); setValores(d.redes || {}); setOriginal(d.redes || {}); setSomenteLeitura(d.somenteLeitura === true);
      })
      .catch((e: unknown) => { if (!ac.signal.aborted) setMsg({ ok: false, texto: e instanceof Error ? e.message : "Falha ao carregar." }); })
      .finally(() => { if (!ac.signal.aborted) setCarregando(false); });
    return () => ac.abort();
  }, [url]);

  const alterado = catalogo.some((r) => (valores[r.key] ?? "") !== (original[r.key] ?? ""));

  async function salvar() {
    const token = getCollabToken();
    if (!token || salvando) return;
    setSalvando(true); setMsg(null);
    const envio: Record<string, string> = {};
    catalogo.forEach((r) => { if ((valores[r.key] ?? "") !== (original[r.key] ?? "")) envio[r.key] = valores[r.key] ?? ""; });
    try {
      const r = await fetch(url, {
        method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ redes: envio }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error || "O servidor não confirmou o salvamento.");
      setValores(d.redes || {}); setOriginal(d.redes || {});
      setMsg({ ok: true, texto: "Redes sociais salvas." });
      aoSalvar?.();
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : "Falha ao salvar." });
    } finally { setSalvando(false); }
  }

  return (
    <div className="panel-3d-sub p-5 space-y-5 relative overflow-visible" data-testid="redes-sociais">
      <div className="bevel-3d px-3 py-1.5 uppercase tracking-widest text-[10px] font-extrabold inline-flex items-center gap-2 absolute -top-3 left-4">
        <Share2 className="h-3 w-3 text-primary" /> Redes sociais
      </div>
      {carregando && <p role="status" className="text-sm pt-2">Carregando redes sociais…</p>}
      {somenteLeitura && <p className="text-sm font-bold pt-2">Este cadastro é o celular oficial da empresa: somente leitura.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
        {catalogo.map((r) => (
          <label key={r.key} className="block space-y-1.5">
            <span className="uppercase tracking-widest text-[10px] font-extrabold text-muted-foreground">{r.nome}</span>
            <input
              className="field-engraved w-full h-10 px-3 text-sm" maxLength={200} placeholder={r.exemplo}
              value={valores[r.key] ?? ""} disabled={somenteLeitura || salvando}
              onChange={(e) => { setValores((v) => ({ ...v, [r.key]: e.target.value })); setMsg(null); }}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void salvar()} disabled={!alterado || salvando || somenteLeitura}
          className="btn-3d h-10 px-5 text-[11px] font-black uppercase tracking-wider disabled:opacity-50">
          {salvando ? "Salvando…" : "Salvar redes sociais"}
        </button>
        {msg && <span role={msg.ok ? "status" : "alert"} className={`text-[12px] font-bold ${msg.ok ? "text-emerald-700" : "text-destructive"}`}>{msg.texto}</span>}
      </div>
    </div>
  );
}
