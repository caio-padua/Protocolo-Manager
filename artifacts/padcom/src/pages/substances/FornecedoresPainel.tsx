import { useState } from "react";
import { ChevronDown, ChevronUp, Building2 } from "lucide-react";
import Fornecedores from "@/pages/fornecedores";
import { ComparativoFornecedores, ProdutosDoFornecedor } from "./CatalogoFornecedores";

const ABAS = [
  { id: "cadastros", rotulo: "Fornecedores — Cadastros" },
  { id: "produtos", rotulo: "Fornecedores — Produtos" },
  { id: "comparativo", rotulo: "Comparativo" },
] as const;

const CHAVE = "substancias-painel-fornecedores-aberto";

/** Painel horizontal recolhível: reaproveita o cadastro de fornecedores (mesmas rotas de /fornecedores). */
export function FornecedoresPainel() {
  const [aberto, setAberto] = useState(() => {
    try { return localStorage.getItem(CHAVE) !== "0"; } catch { return true; }
  });
  const [aba, setAba] = useState<(typeof ABAS)[number]["id"]>("cadastros");
  const alternar = () => {
    const prox = !aberto;
    setAberto(prox);
    try { localStorage.setItem(CHAVE, prox ? "1" : "0"); } catch { /* sem armazenamento: apenas não lembra */ }
  };
  return (
    <section className="panel-3d overflow-hidden" data-testid="painel-fornecedores" aria-label="Fornecedores">
      <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
        <div className="bevel-3d inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-primary">
          <Building2 className="h-4 w-4" aria-hidden="true" /> Fornecedores
        </div>
        <button
          type="button"
          className="btn-3d-soft inline-flex min-h-10 min-w-[132px] items-center justify-center gap-2 px-3 text-xs font-black uppercase tracking-widest"
          aria-expanded={aberto}
          aria-controls="painel-fornecedores-corpo"
          onClick={alternar}
          data-testid="button-toggle-painel-fornecedores"
        >
          {aberto ? <><ChevronUp className="h-4 w-4" /> Minimizar</> : <><ChevronDown className="h-4 w-4" /> Maximizar</>}
        </button>
      </div>
      {aberto && (
        <div id="painel-fornecedores-corpo" className="border-t p-3 sm:p-4">
          <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Seções de fornecedores">
            {ABAS.map((a) => (
              <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => setAba(a.id)}
                className={`min-h-10 min-w-[200px] px-4 text-xs font-black uppercase tracking-widest ${aba === a.id ? "btn-3d" : "btn-3d-soft"}`} data-testid={`aba-${a.id}`}>{a.rotulo}</button>
            ))}
          </div>
          {aba === "cadastros" && <Fornecedores embutido />}
          {aba === "produtos" && <ProdutosDoFornecedor />}
          {aba === "comparativo" && <ComparativoFornecedores />}
        </div>
      )}
    </section>
  );
}
