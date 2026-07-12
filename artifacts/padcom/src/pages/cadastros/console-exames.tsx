import { ConsoleExamesTool } from "@/components/ConsoleExamesTool";

// Página do menu Cadastros: CONSOLE DE EXAMES — a MESMA tela única usada também
// no Cockpit da Consulta (ferramenta única, sem duplicata). Edita, do mesmo exame:
// apelidos, unidades, direção e as 5 faixas (rótulo, De e Até editáveis por exame).
export default function CadastroConsoleExames() {
  return (
    <div className="mx-auto max-w-[1400px] p-4">
      <ConsoleExamesTool titulo="Console de Exames" />
    </div>
  );
}
