import { useEffect, useState } from "react";
import { usePermissoes } from "@/lib/permissoes";
import { getCollabToken } from "@/lib/collab-auth";
import { Numeral } from "@/components/numeral/Numeral";
import type { AssinaturasFallbackSaude as Saude } from "@workspace/api-client-react";

const base = import.meta.env.BASE_URL.replace(/\/$/, "");
async function consultar(path: string, options?: RequestInit) {
  const response = await fetch(`${base}/api/assinaturas/fallback/${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${getCollabToken()}`, "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error("Não foi possível consultar ou reenviar os cadernos. Verifique a sessão e a configuração do ZapSign.");
  return response.json();
}

/** Saúde do envio real; não confunde token configurado com plano API ativo. */
export function AssinaturasFallbackSaude() {
  const { isCeo, me } = usePermissoes();
  const [saude, setSaude] = useState<Saude | null>(null);
  const [erro, setErro] = useState("");
  const [resultado, setResultado] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    let ativo = true;
    setSaude(null);
    setConfirmado(false);
    setResultado("");
    setErro("");
    if (!isCeo) return;
    const carregar = async () => {
      try {
        const data = await consultar("saude");
        if (ativo) { setSaude(data); setErro(""); }
      } catch {
        if (ativo) { setSaude(null); setErro("Contagem indisponível. Não foi possível verificar os cadernos pendentes."); }
      }
    };
    void carregar();
    const interval = setInterval(carregar, 30_000);
    return () => { ativo = false; clearInterval(interval); };
  }, [isCeo, me?.id]);

  if (!isCeo) return null;
  async function reenviar() {
    setEnviando(true); setErro(""); setResultado("");
    try {
      const data = await consultar("reenviar", { method: "POST", body: JSON.stringify({ confirmar: true }) });
      setSaude(data);
      setResultado(`${data.reenviados} caderno(s) reenviado(s); ${data.falhas} falha(s). As notificações têm acompanhamento na fila de assinaturas.`);
      setConfirmado(false);
    } catch (e) {
      setErro(`${(e as Error).message} Se a conexão caiu, consulte a contagem antes de tentar novamente; operações incertas permanecem bloqueadas.`);
      setSaude(null);
    } finally { setEnviando(false); }
  }
  return (
    <section className="panel-3d-sub rounded-[6px] p-4 space-y-3" aria-label="Saúde dos cadernos ZapSign">
      <h3 className="font-bold text-sm">ZapSign — saúde dos cadernos</h3>
      <div className="concave-3d rounded-[6px] p-3">
        <p>Aguardando reenvio real: <Numeral>{saude?.aguardandoReenvioReal ?? "Não verificado"}</Numeral></p>
        <p className="text-sm text-muted-foreground">Exigem conferência: <Numeral>{saude?.bloqueados ?? "Não verificado"}</Numeral></p>
      </div>
      <p className="text-sm text-muted-foreground">Após ativar o plano de API do ZapSign, reenvie até dez cadernos por vez. Conteúdo divergente ou envio incerto fica bloqueado para evitar duplicidade.</p>
      <label className="flex items-center gap-2 min-h-11 text-sm">
        <input type="checkbox" checked={confirmado} disabled={enviando}
          onChange={e => setConfirmado(e.target.checked)} className="h-5 w-5 shrink-0" />
        Confirmo o envio real ao ZapSign e a notificação dos clientes.
      </label>
      <button type="button" className="btn-3d-gold rounded-[6px] px-4 min-h-11 disabled:opacity-50"
        disabled={!confirmado || enviando || !saude || saude.aguardandoReenvioReal <= saude.bloqueados}
        onClick={reenviar}>
        {enviando ? "Reenviando cadernos…" : "Reenviar cadernos ao ZapSign"}
      </button>
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {resultado && <p role="status" className="text-sm">{resultado}</p>}
    </section>
  );
}
