import { useState, useEffect } from "react";
import { useScreenTheme } from "@/components/theme/useScreenTheme";

const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Chave = "birthDate" | "phone" | "email" | "sexoBiologico" | "address";
interface Estado { exigido: boolean; completo: boolean; pendentes: Chave[]; valores: Record<Chave, string> }

export type SituacaoPreCadastro = "carregando" | "pendente" | "ok" | "erro";

/** Pergunta ao servidor se o convidado ainda precisa completar o cadastro. */
export function usePreCadastro(token: string | null, ativo: boolean) {
  const [situacao, setSituacao] = useState<SituacaoPreCadastro>("carregando");
  const [estado, setEstado] = useState<Estado | null>(null);
  const [tentativa, setTentativa] = useState(0);
  useEffect(() => {
    if (!token || !ativo) { setSituacao("ok"); return; }
    let vivo = true;
    setSituacao("carregando");
    fetch(`${API_BASE}/api/area-paciente/pre-cadastro`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const e = (await r.json()) as Estado;
        if (!vivo) return;
        setEstado(e);
        setSituacao(e.completo ? "ok" : "pendente");
      })
      .catch(() => { if (vivo) setSituacao("erro"); });
    return () => { vivo = false; };
  }, [token, ativo, tentativa]);
  return { situacao, estado, refazer: () => setTentativa((n) => n + 1), concluir: () => setSituacao("ok") };
}

const INPUT = "concave-3d w-full h-12 px-4 text-primary text-base focus:outline-none focus:ring-2 focus:ring-[#c2a05a] rounded-lg";
const LABEL = "block text-primary text-xs font-black uppercase tracking-widest mb-1.5";

export function PreCadastroObrigatorio({ token, estado, onConcluido }: { token: string; estado: Estado; onConcluido: () => void }) {
  const { theme } = useScreenTheme();
  const [v, setV] = useState<Record<Chave, string>>({ ...estado.valores });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const set = (k: Chave, val: string) => { setV((p) => ({ ...p, [k]: val })); setErro(""); };

  async function salvar() {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`${API_BASE}/api/area-paciente/pre-cadastro`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(v),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErro(d.error || "Não foi possível salvar. Tente novamente."); return; }
      onConcluido();
    } catch { setErro("Erro de conexão. Tente novamente."); }
    finally { setSalvando(false); }
  }

  return (
    <div className={`${theme === "dark" ? "dark" : ""} min-h-screen flex items-center justify-center p-4`}
      style={{ background: theme === "dark" ? "#0b1e3a" : "#f3ecdd" }}>
      <div className="panel-3d rounded-xl w-full max-w-md p-5 space-y-4">
        <div>
          <h1 className="text-primary font-black text-sm uppercase tracking-widest">COMPLETE SEU CADASTRO</h1>
          <p className="text-muted-foreground text-xs mt-1">Antes de abrir seu painel, precisamos destes dados. Todos são obrigatórios.</p>
        </div>
        <div>
          <label className={LABEL}>DATA DE NASCIMENTO (DD/MM/AAAA ou AAAA-MM-DD)</label>
          <input className={INPUT} value={v.birthDate} onChange={(e) => set("birthDate", e.target.value)} inputMode="numeric" />
        </div>
        <div>
          <label className={LABEL}>TELEFONE COM DDD</label>
          <input className={INPUT} value={v.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" />
        </div>
        <div>
          <label className={LABEL}>E-MAIL</label>
          <input className={INPUT} type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
        </div>
        <div>
          <label className={LABEL}>SEXO BIOLÓGICO</label>
          <select className={INPUT} value={v.sexoBiologico.toUpperCase()} onChange={(e) => set("sexoBiologico", e.target.value)}>
            <option value="">Selecione</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
          </select>
        </div>
        <div>
          <label className={LABEL}>ENDEREÇO COMPLETO (rua, número, bairro, cidade, CEP)</label>
          <input className={INPUT} value={v.address} onChange={(e) => set("address", e.target.value)} />
        </div>
        {erro && <p role="alert" className="text-red-600 text-sm font-semibold">{erro}</p>}
        <button type="button" onClick={salvar} disabled={salvando} className="bevel-3d w-full h-12 font-black uppercase tracking-widest text-sm">
          {salvando ? "SALVANDO" : "SALVAR E ENTRAR"}
        </button>
      </div>
    </div>
  );
}
