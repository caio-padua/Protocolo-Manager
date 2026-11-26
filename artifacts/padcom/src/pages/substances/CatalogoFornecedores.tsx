import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Valor } from "@/components/numeral/Numeral";
import { MATRIZ_COMPLETA_KEY, useMatrizCompleta, type Linha } from "./ValoresPorFornecedor";

/**
 * Catálogo padrão: UMA lista, na MESMA ordem, para todos os fornecedores.
 * Ordem fixa = categoria, nome, dose. O fornecedor que não tem o produto mantém a posição, apagadinho.
 */
export function useCatalogoPadrao() {
  const q = useMatrizCompleta();
  const linhas = useMemo(() => [...(q.data?.linhas ?? [])].sort((a, b) =>
    a.classe.localeCompare(b.classe, "pt-BR") || a.produto.localeCompare(b.produto, "pt-BR") ||
    a.doseTotal.localeCompare(b.doseTotal, "pt-BR", { numeric: true }) || a.varianteId - b.varianteId), [q.data]);
  return { q, linhas, fornecedores: q.data?.fornecedores ?? [] };
}

const apresentacao = (l: Linha) => `${l.doseTotal} · ${l.forma}${l.volumeMl ? ` · ${l.volumeMl} mL` : ""}${l.concentracao ? ` · ${l.concentracao}` : ""}`;
const custoDe = (l: Linha, fornecedorId: number) => l.celulas.find((c) => c.fornecedorId === fornecedorId && c.custoUnitarioCentavos > 0);

function CampoAntioxidante({ linha }: { linha: Linha }) {
  const qc = useQueryClient();
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const alternar = async () => {
    setOcupado(true); setErro(null);
    try {
      const r = await fetch(`/api/matriz-fornecedores/substancia/${linha.substanciaId}/antioxidante`, {
        method: "PATCH", headers: collabAuthHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ antioxidante: !linha.antioxidante }),
      });
      if (!r.ok) throw new Error("Não foi possível gravar a classificação.");
      await qc.invalidateQueries({ queryKey: MATRIZ_COMPLETA_KEY });
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao gravar."); }
    finally { setOcupado(false); }
  };
  return (
    <>
      <button type="button" className={linha.antioxidante ? "bevel-3d px-2 py-0.5 text-[10px] font-black uppercase" : "concave-3d px-2 py-0.5 text-[10px] font-black uppercase text-muted-foreground"}
        aria-pressed={linha.antioxidante} disabled={ocupado} onClick={alternar} data-testid={`antioxidante-${linha.varianteId}`}>
        {linha.antioxidante ? "Sim" : "Não"}
      </button>
      {erro && <span className="sr-only" role="alert">{erro}</span>}
    </>
  );
}

function Estado({ q }: { q: ReturnType<typeof useCatalogoPadrao>["q"] }) {
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando produtos…</p>;
  if (q.isError) return <p className="text-sm text-amber-700" role="alert">{q.error instanceof Error ? q.error.message : "Não foi possível consultar os produtos."}</p>;
  return null;
}

/** Aba "Produtos": escolhe o fornecedor (chips em posição fixa) e vê o catálogo inteiro; o que ele não tem fica apagado. */
export function ProdutosDoFornecedor() {
  const { q, linhas, fornecedores } = useCatalogoPadrao();
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const forn = fornecedores.find((f) => f.id === escolhido) ?? fornecedores[0];
  const tem = forn ? linhas.filter((l) => custoDe(l, forn.id)).length : 0;
  return (
    <div className="space-y-3" data-testid="aba-produtos">
      <Estado q={q} />
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Fornecedor">
        {fornecedores.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={f.id === forn?.id}
            className={`min-h-10 min-w-[120px] px-3 text-xs font-black uppercase tracking-wider ${f.id === forn?.id ? "btn-3d" : "btn-3d-soft"} ${f.ativo ? "" : "opacity-50"}`}
            onClick={() => setEscolhido(f.id)} data-testid={`chip-fornecedor-${f.id}`}>{f.nome}</button>
        ))}
      </div>
      {forn && <p className="text-sm font-semibold" data-testid="contagem-produtos">{forn.nome} tem {tem} de {linhas.length} produtos do catálogo. Os apagados não são vendidos por ele.</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="tabela-produtos-fornecedor">
          <thead>
            <tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <th className="py-1 pr-3">Substância</th><th className="py-1 pr-3">Apresentação</th><th className="py-1 pr-3">Categoria</th>
              <th className="py-1 pr-3">Implante</th><th className="py-1 pr-3">Antioxidante</th><th className="py-1 pr-3 text-right">Caixa</th><th className="py-1 text-right">Custo unitário</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const c = forn ? custoDe(l, forn.id) : undefined;
              return (
                <tr key={l.varianteId} className={`border-t border-border/40 ${c ? "" : "opacity-35"}`} data-tem={c ? "1" : "0"}>
                  <td className="py-1 pr-3 font-semibold">{l.produto}</td>
                  <td className="py-1 pr-3">{apresentacao(l)}</td>
                  <td className="py-1 pr-3">{l.classe}</td>
                  <td className="py-1 pr-3">{l.forma === "implante" ? "Sim" : "Não"}</td>
                  <td className="py-1 pr-3"><CampoAntioxidante linha={l} /></td>
                  <td className="py-1 pr-3 text-right tabular-nums">{c ? `${c.quantidadeEmbalagem} un.` : "—"}</td>
                  <td className="py-1 text-right tabular-nums">{c ? <Valor valor={c.custoUnitarioCentavos / 100} /> : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Aba "Comparativo": mesmas linhas, uma coluna por fornecedor em posição fixa, mais Maior e Média. */
export function ComparativoFornecedores() {
  const { q, linhas, fornecedores } = useCatalogoPadrao();
  return (
    <div className="space-y-3" data-testid="aba-comparativo">
      <Estado q={q} />
      <p className="text-sm text-muted-foreground">Cada fornecedor ocupa sempre a mesma coluna. Célula apagada = ele não tem o produto.</p>
      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-max text-sm" data-testid="tabela-comparativo">
          <thead className="sticky top-0 z-10 bg-background">
            <tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <th className="sticky left-0 z-10 bg-background py-1 pr-3">Substância</th><th className="py-1 pr-3">Categoria</th>
              <th className="py-1 pr-3">Implante</th><th className="py-1 pr-3">Antiox.</th>
              <th className="py-1 pr-3 text-right">Maior</th><th className="py-1 pr-3 text-right">Média</th>
              {fornecedores.map((f) => <th key={f.id} className="min-w-[110px] py-1 pr-3 text-right">{f.nome}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const custos = l.celulas.map((c) => c.custoUnitarioCentavos).filter((v) => v > 0);
              const maior = custos.length ? Math.max(...custos) : null;
              const media = custos.length ? Math.round(custos.reduce((a, b) => a + b, 0) / custos.length) : null;
              return (
                <tr key={l.varianteId} className="border-t border-border/40">
                  <td className="sticky left-0 bg-background py-1 pr-3 font-semibold">{l.produto}<span className="block text-[11px] font-normal text-muted-foreground">{apresentacao(l)}</span></td>
                  <td className="py-1 pr-3">{l.classe}</td>
                  <td className="py-1 pr-3">{l.forma === "implante" ? "Sim" : "Não"}</td>
                  <td className="py-1 pr-3">{l.antioxidante ? "Sim" : "Não"}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{maior === null ? <span className="opacity-30">—</span> : <Valor valor={maior / 100} />}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{media === null ? <span className="opacity-30">—</span> : <Valor valor={media / 100} />}</td>
                  {fornecedores.map((f) => {
                    const c = custoDe(l, f.id);
                    return <td key={f.id} className={`py-1 pr-3 text-right tabular-nums ${c ? "" : "opacity-30"}`} data-tem={c ? "1" : "0"}>{c ? <Valor valor={c.custoUnitarioCentavos / 100} /> : "—"}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
