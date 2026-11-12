import { Plus, Trash2 } from "lucide-react";
import { useProcedimentosAtivos, type EntradaProcedimento } from "@/lib/pit-stop-api";

export type ProcedimentoEscolhido = EntradaProcedimento & { chave: string };
export const novaChave = () => `proc-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Escolha de procedimentos reais do catálogo da clínica para o lançamento. A equipe padrão (até 3 pessoas, individual
 * ou conjunta) vem do cadastro do procedimento e é editada na tela do Pit Stop, depois que o protocolo é lançado.
 */
export function SeletorProcedimentos({ valor, onChange }: { valor: ProcedimentoEscolhido[]; onChange: (v: ProcedimentoEscolhido[]) => void }) {
  const catalogo = useProcedimentosAtivos();
  const atualizar = (chave: string, parte: Partial<ProcedimentoEscolhido>) => onChange(valor.map((p) => (p.chave === chave ? { ...p, ...parte } : p)));
  return (
    <section className="panel-3d-sub mt-5 space-y-3 p-4" aria-label="Procedimentos do Pit Stop" data-testid="seletor-procedimentos">
      <h3 className="text-xs font-black uppercase tracking-widest">Procedimentos com equipe (Pit Stop)</h3>
      <p className="text-xs text-muted-foreground">
        Opcional. Escolha procedimentos reais do catálogo (com ou sem substância). Ao lançar, o agendamento vai para o Pit Stop, onde você confere a equipe e as agendas.
        Nada é reservado até a confirmação.
      </p>
      {catalogo.isError && <p role="alert" className="text-xs text-red-800">Não foi possível carregar os procedimentos da clínica.</p>}
      {valor.map((p) => (
        <div key={p.chave} className="concave-3d grid gap-2 p-3 sm:grid-cols-5">
          <label className="text-[11px] font-bold sm:col-span-2">Procedimento
            <select className="field-engraved mt-1 min-h-10 w-full px-2" value={p.procedimentoId || ""} onChange={(e) => atualizar(p.chave, { procedimentoId: Number(e.target.value) })}>
              <option value="">Selecione…</option>
              {(catalogo.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-bold">Sessões
            <input type="number" min={1} max={365} className="field-engraved mt-1 min-h-10 w-full px-2" value={p.totalSessoes ?? 1}
              onChange={(e) => atualizar(p.chave, { totalSessoes: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label className="text-[11px] font-bold">Intervalo (dias)
            <input type="number" min={0} max={365} className="field-engraved mt-1 min-h-10 w-full px-2" value={p.intervaloDias ?? 7}
              onChange={(e) => atualizar(p.chave, { intervaloDias: Math.max(0, Number(e.target.value) || 0) })} />
          </label>
          <label className="text-[11px] font-bold">Início
            <input type="date" className="field-engraved mt-1 min-h-10 w-full px-2" value={p.dataInicio ?? ""} onChange={(e) => atualizar(p.chave, { dataInicio: e.target.value || null })} />
          </label>
          <button type="button" className="text-left text-[11px] font-bold text-red-800 sm:col-span-5" onClick={() => onChange(valor.filter((x) => x.chave !== p.chave))}>
            <Trash2 className="mr-1 inline h-3 w-3" />Remover procedimento
          </button>
        </div>
      ))}
      <button type="button" className="btn-3d-soft inline-flex items-center gap-2 rounded px-4 py-2 text-xs font-bold uppercase tracking-wide"
        onClick={() => onChange([...valor, { chave: novaChave(), procedimentoId: 0, totalSessoes: 1, intervaloDias: 7, dataInicio: null }])}>
        <Plus className="h-4 w-4" />Adicionar procedimento
      </button>
      {valor.length > 0 && (
        <p className="text-[11px] font-bold text-amber-900">
          Este lançamento será agendado pelo Pit Stop. As substâncias escolhidas acima ficam no protocolo; os horários vêm dos procedimentos.
        </p>
      )}
    </section>
  );
}
