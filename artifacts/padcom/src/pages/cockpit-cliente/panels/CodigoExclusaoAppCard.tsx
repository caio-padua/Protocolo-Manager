import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";

// Cockpit > cliente sem senha no aplicativo: a equipe autorizada gera o código de uso único que o cliente digita
// em "Excluir minha conta". Nenhuma mensagem é enviada: a equipe entrega o código em mão, conferindo a identidade.
// Lei do lugar fixo: botão e slot do código/erro nunca mudam de lugar.
const API = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

export default function CodigoExclusaoAppCard({ clientId }: { clientId: number }) {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [expiraEm, setExpiraEm] = useState(0);
  const [agora, setAgora] = useState(Date.now());
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // trocar de cliente apaga o código da tela (nunca fica visível para outro cliente)
  useEffect(() => { setCodigo(null); setErro(""); }, [clientId]);
  useEffect(() => { if (!codigo) return; const t = setInterval(() => setAgora(Date.now()), 1000); return () => clearInterval(t); }, [codigo]);
  const restante = Math.max(0, Math.floor((expiraEm - agora) / 1000));
  useEffect(() => { if (codigo && restante === 0) setCodigo(null); }, [codigo, restante]);

  async function gerar() {
    if (ocupado) return;
    setOcupado(true); setErro("");
    try {
      const r = await fetch(`${API}/cockpit/${clientId}/codigo-exclusao-app`, { method: "POST", headers: collabAuthHeaders() });
      const d = (await r.json().catch(() => ({}))) as { codigo?: string; validadeMinutos?: number; error?: string };
      if (!r.ok || !d.codigo) throw new Error(d.error ?? "Não foi possível gerar o código.");
      setCodigo(d.codigo); setExpiraEm(Date.now() + (d.validadeMinutos ?? 15) * 60_000); setAgora(Date.now());
    } catch (e) { setCodigo(null); setErro((e as Error).message); } finally { setOcupado(false); }
  }

  const mm = String(Math.floor(restante / 60)).padStart(2, "0"), ss = String(restante % 60).padStart(2, "0");
  return (
    <section className="panel-3d-sub rounded-xl p-4 space-y-3" aria-label="Código para excluir conta do aplicativo" data-testid="codigo-exclusao-app">
      <h3 className="text-primary font-black text-xs uppercase tracking-widest flex items-center gap-2"><KeyRound className="w-4 h-4" />Código de exclusão da conta do aplicativo</h3>
      <p className="text-xs text-muted-foreground">Só para cliente que não tem senha. Confira a identidade do cliente e entregue o código em mão: nenhuma mensagem é enviada. Vale 15 minutos, serve uma única vez e gerar outro cancela o anterior. Cancelar a conta no aplicativo não cancela cobranças externas.</p>
      <div className="concave-3d rounded-lg min-h-[56px] flex items-center justify-center text-2xl font-black tracking-[0.3em] text-primary" data-testid="codigo-exclusao-valor" aria-live="polite">
        {codigo ? <span>{codigo} <span className="text-xs tracking-normal text-muted-foreground">({mm}:{ss})</span></span> : <span className="text-xs tracking-normal font-normal text-muted-foreground">Nenhum código ativo na tela</span>}
      </div>
      <div className="min-h-[20px] text-xs text-red-600" role="alert">{erro}</div>
      <button type="button" onClick={() => void gerar()} disabled={ocupado} className="btn-3d w-full min-h-[44px] text-[11px] font-black uppercase tracking-widest" data-testid="codigo-exclusao-gerar">Gerar código</button>
    </section>
  );
}
