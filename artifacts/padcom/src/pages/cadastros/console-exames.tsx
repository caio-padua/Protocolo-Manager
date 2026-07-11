import { ConsoleExamesTool } from "@/components/ConsoleExamesTool";

// Página do menu Cadastros: CONSOLE DE EXAMES — tela ÚNICA que funde as duas
// ferramentas antigas (Direção dos Exames + Planilha de Faixas). Edita, do mesmo
// exame: apelidos, unidades, direção e as 5 faixas (rótulos fixos, cortes editáveis).
// A DirecaoExamesTool continua existindo, embutida no Cockpit.
export default function CadastroConsoleExames() {
  return (
    <div className="mx-auto max-w-[1400px] p-4">
      <ConsoleExamesTool titulo="Console de Exames" />
    </div>
  );
}
