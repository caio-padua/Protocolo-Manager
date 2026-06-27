import { Landmark, Construction, ShieldCheck } from "lucide-react";
import { ConsoleShell, BlockTitle, ExplainRow } from "./comunicacao/_shared";

// Governanca — braço-esqueleto visivel. Escopo de RBAC / multi-clinica
// parado por ordem do CEO; aqui so o esqueleto, sem construir o motor.
export default function Governanca() {
  return (
    <ConsoleShell
      icon={Landmark}
      title="Governança"
      subtitle="Regras de acesso, permissões e controle entre clínicas — quem pode o quê."
    >
      <section className="panel-3d p-5">
        <BlockTitle icon={Construction}>Em estruturação</BlockTitle>
        <div className="space-y-2">
          <ExplainRow>
            Braço <strong>à mostra</strong> para reorganizarmos depois. Nada aqui está ligado ainda —
            é o esqueleto reservado.
          </ExplainRow>
          <ExplainRow>
            Vai abrigar <strong>permissões e acessos</strong> (RBAC = controle de acesso por papel),
            multi-clínica e o centro de comando.
          </ExplainRow>
          <ExplainRow>
            Decisão registrada: <strong>não construir o motor</strong> de governança sem ordem
            explícita. Escopo em <strong>specs/governanca-multiclinica-PENDENTE.md</strong>.
          </ExplainRow>
        </div>
      </section>

      <section className="panel-3d p-5">
        <BlockTitle icon={ShieldCheck}>Por que separado da Hierarquia</BlockTitle>
        <ExplainRow>
          <strong>Hierarquia</strong> descreve a estrutura (organograma). <strong>Governança</strong>
          define as regras sobre essa estrutura (quem acessa, aprova e responde).
        </ExplainRow>
      </section>
    </ConsoleShell>
  );
}
