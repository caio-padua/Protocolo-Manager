import { useCallback, useEffect, useState } from "react";

// Oferta e contratação PaxCare (paciente). Preço, franquia e excedente aparecem como cadastrados; sem aceite, nada é contratado.
const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
type Plano = { id: number; nome: string; descricao: string | null; gratuito: boolean; precoCentavos: number | null; periodicidade: string | null;
  franquiaQtd: number | null; franquiaUnidade: string | null; franquiaPeriodo: string | null; precoExcedenteCentavos: number | null;
  descontoExcedentePct: number | null; beneficios: string[]; termoAceite: string | null; termoHash: string };
type Assin = { assinatura: null | { id: number; planoId: number; cobrancaStatus: string; plano: Plano }; consumo?: { periodo: string; usado: number; franquia: number | null; excedente: number; valorExcedenteCentavos: number | null } };
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PaxCarePlanosPaciente({ token }: { token: string }) {
  const auth = { Authorization: `Bearer ${token}` };
  const [planos, setPlanos] = useState<Plano[]>([]); const [aviso, setAviso] = useState("");
  const [a, setA] = useState<Assin>({ assinatura: null });
  const [aceites, setAceites] = useState<Record<number, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null); const [ocupado, setOcupado] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const carregar = useCallback(async () => {
    const [p, s] = await Promise.all([fetch(`${API_BASE}/api/area-paciente/paxcare/planos`, { headers: auth }), fetch(`${API_BASE}/api/area-paciente/paxcare/assinatura`, { headers: auth })]);
    if (p.ok) { const j = await p.json(); setPlanos(j.planos); setAviso(j.aviso); }
    if (s.ok) setA(await s.json());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { void carregar(); }, [carregar]);
  async function contratar(p: Plano) {
    if (ocupado || !aceites[p.id]) return;
    setOcupado(true); setMsg(null);
    try {
      const r = await fetch(`${API_BASE}/api/area-paciente/paxcare/assinatura`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ planoId: p.id, aceite: true, termoHash: p.termoHash }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Não foi possível contratar.");
      setMsg("Plano contratado."); await carregar();
    } catch (e) { setMsg((e as Error).message); } finally { setOcupado(false); }
  }
  async function cancelar() {
    const r = await fetch(`${API_BASE}/api/area-paciente/paxcare/assinatura`, { method: "DELETE", headers: auth });
    setCancelando(false); setMsg(r.ok ? "Assinatura cancelada." : "Não foi possível cancelar."); await carregar();
  }
  const atual = a.assinatura;
  return (
    <section className="panel-3d rounded-xl p-4 space-y-3" aria-label="Planos PaxCare" data-testid="paxcare-planos">
      <h3 className="text-primary font-black text-xs uppercase tracking-widest">Planos PaxCare</h3>
      {aviso && <p className="text-[11px] text-muted-foreground">{aviso}</p>}
      {msg && <div role="status" className="concave-3d rounded-lg px-3 py-2 text-sm">{msg}</div>}
      {atual && (
        <div className="concave-3d rounded-lg p-3 space-y-1">
          <p className="text-primary font-black text-sm">Seu plano: {atual.plano.nome}</p>
          {a.consumo && atual.plano.franquiaQtd !== null && (
            <p className="text-xs">Uso em {a.consumo.periodo}: {a.consumo.usado} de {atual.plano.franquiaQtd} {atual.plano.franquiaUnidade}{a.consumo.excedente > 0 ? `, excedente ${a.consumo.excedente}${a.consumo.valorExcedenteCentavos !== null ? ` (${brl(a.consumo.valorExcedenteCentavos)})` : ""}` : ""}</p>
          )}
          {atual.cobrancaStatus === "pendente_integracao" && <p className="text-[11px] text-muted-foreground">Cobrança ainda não ativada nesta fase; nada foi cobrado.</p>}
          {cancelando ? (
            <div className="flex gap-2 items-center text-xs"><span>Cancelar a assinatura?</span>
              <button className="btn-3d px-3 min-h-[44px] text-xs font-black uppercase" onClick={() => void cancelar()}>Sim, cancelar</button>
              <button className="underline text-accent min-h-[44px]" onClick={() => setCancelando(false)}>Voltar</button></div>
          ) : <button className="underline text-accent text-[10px] font-black uppercase tracking-widest min-h-[44px]" onClick={() => setCancelando(true)}>Cancelar assinatura</button>}
        </div>
      )}
      {!atual && planos.length === 0 && <p className="text-xs text-muted-foreground">Nenhum plano disponível no momento.</p>}
      {!atual && planos.map((p) => (
        <div key={p.id} className="concave-3d rounded-lg p-3 space-y-2">
          <p className="text-primary font-black text-sm">{p.nome}</p>
          {p.descricao && <p className="text-xs">{p.descricao}</p>}
          <p className="text-sm font-black">{p.gratuito ? "Gratuito" : `${brl(p.precoCentavos ?? 0)} / ${p.periodicidade === "anual" ? "ano" : "mês"}`}</p>
          {p.franquiaQtd !== null && <p className="text-xs">Franquia: {p.franquiaQtd} {p.franquiaUnidade} por {p.franquiaPeriodo === "anual" ? "ano" : "mês"}.
            {" "}{p.precoExcedenteCentavos !== null ? `Excedente: ${brl(p.precoExcedenteCentavos)} cada${p.descontoExcedentePct ? `, com ${String(p.descontoExcedentePct).replace(".", ",")}% de desconto` : ""}.` : "Acima da franquia não é possível usar."}</p>}
          {p.beneficios.length > 0 && <ul className="text-xs list-disc pl-5">{p.beneficios.map((b, i) => <li key={i}>{b}</li>)}</ul>}
          <div className="text-xs border rounded p-2 max-h-32 overflow-auto whitespace-pre-wrap">{p.termoAceite}</div>
          <label className="flex items-start gap-2 min-h-[44px] text-xs"><input type="checkbox" className="mt-1" checked={!!aceites[p.id]} onChange={(e) => setAceites({ ...aceites, [p.id]: e.target.checked })} />Li e aceito o termo deste plano.</label>
          <button disabled={!aceites[p.id] || ocupado} onClick={() => void contratar(p)} className="btn-3d w-full min-h-[44px] text-xs font-black uppercase tracking-widest disabled:opacity-40">Contratar</button>
        </div>
      ))}
    </section>
  );
}
