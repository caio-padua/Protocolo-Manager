import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FlaskConical, Plus, Trash2 } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import type { Fornecedor } from "./calculo";
import { V } from "./componentes";

type Comp = { nome: string; dose: string; unidade: string };
const VIAS = ["IM", "EV", "SC", "ID"] as const;
const UNIDADES = ["mg", "mcg", "g", "UI", "%", "mL"];
const vazio = (): Comp => ({ nome: "", dose: "", unidade: "mg" });
const num = (t: string): number => { const n = parseFloat(t.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const numSimples = (t: string): number => { const n = parseFloat(t.replace(",", ".")); return Number.isFinite(n) ? n : 0; };

/** Cadastro visual de blend: a prévia em etiquetas mostra exatamente o que será gravado. */
export function NovoBlend({ fornecedores, avisar, aoCriar }: { fornecedores: Fornecedor[]; avisar: (t: string) => void; aoCriar: () => void }) {
  const ativos = fornecedores.filter((f) => f.ativo);
  const [nome, setNome] = useState("");
  const [via, setVia] = useState<(typeof VIAS)[number]>("IM");
  const [forma, setForma] = useState<"ampola" | "frasco">("ampola");
  const [volume, setVolume] = useState("2");
  const [lab, setLab] = useState<number>(ativos[0]?.id ?? 0);
  const [qtd, setQtd] = useState("10");
  const [caixa, setCaixa] = useState("");
  const [comps, setComps] = useState<Comp[]>([vazio(), vazio()]);
  const [erro, setErro] = useState<string | null>(null);

  const mudar = (i: number, patch: Partial<Comp>) => setComps((cs) => cs.map((c, k) => (k === i ? { ...c, ...patch } : c)));
  const validos = useMemo(() => comps.filter((c) => c.nome.trim().length >= 2 && numSimples(c.dose) > 0), [comps]);
  const caixaCent = Math.round(num(caixa) * 100);
  const qtdN = Math.round(numSimples(qtd));
  const unit = qtdN > 0 && caixaCent > 0 ? Math.round(caixaCent / qtdN) : null;
  const pronto = nome.trim().length >= 3 && validos.length >= 2 && validos.length === comps.length && caixaCent > 0 && qtdN > 0 && numSimples(volume) > 0 && lab > 0;

  const gravar = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/matriz-fornecedores/blend", {
        method: "POST", headers: { ...collabAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(), via, forma, volumeMl: numSimples(volume), fornecedorId: lab, quantidadeEmbalagem: qtdN, precoCaixaCentavos: caixaCent,
          componentes: comps.map((c) => ({ nome: c.nome.trim(), dose: numSimples(c.dose), unidade: c.unidade })),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Não foi possível cadastrar agora. Nada foi gravado.");
      return j as { substanciaNova: boolean };
    },
    onSuccess: (j) => { avisar(j.substanciaNova ? "Blend cadastrado como indisponível, aguardando revisão clínica." : "Preço do laboratório incluído no blend existente."); aoCriar(); },
    onError: (e: Error) => setErro(e.message),
  });

  return (<>
    <p className="mx-note" style={{ margin: 0 }}>
      O blend nasce <b>indisponível</b>: só aparece para uso clínico depois da revisão do médico. Nada aqui altera preço de venda, estoque ou protocolo.
    </p>
    <div className="mx-nb">
      <div className="mx-nb-form">
        <div className="mx-fld"><span>Nome do blend</span>
          <div className="mx-well mx-fld-in"><input className="mx-txt" value={nome} maxLength={120} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pool Cognitivo" aria-label="Nome do blend" /></div></div>
        <div className="mx-nb-row">
          <div className="mx-fld"><span>Via de uso</span>
            <div className="mx-well mx-seg" role="group" aria-label="Via de uso do blend">
              {VIAS.map((v) => <button key={v} type="button" aria-pressed={via === v} onClick={() => setVia(v)}>{v}</button>)}
            </div></div>
          <div className="mx-fld"><span>Embalagem</span>
            <div className="mx-well mx-seg" role="group" aria-label="Forma">
              {(["ampola", "frasco"] as const).map((f) => <button key={f} type="button" aria-pressed={forma === f} onClick={() => setForma(f)}>{f === "ampola" ? "Ampola" : "Frasco"}</button>)}
            </div></div>
          <div className="mx-fld"><span>Volume (mL)</span>
            <div className="mx-well mx-fld-in"><input className="mx-num" style={{ width: 70 }} value={volume} inputMode="decimal" onChange={(e) => setVolume(e.target.value)} aria-label="Volume em mililitros" /></div></div>
        </div>
        <div className="mx-nb-row">
          <div className="mx-fld" style={{ flex: 2 }}><span>Laboratório</span>
            <div className="mx-well mx-fld-in">
              <select className="mx-txt" value={lab} onChange={(e) => setLab(Number(e.target.value))} aria-label="Laboratório">
                {ativos.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select></div></div>
          <div className="mx-fld"><span>Unidades na caixa</span>
            <div className="mx-well mx-fld-in"><input className="mx-num" style={{ width: 70 }} value={qtd} inputMode="numeric" onChange={(e) => setQtd(e.target.value.replace(/\D/g, ""))} aria-label="Unidades na caixa" /></div></div>
          <div className="mx-fld"><span>Preço da caixa (R$)</span>
            <div className="mx-well mx-fld-in"><input className="mx-num" style={{ width: 100 }} value={caixa} inputMode="decimal" placeholder="0,00" onChange={(e) => setCaixa(e.target.value.replace(/[^\d,.]/g, ""))} aria-label="Preço da caixa em reais" /></div></div>
        </div>

        <div className="mx-nb-comps">
          <span className="mx-nb-h">Componentes (dose em cada {forma})</span>
          {comps.map((c, i) => (
            <div className="mx-nb-comp" key={i}>
              <div className="mx-well mx-fld-in" style={{ flex: 1 }}><input className="mx-txt" value={c.nome} maxLength={80} placeholder={`Componente ${i + 1}`} aria-label={`Nome do componente ${i + 1}`} onChange={(e) => mudar(i, { nome: e.target.value })} /></div>
              <div className="mx-well mx-fld-in"><input className="mx-num" style={{ width: 84 }} value={c.dose} inputMode="decimal" placeholder="Dose" aria-label={`Dose do componente ${i + 1}`} onChange={(e) => mudar(i, { dose: e.target.value.replace(/[^\d,.]/g, "") })} /></div>
              <div className="mx-well mx-fld-in"><select className="mx-txt" value={c.unidade} aria-label={`Unidade do componente ${i + 1}`} onChange={(e) => mudar(i, { unidade: e.target.value })}>{UNIDADES.map((u) => <option key={u}>{u}</option>)}</select></div>
              <button type="button" className="mx-btn" style={{ height: 34 }} disabled={comps.length <= 2} aria-label={`Remover componente ${i + 1}`} onClick={() => setComps((cs) => cs.filter((_, k) => k !== i))}><Trash2 size={14} /></button>
            </div>
          ))}
          <button type="button" className="mx-btn" disabled={comps.length >= 20} onClick={() => setComps((cs) => [...cs, vazio()])}><Plus size={14} />Adicionar componente</button>
        </div>
      </div>

      <aside className="mx-panel mx-nb-prev" aria-label="Prévia do blend">
        <span className="mx-nb-h">Prévia</span>
        <div className="mx-nb-card">
          <div className="mx-nb-title"><FlaskConical size={16} /><b>{nome.trim() || "Nome do blend"}</b><span className="mx-tag mx-tag-blend">Blend</span></div>
          <div className="mx-nb-meta"><span>{via}</span><span>{forma === "ampola" ? "Ampola" : "Frasco"} de {numSimples(volume) || "—"} mL</span><span className="mx-tag mx-tag-conf">Indisponível até revisão</span></div>
          <div className="mx-chips" aria-label="Componentes">
            {validos.length === 0 && <span className="mx-empty">Preencha ao menos 2 componentes.</span>}
            {validos.map((c, i) => <span key={i} className="mx-bchip"><b>{c.nome.trim()}</b>{c.dose.trim()} {c.unidade}</span>)}
          </div>
          <div className="mx-nb-money">
            <div><span>Caixa com {qtdN || "—"}</span>{caixaCent > 0 ? <V c={caixaCent} /> : <span className="mx-empty">—</span>}</div>
            <div><span>Por unidade</span>{unit ? <V c={unit} /> : <span className="mx-empty">—</span>}</div>
          </div>
        </div>
        {erro && <p className="mx-note mx-note-err" role="alert">{erro}</p>}
        <button type="button" className="mx-btn mx-btn-gold" disabled={!pronto || gravar.isPending} onClick={() => { setErro(null); gravar.mutate(); }}>
          {gravar.isPending ? "Cadastrando…" : "Cadastrar blend"}
        </button>
        {!pronto && <p className="mx-note" style={{ margin: 0 }}>Falta: nome, laboratório, preço da caixa e 2 ou mais componentes com dose.</p>}
      </aside>
    </div>
  </>);
}
