import padconSymbolUrl from "@/assets/padcon-symbol-gold.png";

type Props = {
  /** Altura (px) do simbolo. A largura sai por proporcao. */
  height?: number;
  className?: string;
  /** Passa um sweep de luz (glint) lento mascarado pelo proprio simbolo. */
  glint?: boolean;
};

/**
 * Simbolo PADCON (no entrelacado) em OURO POLIDO 3D — recorte da arte OFICIAL
 * (LOGO_PADCON_17), fundo removido. Nao e desenho digitado: e o render oficial
 * com transparencia, renderizado flutuante.
 */
export function PadconSymbol({ height = 22, className, glint = false }: Props) {
  if (!glint) {
    return (
      <img
        src={padconSymbolUrl}
        alt="PADCON"
        className={className}
        style={{ height, width: "auto", display: "block" }}
        draggable={false}
      />
    );
  }
  return (
    <span className={className} style={{ position: "relative", display: "inline-block" }}>
      <img
        src={padconSymbolUrl}
        alt="PADCON"
        style={{ height, width: "auto", display: "block" }}
        draggable={false}
      />
      <span
        className="symbol-glint"
        style={{ WebkitMaskImage: `url(${padconSymbolUrl})`, maskImage: `url(${padconSymbolUrl})` }}
      >
        <span className="symbol-glint-band" />
      </span>
    </span>
  );
}

export default PadconSymbol;
