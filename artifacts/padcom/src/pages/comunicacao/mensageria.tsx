import { Link } from "wouter";
import { Inbox, Stethoscope, Repeat, ListChecks, MessageSquare } from "lucide-react";
import { ConsoleShell, BlockTitle, ExplainRow, BASE } from "./_shared";

// Console da Mensageria — apresenta o motor de mensagens/lembretes que ja
// existe no sistema. Nao reescreve o motor; so reune e aponta atalhos.
export default function ComunicacaoMensageria() {
  return (
    <ConsoleShell
      icon={Inbox}
      title="Mensageria"
      subtitle="Central das mensagens e lembretes do sistema — o que dispara, para quem e quando."
    >
      <section className="panel-3d p-5">
        <BlockTitle icon={ListChecks}>O que este braço faz</BlockTitle>
        <div className="space-y-2">
          <ExplainRow>
            <strong>Mensagens do sistema</strong> — avisos e confirmações enviados ao cliente e à
            equipe ao longo do protocolo.
          </ExplainRow>
          <ExplainRow>
            <strong>Lembretes recorrentes</strong> — programados por evento (pré-sessão, pós-sessão,
            cobrança, exames) e reenviados sem intervenção manual.
          </ExplainRow>
          <ExplainRow>
            <strong>Cartões de tarefa</strong> — cada disparo pode gerar um cartão para o
            profissional responsável (papel: enfermagem, administração, financeiro).
          </ExplainRow>
        </div>
      </section>

      <section className="panel-3d p-5">
        <BlockTitle icon={Repeat}>Onde a mensageria já opera hoje</BlockTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/cockpit">
            <div className="panel-3d-sub flex items-center gap-3 p-4 cursor-pointer">
              <div className="bevel-3d flex h-9 w-9 items-center justify-center text-primary">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide">Cockpit da Consulta</p>
                <p className="text-[12px] text-muted-foreground">Dispara e acompanha mensagens por cliente</p>
              </div>
            </div>
          </Link>
          <a href={`${BASE}/api/email/send-weekly-reminders`} onClick={(e) => e.preventDefault()}>
            <div className="panel-3d-sub flex items-center gap-3 p-4 opacity-90">
              <div className="bevel-3d flex h-9 w-9 items-center justify-center text-primary">
                <Repeat className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide">Lembretes semanais</p>
                <p className="text-[12px] text-muted-foreground">Motor de lote (ver braço E-mails)</p>
              </div>
            </div>
          </a>
          <Link href="/comunicacao/whatsapp-status">
            <div className="panel-3d-sub flex items-center gap-3 p-4 cursor-pointer">
              <div className="bevel-3d flex h-9 w-9 items-center justify-center text-primary">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide">Status do WhatsApp</p>
                <p className="text-[12px] text-muted-foreground">Entrega de cada envio e falhas dos lembretes</p>
              </div>
            </div>
          </Link>
        </div>
      </section>
    </ConsoleShell>
  );
}
