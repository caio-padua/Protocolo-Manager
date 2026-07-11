import { DirecaoExamesTool } from "@/components/DirecaoExamesTool";

// Página do menu Cadastros: ferramenta de DIREÇÃO dos exames (o que é
// "excelente" em cada exame). A mesma ferramenta é embutida no Cockpit.
export default function CadastroDirecaoExames() {
  return (
    <div className="mx-auto max-w-5xl p-4">
      <DirecaoExamesTool titulo="Cadastro de Direção dos Exames" />
    </div>
  );
}
