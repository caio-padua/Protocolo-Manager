import { useCallback, useEffect, useState } from "react";
import { collabAuthHeaders } from "@/lib/collab-auth";

// PAXCARE > PLANOS (titular da plataforma). Nada vem preenchido: preço, franquia, excedente e desconto nascem vazios.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
type Plano = {
  id: number; nome: string; descricao: string | null; status: "rascunho" | "ativo" | "encerrado"; gratuito: boolean;
  precoCentavos: number | null; periodicidade: "mensal" | "anual" | null;
  franquiaQtd: number | null; franquiaUnidade: string | null; franquiaPeriodo: "mensal" | "anual" | null;
  precoExcedenteCentavos: number | null; descontoExcedentePct: number | null; beneficios: string[]; termoAceite: string | null;
};
const reais = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2).replace(".", ","));
const paraCentavos = (s: string) => { const t = s.trim().replace(/\./g, "").replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN; };
const paraInt = (s: string) => { const t = s.trim(); if (!t) return null; const n = Number(t); return Number.isInteger(n) && n >= 0 ? n : NaN; };
const paraPct = (s: string) => { const t = s.trim().replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN; };

function Editor({ plano, onDone, onMsg }: { plano: Plano; onDone: () => void; onMsg: (m: string) => void }) {
  const [f, setF] = useState({
    nome: plano.nome, descricao: plano.descricao ?? "", gratuito: plano.gratuito, preco: reais(plano.precoCentavos), per: plano.periodicidade ?? "",
    fq: plano.franquiaQtd === null ? "" : String(plano.franquiaQtd), fu: plano.franquiaUnidade ?? "", fp: plano.franquiaPeriodo ?? "",
    pe: reais(plano.precoExcedenteCentavos), de: plano.descontoExcedentePct === null ? "" : String(plano.descontoExcedentePct).replace(".", ","),
    be: plano.beneficios.join("\n"), te: plano.termoAceite ?? "",
  });
  const [ocupado, setOcupado] = useState(false);
  const encerrado = plano.status === "encerrado";
  async function chamar(path: string, method: string, body?: unknown) {
    const r = await fetch(`${BASE}/api/paxcare/planos/${plano.id}${path}`, { method, headers: collabAuthHeaders(body ? { "Content-Type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Não foi possível concluir.");
  }
  async function salvar() {
    const preco = paraCentavos(f.preco), pe = paraCentavos(f.pe), fq = paraInt(f.fq), de = paraPct(f.de);
    if ([preco, pe, fq, de].some((v) => typeof v === "number" && Number.isNaN(v))) { onMsg("Confira os números digitados."); return; }
    setOcupado(true);
    try {
      await chamar("", "PATCH", {
        nome: f.nome, descricao: f.descricao.trim() || null, gratuito: f.gratuito, precoCentavos: f.gratuito ? null : preco,
        periodicidade: f.gratuito ? null : (f.per || null), franquiaQtd: fq, franquiaUnidade: f.fu.trim() || null, franquiaPeriodo: f.fp || null,
        precoExcedenteCentavos: pe, descontoExcedentePct: de,
        beneficios: f.be.split("\n").map((s) => s.trim()).filter(Boolean), termoAceite: f.te.trim() || null,
      });
      onMsg("Plano salvo."); onDone();
    } catch (e) { onMsg((e as Error).message); } finally { setOcupado(false); }
  }
  async function status(acao: "ativar" | "encerrar") {
    setOcupado(true);
    try { await chamar(`/${acao}`, "POST"); onMsg(acao === "ativar" ? "Plano ativado." : "Plano encerrado."); onDone(); }
    catch (e) { onMsg((e as Error).message); } finally { setOcupado(false); }
  }
  const campo = "w-full min-h-[44px] rounded-md border bg-background px-3 text-sm";
  const rot = "block text-[10px] font-black uppercase tracking-widest text-primary mb-1";
  return (
    <div className="concave-3d rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-primary font-black text-sm uppercase tracking-wide">#{plano.id} · {plano.status}</p>
      </div>
      <fieldset disabled={encerrado || ocupado} className="space-y-3">
        <div><label className={rot}>Nome</label><input className={campo} value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
        <div><label className={rot}>Descrição</label><textarea className={campo} rows={2} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
        <label className="flex items-center gap-2 min-h-[44px] text-sm"><input type="checkbox" checked={f.gratuito} onChange={(e) => setF({ ...f, gratuito: e.target.checked })} />Plano gratuito</label>
        {!f.gratuito && (
          <div className="grid grid-cols-2 gap-3">
            <div><label className={rot}>Preço (R$)</label><input inputMode="decimal" className={campo} value={f.preco} onChange={(e) => setF({ ...f, preco: e.target.value })} placeholder="não informado" /></div>
            <div><label className={rot}>Cobrança</label>
              <select className={campo} value={f.per} onChange={(e) => setF({ ...f, per: e.target.value as "mensal" | "anual" | "" })}><option value="">não informada</option><option value="mensal">Mensal</option><option value="anual">Anual</option></select></div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div><label className={rot}>Franquia</label><input inputMode="numeric" className={campo} value={f.fq} onChange={(e) => setF({ ...f, fq: e.target.value })} placeholder="sem franquia" /></div>
          <div><label className={rot}>Unidade</label><input className={campo} value={f.fu} onChange={(e) => setF({ ...f, fu: e.target.value })} placeholder="ex.: pedidos" /></div>
          <div><label className={rot}>Período</label>
            <select className={campo} value={f.fp} onChange={(e) => setF({ ...f, fp: e.target.value as "mensal" | "anual" | "" })}><option value="">—</option><option value="mensal">Mensal</option><option value="anual">Anual</option></select></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={rot}>Preço do excedente (R$)</label><input inputMode="decimal" className={campo} value={f.pe} onChange={(e) => setF({ ...f, pe: e.target.value })} placeholder="não informado" /></div>
          <div><label className={rot}>Desconto no excedente (%)</label><input inputMode="decimal" className={campo} value={f.de} onChange={(e) => setF({ ...f, de: e.target.value })} placeholder="nenhum" /></div>
        </div>
        <div><label className={rot}>Benefícios (um por linha)</label><textarea className={campo} rows={3} value={f.be} onChange={(e) => setF({ ...f, be: e.target.value })} /></div>
        <div><label className={rot}>Termo de aceite (texto que o paciente lê)</label><textarea className={campo} rows={4} value={f.te} onChange={(e) => setF({ ...f, te: e.target.value })} /></div>
      </fieldset>
      {!encerrado && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void salvar()} disabled={ocupado} className="btn-3d min-h-[44px] px-4 text-xs font-black uppercase tracking-widest disabled:opacity-40">Salvar</button>
          {plano.status === "rascunho" && <button onClick={() => void status("ativar")} disabled={ocupado} className="btn-3d min-h-[44px] px-4 text-xs font-black uppercase tracking-widest disabled:opacity-40">Ativar</button>}
          {plano.status === "ativo" && <button onClick={() => void status("encerrar")} disabled={ocupado} className="min-h-[44px] px-4 text-xs font-black uppercase tracking-widest underline text-accent">Encerrar (fecha novas contratações)</button>}
        </div>
      )}
    </div>
  );
}

export default function PaxCarePlanos() {
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const carregar = useCallback(async () => {
    const r = await fetch(`${BASE}/api/paxcare/planos`, { headers: collabAuthHeaders() });
    if (r.status === 403) { setMsg("Acesso restrito ao titular da plataforma."); setPlanos([]); return; }
    if (!r.ok) { setMsg("Não foi possível carregar os planos."); setPlanos([]); return; }
    setPlanos(await r.json());
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  async function criar() {
    const r = await fetch(`${BASE}/api/paxcare/planos`, { method: "POST", headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ nome }) });
    if (!r.ok) { setMsg("Informe o nome do plano."); return; }
    setNome(""); setMsg("Rascunho criado. Preencha e ative."); await carregar();
  }
  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <header className="panel-3d rounded-xl p-5">
        <p className="text-accent text-[9px] font-black uppercase tracking-widest">PaxCare</p>
        <h1 className="text-primary font-black text-2xl" style={{ fontFamily: "'EB Garamond', serif" }}>Planos do paciente</h1>
        <p className="text-muted-foreground text-xs mt-1">Nenhum valor vem preenchido. A assinatura do PaxCare é separada do PAM de cada clínica. Planos encerrados ficam guardados e contratos existentes continuam.</p>
      </header>
      {msg && <div role="status" className="concave-3d rounded-lg px-4 py-3 text-sm">{msg}</div>}
      <div className="panel-3d rounded-xl p-4 flex gap-2">
        <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do novo plano" className="flex-1 min-h-[44px] rounded-md border bg-background px-3 text-sm" />
        <button disabled={nome.trim().length < 2} onClick={() => void criar()} className="btn-3d min-h-[44px] px-4 text-xs font-black uppercase tracking-widest disabled:opacity-40">Criar rascunho</button>
      </div>
      {planos === null ? <p className="text-sm text-muted-foreground">Carregando…</p> : planos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum plano cadastrado.</p> :
        planos.map((p) => <Editor key={`${p.id}-${p.status}`} plano={p} onDone={() => void carregar()} onMsg={setMsg} />)}
    </div>
  );
}
