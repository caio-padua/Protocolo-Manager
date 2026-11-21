import { useCallback, useEffect, useState } from "react";
import { HeartPulse, IdCard, Scissors, TriangleAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api, dataBR, formatarValor, MUDO, NAVY, OURO, type Resposta, type SessaoDetalhe } from "./util";

const CIRURGIAS = [8, 9, 88, 315];
const CONDICOES = [6, 82, 83, 84];
type Correcao = { id: number; questionRowId: number; pergunta: string | null; texto: string; status: string; criadoEm: string; notaProfissional: string | null };

const valor = (rs: Resposta[] | undefined, id: number) => {
  const r = rs?.find((x) => x.questionRowId === id);
  return r ? formatarValor(r.valor) : "—";
};

/** Resumo compacto do retorno: identidade do cadastro, cirurgias, condicoes e correcoes pendentes. */
export default function ResumoRetorno({ clientId, detail, base }: { clientId: number; detail: SessaoDetalhe; base?: SessaoDetalhe }) {
  const { toast } = useToast();
  const [correcoes, setCorrecoes] = useState<Correcao[]>([]);
  const [nota, setNota] = useState<Record<number, string>>({});
  const ler = useCallback(async () => {
    try { setCorrecoes(await api<Correcao[]>(`/api/collaborator/anamnese/clientes/${clientId}/correcoes`)); } catch { /* sem acesso: o painel principal ja avisa */ }
  }, [clientId]);
  useEffect(() => { void ler(); }, [ler]);

  async function resolver(id: number, decisao: "aceita" | "recusada") {
    try {
      await api(`/api/collaborator/anamnese/correcoes/${id}/resolver`, { method: "POST", body: JSON.stringify({ decisao, nota: nota[id] ?? "" }) });
      toast({ title: "Pedido registrado", description: "A decisão ficou na trilha. O histórico original não foi alterado." });
      await ler();
    } catch (e) { toast({ title: "Não foi possível registrar", description: (e as Error).message, variant: "destructive" }); }
  }

  const id = detail.identidade;
  const pendentes = correcoes.filter((c) => c.status === "pendente");
  const r = detail.respostas, b = base?.respostas;
  return (
    <div className="grid gap-3 lg:grid-cols-3" data-testid="resumo-retorno">
      <div className="panel-3d-sub p-3" data-testid="resumo-identidade">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}><IdCard className="h-3.5 w-3.5" style={{ color: OURO }} /> Identidade (cadastro)</div>
        {id ? (
          <div className="space-y-0.5 text-[12px]" style={{ color: NAVY }}>
            <div className="font-bold">{id.nome ?? "—"}</div>
            <div>CPF {id.cpfMascarado ?? "—"}</div>
            <div>{id.idade != null ? `${id.idade} anos` : "idade indisponível"}{id.dataNascimento ? ` · nasc. ${dataBR(id.dataNascimento.length === 10 ? `${id.dataNascimento}T12:00:00Z` : id.dataNascimento)}` : ""}</div>
          </div>
        ) : <div className="text-[12px]" style={{ color: MUDO }}>Sessão sem cliente vinculado.</div>}
      </div>

      <div className="panel-3d-sub p-3" data-testid="resumo-cirurgias">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}><Scissors className="h-3.5 w-3.5" style={{ color: OURO }} /> Cirurgias (só crescem)</div>
        <ul className="space-y-1 text-[12px]" style={{ color: NAVY }}>
          {CIRURGIAS.map((q) => (valor(r, q) !== "—" || valor(b, q) !== "—") && (
            <li key={q}><span style={{ color: MUDO }}>{r?.find((x) => x.questionRowId === q)?.pergunta ?? b?.find((x) => x.questionRowId === q)?.pergunta ?? ""}: </span><b>{valor(r, q)}</b></li>
          ))}
        </ul>
      </div>

      <div className="panel-3d-sub p-3" data-testid="resumo-condicoes">
        <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: NAVY }}><HeartPulse className="h-3.5 w-3.5" style={{ color: OURO }} /> Condições</div>
        <ul className="space-y-1 text-[12px]" style={{ color: NAVY }}>
          {CONDICOES.map((q) => (valor(r, q) !== "—" || valor(b, q) !== "—") && (
            <li key={q}><span style={{ color: MUDO }}>{(r ?? b ?? []).find((x) => x.questionRowId === q)?.pergunta ?? ""}: </span><b>{valor(r, q)}</b>
              {base && valor(b, q) !== valor(r, q) && <span style={{ color: MUDO }}> (antes: {valor(b, q)})</span>}</li>
          ))}
        </ul>
      </div>

      {pendentes.length > 0 && (
        <div className="lg:col-span-3 rounded-md border border-amber-300 bg-amber-50 p-3" data-testid="correcoes-pendentes">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800"><TriangleAlert className="h-3.5 w-3.5" /> Erros comunicados pelo cliente ({pendentes.length})</div>
          {pendentes.map((c) => (
            <div key={c.id} className="space-y-1 border-t border-amber-200 py-2 text-[12px] text-amber-900">
              <div><b>{c.pergunta ?? "Registro"}</b> — {c.texto} <span className="opacity-70">({dataBR(c.criadoEm)})</span></div>
              <input value={nota[c.id] ?? ""} onChange={(e) => setNota((n) => ({ ...n, [c.id]: e.target.value }))} placeholder="Nota do profissional (obrigatória)" className="field-engraved w-full px-2 py-1.5 text-[12px]" data-testid="correcao-nota" />
              <div className="flex gap-2">
                <button type="button" className="btn-3d rounded-md px-3 py-1 text-[11px] font-semibold uppercase" onClick={() => void resolver(c.id, "aceita")} data-testid="correcao-aceitar">Aceitar pedido</button>
                <button type="button" className="btn-3d-soft rounded-md px-3 py-1 text-[11px] font-semibold uppercase" onClick={() => void resolver(c.id, "recusada")}>Recusar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
