import type { ReactNode } from "react";
import { VidroCor } from "@/components/VidroCor";
import { rotuloDaForma } from "@/lib/agenda-forma";

/**
 * Conteudo do cartao de AGENDA (mesmo desenho na Agenda Configuracao e no cadastro interno da empresa; Padrao 41).
 * Tres linhas: TITULO em fonte serifada (EB Garamond, semibold discreto, coluna fixa para alinhar) + VALOR em fonte operacional, sem quebra de linha:
 *   Agenda profissional  <categoria>
 *   Forma                <Sede | Online | Outro local>
 *   Título agenda        <nome livre da agenda>
 * A categoria so aparece quando foi gravada; sem ela o cartao diz "pendente" (nunca deduz do nome).
 * A cor e a UNICA cor da agenda (agenda_resources.color, espelhada no local ligado pelo servidor).
 */
function Linha({ titulo, children, testId }: { titulo: string; children: ReactNode; testId: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2 whitespace-nowrap leading-tight">
      <span className="w-[7rem] shrink-0 font-serif text-[13px] font-semibold leading-none text-foreground/75">{titulo}</span>
      <span className="min-w-0 truncate text-[10.5px] font-medium uppercase" data-testid={testId}>{children}</span>
    </span>
  );
}

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
        <Linha titulo="Agenda profissional" testId="cartao-agenda-categoria">
          {categoria ?? <span className="normal-case text-amber-600">categoria pendente</span>}
        </Linha>
        <Linha titulo="Forma" testId="cartao-agenda-forma">{rotuloDaForma(forma)}</Linha>
        <span title={titulo} className="block min-w-0">
          <Linha titulo="Título agenda" testId="cartao-agenda-titulo">{titulo}</Linha>
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
