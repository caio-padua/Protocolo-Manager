import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

// "Excluir minha conta" (Apple App Store). Lei do lugar fixo: campos e botão sempre no mesmo lugar;
// o botão só habilita com a palavra EXCLUIR; a mensagem de erro tem slot reservado.
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
type Aviso = { removidos: string[]; mantidos: string[]; observacao: string };

export default function ExcluirContaPaxCare({ token, somenteLeitura, aoExcluir }: { token: string; somenteLeitura: boolean; aoExcluir: () => void }) {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [senha, setSenha] = useState("");
  const [palavra, setPalavra] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(`${API_BASE}/api/area-paciente/conta/aviso-exclusao`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : null)).then((j) => { if (vivo) setAviso(j); }).catch(() => { if (vivo) setAviso(null); });
    return () => { vivo = false; };
  }, [token]);

  async function excluir() {
    if (ocupado || somenteLeitura || palavra !== "EXCLUIR") return;
    setOcupado(true); setErro("");
    try {
      // Passo 1: reautenticar (senha; quem não tem senha informa a data de nascimento).
      const ped = await fetch(`${API_BASE}/api/area-paciente/conta/pedido-exclusao`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(senha.includes("/") || /^\d{8}$/.test(senha) ? { dataNascimento: senha } : { senha }),
      });
      const pj = await ped.json().catch(() => ({})) as { error?: string; confirmacaoToken?: string };
      if (!ped.ok || !pj.confirmacaoToken) throw new Error(pj.error ?? "Não foi possível confirmar sua identidade.");
      // Passo 2: confirmação final.
      const r = await fetch(`${API_BASE}/api/area-paciente/conta`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacao: "EXCLUIR", confirmacaoToken: pj.confirmacaoToken }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((j as { error?: string }).error ?? "Não foi possível excluir agora.");
      try { localStorage.removeItem("paxcare.ocultarGamificacao"); } catch { /* sem armazenamento */ }
      aoExcluir();
    } catch (e) { setErro((e as Error).message); } finally { setOcupado(false); }
  }

  return (
    <section className="panel-3d rounded-xl p-4 space-y-3" aria-label="Excluir minha conta" data-testid="excluir-conta">
      <h3 className="text-primary font-black text-xs uppercase tracking-widest flex items-center gap-2"><Trash2 className="w-4 h-4" />Excluir minha conta</h3>
      {aviso ? (
        <div className="concave-3d rounded-lg p-3 space-y-2 text-xs text-primary">
          <p className="font-black uppercase tracking-widest text-[10px]">O que será removido</p>
          <ul className="list-disc pl-4 space-y-1">{aviso.removidos.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="font-black uppercase tracking-widest text-[10px]">O que a lei obriga a clínica a manter</p>
          <ul className="list-disc pl-4 space-y-1">{aviso.mantidos.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="text-muted-foreground">{aviso.observacao}</p>
        </div>
      ) : <p className="text-xs text-muted-foreground" role="status">Carregando aviso…</p>}
      <label className="block text-[10px] font-black uppercase tracking-widest text-primary">Sua senha (ou data de nascimento, se não tem senha)
        <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)}
          className="concave-3d mt-1 w-full rounded-md px-3 min-h-[44px] text-sm normal-case tracking-normal font-normal" />
      </label>
      <label className="block text-[10px] font-black uppercase tracking-widest text-primary">Digite EXCLUIR para confirmar
        <input value={palavra} onChange={(e) => setPalavra(e.target.value)} autoCapitalize="characters"
          className="concave-3d mt-1 w-full rounded-md px-3 min-h-[44px] text-sm normal-case tracking-normal font-normal" data-testid="excluir-palavra" />
      </label>
      <div className="min-h-[20px] text-xs text-red-600" role="alert">{erro}</div>
      <button type="button" onClick={() => void excluir()} disabled={ocupado || somenteLeitura || palavra !== "EXCLUIR" || !aviso}
        className="btn-3d w-full min-h-[44px] text-[11px] font-black uppercase tracking-widest disabled:opacity-40" data-testid="excluir-conta-botao">
        Excluir minha conta
      </button>
      {somenteLeitura && <p className="text-[10px] text-muted-foreground">Na prévia do administrador esta ação fica desligada.</p>}
    </section>
  );
}
