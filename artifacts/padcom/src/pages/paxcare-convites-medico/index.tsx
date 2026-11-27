import { useCallback, useEffect, useState } from "react";
import { collabAuthHeaders } from "@/lib/collab-auth";

// Acompanhamento do CEO: convites que clientes fizeram a médicos no PaxCare. Só leitura; sem token, sem conteúdo do cofre.
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
const SITUACAO: Record<string, string> = { pendente: "Aguardando o médico", aceito: "Aceito", recusado: "Recusado", revogado: "Revogado pelo cliente", expirado: "Expirado", acesso_encerrado: "Acesso encerrado" };
type Conv = { id: number; medico: string; email: string; empresaId: number | null; situacao: string; criadoEm: string; expiraEm: string; acessoAte: string | null };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

export default function PaxcareConvitesMedicoPage() {
  const [dados, setDados] = useState<{ resumo: Record<string, number>; convites: Conv[] } | null>(null);
  const [filtro, setFiltro] = useState("");
  const [erro, setErro] = useState("");
  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`${API}/ceo/paxcare/convites-medico`, { headers: collabAuthHeaders() });
      if (r.status === 403) throw new Error("Somente o titular da plataforma vê estes convites.");
      if (!r.ok) throw new Error(r.status === 401 ? "Entre como colaborador." : "Não foi possível carregar os convites.");
      setDados(await r.json()); setErro("");
    } catch (e) { setDados(null); setErro((e as Error).message); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  const lista = dados?.convites.filter((c) => !filtro || c.situacao === filtro) ?? [];

  return (
    <div className="space-y-4 max-w-4xl" data-testid="paxcare-convites-medico">
      <header className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4">
          <p className="text-accent text-[9px] font-black uppercase tracking-widest">PAXCARE</p>
          <h1 className="text-primary font-black text-2xl mt-0.5" style={{ fontFamily: "'EB Garamond', serif" }}>Convites de clientes a médicos</h1>
          <p className="text-muted-foreground text-xs mt-1">Acompanhamento somente leitura. O e-mail aparece mascarado e o conteúdo do cofre nunca aparece aqui.</p>
        </div>
      </header>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {Object.keys(SITUACAO).map((k) => (
          <button key={k} type="button" aria-pressed={filtro === k} onClick={() => setFiltro(filtro === k ? "" : k)}
            className={`${filtro === k ? "concave-3d" : "btn-3d-soft"} min-h-[44px] px-3 text-[10px] font-black uppercase tracking-widest flex justify-between items-center`}>
            <span>{SITUACAO[k]}</span><span className="tabular-nums">{dados ? (dados.resumo[k] ?? 0) : "—"}</span>
          </button>
        ))}
      </div>
      <div role="status" aria-live="polite" className="min-h-[20px] text-xs text-red-600">{erro}</div>
      {!dados && !erro && <div className="concave-3d rounded-lg px-4 py-3 text-sm">Carregando…</div>}
      {dados && lista.length === 0 && <div className="concave-3d rounded-lg px-4 py-3 text-sm">Nenhum convite neste filtro.</div>}
      {lista.map((c) => (
        <section key={c.id} className="panel-3d rounded-xl p-4 space-y-1" aria-label={`Convite ${c.id}`} data-testid={`convite-medico-${c.id}`}>
          <p className="text-primary font-black text-base break-words">{c.medico}</p>
          <p className="text-xs text-muted-foreground break-words">{c.email}{c.empresaId ? ` · clínica ${c.empresaId}` : " · médico individual"}</p>
          <p className="text-xs">{SITUACAO[c.situacao] ?? c.situacao} · criado em {fmt(c.criadoEm)} · convite vale até {fmt(c.expiraEm)} · acesso até {fmt(c.acessoAte)}</p>
        </section>
      ))}
    </div>
  );
}
