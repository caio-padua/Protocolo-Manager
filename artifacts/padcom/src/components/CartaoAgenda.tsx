import type { ReactNode } from "react";
import { VidroCor } from "@/components/VidroCor";
import { rotuloDaForma } from "@/lib/agenda-forma";

/**
 * Conteudo do cartao de AGENDA (mesmo desenho na Agenda Configuracao e no cadastro interno da empresa):
 *   vidro de cor | AGENDA PROFISSIONAL <categoria> / Forma de atendimento / Titulo da agenda.
 * A categoria so aparece quando foi gravada; sem ela o cartao diz "categoria pendente" (nunca deduz do nome).
 * A cor e a UNICA cor da agenda (agenda_resources.color, espelhada no local ligado pelo servidor).
 */
export function CartaoAgendaConteudo({ categoria, forma, titulo, cor, inativa }: {
  categoria?: string | null;
  /** Valor gravado: local, online ou externo. */
  forma: string;
  titulo: string;
  cor: string;
  inativa?: boolean;
}) {
  return (
    <>
      <VidroCor cor={cor} />
      <span className="min-w-0 flex-1 space-y-1" data-testid="cartao-agenda">
        <span className="block break-words text-[12px] font-extrabold uppercase leading-tight tracking-wide" data-testid="cartao-agenda-categoria">
          Agenda profissional{" "}
          {categoria
            ? categoria
            : <span className="text-[10px] normal-case tracking-normal text-amber-600">· categoria pendente</span>}
        </span>
        <span className="block text-xs leading-tight">
          <span className="tecla-sub mr-1.5 text-[9px] font-bold uppercase tracking-wider">Forma de atendimento</span>
          <span className="font-semibold" data-testid="cartao-agenda-forma">{rotuloDaForma(forma)}</span>
        </span>
        <span className="block break-words text-xs leading-tight" title={titulo}>
          <span className="tecla-sub mr-1.5 text-[9px] font-bold uppercase tracking-wider">Título da agenda</span>
          <span className="font-semibold" data-testid="cartao-agenda-titulo">{titulo}</span>
        </span>
      </span>
      {inativa && <span className="text-[10px] font-semibold uppercase text-amber-500">inativo</span>}
    </>
  );
}

/** Cartao estatico (sem ser tecla): usado no cadastro interno da empresa, com a acao a direita. */
export function CartaoAgenda({ acao, ...dados }: Parameters<typeof CartaoAgendaConteudo>[0] & { acao?: ReactNode }) {
  return (
    <div className="tecla-3d flex w-full items-center gap-2.5 py-2.5 pl-4 pr-3 text-left">
      <CartaoAgendaConteudo {...dados} />
      {acao}
    </div>
  );
}
