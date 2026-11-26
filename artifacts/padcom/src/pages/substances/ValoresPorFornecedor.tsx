import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Coins } from "lucide-react";
import { collabAuthHeaders } from "@/lib/collab-auth";
import { Valor, Numeral } from "@/components/numeral/Numeral";

export type Celula = { fornecedorId: number; custoUnitarioCentavos: number; custoEmbalagemCentavos: number; quantidadeEmbalagem: number };
export type Linha = {
  varianteId: number; substanciaId: number; produto: string; doseTotal: string; forma: string;
  volumeMl: string | null; concentracao: string | null; celulas: Celula[];
  classe: string; antioxidante: boolean; isBlend: boolean; disponivel: boolean;
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
            const media = custos.length ? Math.round(custos.reduce((a, c) => a + c.custoUnitarioCentavos, 0) / custos.length) : null;
            return (
              <div key={l.varianteId} className="concave-3d p-3">
                <p className="text-xs font-black uppercase tracking-wide">
                  {l.doseTotal} · {l.forma}{l.volumeMl ? ` · ${l.volumeMl} mL` : ""}{l.concentracao ? ` · ${l.concentracao}` : ""}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4" data-testid={`posicoes-precos-${l.varianteId}`}>
                  <div className="panel-3d-sub p-2" data-testid="posicao-maior">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Maior preço</p>
                    <p className="text-sm font-black tabular-nums">{maior === null ? <span className="opacity-30">—</span> : <Valor valor={maior / 100} />}</p>
                  </div>
                  <div className="panel-3d-sub p-2" data-testid="posicao-media">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Preço médio</p>
                    <p className="text-sm font-black tabular-nums">{media === null ? <span className="opacity-30">—</span> : <Valor valor={media / 100} />}</p>
                  </div>
                  {(q.data?.fornecedores ?? []).map((f) => {
                    const c = custos.find((x) => x.fornecedorId === f.id);
                    return (
                      <div key={f.id} className={`panel-3d-sub p-2 ${c ? "" : "opacity-35"}`} data-testid={`posicao-fornecedor-${f.id}`} data-tem={c ? "1" : "0"}>
                        <p className="truncate text-[9px] font-black uppercase tracking-widest text-muted-foreground">{f.nome}</p>
                        <p className="text-sm font-black tabular-nums">
                          {c ? <Valor valor={c.custoUnitarioCentavos / 100} /> : <span aria-label="sem preço deste fornecedor">—</span>}
                        </p>
                        {c && <p className="text-[10px] text-muted-foreground tabular-nums"><Valor valor={c.custoEmbalagemCentavos / 100} /> · <Numeral>{c.quantidadeEmbalagem}</Numeral> un.</p>}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3">
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
