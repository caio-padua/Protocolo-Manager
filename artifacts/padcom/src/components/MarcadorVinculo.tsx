/**
 * Etiquetas TEMPORÁRIAS de conferência visual. O mesmo código marca o mesmo conceito real em telas
 * diferentes. Não são identificadores: a ligação de verdade usa sempre os ids do banco e da API, e
 * estas etiquetas não substituem testes. Para remover tudo, ponha MARCADORES_ATIVOS = false.
 */
export const MARCADORES_ATIVOS = true;

export const MARCADORES = {
  C1: "Categoria profissional",
  P1: "Profissional",
  A1: "Agenda",
  C2: "Clínica",
  L1: "Local",
  D1: "Procedimento",
} as const;
export type CodigoMarcador = keyof typeof MARCADORES;

export function MarcadorVinculo({ codigo, pendente = false, nota }: { codigo: CodigoMarcador; pendente?: boolean; nota?: string }) {
  if (!MARCADORES_ATIVOS) return null;
  const titulo = pendente
    ? `${MARCADORES[codigo]} — ligação ainda não verificada${nota ? `: ${nota}` : ""}`
    : `${MARCADORES[codigo]} — mesma ligação real nas telas que exibem ${codigo}${nota ? `. ${nota}` : ""}`;
  return (
    <span
      title={titulo}
      data-marcador={codigo}
      className={`ml-1.5 inline-flex items-center gap-0.5 align-middle font-mono text-[9px] font-normal normal-case tracking-normal opacity-70 ${
        pendente ? "text-amber-600" : "text-muted-foreground"
      }`}
    >
      {codigo}
      {pendente && <span className="italic">pendente</span>}
    </span>
  );
}
