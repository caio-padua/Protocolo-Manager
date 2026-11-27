import { useCallback, useEffect, useState } from "react";
import { Mail } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { useToast } from "@/hooks/use-toast";

// Contatos "Quero contratar" vindos do site PAXMED. Marcar como contatado não envia mensagem a ninguém.
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

type Contato = { id: number; nome: string; email: string; telefone: string | null; clinica: string; especialidade: string; volume_protocolos: string | null; necessidade: string; source: string | null; contatado: boolean; contatado_em: string | null; criado_em: string };
const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default function VitrineContatosPage() {
  const { toast } = useToast();
  const [itens, setItens] = useState<Contato[] | null>(null);
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${API}/vitrine-contatos${filtro ? `?contatado=${filtro}` : ""}`, { headers: collabAuthHeaders() });
      if (!r.ok) throw new Error(r.status === 401 ? "Entre como colaborador para ver os contatos." : "Não foi possível carregar os contatos.");
      const d = (await r.json()) as { contatos: Contato[] };
      setItens(d.contatos); setErro("");
    } catch (e) { setItens(null); setErro((e as Error).message); }
  }, [filtro]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function marcar(c: Contato) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await fetch(`${API}/vitrine-contatos/${c.id}/contato`, {
        method: "PATCH", headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ contatado: !c.contatado }),
      });
      if (!r.ok) throw new Error("Não foi possível salvar.");
      toast({ title: "Salvo", description: "Nenhuma mensagem foi enviada." });
      await carregar();
    } catch (e) { toast({ title: "Erro", description: (e as Error).message, variant: "destructive" }); } finally { setOcupado(false); }
  }

  return (
    <div className="space-y-4 max-w-4xl" data-testid="vitrine-contatos">
      <header className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4">
          <p className="text-accent text-[9px] font-black uppercase tracking-widest">PAXMED</p>
          <h1 className="text-primary font-black text-2xl mt-0.5" style={{ fontFamily: "'EB Garamond', serif" }}>Contatos da vitrine</h1>
          <p className="text-muted-foreground text-xs mt-1">Médicos e clínicas que pediram contato pelo site. Marcar como contatado só registra; não envia mensagem.</p>
        </div>
      </header>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[10px] font-black uppercase tracking-widest" htmlFor="filtro-contatos">Filtrar</label>
        <select id="filtro-contatos" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="concave-3d h-11 px-3 text-sm rounded-lg">
          <option value="">Todos</option>
          <option value="false">Ainda não contatados</option>
          <option value="true">Já contatados</option>
        </select>
      </div>
      <div role="status" aria-live="polite" className="min-h-[20px] text-xs text-red-600">{erro}</div>
      {!itens && !erro && <div className="concave-3d rounded-lg px-4 py-3 text-sm">Carregando…</div>}
      {itens && itens.length === 0 && <div className="concave-3d rounded-lg px-4 py-3 text-sm">Nenhum contato neste filtro.</div>}
      {itens?.map((c) => (
        <section key={c.id} className="panel-3d rounded-xl p-4 space-y-2" aria-label={`Contato ${c.id}`} data-testid={`contato-${c.id}`}>
          <p className="text-[10px] uppercase tracking-widest text-accent flex items-center gap-1"><Mail className="w-3 h-3" />{fmt(c.criado_em)}{c.source ? ` · ${c.source}` : ""}</p>
          <p className="text-primary font-black text-base break-words">{c.nome}</p>
          <p className="text-xs text-muted-foreground break-words">{c.email}{c.telefone ? ` · ${c.telefone}` : ""} · {c.clinica} · {c.especialidade}{c.volume_protocolos ? ` · ${c.volume_protocolos}` : ""}</p>
          <p className="text-xs break-words">{c.necessidade}</p>
          <button type="button" disabled={ocupado} onClick={() => void marcar(c)} className="btn-3d px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest disabled:opacity-40">
            {c.contatado ? `Contatado em ${c.contatado_em ? fmt(c.contatado_em) : ""} (desfazer)` : "Marcar como contatado"}
          </button>
        </section>
      ))}
    </div>
  );
}
