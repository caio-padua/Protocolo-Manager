import { useCallback, useEffect, useState } from "react";
import { useParams } from "wouter";
import { collabAuthHeaders } from "@/lib/collab-auth";

// Médico (colaborador): recebe o convite de um paciente do PaxCare, aceita ou recusa, e lê só o que o paciente liberou.
// O servidor confere e-mail E número do CRM do cadastro do médico; divergência volta como recusa genérica.
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/collaborator/paxcare`;
type Comp = { historico: boolean; exames: boolean; documentos: boolean };
type Conv = { id: number; cliente: string; status: string; compartilha: Comp; acessoDias: number; expiraEm: string };
type Aceito = { id: number; clientId: number; nome: string; acessoAte: string };
type Item = { id: number; tipo: string; titulo: string; dataRef: string | null; notas: string | null; temArquivo: boolean };
const CATS: { k: keyof Comp; l: string }[] = [{ k: "historico", l: "Histórico" }, { k: "exames", l: "Exames" }, { k: "documentos", l: "Documentos" }];
const fmt = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default function PaxcareConviteRecebidoPage() {
  const { token } = useParams<{ token?: string }>();
  const [conv, setConv] = useState<Conv | null>(null);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aceitos, setAceitos] = useState<Aceito[] | null>(null);
  const [aberto, setAberto] = useState<{ id: number; itens: Item[] } | null>(null);
  const [erroCofre, setErroCofre] = useState("");

  const listar = useCallback(async () => {
    try {
      const r = await fetch(`${API}/convites-aceitos`, { headers: collabAuthHeaders() });
      if (!r.ok) throw new Error(r.status === 401 ? "Entre como colaborador." : "Não foi possível carregar seus pacientes.");
      setAceitos(await r.json());
    } catch (e) { setAceitos(null); setErroCofre((e as Error).message); }
  }, []);
  useEffect(() => { void listar(); }, [listar]);

  useEffect(() => {
    if (!token) { setConv(null); return; }
    setErro(""); setResultado("");
    void (async () => {
      try {
        const r = await fetch(`${API}/convites/${encodeURIComponent(token)}`, { headers: collabAuthHeaders() });
        if (r.status === 429) throw new Error("Muitas tentativas. Aguarde alguns minutos.");
        if (!r.ok) throw new Error(r.status === 401 ? "Entre como colaborador para abrir o convite." : "Este convite não pode ser aberto com a sua conta.");
        setConv(await r.json());
      } catch (e) { setConv(null); setErro((e as Error).message); }
    })();
  }, [token]);

  async function decidir(aceitar: boolean) {
    if (ocupado || !token) return;
    setOcupado(true);
    try {
      const r = await fetch(`${API}/convites/${encodeURIComponent(token)}/${aceitar ? "aceitar" : "recusar"}`, { method: "POST", headers: collabAuthHeaders() });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Não foi possível responder.");
      setResultado(aceitar ? "Convite aceito. O paciente aparece na lista abaixo." : "Convite recusado.");
      setConv(conv ? { ...conv, status: aceitar ? "aceito" : "recusado" } : conv);
      await listar();
    } catch (e) { setResultado((e as Error).message); } finally { setOcupado(false); }
  }
  async function abrirCofre(id: number) {
    setErroCofre(""); setAberto(null);
    const r = await fetch(`${API}/convites-aceitos/${id}/cofre`, { headers: collabAuthHeaders() });
    if (!r.ok) { setErroCofre("Acesso encerrado ou não autorizado pelo paciente."); await listar(); return; }
    setAberto({ id, itens: (await r.json()).itens });
  }

  return (
    <div className="space-y-4 max-w-3xl" data-testid="paxcare-convite-recebido">
      <header className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4">
          <p className="text-accent text-[9px] font-black uppercase tracking-widest">PAXCARE</p>
          <h1 className="text-primary font-black text-2xl mt-0.5" style={{ fontFamily: "'EB Garamond', serif" }}>Convites de pacientes</h1>
          <p className="text-muted-foreground text-xs mt-1">Você vê somente o que o paciente liberou, pelo prazo que ele escolheu. Ele pode retirar o acesso a qualquer momento.</p>
        </div>
      </header>

      {token && (
        <section className="panel-3d rounded-xl p-4 space-y-2" aria-label="Convite aberto">
          <div role="alert" className="min-h-[20px] text-xs text-red-600">{erro}</div>
          {conv && (
            <>
              <p className="text-primary font-black text-base">Convite de {conv.cliente}</p>
              <p className="text-xs">Libera: {CATS.filter((c) => conv.compartilha[c.k]).map((c) => c.l).join(", ")} · acesso por {conv.acessoDias} dias após aceitar · convite vale até {fmt(conv.expiraEm)}</p>
              <p className="text-xs">Situação: {conv.status === "pendente" ? "aguardando a sua resposta" : conv.status}</p>
              <div className="flex gap-2 flex-wrap">
                <button disabled={ocupado || conv.status !== "pendente"} onClick={() => void decidir(true)} className="btn-3d px-4 min-h-[44px] text-[10px] font-black uppercase tracking-widest disabled:opacity-40">Aceitar</button>
                <button disabled={ocupado || conv.status !== "pendente"} onClick={() => void decidir(false)} className="btn-3d-soft px-4 min-h-[44px] text-[10px] font-black uppercase tracking-widest disabled:opacity-40">Recusar</button>
              </div>
            </>
          )}
          <div role="status" aria-live="polite" className="min-h-[20px] text-xs">{resultado}</div>
        </section>
      )}

      <section className="panel-3d rounded-xl p-4 space-y-2" aria-label="Pacientes com acesso">
        <h2 className="text-primary font-black text-xs uppercase tracking-widest">Pacientes que liberaram acesso</h2>
        <div role="alert" className="min-h-[20px] text-xs text-red-600">{erroCofre}</div>
        {aceitos && aceitos.length === 0 && <div className="concave-3d rounded-lg px-4 py-3 text-sm">Nenhum acesso ativo.</div>}
        {aceitos?.map((a) => (
          <div key={a.id} className="concave-3d rounded-lg p-3 space-y-2" data-testid={`aceito-${a.id}`}>
            <p className="text-primary font-black text-sm break-words">{a.nome}</p>
            <p className="text-xs text-muted-foreground">Acesso até {fmt(a.acessoAte)}</p>
            <button onClick={() => void abrirCofre(a.id)} className="btn-3d px-3 min-h-[44px] text-[10px] font-black uppercase tracking-widest">Ver o que foi liberado</button>
            {aberto?.id === a.id && (aberto.itens.length === 0
              ? <p className="text-xs text-muted-foreground">Nada guardado nas categorias liberadas.</p>
              : aberto.itens.map((i) => <div key={i.id} className="text-xs break-words"><b>{i.titulo}</b> · {i.tipo}{i.dataRef ? ` · ${i.dataRef.split("-").reverse().join("/")}` : ""}{i.notas ? ` — ${i.notas}` : ""}</div>))}
          </div>
        ))}
      </section>
    </div>
  );
}
