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
  J1: "Janela de atendimento",
  X1: "Exceção ou feriado",
  K1: "Cliente",
  T1: "Protocolo",
  S1: "Duração do atendimento (slot)",
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

/**
 * Registro de canto: marca discreta no canto superior esquerdo de um botão ou seletor.
 * O elemento pai precisa ser `relative` (use ComRegistro). Mesmo código = mesmo conceito real.
 */
export function Registro({ codigo, pendente = false, nota }: { codigo: CodigoMarcador; pendente?: boolean; nota?: string }) {
  if (!MARCADORES_ATIVOS) return null;
  const titulo = pendente
    ? `${codigo} · ${MARCADORES[codigo]} — ligação ainda não verificada${nota ? `: ${nota}` : ""}`
    : `${codigo} · ${MARCADORES[codigo]}${nota ? ` — ${nota}` : ""}`;
  return (
    <span className="registro-canto" title={titulo} data-registro={codigo} data-pendente={pendente || undefined}>
      {codigo}
    </span>
  );
}

export function ComRegistro({ codigo, pendente, nota, children, className = "" }: {
  codigo: CodigoMarcador; pendente?: boolean; nota?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Registro codigo={codigo} pendente={pendente} nota={nota} />
      {children}
    </div>
  );
}

/** Legenda recolhível: o que cada letra+número significa. */
export function LegendaRegistros() {
  if (!MARCADORES_ATIVOS) return null;
  return (
    <details className="relative">
      <summary className="btn-3d-soft inline-flex h-8 cursor-pointer list-none items-center gap-1.5 px-3 text-[11px] font-bold uppercase tracking-wide">
        <span className="registro-canto !static !opacity-100">R</span> Legenda dos registros
      </summary>
      <div className="panel-3d-sub absolute right-0 z-20 mt-2 w-72 space-y-1.5 p-3">
        <p className="text-[11px] text-muted-foreground">
          A marca no canto de cada botão ou seletor mostra de qual cadastro ele puxa. O mesmo código vale em todas as telas.
        </p>
        {(Object.keys(MARCADORES) as CodigoMarcador[]).map((c) => (
          <div key={c} className="flex items-center gap-2 text-xs">
            <span className="registro-canto !static !opacity-100">{c}</span>
            <span>{MARCADORES[c]}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
