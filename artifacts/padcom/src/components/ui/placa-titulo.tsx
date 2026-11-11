/**
 * Placa de título (Padrão 40 da skill-layout-paxter).
 * TODO título de seção ou grupo usa esta placa: largura FIXA (nunca acompanha o tamanho da frase),
 * texto em MAIÚSCULO alinhado à esquerda, sem símbolo; nome longo é cortado com reticências (o nome inteiro vai no title).
 * Nada de etiqueta, contagem ou subtítulo dentro da placa.
 */
export const LARGURA_PLACA_TITULO = "w-[18rem] max-w-full";

export function PlacaTitulo({ titulo, testId }: { titulo: string; testId?: string }) {
  return (
    <span
      className={`bevel-3d inline-flex h-8 shrink-0 items-center px-3 text-left text-[10px] font-black uppercase tracking-[0.18em] text-primary ${LARGURA_PLACA_TITULO}`}
      data-testid={testId}
    >
      <span className="min-w-0 flex-1 truncate" title={titulo}>{titulo}</span>
    </span>
  );
}
