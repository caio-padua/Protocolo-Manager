import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, X } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { nomeDe, type Calc, type Fornecedor } from "./calculo";
import { V, brl, qtdTxt } from "./componentes";

export function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  return (
    <div className="mx-scrim" onClick={onFechar}>
      <div className="mx-panel mx-modal" role="dialog" aria-modal="true" aria-label={titulo} onClick={(e) => e.stopPropagation()}>
        <div className="mx-bevel mx-modal-h" style={{ borderRadius: "6px 6px 0 0" }}>
          <h2>{titulo}</h2>
          <button type="button" className="mx-modal-x" aria-label="Fechar" onClick={onFechar}><X size={16} /></button>
        </div>
        <div className="mx-modal-b">{children}</div>
      </div>
    </div>
  );
}

/** Rascunho de pedido: nada é enviado a laboratório e o estoque não muda. */
export function PedidoPorLaboratorio({ fornecedores, cor, linhas, avisar }: { fornecedores: Fornecedor[]; cor: (id: number) => string; linhas: Calc[]; avisar: (t: string) => void }) {
  const [soFalta, setSoFalta] = useState(true);
  const pedidos = useMemo(() => fornecedores.map((f) => {
    const itens = linhas.filter((x) => x.vencedoras[0]?.fornecedorId === f.id).map((x) => {
      const c = x.vencedoras[0];
      const falta = x.linha.estoque?.falta ?? 0;
      const caixas = falta > 0 ? Math.ceil(falta / c.quantidadeEmbalagem) : soFalta ? 0 : 1;
      return { nome: `${nomeDe(x.linha)} ${x.linha.doseTotal}`, caixas, qtd: c.quantidadeEmbalagem, falta, total: caixas * c.custoEmbalagemCentavos, caixa: c.custoEmbalagemCentavos };
    }).filter((i) => i.caixas > 0);
    return { f, itens, total: itens.reduce((a, b) => a + b.total, 0) };
  }), [fornecedores, linhas, soFalta]);

  const copiar = (i: number) => {
    const p = pedidos[i];
    const t = `Rascunho de pedido, ${p.f.nome}\n${p.itens.map((x) => `${x.caixas} cx c/ ${x.qtd} un.  ${x.nome}  ${brl(x.caixa)} cada`).join("\n")}\nTotal: ${brl(p.total)}`;
    try { void navigator.clipboard?.writeText(t); } catch { /* sem permissão: segue só com o aviso */ }
    avisar(`Lista de ${p.f.nome} copiada (${p.itens.length} itens)`);
  };
  return (<>
    <p className="mx-note" style={{ margin: 0 }}>Cada produto vai para o laboratório de menor preço. É um rascunho: nada é enviado a laboratório e o estoque não muda.</p>
    <div className="mx-ped-opt">
      <label className="mx-check"><input type="checkbox" checked={soFalta} onChange={(e) => setSoFalta(e.target.checked)} />Só o que está faltando (livre menor que zero)</label>
      <span className="mx-note">Desmarcado, entra 1 caixa de cada produto vencedor.</span>
    </div>
    <div className="mx-pedidos">
      {pedidos.map((p, i) => (
        <div key={p.f.id} className="mx-panel mx-ped" style={{ ["--pc" as string]: cor(p.f.id) }}>
          <h3>{p.f.nome}</h3>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span className="mx-serif" style={{ fontSize: 30, fontWeight: 800 }}>{p.itens.length}</span><span className="mx-note">itens no rascunho</span>
          </div>
          <V c={p.total} />
          <ul>
            {p.itens.slice(0, 6).map((x) => <li key={x.nome}><span title={x.nome}>{x.caixas} cx · {x.nome}</span><V c={x.total} peso={600} className="mx-money mx-m13" /></li>)}
            {p.itens.length === 0 && <li><span className="mx-empty">Nenhum item vence aqui.</span></li>}
          </ul>
          {p.itens.length > 6 && <span className="mx-note">e mais {p.itens.length - 6}</span>}
          <button type="button" className="mx-btn" disabled={!p.itens.length} onClick={() => copiar(i)}><Copy size={13} />Copiar lista</button>
        </div>
      ))}
    </div>
  </>);
}

type Reserva = { id: number; protocolId: number; protocolo: string; cliente: string | null; substancia: string; reservada: number; consumida: number; liberada: number; status: string };

/** Reservas ativas (estoque dinâmico). Liberar é decisão humana e exige segundo clique. */
export function ReservasDeEstoque({ avisar, aoMudar }: { avisar: (t: string) => void; aoMudar: () => void }) {
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState<number | null>(null);
  const lista = useQuery({
    queryKey: ["estoque-reservas"],
    queryFn: async (): Promise<Reserva[]> => {
      const r = await fetch("/api/estoque/reservas?status=ativa", { headers: collabAuthHeaders() });
      if (!r.ok) throw new Error("Não foi possível ler as reservas agora.");
      return r.json();
    },
  });
  const liberar = useMutation({
    mutationFn: async (protocolId: number) => {
      const r = await fetch(`/api/estoque/reservas/protocolo/${protocolId}/liberar`, { method: "POST", headers: collabAuthHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Não foi possível liberar a reserva.");
      return j as { unidades: number };
    },
    onSuccess: (j) => { avisar(`${qtdTxt(j.unidades)} unidades voltaram ao estoque livre`); setConfirmar(null); void qc.invalidateQueries({ queryKey: ["estoque-reservas"] }); aoMudar(); },
    onError: (e: Error) => avisar(e.message),
  });
  const dados = lista.data ?? [];
  return (<>
    <p className="mx-note" style={{ margin: 0 }}>
      Quando um protocolo é confirmado, as unidades de cada item saem do estoque livre e ficam reservadas aqui. Cada aplicação confirmada baixa 1 unidade da reserva e do lote que vence primeiro.
      Liberar devolve ao estoque livre só o que ainda não foi aplicado; o estoque físico não muda.
    </p>
    {lista.isLoading && <p className="mx-note">Carregando…</p>}
    {lista.isError && <p className="mx-note mx-note-err" role="alert">{(lista.error as Error).message}</p>}
    {lista.data && (
      <div className="mx-well" style={{ padding: 4, overflow: "auto" }}>
        <table className="mx-resv">
          <thead><tr><th>Protocolo</th><th>Cliente</th><th>Substância</th><th className="mx-n">Reservada</th><th className="mx-n">Aplicada</th><th className="mx-n">Restante</th><th /></tr></thead>
          <tbody>
            {dados.map((r) => (
              <tr key={r.id}>
                <td>{r.protocolo}</td><td>{r.cliente ?? "—"}</td><td>{r.substancia}</td>
                <td className="mx-n">{qtdTxt(r.reservada)}</td><td className="mx-n">{qtdTxt(r.consumida)}</td><td className="mx-n"><b>{qtdTxt(r.reservada - r.consumida - r.liberada)}</b></td>
                <td className="mx-n">
                  {confirmar === r.protocolId
                    ? <button type="button" className="mx-btn mx-btn-gold" style={{ height: 28 }} disabled={liberar.isPending} onClick={() => liberar.mutate(r.protocolId)}>Confirmar liberação do protocolo</button>
                    : <button type="button" className="mx-btn" style={{ height: 28 }} onClick={() => setConfirmar(r.protocolId)}>Liberar</button>}
                </td>
              </tr>
            ))}
            {dados.length === 0 && <tr><td colSpan={7} className="mx-empty" style={{ padding: 16 }}>Nenhuma reserva ativa. Elas nascem quando um protocolo é confirmado no agendamento.</td></tr>}
          </tbody>
        </table>
      </div>
    )}
  </>);
}
