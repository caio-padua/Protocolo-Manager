import { Cloud, HardDrive, FolderTree } from "lucide-react";
import { ConsoleShell, ToolCard, StatusVela, ExplainRow, useComunicacaoStatus } from "./_shared";

// Plataformas Digitais — Google Drive (real) e OneDrive (em breve, honesto).
export default function ComunicacaoPlataformas() {
  const { status, loading, error } = useComunicacaoStatus();

  return (
    <ConsoleShell
      icon={Cloud}
      title="Plataformas Digitais"
      subtitle="Onde os arquivos do cliente são guardados e organizados na nuvem."
    >
      <section className="grid gap-4 lg:grid-cols-2">
        <ToolCard
          icon={FolderTree}
          name="Google Drive"
          accent="text-primary"
          vela={<StatusVela on={!!status?.drive} pending={loading} error={error} labelOn="Conectado" labelOff="Não conectado" />}
        >
          <ExplainRow>
            Estrutura por cliente: <strong>PACIENTES / NOME CPF</strong> com 15 subpastas (cadastro,
            exames, protocolos, financeiro, etc.).
          </ExplainRow>
          <ExplainRow>
            Recebe automaticamente protocolos e RAS assinados, com nome padronizado por data.
          </ExplainRow>
          {!status?.drive && !loading && (
            <p className="text-[12px] text-amber-700 dark:text-amber-400">
              A integração Google Drive deste ambiente não respondeu como conectada.
            </p>
          )}
        </ToolCard>

        <ToolCard
          icon={HardDrive}
          name="OneDrive"
          accent="text-slate-400"
          vela={<StatusVela on={false} labelOff="Em breve" />}
        >
          <ExplainRow>
            Integração com a nuvem da Microsoft (OneDrive / SharePoint) — <strong>ainda não construída</strong>.
          </ExplainRow>
          <ExplainRow>
            Planejada como espelho do Google Drive (mesma estrutura de pastas por cliente). Está no
            multi-spec de pendências.
          </ExplainRow>
          <p className="text-[12px] text-muted-foreground">
            Sem botão de conexão de propósito: nada aqui é simulado.
          </p>
        </ToolCard>
      </section>
    </ConsoleShell>
  );
}
