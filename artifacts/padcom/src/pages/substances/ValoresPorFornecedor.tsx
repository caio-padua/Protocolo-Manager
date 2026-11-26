import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Coins } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Valor, Numeral } from "@/components/numeral/Numeral";

type Celula = { fornecedorId: number; custoUnitarioCentavos: number; custoEmbalagemCentavos: number; quantidadeEmbalagem: number };
type Linha = {
  varianteId: number; substanciaId: number; doseTotal: string; forma: string;
  volumeMl: string | null; concentracao: string | null; celulas: Celula[];
  publicado: { precoCentavos: number; origem: string } | null;
};
export type Matriz = { fornecedores: { id: number; nome: string; ativo: boolean }[]; linhas: Linha[]; parametros?: { referenciaModo?: string } };

export const MATRIZ_COMPLETA_KEY = ["matriz-fornecedores-completa"] as const;

async function lerMatriz(): Promise<Matriz> {
  const r = await fetch("/api/matriz-fornecedores/completa", { headers: collabAuthHeaders() });
  if (r.status === 401) throw new Error("Entre novamente para consultar os valores.");
  if (r.status === 403) throw new Error("Seu acesso não permite consultar os valores desta clínica.");
  if (!r.ok) throw new Error("A consulta dos valores está indisponível neste momento.");
  return (await r.json()) as Matriz;
}

export function useMatrizCompleta() {
  return useQuery({ queryKey: MATRIZ_COMPLETA_KEY, queryFn: lerMatriz, staleTime: 0, refetchOnMount: "always" });
}

/** Somente leitura: custos, maior custo e preço precificado vêm da Matriz; nada é recalculado aqui. */
export function ValoresPorFornecedor({ substanceId }: { substanceId: number }) {
  const q = useMatrizCompleta();
  const linhas = (q.data?.linhas ?? []).filter((l) => l.substanciaId === substanceId);
  const nome = (id: number) => q.data?.fornecedores.find((f) => f.id === id)?.nome ?? `Fornecedor ${id}`;

  return (
    <section className="panel-3d-sub p-4" data-testid={`valores-fornecedor-${substanceId}`} aria-label="Valores por fornecedor">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary">
          <Coins className="h-4 w-4" aria-hidden="true" /> Valores por fornecedor
        </div>
        <Link href="/matriz-fornecedores" className="text-[10px] font-black uppercase tracking-widest text-primary underline">
          Abrir a Matriz
        </Link>
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando valores…</p>
      ) : q.isError ? (
        <p className="text-sm text-amber-700" role="alert">{q.error instanceof Error ? q.error.message : "Não foi possível consultar os valores."}</p>
      ) : linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma apresentação com valor de fornecedor registrada para esta substância.</p>
      ) : (
        <div className="space-y-3">
          {linhas.map((l) => {
            const custos = l.celulas.filter((c) => c.custoUnitarioCentavos > 0);
            const maior = custos.length ? Math.max(...custos.map((c) => c.custoUnitarioCentavos)) : null;
            return (
              <div key={l.varianteId} className="concave-3d p-3">
                <p className="text-xs font-black uppercase tracking-wide">
                  {l.doseTotal} · {l.forma}{l.volumeMl ? ` · ${l.volumeMl} mL` : ""}{l.concentracao ? ` · ${l.concentracao}` : ""}
                </p>
                {custos.length === 0 ? (
                  <p className="mt-2 text-xs text-muted-foreground">Sem custo de fornecedor registrado.</p>
                ) : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          <th className="py-1 pr-3">Fornecedor</th>
                          <th className="py-1 pr-3 text-right">Custo unitário</th>
                          <th className="py-1 text-right">Embalagem</th>
                        </tr>
                      </thead>
                      <tbody>
                        {custos.map((c) => (
                          <tr key={c.fornecedorId} className="border-t border-border/40">
                            <td className="py-1 pr-3 font-semibold">{nome(c.fornecedorId)}</td>
                            <td className="py-1 pr-3 text-right tabular-nums"><Valor valor={c.custoUnitarioCentavos / 100} /></td>
                            <td className="py-1 text-right tabular-nums text-muted-foreground">
                              <Valor valor={c.custoEmbalagemCentavos / 100} /> · <Numeral>{c.quantidadeEmbalagem}</Numeral> un.
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="panel-3d-sub p-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Maior custo</p>
                    <p className="text-base font-black tabular-nums">{maior === null ? "—" : <Valor valor={maior / 100} />}</p>
                  </div>
                  <div className="panel-3d-sub p-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Preço precificado</p>
                    <p className="text-base font-black tabular-nums">{l.publicado ? <Valor valor={l.publicado.precoCentavos / 100} /> : "Não publicado"}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
