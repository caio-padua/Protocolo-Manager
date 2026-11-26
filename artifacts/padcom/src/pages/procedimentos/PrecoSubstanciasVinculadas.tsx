import { Coins } from "lucide-react";
import { useMatrizCompleta } from "@/pages/substances/ValoresPorFornecedor";
import { Valor } from "@/components/numeral/Numeral";

const MODO: Record<string, string> = { maior: "maior custo", media: "custo médio", menor: "menor custo" };

/** Somente leitura: custo de referência entre fornecedores e preço precificado, lidos da Matriz. Sem preço mostra "sem preço", nunca zero. */
export function PrecoSubstanciasVinculadas({ ids, nomes }: { ids: number[]; nomes: Record<number, string> }) {
  const q = useMatrizCompleta();
  if (ids.length === 0) return null;
  const modo = q.data?.parametros?.referenciaModo ?? "maior";
  return (
    <div className="concave-3d space-y-2 p-3 text-xs" data-testid="preco-substancias-vinculadas">
      <p className="flex items-center gap-2 font-bold"><Coins className="h-4 w-4" aria-hidden="true" /> Preço das substâncias vinculadas ({MODO[modo] ?? "maior custo"} entre fornecedores)</p>
      {q.isLoading ? <p className="text-muted-foreground">Carregando preços…</p>
        : q.isError ? <p className="text-muted-foreground">Preços indisponíveis para este acesso.</p>
        : ids.map((id) => {
          const linhas = (q.data?.linhas ?? []).filter((l) => l.substanciaId === id);
          const custos = linhas.flatMap((l) => l.celulas.map((c) => c.custoUnitarioCentavos)).filter((c) => c > 0);
          const ref = custos.length === 0 ? null
            : modo === "menor" ? Math.min(...custos)
            : modo === "media" ? Math.round(custos.reduce((a, b) => a + b, 0) / custos.length)
            : Math.max(...custos);
          const pub = linhas.map((l) => l.publicado?.precoCentavos).filter((v): v is number => typeof v === "number");
          const pMin = pub.length ? Math.min(...pub) : null;
          const pMax = pub.length ? Math.max(...pub) : null;
          return (
            <div key={id} className="panel-3d-sub flex flex-wrap items-center justify-between gap-2 p-2">
              <span className="font-bold">{nomes[id] ?? `Substância ${id}`}</span>
              <span className="tabular-nums">
                Custo: {ref === null ? "sem preço" : <Valor valor={ref / 100} />}
                {" · "}Precificado: {pMin === null || pMax === null ? "sem preço" : pMin === pMax ? <Valor valor={pMin / 100} /> : <><Valor valor={pMin / 100} /> a <Valor valor={pMax / 100} /></>}
              </span>
            </div>
          );
        })}
    </div>
  );
}
