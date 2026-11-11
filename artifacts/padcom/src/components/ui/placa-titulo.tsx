import type { LucideIcon } from "lucide-react";

/**
 * Placa de título (Padrão 40 da skill-layout-paxter).
 * TODO título de seção, cidade ou grupo usa esta placa: largura FIXA (nunca acompanha o tamanho da frase),
 * ícone + nome em MAIÚSCULO alinhados à esquerda; nome longo é cortado com reticências (o nome inteiro vai no title).
 * Nada de etiqueta, contagem em texto ou subtítulo dentro da placa: o que precisa ir ao lado vai à direita da linha.
 */
export const LARGURA_PLACA_TITULO = "w-[18rem] max-w-full";

export function PlacaTitulo({ icone: Icone, titulo, onClick, expandido, testId }: {
  icone: LucideIcon;
  titulo: string;
  /** Se informado, a placa vira botão (usado pela sanfona do grupo). */
  onClick?: () => void;
  expandido?: boolean;
  testId?: string;
}) {
  const classe = `bevel-3d inline-flex h-8 shrink-0 items-center gap-2 px-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-primary ${LARGURA_PLACA_TITULO}`;
  const conteudo = (
    <>
      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate" title={titulo}>{titulo}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} aria-expanded={expandido} className={`${classe} cursor-pointer`} data-testid={testId}>{conteudo}</button>
  ) : (
    <span className={classe} data-testid={testId}>{conteudo}</span>
  );
}
