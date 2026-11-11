import { useMemo, useState } from "react";
import type { Substance } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { nomeSugeridoProduto } from "./sugestao-produto";

interface Props {
  produtos: Substance[];
  carregando: boolean;
  erro: boolean;
  tentarNovamente: () => void;
  onEscolher: (produto: Substance) => void;
}

/** Exibe o catálogo real sem criar procedimentos, estoque ou reservas. */
export function CatalogoProdutos({ produtos, carregando, erro, tentarNovamente, onEscolher }: Props) {
  const [busca, setBusca] = useState("");
  const itens = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return [...produtos].sort((a, b) => a.name.localeCompare(b.name, "pt-BR") || a.id - b.id)
      .filter((p) => !termo || [p.name, p.defaultDose ?? "", String(p.id)].some((s) => s.toLocaleLowerCase("pt-BR").includes(termo)));
  }, [produtos, busca]);

  return (
    <section className="panel-3d space-y-4 p-4 sm:p-5" aria-labelledby="catalogo-produtos-titulo">
      <div className="bevel-3d px-3 py-2">
        <h2 id="catalogo-produtos-titulo" className="text-xs font-black uppercase tracking-widest text-primary">
          Produtos disponíveis para procedimentos
        </h2>
      </div>
      <p className="text-xs text-muted-foreground">
        Produtos do cadastro original. Escolha uma apresentação para preparar um procedimento; equipe e dose exigem conferência.
      </p>
      {carregando ? <p role="status">Carregando produtos…</p> : erro ? (
        <div role="alert" className="concave-3d p-3 text-sm">
          Não foi possível carregar o catálogo.{" "}
          <button type="button" className="underline" onClick={tentarNovamente}>Tentar novamente</button>
        </div>
      ) : (
        <>
          <Input className="field-engraved min-h-11" value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto, apresentação ou identificador" aria-label="Buscar produtos disponíveis" />
          <p className="text-xs font-bold text-primary" role="status">{itens.length} de {produtos.length} produtos</p>
          <div className="concave-3d max-h-96 space-y-2 overflow-y-auto p-3" aria-label="Produtos disponíveis">
            {itens.map((produto) => (
              <div key={produto.id} className="bevel-3d p-3" data-testid={`catalogo-produto-${produto.id}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="min-w-0 flex-1 text-sm font-semibold">{nomeSugeridoProduto(produto.name) || produto.name}</span>
                  <Button type="button" className="btn-3d-soft min-h-10" onClick={() => onEscolher(produto)}
                    aria-label={`Cadastrar procedimento para ${produto.name}, identificador ${produto.id}`}>
                    Cadastrar procedimento
                  </Button>
                </div>
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer text-primary underline">Detalhes da apresentação</summary>
                  <p>Identificador {produto.id} · Cadastro: {produto.name}</p>
                  <p>Dose ou apresentação cadastrada: {produto.defaultDose || "—"}</p>
                  {(produto.components?.length ?? 0) > 1 && produto.components?.map((componente) => (
                    <p key={componente.id}>{componente.componentName}: {componente.doseValue ?? "—"} {componente.doseUnit ?? ""}</p>
                  ))}
                </details>
              </div>
            ))}
            {!itens.length && <p className="p-3 text-sm">Nenhum produto encontrado.</p>}
          </div>
        </>
      )}
    </section>
  );
}
