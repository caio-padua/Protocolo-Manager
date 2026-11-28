import type { ReactNode } from "react";
import { Lock, MapPin, Stethoscope, UserRound } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { formatStatus } from "@/lib/status";
import type { GoogleAgendaCommitment } from "@workspace/api-client-react";
import { QuadradoAplicacao } from "./QuadradoAplicacao";
import { ESTADO_APLICACAO, estadoDaAplicacao, rotuloAtendimento, rotuloHora } from "./timeline-logica";
import type { SessaoLinha } from "./GradeTimeline";

/**
 * Cartão rápido da linha do tempo: só de passar o mouse (ou focar com o teclado) abre um quadrinho com o essencial,
 * e fecha ao tirar o mouse. Não grava nada e não substitui os detalhes (o clique continua abrindo a janela completa).
 * No celular não abre sozinho: o toque abre os detalhes, como antes. Compromisso do Google mostra só título, agenda e
 * horário; a descrição do evento nunca aparece aqui.
 */
export function CartaoRapido({ cor, ini, fim, sessao, evento, children }: {
  cor: string; ini: number; fim: number; sessao?: SessaoLinha; evento?: GoogleAgendaCommitment; children: ReactNode;
}) {
  return (
    <HoverCard openDelay={140} closeDelay={60}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" align="start" sideOffset={8} collisionPadding={12} avoidCollisions
        className="ag-rapido panel-3d" style={{ ["--ev" as string]: cor }} data-testid="cartao-rapido">
        {sessao ? <Sessao sessao={sessao} ini={ini} fim={fim} /> : evento ? <Google evento={evento} /> : null}
        <p className="ag-rapido-pe">Clique para abrir os detalhes</p>
      </HoverCardContent>
    </HoverCard>
  );
}

function Sessao({ sessao, ini, fim }: { sessao: SessaoLinha; ini: number; fim: number }) {
  const apps = sessao.substanceApplications ?? [];
  const local = sessao.serviceType === "homecare" ? "Atendimento domiciliar" : sessao.unit ?? null;
  return (
    <>
      <div className="ag-rapido-cab">
        <p className="ag-rapido-nome">{sessao.clientName}</p>
        <p className="ag-rapido-hora">{rotuloHora(ini)} às {rotuloHora(fim)} · {formatStatus(sessao.status)}</p>
      </div>
      <div className="ag-rapido-corpo">
        <p className="ag-rapido-linha">
          <Stethoscope className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
          <span className="font-bold">{sessao.agendaNome ?? "Sem agenda ligada"}</span>
        </p>
        {(sessao.professionalName || sessao.nurseName) && (
          <p className="ag-rapido-linha"><UserRound className="h-3 w-3 shrink-0 opacity-60" aria-hidden /><span>{sessao.professionalName ?? sessao.nurseName}</span></p>
        )}
        {local && <p className="ag-rapido-linha"><MapPin className="h-3 w-3 shrink-0 opacity-60" aria-hidden /><span>{local}</span></p>}
        <p className="ag-rapido-titulo">{rotuloAtendimento(sessao)}</p>
        <div data-testid="cartao-rapido-aplicacoes" className="space-y-1">
          {apps.length === 0 ? (
            <p className="text-[11px] opacity-60">Sem aplicação nesta visita.</p>
          ) : apps.slice(0, 4).map((a) => {
            const estado = estadoDaAplicacao(a.displayState);
            return (
              <p key={a.id} className="ag-rapido-linha">
                <QuadradoAplicacao app={a} />
                <span className="font-bold uppercase tracking-tight">{a.substanceName}</span>
                <span className="ml-auto shrink-0 text-[9px] font-black uppercase tracking-wider" style={{ color: ESTADO_APLICACAO[estado].cor }}>{ESTADO_APLICACAO[estado].rotulo}</span>
              </p>
            );
          })}
          {apps.length > 4 && <p className="text-[10px] font-bold opacity-60">+ {apps.length - 4} aplicações</p>}
        </div>
      </div>
    </>
  );
}

function Google({ evento }: { evento: GoogleAgendaCommitment }) {
  return (
    <>
      <div className="ag-rapido-cab">
        <p className="ag-rapido-nome flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden /><span className="truncate">{evento.titulo}</span></p>
        <p className="ag-rapido-hora">{evento.diaInteiro ? "Dia inteiro" : evento.horario}</p>
      </div>
      <div className="ag-rapido-corpo">
        <p className="ag-rapido-linha"><Stethoscope className="h-3 w-3 shrink-0 opacity-60" aria-hidden /><span className="font-bold">{evento.agenda}</span></p>
        <p className="text-[11px] opacity-60">Compromisso do Google, somente leitura.</p>
      </div>
    </>
  );
}
