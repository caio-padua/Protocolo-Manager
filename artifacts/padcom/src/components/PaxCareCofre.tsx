import { useCallback, useEffect, useState } from "react";
import PaxCarePlanosPaciente from "@/components/PaxCarePlanosPaciente";
import PaxCareConviteMedico from "@/components/PaxCareConviteMedico";
import { Loader2, ShieldCheck, Trash2, FileText, Building2 } from "lucide-react";

// PAXCARE (experiência do paciente): cofre pessoal + clínicas vinculadas. Tudo vem de rotas
// token-bound (/area-paciente/paxcare/*); o paciente nunca informa o próprio id.
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Comp = { historico: boolean; exames: boolean; documentos: boolean };
type Item = { id: number; tipo: string; titulo: string; dataRef: string | null; notas: string | null; temArquivo: boolean; arquivoNome: string | null };
type Vinculo = { id: number; empresaId: number; clinica: string | null; local: string | null; status: string; compartilha: Comp };
type Disp = { id: number; nome: string; local: string | null };

const TIPOS: { v: string; l: string }[] = [
  { v: "historico", l: "Histórico de saúde" },
  { v: "exame_externo", l: "Exame de outro lugar" },
  { v: "documento", l: "Documento" },
];
const CATS: { k: keyof Comp; l: string }[] = [
  { k: "historico", l: "Histórico" },
  { k: "exames", l: "Exames" },
  { k: "documentos", l: "Documentos" },
];

export default function PaxCareCofre({ token }: { token: string }) {
  const auth = { Authorization: `Bearer ${token}` };
  const [itens, setItens] = useState<Item[]>([]);
  const [vinc, setVinc] = useState<Vinculo[]>([]);
  const [disp, setDisp] = useState<Disp[]>([]);
  const [clinOrigem, setClinOrigem] = useState<string | null>(null);
  const [exClin, setExClin] = useState<{ total: number; ultimaColeta: string | null } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [tipo, setTipo] = useState("historico");
  const [titulo, setTitulo] = useState("");
  const [notas, setNotas] = useState("");
  const [arq, setArq] = useState<File | null>(null);
  const [novaEmp, setNovaEmp] = useState("");
  const [novaComp, setNovaComp] = useState<Comp>({ historico: false, exames: false, documentos: false });
  const [revogando, setRevogando] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        fetch(`${API_BASE}/api/area-paciente/paxcare/cofre`, { headers: auth }),
        fetch(`${API_BASE}/api/area-paciente/paxcare/clinicas`, { headers: auth }),
      ]);
      if (!a.ok || !b.ok) throw new Error(a.status === 401 || b.status === 401 ? "Sessão expirada. Entre novamente." : "Não foi possível carregar o PaxCare.");
      const c = await a.json(); const d = await b.json();
      setItens(c.itens); setExClin(c.examesDaClinica); setClinOrigem(c.clinicaOrigem?.nome ?? null);
      setVinc(d.vinculos); setDisp(d.disponiveis); setMsg(null);
    } catch (e) { setMsg((e as Error).message); } finally { setCarregando(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { void carregar(); }, [carregar]);

  async function guardar() {
    if (ocupado) return;
    setOcupado(true); setMsg(null);
    const fd = new FormData();
    fd.set("tipo", tipo); fd.set("titulo", titulo); if (notas.trim()) fd.set("notas", notas);
    if (arq) fd.set("arquivo", arq);
    try {
      const r = await fetch(`${API_BASE}/api/area-paciente/paxcare/cofre`, { method: "POST", headers: auth, body: fd });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Não foi possível guardar.");
      setTitulo(""); setNotas(""); setArq(null); await carregar();
    } catch (e) { setMsg((e as Error).message); } finally { setOcupado(false); }
  }
  async function remover(id: number) {
    const r = await fetch(`${API_BASE}/api/area-paciente/paxcare/cofre/${id}`, { method: "DELETE", headers: auth });
    if (!r.ok) setMsg("Não foi possível remover."); else await carregar();
  }
  async function abrir(id: number) {
    const r = await fetch(`${API_BASE}/api/area-paciente/paxcare/cofre/${id}/arquivo`, { headers: auth });
    if (!r.ok) { setMsg("Arquivo indisponível."); return; }
    window.open(URL.createObjectURL(await r.blob()), "_blank");
  }
  async function vincular() {
    if (!novaEmp || ocupado) return;
    setOcupado(true);
    try {
      const r = await fetch(`${API_BASE}/api/area-paciente/paxcare/vinculos`, {
        method: "POST", headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ empresaId: Number(novaEmp), compartilha: novaComp }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Não foi possível vincular.");
      setNovaEmp(""); setNovaComp({ historico: false, exames: false, documentos: false }); await carregar();
    } catch (e) { setMsg((e as Error).message); } finally { setOcupado(false); }
  }
  async function alterar(v: Vinculo, k: keyof Comp) {
    if (ocupado) return;
    setOcupado(true);
    const c = { [k]: !v.compartilha[k] };
    try {
    const r = await fetch(`${API_BASE}/api/area-paciente/paxcare/vinculos/${v.id}`, {
      method: "PATCH", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(c),
    });
    if (!r.ok) setMsg("Não foi possível alterar."); else await carregar();
    } finally { setOcupado(false); }
  }
  async function revogar(id: number) {
    const r = await fetch(`${API_BASE}/api/area-paciente/paxcare/vinculos/${id}`, { method: "DELETE", headers: auth });
    setRevogando(null);
    if (!r.ok) setMsg("Não foi possível revogar."); else await carregar();
  }

  if (carregando) return <div className="concave-3d rounded-lg p-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Carregando…</div>;

  const ativos = vinc.filter((v) => v.status === "ativo");
  return (
    <div className="space-y-4" data-testid="paxcare-cofre">
      <header className="panel-3d rounded-xl overflow-hidden">
        <div className="login-card-topbar px-5 py-4">
          <p className="text-accent text-[9px] font-black uppercase tracking-widest">PaxCare</p>
          <h2 className="text-primary font-black text-2xl mt-0.5 tracking-wide" style={{ fontFamily: "'EB Garamond', serif" }}>Meu cofre de saúde</h2>
          <p className="text-muted-foreground text-xs leading-snug mt-1">
            Seus dados são seus. Cada clínica só vê o que você escolher compartilhar, e você pode retirar o acesso a qualquer momento.
          </p>
        </div>
      </header>

      <PaxCarePlanosPaciente token={token} />

      {msg && <div role="alert" className="concave-3d rounded-lg px-4 py-3 text-sm text-red-600">{msg}</div>}

      <section className="panel-3d rounded-xl p-4 space-y-3" aria-label="Clínicas vinculadas">
        <h3 className="text-primary font-black text-xs uppercase tracking-widest flex items-center gap-2"><Building2 className="w-4 h-4" />Clínicas vinculadas</h3>
        {ativos.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma clínica tem acesso ao seu cofre.</p>}
        {ativos.map((v) => (
          <div key={v.id} className="concave-3d rounded-lg p-3 space-y-2">
            <p className="text-primary font-black text-sm">{v.clinica}{v.local ? <span className="text-muted-foreground font-normal text-xs"> · {v.local}</span> : null}</p>
            <div className="flex flex-wrap gap-2">
              {CATS.map((c) => (
                <label key={c.k} className="flex items-center gap-2 min-h-[44px] px-2 text-xs">
                  <input type="checkbox" disabled={ocupado} checked={v.compartilha[c.k]} onChange={() => void alterar(v, c.k)} />{c.l}
                </label>
              ))}
            </div>
            {revogando === v.id ? (
              <div className="flex gap-2 items-center text-xs">
                <span>Retirar todo o acesso agora?</span>
                <button className="btn-3d px-3 min-h-[44px] text-xs font-black uppercase" onClick={() => void revogar(v.id)}>Sim, retirar</button>
                <button className="text-accent underline min-h-[44px]" onClick={() => setRevogando(null)}>Cancelar</button>
              </div>
            ) : (
              <button className="text-accent text-[10px] font-black uppercase tracking-widest underline min-h-[44px]" onClick={() => setRevogando(v.id)}>Revogar acesso</button>
            )}
          </div>
        ))}
        <div className="concave-3d rounded-lg p-3 space-y-2">
          <label className="block text-[10px] font-black uppercase tracking-widest text-primary" htmlFor="pc-emp">Vincular a uma clínica</label>
          <select id="pc-emp" value={novaEmp} onChange={(e) => setNovaEmp(e.target.value)} className="w-full min-h-[44px] rounded-md border bg-background px-2 text-sm">
            <option value="">Escolha a clínica…</option>
            {disp.map((d) => <option key={d.id} value={d.id}>{d.nome}{d.local ? ` · ${d.local}` : ""}</option>)}
          </select>
          <div className="flex flex-wrap gap-2">
            {CATS.map((c) => (
              <label key={c.k} className="flex items-center gap-2 min-h-[44px] px-2 text-xs">
                <input type="checkbox" checked={novaComp[c.k]} onChange={() => setNovaComp({ ...novaComp, [c.k]: !novaComp[c.k] })} />{c.l}
              </label>
            ))}
          </div>
          <button disabled={!novaEmp || ocupado} onClick={() => void vincular()} className="btn-3d w-full min-h-[44px] text-xs font-black uppercase tracking-widest disabled:opacity-40">Vincular</button>
        </div>
      </section>

      <PaxCareConviteMedico token={token} />

      <section className="panel-3d rounded-xl p-4 space-y-3" aria-label="Guardar no cofre">
        <h3 className="text-primary font-black text-xs uppercase tracking-widest flex items-center gap-2"><ShieldCheck className="w-4 h-4" />Guardar no cofre</h3>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo" className="w-full min-h-[44px] rounded-md border bg-background px-2 text-sm">
          {TIPOS.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" maxLength={160} className="w-full min-h-[44px] rounded-md border bg-background px-3 text-sm" />
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Observações (opcional)" rows={2} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => setArq(e.target.files?.[0] ?? null)} className="text-xs" />
        <button disabled={ocupado || titulo.trim().length < 2} onClick={() => void guardar()} className="btn-3d w-full min-h-[44px] text-xs font-black uppercase tracking-widest disabled:opacity-40">
          {ocupado ? "Guardando…" : "Guardar"}
        </button>
      </section>

      <section className="panel-3d rounded-xl p-4 space-y-2" aria-label="Itens do cofre">
        <h3 className="text-primary font-black text-xs uppercase tracking-widest">Meus itens</h3>
        {exClin && exClin.total > 0 && (
          <p className="text-xs text-muted-foreground">
            Resultados de exames feitos em {clinOrigem ?? "sua clínica"}: {exClin.total}{exClin.ultimaColeta ? `, última coleta em ${exClin.ultimaColeta.split("-").reverse().join("/")}` : ""}. Veja na aba Evolução.
          </p>
        )}
        {itens.length === 0 && <p className="text-xs text-muted-foreground">Seu cofre ainda está vazio.</p>}
        {itens.map((i) => (
          <div key={i.id} className="concave-3d rounded-lg p-3 flex items-start gap-2">
            <FileText className="w-4 h-4 mt-0.5 text-accent shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-primary font-black text-sm break-words">{i.titulo}</p>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{TIPOS.find((t) => t.v === i.tipo)?.l}{i.dataRef ? ` · ${i.dataRef.split("-").reverse().join("/")}` : ""}</p>
              {i.notas && <p className="text-xs mt-1 break-words">{i.notas}</p>}
              {i.temArquivo && <button className="text-accent text-xs underline min-h-[44px]" onClick={() => void abrir(i.id)}>Abrir {i.arquivoNome ?? "arquivo"}</button>}
            </div>
            <button aria-label="Remover do cofre" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground" onClick={() => void remover(i.id)}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </section>
    </div>
  );
}
