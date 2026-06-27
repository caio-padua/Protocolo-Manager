import { Network, Construction, Users } from "lucide-react";
import { ConsoleShell, BlockTitle, ExplainRow } from "./comunicacao/_shared";

// Hierarquia — braço-esqueleto visivel (decisao do CEO: deixar a mostra,
// reorganizar depois). Sem dado falso; conteudo definitivo em onda futura.
export default function Hierarquia() {
  return (
    <ConsoleShell
      icon={Network}
      title="Hierarquia"
      subtitle="Organograma da operação — quem responde a quem, por clínica e por papel."
    >
      <section className="panel-3d p-5">
        <BlockTitle icon={Construction}>Em estruturação</BlockTitle>
        <div className="space-y-2">
          <ExplainRow>
            Este braço está <strong>à mostra</strong> de propósito: a estrutura existe no menu, o
            conteúdo definitivo será desenhado numa próxima onda.
          </ExplainRow>
          <ExplainRow>
            Vai mapear o <strong>organograma</strong>: clínicas, equipes e a cadeia de
            responsabilidade (papéis médico, enfermagem, administração, financeiro).
          </ExplainRow>
          <ExplainRow>
            O escopo técnico está guardado em <strong>specs/governanca-multiclinica-PENDENTE.md</strong>.
          </ExplainRow>
        </div>
      </section>

      <section className="panel-3d p-5">
        <BlockTitle icon={Users}>Hoje, os papéis vivem em</BlockTitle>
        <ExplainRow>
          <strong>Configurações → Equipe (Profissionais)</strong> já cadastra os profissionais e seus
          papéis. A Hierarquia vai consolidar isso num organograma único.
        </ExplainRow>
      </section>
    </ConsoleShell>
  );
}
