import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { Check, Pill, X, Pencil } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { useToast } from "@/hooks/use-toast";

// Fila central "Medicações & Adesão": medicamentos/suplementos que clientes DESTA clínica cadastraram
// (com consentimento ativo) e aguardam conferência. Validar e Recusar em um clique; Ajustar abre a aba do cliente.
// Lei do lugar fixo: botões não mudam; confirmação de recusa em slot reservado (invisible).
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

type Item = { id: number; clientId: number; clientName: string; nome: string; doseValor: number | null; doseUnidade: string | null; observacao: string | null; criadoEm: string };

const fmtData = (iso: string) => { const d = new Date(iso); return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }); };

export default function MedicacoesFilaPage() {
  const { toast } = useToast();
  const [itens, setItens] = useState<Item[] | null>(null);
  const [podeDecidir, setPodeDecidir] = useState(false);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [recusando, setRecusando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${API}/cockpit-medicacoes/fila`, { headers: collabAuthHeaders() });
      if (!r.ok) throw new Error(r.status === 401 ? "Entre como colaborador para ver a fila." : "Não foi possível carregar a fila.");
      const d = await r.json() as { podeDecidir: boolean; itens: Item[] };
      setItens(d.itens); setPodeDecidir(d.podeDecidir); setErro("");
    } catch (e) { setErro((e as Error).message); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function decidir(i: Item, corpo: Record<string, unknown>) {
    if (ocupado) return;
    setOcupado(true);
    try {
      const r = await fetch(`${API}/cockpit/${i.clientId}/medicacoes/${i.id}/decisao`, {
        method: "POST", headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(corpo),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string; lembreteRecalculado?: boolean };
      if (!r.ok) throw new Error(d.error ?? "Não foi possível concluir.");
      toast({ title: "Decisão registrada", description: d.lembreteRecalculado === false ? "Atenção: o lembrete não foi recalculado." : undefined });
      setRecusando(null); setMotivo("");
      await carregar();
    } catch (e) { toast({ title: "Erro", description: (e as Error).message, variant: "destructive" }); } finally { setOcupado(false); }
  }

  return (
    <div className="space-y-4 max-w-4xl" data-testid="fila-medicacoes">
      <header className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4">
          <p className="text-accent text-[9px] font-black uppercase tracking-widest">PaxCare</p>
          <h1 className="text-primary font-black text-2xl mt-0.5" style={{ fontFamily: "'EB Garamond', serif" }}>Medicações &amp; Adesão — fila de conferência</h1>
          <p className="text-muted-foreground text-xs mt-1">Medicamentos e suplementos que seus clientes cadastraram e autorizaram a clínica a ver. O lembrete só vale depois da validação.</p>
        </div>
      </header>
      <div role="status" aria-live="polite" className="min-h-[20px] text-xs text-red-600">{erro}</div>
      {!itens && !erro && <div className="concave-3d rounded-lg px-4 py-3 text-sm">Carregando…</div>}
      {itens && itens.length === 0 && <div className="concave-3d rounded-lg px-4 py-3 text-sm">Nenhuma medicação aguardando conferência.</div>}
      {itens && !podeDecidir && itens.length > 0 && <p className="text-[11px] text-muted-foreground">Somente médico valida ou recusa. Você pode consultar a fila.</p>}
      {itens?.map((i) => (
        <section key={i.id} className="panel-3d rounded-xl p-4 space-y-3" aria-label={`${i.nome} de ${i.clientName}`}>
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest text-accent flex items-center gap-1"><Pill className="w-3 h-3" />Cadastrado em {fmtData(i.criadoEm)}</p>
              <p className="text-primary font-black text-base break-words">{i.nome}</p>
              <p className="text-xs text-muted-foreground">{i.doseValor != null && i.doseUnidade ? `${String(i.doseValor).replace(".", ",")} ${i.doseUnidade}` : "dose não informada"}{i.observacao ? ` · ${i.observacao}` : ""}</p>
            </div>
            <Link href={`/cockpit/${i.clientId}/medicacoes`} className="text-xs font-black uppercase tracking-widest text-primary underline min-h-[44px] flex items-center">{i.clientName}</Link>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" disabled={ocupado || !podeDecidir} onClick={() => void decidir(i, { decisao: "validar" })}
              className="btn-3d px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-40"><Check className="w-3 h-3" />Validar</button>
            <Link href={`/cockpit/${i.clientId}/medicacoes`}
              className="btn-3d-soft px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest flex items-center gap-1"><Pencil className="w-3 h-3" />Ajustar</Link>
            <button type="button" disabled={ocupado || !podeDecidir} onClick={() => { setRecusando(i.id); setMotivo(""); }}
              className="btn-3d-soft px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest flex items-center gap-1 disabled:opacity-40"><X className="w-3 h-3" />Recusar</button>
          </div>
          <div className={`flex gap-2 flex-wrap ${recusando === i.id ? "" : "invisible h-0 overflow-hidden"}`} aria-hidden={recusando !== i.id}>
            <input aria-label="Motivo da recusa" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} tabIndex={recusando === i.id ? 0 : -1}
              placeholder="Motivo da recusa" className="concave-3d flex-1 min-w-[200px] h-11 px-3 text-sm rounded-lg" />
            <button type="button" tabIndex={recusando === i.id ? 0 : -1} disabled={ocupado || recusando !== i.id || !motivo.trim()}
              onClick={() => void decidir(i, { decisao: "recusar", motivo: motivo.trim() })}
              className="btn-3d px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest">Confirmar recusa</button>
          </div>
        </section>
      ))}
    </div>
  );
}
