import padconSymbolUrl from "@/assets/padcon-symbol-gold.png";

type Props = {
  /** Altura (px) do simbolo. A largura sai por proporcao. */
  height?: number;
  className?: string;
};

/**
 * Simbolo PADCON (no entrelacado) em OURO POLIDO 3D — recorte da arte OFICIAL
 * (LOGO_PADCON_17), fundo removido. Nao e desenho digitado: e o render oficial
 * com transparencia, renderizado flutuante.
 */
export function PadconSymbol({ height = 22, className }: Props) {
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

export default PadconSymbol;
