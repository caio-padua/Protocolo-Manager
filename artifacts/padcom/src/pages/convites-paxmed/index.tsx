import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { useToast } from "@/hooks/use-toast";

// Pedidos de convite recebidos pela vitrine PAXMED. Só o titular da plataforma decide.
// Mudar o status NÃO cria login, NÃO cobra e NÃO envia mensagem. O botão e o seletor ficam sempre no mesmo lugar.
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

const STATUS: { valor: string; rotulo: string }[] = [
  { valor: "recebida", rotulo: "Recebida" },
  { valor: "em_analise", rotulo: "Em análise" },
  { valor: "aprovada", rotulo: "Aprovada" },
  { valor: "lista_espera", rotulo: "Lista de espera" },
  { valor: "recusada", rotulo: "Não aprovada" },
];
type Convite = { id: number; protocolo: string; nome: string; email: string; crm: string; uf: string; especialidade: string; clinica: string | null; cidade: string; mensagem: string | null; status: string; criado_em: string };
const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default function ConvitesPaxmedPage() {
  const { toast } = useToast();
  const [itens, setItens] = useState<Convite[] | null>(null);
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [escolha, setEscolha] = useState<Record<number, string>>({});

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${API}/vitrine-convites${filtro ? `?status=${filtro}` : ""}`, { headers: collabAuthHeaders() });
      if (r.status === 403) throw new Error("Somente o titular da plataforma vê os pedidos de convite.");
      if (!r.ok) throw new Error(r.status === 401 ? "Entre como colaborador para ver os pedidos." : "Não foi possível carregar os pedidos.");
      const d = (await r.json()) as { convites: Convite[] };
      setItens(d.convites); setErro("");
    } catch (e) { setItens(null); setErro((e as Error).message); }
  }, [filtro]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function salvar(c: Convite) {
    const novo = escolha[c.id] ?? c.status;
    if (ocupado || novo === c.status) return;
    setOcupado(true);
    try {
      const r = await fetch(`${API}/vitrine-convites/${c.id}/status`, {
        method: "PATCH", headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status: novo }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Não foi possível salvar.");
      toast({ title: "Status salvo", description: "Nenhum acesso, cobrança ou mensagem foi criado." });
      await carregar();
    } catch (e) { toast({ title: "Erro", description: (e as Error).message, variant: "destructive" }); } finally { setOcupado(false); }
  }

  return (
    <div className="space-y-4 max-w-4xl" data-testid="convites-paxmed">
      <header className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4">
          <p className="text-accent text-[9px] font-black uppercase tracking-widest">PAXMED</p>
          <h1 className="text-primary font-black text-2xl mt-0.5" style={{ fontFamily: "'EB Garamond', serif" }}>Pedidos de convite</h1>
          <p className="text-muted-foreground text-xs mt-1">Médicos e clínicas que pediram entrada pelo site. Aprovar só muda o status: não cria login, cobrança nem mensagem.</p>
        </div>
      </header>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-[10px] font-black uppercase tracking-widest" htmlFor="filtro-convites">Filtrar</label>
        <select id="filtro-convites" value={filtro} onChange={(e) => setFiltro(e.target.value)} className="concave-3d h-11 px-3 text-sm rounded-lg">
          <option value="">Todos</option>
          {STATUS.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
        </select>
      </div>
      <div role="status" aria-live="polite" className="min-h-[20px] text-xs text-red-600">{erro}</div>
      {!itens && !erro && <div className="concave-3d rounded-lg px-4 py-3 text-sm">Carregando…</div>}
      {itens && itens.length === 0 && <div className="concave-3d rounded-lg px-4 py-3 text-sm">Nenhum pedido neste filtro.</div>}
      {itens?.map((c) => (
        <section key={c.id} className="panel-3d rounded-xl p-4 space-y-2" aria-label={`Pedido ${c.protocolo}`} data-testid={`convite-${c.id}`}>
          <p className="text-[10px] uppercase tracking-widest text-accent flex items-center gap-1"><UserPlus className="w-3 h-3" />{c.protocolo} · {fmt(c.criado_em)}</p>
          <p className="text-primary font-black text-base break-words">{c.nome}</p>
          <p className="text-xs text-muted-foreground break-words">{c.email} · CRM {c.crm}/{c.uf} · {c.especialidade} · {c.cidade}{c.clinica ? ` · ${c.clinica}` : ""}</p>
          {c.mensagem && <p className="text-xs break-words">{c.mensagem}</p>}
          <div className="flex items-center gap-2 flex-wrap">
            <select aria-label={`Status de ${c.protocolo}`} value={escolha[c.id] ?? c.status} onChange={(e) => setEscolha((m) => ({ ...m, [c.id]: e.target.value }))} className="concave-3d h-11 px-3 text-sm rounded-lg">
              {STATUS.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
            </select>
            <button type="button" disabled={ocupado || (escolha[c.id] ?? c.status) === c.status} onClick={() => void salvar(c)} className="btn-3d px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest disabled:opacity-40">Salvar status</button>
          </div>
        </section>
      ))}
    </div>
  );
}
