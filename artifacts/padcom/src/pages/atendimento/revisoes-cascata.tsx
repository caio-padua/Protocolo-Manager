import { useCallback, useEffect, useState } from "react";
import { apiJson } from "@/lib/api-fetch";

type Revisao = {
  id: number; canal: string; pergunta_resumo: string; acao: string; estagio: string | null; motivo: string | null; intencao: string | null;
  resposta_proposta: string | null; parecer1: unknown; parecer2: unknown; parecer3: unknown; estado: string; criada_em: string;
};
const texto = (p: unknown): string => (p == null ? "—" : typeof p === "string" ? p : ((p as { resposta?: string; texto?: string }).resposta ?? (p as { texto?: string }).texto ?? JSON.stringify(p)));

/** Revisão humana da cascata de 3 IAs: compara os pareceres lado a lado. Nada é enviado por esta tela. */
export default function RevisoesCascataPage() {
  const [estado, setEstado] = useState("pendente"); const [itens, setItens] = useState<Revisao[]>([]); const [msg, setMsg] = useState<string | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [form, setForm] = useState({ gatilho: "", resposta: "", confirmar: false, motivo: "" });
  const carregar = useCallback(async () => {
    try { setItens((await apiJson<{ itens: Revisao[] }>(`/atendimento/cascata/revisoes?estado=${estado}`)).itens); }
    catch (e) { setMsg((e as Error).message); }
  }, [estado]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function ratificar(r: Revisao) {
    try { await apiJson(`/atendimento/cascata/revisoes/${r.id}/ratificar`, { method: "POST", body: JSON.stringify({ confirmar: form.confirmar, gatilho: form.gatilho, resposta: form.resposta, intencao: r.intencao }) }); setMsg("Ratificada."); setAberta(null); await carregar(); }
    catch (e) { setMsg((e as Error).message); }
  }
  async function retificar(r: Revisao) {
    try { await apiJson(`/atendimento/cascata/revisoes/${r.id}/retificar`, { method: "POST", body: JSON.stringify({ motivo: form.motivo }) }); setMsg("Retificada. Nenhuma mensagem foi enviada."); setAberta(null); await carregar(); }
    catch (e) { setMsg((e as Error).message); }
  }
  return (
    <div className="space-y-4" data-testid="revisoes-cascata">
      <h1 className="text-3xl font-bold tracking-tight">Revisões da Cascata de 3 IAs</h1>
      <p className="text-muted-foreground">Compare os três pareceres. Ratificar cria uma resposta aprovada; Retificar desativa e mantém o rascunho para envio humano. Exige administrador.</p>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <select className="h-9 rounded-md border bg-background px-2" value={estado} onChange={(e) => setEstado(e.target.value)}>
        <option value="pendente">Pendentes</option><option value="ratificada">Ratificadas</option><option value="retificada">Retificadas</option>
      </select>
      {itens.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma revisão neste estado.</p>}
      {itens.map((r) => (
        <div key={r.id} className="panel-3d p-4 space-y-3">
          <div className="flex justify-between gap-2 flex-wrap"><strong>#{r.id} · {r.pergunta_resumo}</strong><span className="text-xs">{r.canal} · {new Date(r.criada_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span></div>
          <div className="grid gap-3 md:grid-cols-3">
            {[r.parecer1, r.parecer2, r.parecer3].map((p, i) => (
              <div key={i} className="panel-3d-sub p-3 text-sm"><div className="font-semibold mb-1">IA {i + 1}</div><p className="whitespace-pre-wrap">{texto(p)}</p></div>))}
          </div>
          <div className="text-sm"><b>Resposta proposta:</b> <span className="whitespace-pre-wrap">{r.resposta_proposta ?? "—"}</span></div>
          {r.estado === "pendente" && (aberta === r.id ? (
            <div className="space-y-2">
              <input className="w-full h-9 rounded-md border bg-background px-2" placeholder="Gatilho (ao menos duas palavras)" value={form.gatilho} onChange={(e) => setForm({ ...form, gatilho: e.target.value })} />
              <textarea className="w-full rounded-md border bg-background p-2" placeholder="Resposta revisada" value={form.resposta} onChange={(e) => setForm({ ...form, resposta: e.target.value })} />
              <label className="text-sm flex gap-2"><input type="checkbox" checked={form.confirmar} onChange={(e) => setForm({ ...form, confirmar: e.target.checked })} />Confirmo que revisei e assumo a responsabilidade.</label>
              <input className="w-full h-9 rounded-md border bg-background px-2" placeholder="Motivo (para retificar)" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
              <div className="flex gap-2"><button className="btn-3d px-3 h-9 rounded-md" onClick={() => ratificar(r)}>Ratificar</button>
                <button className="btn-3d-soft px-3 h-9 rounded-md" onClick={() => retificar(r)}>Retificar</button></div>
            </div>
          ) : <button className="btn-3d-soft px-3 h-9 rounded-md" onClick={() => { setAberta(r.id); setForm({ gatilho: "", resposta: r.resposta_proposta ?? "", confirmar: false, motivo: "" }); }}>Revisar</button>)}
        </div>))}
    </div>
  );
}
