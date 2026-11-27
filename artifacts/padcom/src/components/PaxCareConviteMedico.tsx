import { useCallback, useEffect, useState } from "react";
import { Stethoscope, Copy } from "lucide-react";

// PAXCARE: o paciente convida um médico (acesso individual, por categoria e prazo). Sem envio automático:
// o link aparece uma vez e o próprio paciente o entrega. O id do paciente nunca é enviado: vem do token.
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/area-paciente/paxcare/convites-medico`;
type Comp = { historico: boolean; exames: boolean; documentos: boolean };
type Conv = { id: number; medico: string; email: string; status: string; expiraEm: string; acessoAte: string | null; compartilha: Comp };
const ROT: Record<string, string> = { pendente: "Aguardando o médico", aceito: "Aceito", recusado: "Recusado", revogado: "Revogado", expirado: "Expirado" };
const CATS: { k: keyof Comp; l: string }[] = [{ k: "historico", l: "Histórico" }, { k: "exames", l: "Exames" }, { k: "documentos", l: "Documentos" }];
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

export default function PaxCareConviteMedico({ token }: { token: string }) {
  const auth = { Authorization: `Bearer ${token}` };
  const [lista, setLista] = useState<Conv[]>([]);
  const [termo, setTermo] = useState<{ texto: string; hash: string } | null>(null);
  const [msg, setMsg] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [link, setLink] = useState("");
  const [f, setF] = useState({ medicoNome: "", medicoEmail: "", conselho: "", uf: "", validadeDias: 7, acessoDias: 30 });
  const [comp, setComp] = useState<Comp>({ historico: false, exames: false, documentos: false });
  const [aceite, setAceite] = useState(false);
  const [revogando, setRevogando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([fetch(API, { headers: auth }), fetch(`${API}/termo`, { headers: auth })]);
      if (!a.ok || !b.ok) throw new Error(a.status === 401 ? "Sessão expirada. Entre novamente." : "Não foi possível carregar os convites a médicos.");
      setLista(await a.json()); setTermo(await b.json());
    } catch (e) { setMsg((e as Error).message); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { void carregar(); }, [carregar]);

  const alguma = comp.historico || comp.exames || comp.documentos;
  const pronto = f.medicoNome.trim().length >= 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.medicoEmail) && /^\d{3,8}$/.test(f.conselho) && f.uf.trim().length === 2 && alguma && aceite;

  async function criar() {
    if (ocupado || !pronto || !termo) return;
    setOcupado(true); setMsg(""); setLink("");
    try {
      const r = await fetch(API, { method: "POST", headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, medicoNome: f.medicoNome.trim(), medicoEmail: f.medicoEmail.trim(), uf: f.uf.trim(), compartilha: comp, consentimentoHash: termo.hash }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Não foi possível criar o convite.");
      setLink(`${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/paxcare-convite/${d.token}`);
      setF({ ...f, medicoNome: "", medicoEmail: "", conselho: "", uf: "" }); setComp({ historico: false, exames: false, documentos: false }); setAceite(false);
      await carregar();
    } catch (e) { setMsg((e as Error).message); } finally { setOcupado(false); }
  }
  async function revogar(id: number) {
    const r = await fetch(`${API}/${id}`, { method: "DELETE", headers: auth });
    setRevogando(null);
    if (!r.ok) setMsg("Não foi possível revogar."); else { setMsg(""); await carregar(); }
  }

  const campo = "w-full min-h-[44px] rounded-md border bg-background px-3 text-sm";
  return (
    <section className="panel-3d rounded-xl p-4 space-y-3" aria-label="Convidar um médico" data-testid="convite-medico-paciente">
      <h3 className="text-primary font-black text-xs uppercase tracking-widest flex items-center gap-2"><Stethoscope className="w-4 h-4" />Convidar um médico</h3>
      <p className="text-xs text-muted-foreground">O médico vê só o que você marcar, só pelo prazo escolhido. Nenhuma mensagem é enviada: você entrega o link.</p>
      <div role="alert" className="min-h-[20px] text-xs text-red-600">{msg}</div>
      <div className="concave-3d rounded-lg p-3 space-y-2">
        <input aria-label="Nome do médico" placeholder="Nome do médico" value={f.medicoNome} maxLength={120} onChange={(e) => setF({ ...f, medicoNome: e.target.value })} className={campo} />
        <input aria-label="E-mail do médico" type="email" placeholder="E-mail do médico" value={f.medicoEmail} onChange={(e) => setF({ ...f, medicoEmail: e.target.value })} className={campo} />
        <div className="flex gap-2">
          <input aria-label="Número do CRM" inputMode="numeric" placeholder="CRM (só números)" value={f.conselho} onChange={(e) => setF({ ...f, conselho: e.target.value.replace(/\D/g, "").slice(0, 8) })} className={campo} />
          <input aria-label="UF do CRM" placeholder="UF" value={f.uf} maxLength={2} onChange={(e) => setF({ ...f, uf: e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase() })} className={`${campo} max-w-[80px]`} />
        </div>
        <div className="flex flex-wrap gap-2">
          {CATS.map((c) => (
            <label key={c.k} className="flex items-center gap-2 min-h-[44px] px-2 text-xs"><input type="checkbox" checked={comp[c.k]} onChange={() => setComp({ ...comp, [c.k]: !comp[c.k] })} />{c.l}</label>
          ))}
        </div>
        <div className="flex gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest flex-1">Convite vale (dias)
            <input type="number" min={1} max={30} value={f.validadeDias} onChange={(e) => setF({ ...f, validadeDias: Math.min(30, Math.max(1, Number(e.target.value) || 1)) })} className={campo} /></label>
          <label className="text-[10px] font-black uppercase tracking-widest flex-1">Acesso dura (dias)
            <input type="number" min={1} max={365} value={f.acessoDias} onChange={(e) => setF({ ...f, acessoDias: Math.min(365, Math.max(1, Number(e.target.value) || 1)) })} className={campo} /></label>
        </div>
        {termo && <p className="text-xs leading-snug" data-testid="termo-convite">{termo.texto}</p>}
        <label className="flex items-start gap-2 min-h-[44px] text-xs"><input type="checkbox" checked={aceite} onChange={() => setAceite(!aceite)} className="mt-1" />Li e autorizo.</label>
        <button disabled={!pronto || ocupado} onClick={() => void criar()} className="btn-3d w-full min-h-[44px] text-xs font-black uppercase tracking-widest disabled:opacity-40">{ocupado ? "Criando…" : "Criar convite"}</button>
        <div className="min-h-[64px]">
          {link && (
            <div className="space-y-1" data-testid="link-convite">
              <p className="text-xs font-black">Link do convite (aparece só agora):</p>
              <p className="text-[11px] break-all select-all">{link}</p>
              <button className="text-accent text-xs underline min-h-[44px] flex items-center gap-1" onClick={() => void navigator.clipboard?.writeText(link)}><Copy className="w-3 h-3" />Copiar</button>
            </div>
          )}
        </div>
      </div>
      {lista.length === 0 && <p className="text-xs text-muted-foreground">Você ainda não convidou nenhum médico.</p>}
      {lista.map((c) => (
        <div key={c.id} className="concave-3d rounded-lg p-3 space-y-1" data-testid={`meu-convite-${c.id}`}>
          <p className="text-primary font-black text-sm break-words">{c.medico}</p>
          <p className="text-xs text-muted-foreground break-words">{c.email} · {CATS.filter((x) => c.compartilha[x.k]).map((x) => x.l).join(", ")}</p>
          <p className="text-xs">{ROT[c.status] ?? c.status} · convite até {fmt(c.expiraEm)}{c.acessoAte ? ` · acesso até ${fmt(c.acessoAte)}` : ""}</p>
          {(c.status === "pendente" || c.status === "aceito") && (revogando === c.id ? (
            <div className="flex gap-2 items-center text-xs flex-wrap">
              <span>Retirar o acesso agora?</span>
              <button className="btn-3d px-3 min-h-[44px] text-xs font-black uppercase" onClick={() => void revogar(c.id)}>Sim, retirar</button>
              <button className="text-accent underline min-h-[44px]" onClick={() => setRevogando(null)}>Cancelar</button>
            </div>
          ) : <button className="text-accent text-[10px] font-black uppercase tracking-widest underline min-h-[44px]" onClick={() => setRevogando(c.id)}>Revogar</button>)}
        </div>
      ))}
    </section>
  );
}
