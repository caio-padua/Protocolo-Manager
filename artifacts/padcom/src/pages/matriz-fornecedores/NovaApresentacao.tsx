import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import type { Linha } from "./calculo";
import { unidadeTxt } from "./calculo";
import { V } from "./componentes";

const COMUNS = [1, 5, 10, 20, 25, 30, 50, 100];
const numSimples = (t: string): number => { const n = parseFloat(t.replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const num = (t: string): number => { const n = parseFloat(t.replace(/\./g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

/** Grava a apresentação (unidades na caixa e preço da caixa) de um laboratório para esta substância. */
export function NovaApresentacao({ linha, fornecedorId, fornecedorNome, avisar, aoGravar }: {
  linha: Linha; fornecedorId: number; fornecedorNome: string; avisar: (t: string) => void; aoGravar: () => void;
}) {
  const atual = linha.celulas.find((c) => c.fornecedorId === fornecedorId);
  const [qtd, setQtd] = useState(atual ? String(atual.quantidadeEmbalagem) : "");
  const [caixa, setCaixa] = useState(atual ? (atual.custoEmbalagemCentavos / 100).toFixed(2).replace(".", ",") : "");
  const [erro, setErro] = useState<string | null>(null);
  const sugestoes = useMemo(() => [...new Set([...linha.celulas.map((c) => c.quantidadeEmbalagem), ...COMUNS])].sort((a, b) => a - b), [linha]);
  const q = Math.round(numSimples(qtd)); const cx = Math.round(num(caixa) * 100);
  const unit = q > 0 && cx > 0 ? Math.round(cx / q) : null;

  const gravar = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/matriz-fornecedores/oferta", { method: "POST", headers: { ...collabAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ varianteId: linha.varianteId, fornecedorId, quantidadeEmbalagem: q, precoCaixaCentavos: cx }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Não foi possível gravar agora. Nada foi alterado.");
      return j as { atualizada: boolean };
    },
    onSuccess: (j) => { avisar(j.atualizada ? "Apresentação atualizada (o valor anterior ficou no histórico)." : "Apresentação gravada."); aoGravar(); },
    onError: (e: Error) => setErro(e.message),
  });

  return (<>
    <p className="mx-note" style={{ margin: 0 }}>
      {fornecedorNome} · {linha.produto} {linha.doseTotal}. {atual ? "Já existe preço deste laboratório: ao gravar, o valor anterior fica guardado no histórico." : "Este laboratório ainda não tem preço para esta apresentação."}
    </p>
    <div className="mx-nb-row">
      <div className="mx-fld"><span>Unidades na caixa</span>
        <div className="mx-well mx-fld-in"><input className="mx-num" style={{ width: 90 }} list="mx-qtds" value={qtd} inputMode="numeric" onChange={(e) => setQtd(e.target.value.replace(/\D/g, ""))} aria-label="Unidades na caixa" />
          <datalist id="mx-qtds">{sugestoes.map((n) => <option key={n} value={n}>{n} {unidadeTxt(linha.forma, n)}</option>)}</datalist></div></div>
      <div className="mx-fld"><span>Preço da caixa (R$)</span>
        <div className="mx-well mx-fld-in"><input className="mx-num" style={{ width: 120 }} value={caixa} inputMode="decimal" placeholder="0,00" onChange={(e) => setCaixa(e.target.value.replace(/[^\d,.]/g, ""))} aria-label="Preço da caixa em reais" /></div></div>
      <div className="mx-fld"><span>Por unidade</span><div className="mx-well mx-fld-in" style={{ minWidth: 90 }}>{unit ? <V c={unit} /> : <span className="mx-empty">—</span>}</div></div>
    </div>
    {erro && <p className="mx-note mx-note-err" role="alert">{erro}</p>}
    <button type="button" className="mx-btn mx-btn-gold" disabled={q <= 0 || cx <= 0 || gravar.isPending} onClick={() => { setErro(null); gravar.mutate(); }}>{gravar.isPending ? "Gravando…" : "Gravar apresentação"}</button>
  </>);
}
