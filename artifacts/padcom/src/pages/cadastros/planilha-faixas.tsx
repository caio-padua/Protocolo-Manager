import { PlanilhaFaixasTool } from "@/components/PlanilhaFaixasTool";

// Página do menu Cadastros: PLANILHA GERAL de faixas + unidade padrão de TODOS
// os exames de uma vez. Complementa a DirecaoExamesTool (edição fina de 1
// exame) — as duas gravam no mesmo backend, pela mesma chave.
export default function CadastroPlanilhaFaixas() {
  return (
    <div className="mx-auto max-w-[1400px] p-4">
      <PlanilhaFaixasTool titulo="Planilha Geral de Faixas e Unidades" />
    </div>
  );
}
