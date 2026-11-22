// Figuras simples (esquemáticas) de cada região medida com fita.
// Só apresentação: não altera dados nem contrato de gravação.

type Regiao = "pescoco" | "torax" | "cintura" | "abdomen" | "quadril" | "braco" | "coxa" | "panturrilha";

const REGIAO_POR_CAMPO: Record<string, { regiao: Regiao; lado?: "D" | "E" }> = {
  cPescoco: { regiao: "pescoco" },
  cTorax: { regiao: "torax" },
  cCintura: { regiao: "cintura" },
  cAbdomen: { regiao: "abdomen" },
  cQuadril: { regiao: "quadril" },
  cBracoD: { regiao: "braco", lado: "D" },
  cBracoE: { regiao: "braco", lado: "E" },
  cCoxaD: { regiao: "coxa", lado: "D" },
  cCoxaE: { regiao: "coxa", lado: "E" },
  cPanturrilhaD: { regiao: "panturrilha", lado: "D" },
  cPanturrilhaE: { regiao: "panturrilha", lado: "E" },
};

export const temFigura = (key: string) => key in REGIAO_POR_CAMPO;

const FITA = "#b8924d";

// Cada figura: viewBox 0 0 60 60; corpo em tom neutro e fita (elipse) em ouro.
function Desenho({ regiao }: { regiao: Regiao }) {
  const corpo = { fill: "currentColor", fillOpacity: 0.18, stroke: "currentColor", strokeOpacity: 0.55, strokeWidth: 1.2 } as const;
  const fita = { fill: "none", stroke: FITA, strokeWidth: 3, strokeLinecap: "round" } as const;
  switch (regiao) {
    case "pescoco":
      return (<>
        <circle cx="30" cy="12" r="9" {...corpo} />
        <path d="M24 20 H36 V34 L52 42 V54 H8 V42 L24 34 Z" {...corpo} />
        <ellipse cx="30" cy="27" rx="8" ry="3" {...fita} />
      </>);
    case "torax":
      return (<>
        <path d="M18 6 H42 L52 14 V54 H8 V14 Z" {...corpo} />
        <ellipse cx="30" cy="24" rx="22" ry="4" {...fita} />
      </>);
    case "cintura":
      return (<>
        <path d="M14 6 H46 L40 30 L44 54 H16 L20 30 Z" {...corpo} />
        <ellipse cx="30" cy="30" rx="10" ry="3" {...fita} />
      </>);
    case "abdomen":
      return (<>
        <path d="M16 6 H44 Q54 30 44 54 H16 Q6 30 16 6 Z" {...corpo} />
        <ellipse cx="30" cy="36" rx="15" ry="4" {...fita} />
      </>);
    case "quadril":
      return (<>
        <path d="M16 6 H44 Q56 28 50 54 H10 Q4 28 16 6 Z" {...corpo} />
        <ellipse cx="30" cy="38" rx="21" ry="4" {...fita} />
      </>);
    case "braco":
      return (<>
        <path d="M22 4 H38 L40 30 L37 56 H23 L20 30 Z" {...corpo} />
        <ellipse cx="30" cy="22" rx="9" ry="3" {...fita} />
      </>);
    case "coxa":
      return (<>
        <path d="M16 4 H44 L40 56 H22 Z" {...corpo} />
        <ellipse cx="30" cy="16" rx="13" ry="3.5" {...fita} />
      </>);
    case "panturrilha":
      return (<>
        <path d="M22 4 H38 Q46 20 38 32 L36 56 H24 L22 32 Q14 20 22 4 Z" {...corpo} />
        <ellipse cx="30" cy="20" rx="10" ry="3" {...fita} />
      </>);
  }
}

export function FiguraFita({ campo }: { campo: string }) {
  const info = REGIAO_POR_CAMPO[campo];
  if (!info) return null;
  return (
    <span className="concave-3d relative flex h-14 w-14 shrink-0 items-center justify-center text-foreground" aria-hidden="true">
      <svg viewBox="0 0 60 60" className="h-11 w-11">
        <Desenho regiao={info.regiao} />
      </svg>
      {info.lado && (
        <span className="bevel-3d absolute -bottom-1.5 -right-1.5 px-1 text-[9px] font-black leading-4">{info.lado}</span>
      )}
    </span>
  );
}
